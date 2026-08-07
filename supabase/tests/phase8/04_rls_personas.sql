-- Phase 8 / MCS-SUR — RLS persona matrix for the market surveillance workspace.
--
-- Personas:
--   P1 external applicant
--   P2 licensee primary user (the entity the signal is about)
--   P3 conduct supervisor (market_conduct view + analytics + initiate_investigation)
--   P4 conduct analyst (market_conduct view + analytics, no referral)
--   P5 admin (super_admin)
--   P6 authenticated internal user with no roles
--   P7 anon
--
-- Every negative case is asserted by direct id, so a leaked identifier cannot be
-- used to bypass module scope.

BEGIN;
SELECT plan(26);

INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f8301','p8-rls-applicant@test'),
  ('00000000-0000-0000-0000-0000000f8302','p8-rls-entity@test'),
  ('00000000-0000-0000-0000-0000000f8303','p8-rls-supervisor@test'),
  ('00000000-0000-0000-0000-0000000f8304','p8-rls-analyst@test'),
  ('00000000-0000-0000-0000-0000000f8305','p8-rls-admin@test'),
  ('00000000-0000-0000-0000-0000000f8306','p8-rls-nobody@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000f8301','applicant'),
  ('00000000-0000-0000-0000-0000000f8302','licensee_primary'),
  ('00000000-0000-0000-0000-0000000f8303','supervisor'),
  ('00000000-0000-0000-0000-0000000f8304','analyst'),
  ('00000000-0000-0000-0000-0000000f8305','super_admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.roles (id, name, system_role, status) VALUES
  ('00000000-0000-0000-0000-0000000f8310','P8 RLS Supervisor','supervisor','active'),
  ('00000000-0000-0000-0000-0000000f8311','P8 RLS Analyst','analyst','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8310', p.id FROM public.permissions p
 WHERE p.module='market_conduct'
   AND p.name IN ('view','run_conduct_analytics','manage_monitoring_rules','initiate_investigation')
ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8311', p.id FROM public.permissions p
 WHERE p.module='market_conduct' AND p.name IN ('view','run_conduct_analytics')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_dynamic_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000f8303','00000000-0000-0000-0000-0000000f8310'),
  ('00000000-0000-0000-0000-0000000f8304','00000000-0000-0000-0000-0000000f8311')
ON CONFLICT DO NOTHING;

INSERT INTO public.licensees (id, name)
VALUES ('00000000-0000-0000-0000-0000000f8320','P8 RLS Bank')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_monitoring_rules (id, name, code, metric, threshold_value, definition)
VALUES ('00000000-0000-0000-0000-0000000f8330','P8 RLS Rule','P8_RLS','complaint_count',9,
        '{"metric":"complaint_count","threshold":9}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_alerts
  (id, licensee_id, kind, severity, status, title, generated_by, explanation,
   observation_start, observation_end, rule_version, threshold_value)
VALUES ('00000000-0000-0000-0000-0000000f8340','00000000-0000-0000-0000-0000000f8320',
        'rule_triggered','high','open','P8 RLS signal','manual','probe',
        now() - interval '30 days', now(), 1, 9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_signal_events (signal_id, from_disposition, to_disposition, reason)
VALUES ('00000000-0000-0000-0000-0000000f8340', NULL, 'NEW', 'generated');

INSERT INTO public.conduct_signal_evidence (id, signal_id, label, note)
VALUES ('00000000-0000-0000-0000-0000000f8350','00000000-0000-0000-0000-0000000f8340',
        'Extract','probe evidence')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS is on for every surveillance object
-- ---------------------------------------------------------------------------
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_alerts'::regclass),
          'RLS enabled on conduct_alerts (signals)');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_signal_events'::regclass),
          'RLS enabled on conduct_signal_events');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_signal_evidence'::regclass),
          'RLS enabled on conduct_signal_evidence');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.conduct_monitoring_rules'::regclass),
          'RLS enabled on conduct_monitoring_rules');

SET LOCAL ROLE authenticated;

-- P3 conduct supervisor -------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8303","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 1,
          'P3 supervisor can read the surveillance signal');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 1,
          'P3 supervisor can read the disposition history');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_evidence
            WHERE id='00000000-0000-0000-0000-0000000f8350'), 1,
          'P3 supervisor can read signal evidence');

-- P4 conduct analyst ----------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8304","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 1,
          'P4 analyst can read the surveillance signal');
SELECT throws_ok(
  $$SELECT public.refer_conduct_signal_to_investigation(
      '00000000-0000-0000-0000-0000000f8340'::uuid,'Alleged misconduct')$$,
  NULL, NULL, 'P4 analyst cannot refer a signal to investigation');
SELECT throws_ok(
  $$UPDATE public.conduct_monitoring_rules SET threshold_value=1
     WHERE id='00000000-0000-0000-0000-0000000f8330'$$,
  NULL, NULL, 'P4 analyst cannot reconfigure a monitoring rule');

-- P5 admin --------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8305","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 1,
          'P5 admin can read the surveillance signal');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 1,
          'P5 admin can read the disposition history');

-- P1 external applicant -------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8301","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P1 applicant cannot read a surveillance signal by id');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P1 applicant cannot read disposition history by id');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_evidence
            WHERE id='00000000-0000-0000-0000-0000000f8350'), 0,
          'P1 applicant cannot read signal evidence by id');
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8340'::uuid,'UNDER_REVIEW','probe')$$,
  NULL, NULL, 'P1 applicant cannot disposition a signal');

-- P2 licensee user (the subject of the signal) ---------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8302","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P2 licensee user cannot read the surveillance signal about it');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P2 licensee user cannot read the disposition history');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_evidence
            WHERE id='00000000-0000-0000-0000-0000000f8350'), 0,
          'P2 licensee user cannot read signal evidence');
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8340'::uuid,'FALSE_POSITIVE','not us')$$,
  NULL, NULL, 'P2 licensee user cannot close a signal about itself');
SELECT throws_ok(
  $$UPDATE public.conduct_alerts SET disposition='FALSE_POSITIVE'
     WHERE id='00000000-0000-0000-0000-0000000f8340'$$,
  NULL, NULL, 'P2 licensee user cannot bypass the RPC with a direct update');

-- P6 internal user with no roles ------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8306","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P6 unauthorised internal user cannot read the signal');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P6 unauthorised internal user cannot read disposition history');
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8340'::uuid,'MONITOR',NULL)$$,
  NULL, NULL, 'P6 unauthorised internal user cannot disposition a signal');

-- P7 anon ---------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', NULL, true);
SELECT is((SELECT count(*)::int FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P7 anon cannot read surveillance signals');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8340'), 0,
          'P7 anon cannot read disposition history');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_evidence
            WHERE id='00000000-0000-0000-0000-0000000f8350'), 0,
          'P7 anon cannot read signal evidence');
SELECT is((SELECT count(*)::int FROM public.conduct_monitoring_rule_versions
            WHERE rule_id='00000000-0000-0000-0000-0000000f8330'), 0,
          'P7 anon cannot read rule version history');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
