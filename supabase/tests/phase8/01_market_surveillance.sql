-- Phase 8 / MCS-SUR-001 — Market Surveillance signal object and disposition lifecycle.
--
-- Asserts: the signal record carries surveillance provenance (rule version,
-- threshold, observation window, source records), the disposition vocabulary is
-- exactly the six FRD states, dispositions can only move through
-- set_conduct_signal_disposition(), a reason is mandatory for FALSE_POSITIVE and
-- CLOSED, terminal states cannot be re-dispositioned, ESCALATED is reserved for
-- the referral RPC, and the disposition event ledger is append-only.

BEGIN;
SELECT plan(32);

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
SELECT has_column('public','conduct_alerts','disposition','signal disposition column exists');
SELECT has_column('public','conduct_alerts','disposition_reason','disposition reason recorded');
SELECT has_column('public','conduct_alerts','reviewed_by','reviewer recorded');
SELECT has_column('public','conduct_alerts','reviewed_at','review time recorded');
SELECT has_column('public','conduct_alerts','observation_start','observation window start exists');
SELECT has_column('public','conduct_alerts','observation_end','observation window end exists');
SELECT has_column('public','conduct_alerts','instrument_ref','instrument reference exists');
SELECT has_column('public','conduct_alerts','rule_version','rule version stamped on the signal');
SELECT has_column('public','conduct_alerts','threshold_value','threshold crossed stamped on the signal');
SELECT has_column('public','conduct_alerts','investigation_id','referral linkage exists');
SELECT has_table('public','conduct_signal_events','signal event ledger exists');
SELECT has_table('public','conduct_signal_evidence','signal evidence table exists');

SELECT is(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'public.conduct_alerts'::regclass
      AND conname = 'conduct_alerts_disposition_chk'),
  'CHECK ((disposition = ANY (ARRAY[''NEW''::text, ''UNDER_REVIEW''::text, ''FALSE_POSITIVE''::text, ''MONITOR''::text, ''ESCALATED''::text, ''CLOSED''::text])))',
  'disposition vocabulary is exactly the six FRD states'
);

SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_signal_events'::regclass),
          'RLS enabled on the signal event ledger');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_signal_evidence'::regclass),
          'RLS enabled on signal evidence');
SELECT ok(NOT EXISTS (
  SELECT 1 FROM pg_policies
   WHERE tablename='conduct_signal_events' AND cmd IN ('UPDATE','DELETE','ALL')
), 'no client UPDATE/DELETE policy on the signal event ledger');

-- ---------------------------------------------------------------------------
-- RPC surface
-- ---------------------------------------------------------------------------
SELECT ok((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='set_conduct_signal_disposition'),
          'disposition RPC is SECURITY DEFINER');
SELECT ok((SELECT array_to_string(p.proconfig,',') LIKE '%search_path%'
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='set_conduct_signal_disposition'),
          'disposition RPC pins search_path');
SELECT ok(NOT has_function_privilege('anon',
            'public.set_conduct_signal_disposition(uuid,text,text)','EXECUTE'),
          'anon may not disposition a surveillance signal');

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f8001','p8-analyst@test'),
  ('00000000-0000-0000-0000-0000000f8002','p8-nobody@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000f8001','analyst')
ON CONFLICT DO NOTHING;

INSERT INTO public.roles (id, name, system_role, status)
VALUES ('00000000-0000-0000-0000-0000000f8010','P8 Conduct Analyst','analyst','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8010', p.id
  FROM public.permissions p
 WHERE p.module = 'market_conduct'
   AND p.name IN ('view','run_conduct_analytics','manage_monitoring_rules','initiate_investigation')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_dynamic_roles (user_id, role_id)
VALUES ('00000000-0000-0000-0000-0000000f8001','00000000-0000-0000-0000-0000000f8010')
ON CONFLICT DO NOTHING;

INSERT INTO public.licensees (id, name)
VALUES ('00000000-0000-0000-0000-0000000f8020','P8 Surveillance Bank')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_alerts
  (id, licensee_id, kind, severity, status, title, generated_by, explanation,
   source_record_ids, observation_start, observation_end, instrument_ref,
   rule_version, threshold_value)
VALUES
  ('00000000-0000-0000-0000-0000000f8030','00000000-0000-0000-0000-0000000f8020',
   'rule_triggered','high','open','P8 signal — complaint spike','manual',
   'Complaint volume 14 exceeded threshold 10 over 30 days',
   ARRAY['00000000-0000-0000-0000-0000000f8021'::uuid],
   now() - interval '30 days', now(), 'PROD-XYZ', 1, 10),
  ('00000000-0000-0000-0000-0000000f8031','00000000-0000-0000-0000-0000000f8020',
   'rule_triggered','medium','open','P8 signal — second','manual','probe',
   '{}'::uuid[], now() - interval '7 days', now(), NULL, 1, 5),
  ('00000000-0000-0000-0000-0000000f8032','00000000-0000-0000-0000-0000000f8020',
   'rule_triggered','low','open','P8 signal — third','manual','probe',
   '{}'::uuid[], now() - interval '7 days', now(), NULL, 1, 5)
ON CONFLICT (id) DO NOTHING;

SELECT is((SELECT disposition FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8030'), 'NEW',
          'a newly generated signal starts at NEW');
SELECT isnt((SELECT explanation FROM public.conduct_alerts
              WHERE id='00000000-0000-0000-0000-0000000f8030'), NULL,
            'signal explains what fired');
SELECT is((SELECT array_length(source_record_ids,1) FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8030'), 1,
          'signal cites the source records that caused it');

-- ---------------------------------------------------------------------------
-- Behaviour as an authorised conduct analyst
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8001","role":"authenticated"}';

SELECT throws_ok(
  $$UPDATE public.conduct_alerts SET disposition='FALSE_POSITIVE'
     WHERE id='00000000-0000-0000-0000-0000000f8030'$$,
  NULL, NULL, 'disposition cannot be changed by a direct table UPDATE');

SELECT lives_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8030'::uuid,'UNDER_REVIEW','picking this up')$$,
  'analyst can move a signal to UNDER_REVIEW');

SELECT is((SELECT disposition FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8030'), 'UNDER_REVIEW',
          'disposition persisted as UNDER_REVIEW');
SELECT is((SELECT reviewed_by FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8030'),
          '00000000-0000-0000-0000-0000000f8001'::uuid,
          'reviewer is taken from the authenticated actor, not the client');
SELECT is((SELECT status FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8030'), 'acknowledged',
          'legacy alert status stays consistent with the disposition');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8030'
              AND from_disposition='NEW' AND to_disposition='UNDER_REVIEW'), 1,
          'transition written to the event ledger exactly once');

SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8030'::uuid,'UNDER_REVIEW','again')$$,
  NULL, NULL, 'a no-op re-disposition is refused');

SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8030'::uuid,'ESCALATED','shortcut')$$,
  NULL, NULL, 'ESCALATED is reserved for the referral RPC');

SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8031'::uuid,'NOT_A_STATE','x')$$,
  NULL, NULL, 'an unknown disposition is refused');

SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8031'::uuid,'FALSE_POSITIVE',NULL)$$,
  NULL, NULL, 'FALSE_POSITIVE requires a reason');
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8031'::uuid,'CLOSED','   ')$$,
  NULL, NULL, 'CLOSED requires a non-blank reason');

SELECT lives_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8031'::uuid,'FALSE_POSITIVE','duplicate of an existing case')$$,
  'FALSE_POSITIVE accepted with a reason');
SELECT is((SELECT disposition_reason FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8031'),
          'duplicate of an existing case', 'disposition reason retained');
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8031'::uuid,'MONITOR','reopen')$$,
  NULL, NULL, 'a terminal signal cannot be re-dispositioned');

SELECT lives_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8032'::uuid,'MONITOR',NULL)$$,
  'MONITOR does not require a reason');

-- Evidence is attachable; the event ledger is append-only.
SELECT lives_ok(
  $$INSERT INTO public.conduct_signal_evidence (signal_id, label, note, added_by)
    VALUES ('00000000-0000-0000-0000-0000000f8030','Trade extract','sample rows',
            '00000000-0000-0000-0000-0000000f8001')$$,
  'analyst can attach evidence to a signal');

SELECT throws_ok(
  $$UPDATE public.conduct_signal_events SET reason='tamper'
     WHERE signal_id='00000000-0000-0000-0000-0000000f8030'$$,
  NULL, NULL, 'signal event ledger rejects UPDATE');
SELECT throws_ok(
  $$DELETE FROM public.conduct_signal_events
     WHERE signal_id='00000000-0000-0000-0000-0000000f8030'$$,
  NULL, NULL, 'signal event ledger rejects DELETE');

-- Unauthorised internal user cannot review signals.
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8002","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8032'::uuid,'UNDER_REVIEW','not mine')$$,
  NULL, NULL, 'an unauthorised internal user cannot disposition a signal');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
