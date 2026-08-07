-- Phase 3 / FP-SCR-001 — screening provider state honesty
BEGIN;
SELECT plan(28);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f3201', 'p3-scr-super@test')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role)
  VALUES ('00000000-0000-0000-0000-0000000f3201', 'super_admin')
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  INSERT INTO public.fp_individuals (id, full_name, status)
    VALUES ('00000000-0000-0000-0000-0000000f3220','P3 Screening Subject','active')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.fp_assessments (id, individual_id, assessment_type, status, declaration_data)
    VALUES ('00000000-0000-0000-0000-0000000f3240','00000000-0000-0000-0000-0000000f3220',
            'initial','draft','{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
END$$;

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f3201","role":"authenticated"}';

-- 1. All eight canonical states are reachable and idempotent -----------------
SELECT is(public.fp_normalise_provider_state('SUCCESS_HIT'), 'SUCCESS_HIT', 'SUCCESS_HIT is canonical');
SELECT is(public.fp_normalise_provider_state('SUCCESS_NO_MATCH'), 'SUCCESS_NO_MATCH', 'SUCCESS_NO_MATCH is canonical');
SELECT is(public.fp_normalise_provider_state('NOT_CONFIGURED'), 'NOT_CONFIGURED', 'NOT_CONFIGURED is canonical');
SELECT is(public.fp_normalise_provider_state('SANDBOX'), 'SANDBOX', 'SANDBOX is canonical');
SELECT is(public.fp_normalise_provider_state('PROVIDER_FAILURE'), 'PROVIDER_FAILURE', 'PROVIDER_FAILURE is canonical');
SELECT is(public.fp_normalise_provider_state('TRANSPORT_FAILURE'), 'TRANSPORT_FAILURE', 'TRANSPORT_FAILURE is canonical');
SELECT is(public.fp_normalise_provider_state('RATE_LIMITED'), 'RATE_LIMITED', 'RATE_LIMITED is canonical');
SELECT is(public.fp_normalise_provider_state('MANUAL'), 'MANUAL', 'MANUAL is canonical');

-- 2. Legacy vocabulary maps onto the canonical states ------------------------
SELECT is(public.fp_normalise_provider_state('screened_hits'), 'SUCCESS_HIT', 'legacy screened_hits maps to SUCCESS_HIT');
SELECT is(public.fp_normalise_provider_state('screened_clean'), 'SUCCESS_NO_MATCH', 'legacy screened_clean maps to SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('unconfigured'), 'NOT_CONFIGURED', 'unconfigured maps to NOT_CONFIGURED');
SELECT is(public.fp_normalise_provider_state('manual'), 'MANUAL', 'manual maps to MANUAL');

-- 3. A non-completing check can NEVER read as clean --------------------------
SELECT is(public.fp_normalise_provider_state('screened_clean', 'sandbox', NULL, NULL),
  'SANDBOX', 'a sandbox environment can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('screened_clean', NULL, 'mock', NULL),
  'SANDBOX', 'a mock execution can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('screened_clean', NULL, 'simulated', NULL),
  'SANDBOX', 'a simulated execution can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('screened_clean', NULL, NULL, 'not_configured'),
  'NOT_CONFIGURED', 'an unconfigured provider can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('screened_clean', NULL, NULL, 'rate_limited'),
  'RATE_LIMITED', 'a rate-limited call can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('screened_clean', NULL, NULL, 'timeout'),
  'TRANSPORT_FAILURE', 'a timeout can never present as SUCCESS_NO_MATCH');
SELECT is(public.fp_normalise_provider_state('failed'), 'PROVIDER_FAILURE', 'a provider error is PROVIDER_FAILURE');
SELECT is(public.fp_normalise_provider_state('something_unknown'), 'PROVIDER_FAILURE',
  'an unrecognised outcome fails closed as PROVIDER_FAILURE, never clean');

-- 4. Conclusiveness ----------------------------------------------------------
SELECT ok(public.fp_provider_state_conclusive('SUCCESS_HIT'), 'SUCCESS_HIT is conclusive');
SELECT ok(public.fp_provider_state_conclusive('SUCCESS_NO_MATCH'), 'SUCCESS_NO_MATCH is conclusive');
SELECT ok(public.fp_provider_state_conclusive('MANUAL'), 'MANUAL is conclusive');
SELECT is(
  (SELECT count(*)::int FROM (VALUES ('NOT_CONFIGURED'),('SANDBOX'),('PROVIDER_FAILURE'),
                                      ('TRANSPORT_FAILURE'),('RATE_LIMITED')) s(st)
     WHERE public.fp_provider_state_conclusive(s.st)),
  0, 'no non-completing state is ever conclusive');

-- 5. Stamping trigger on real runs ------------------------------------------
INSERT INTO public.fp_screening_runs
  (id, assessment_id, individual_id, run_type, status, total_checks, total_hits, provider_outcomes)
VALUES
  ('00000000-0000-0000-0000-0000000f3250','00000000-0000-0000-0000-0000000f3240',
   '00000000-0000-0000-0000-0000000f3220','initial','completed',1,0,
   jsonb_build_array(jsonb_build_object('provider','acme','outcome','screened_clean','environment','sandbox'))),
  ('00000000-0000-0000-0000-0000000f3251','00000000-0000-0000-0000-0000000f3240',
   '00000000-0000-0000-0000-0000000f3220','initial','completed',1,1,
   jsonb_build_array(jsonb_build_object('provider','acme','outcome','screened_hits','environment','production'))),
  ('00000000-0000-0000-0000-0000000f3252','00000000-0000-0000-0000-0000000f3240',
   '00000000-0000-0000-0000-0000000f3220','initial','failed',1,0,
   jsonb_build_array(jsonb_build_object('provider','acme','outcome','screened_clean','error_category','timeout'))),
  ('00000000-0000-0000-0000-0000000f3253','00000000-0000-0000-0000-0000000f3240',
   '00000000-0000-0000-0000-0000000f3220','initial','completed',1,0,
   '[]'::jsonb);

SELECT is((SELECT provider_outcomes->0->>'state' FROM public.fp_screening_runs
            WHERE id='00000000-0000-0000-0000-0000000f3250'),
  'SANDBOX', 'a stored sandbox run is stamped SANDBOX, not clean');
SELECT is((SELECT provider_outcomes->0->>'state' FROM public.fp_screening_runs
            WHERE id='00000000-0000-0000-0000-0000000f3251'),
  'SUCCESS_HIT', 'a real hit is stamped SUCCESS_HIT');
SELECT is((SELECT provider_outcomes->0->>'state' FROM public.fp_screening_runs
            WHERE id='00000000-0000-0000-0000-0000000f3252'),
  'TRANSPORT_FAILURE', 'a timed-out run is stamped TRANSPORT_FAILURE even though it claimed clean');
SELECT ok((SELECT provider_outcomes->0->>'provider' FROM public.fp_screening_runs
            WHERE id='00000000-0000-0000-0000-0000000f3250') = 'acme',
  'stamping preserves the original provider payload keys');

SELECT is(
  (SELECT count(*)::int FROM (VALUES
      ('00000000-0000-0000-0000-0000000f3250'::uuid),
      ('00000000-0000-0000-0000-0000000f3252'::uuid),
      ('00000000-0000-0000-0000-0000000f3253'::uuid)) s(rid)
    WHERE public.fp_run_is_conclusive(s.rid)),
  0, 'sandbox, failed and empty runs are all non-conclusive');

SELECT ok(public.fp_run_is_conclusive('00000000-0000-0000-0000-0000000f3251'),
  'only the live provider response is conclusive');

ROLLBACK;
