-- Phase 8 / MCS-SUR-002 — escalation of a surveillance signal into a formal
-- investigation, with provenance preserved.
--
-- Asserts: only a permitted supervisor may refer; only an UNDER_REVIEW signal is
-- referable; an allegation summary is mandatory; the created investigation is
-- stamped source_type='surveillance_signal' with source_id = signal id and
-- carries the rule/version/threshold/observation/source-record provenance; the
-- signal is linked back and moved to ESCALATED with an event row; and the
-- original signal evidence is never mutated.

BEGIN;
SELECT plan(22);

SELECT ok((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='refer_conduct_signal_to_investigation'),
          'referral RPC is SECURITY DEFINER');
SELECT ok((SELECT array_to_string(p.proconfig,',') LIKE '%search_path%'
             FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
            WHERE n.nspname='public' AND p.proname='refer_conduct_signal_to_investigation'),
          'referral RPC pins search_path');
SELECT is(
  (SELECT pg_get_function_identity_arguments(p.oid)
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='refer_conduct_signal_to_investigation'),
  'uuid, text, text, text, date',
  'referral RPC accepts no caller-supplied actor'
);

-- ---------------------------------------------------------------------------
-- Fixtures: a referrer with initiate_investigation, and an analyst without it
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000f8101','p8-supervisor@test'),
  ('00000000-0000-0000-0000-0000000f8102','p8-reviewer-only@test')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.roles (id, name, system_role, status) VALUES
  ('00000000-0000-0000-0000-0000000f8110','P8 Conduct Supervisor','supervisor','active'),
  ('00000000-0000-0000-0000-0000000f8111','P8 Signal Reviewer','analyst','active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8110', p.id FROM public.permissions p
 WHERE p.module='market_conduct'
   AND p.name IN ('view','run_conduct_analytics','initiate_investigation')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-0000000f8111', p.id FROM public.permissions p
 WHERE p.module='market_conduct' AND p.name IN ('view','run_conduct_analytics')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_dynamic_roles (user_id, role_id) VALUES
  ('00000000-0000-0000-0000-0000000f8101','00000000-0000-0000-0000-0000000f8110'),
  ('00000000-0000-0000-0000-0000000f8102','00000000-0000-0000-0000-0000000f8111')
ON CONFLICT DO NOTHING;

INSERT INTO public.licensees (id, name)
VALUES ('00000000-0000-0000-0000-0000000f8120','P8 Referral Bank')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_monitoring_rules
  (id, name, code, metric, threshold_value, comparison_operator, lookback_days, definition)
VALUES ('00000000-0000-0000-0000-0000000f8130','P8 Referral Rule','P8_REF','complaint_count',
        10,'>',30,'{"metric":"complaint_count","threshold":10,"lookback_days":30}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_alerts
  (id, licensee_id, kind, severity, status, title, generated_by, explanation,
   source_record_ids, observation_start, observation_end, rule_version, threshold_value,
   triage_rule_id)
VALUES
  ('00000000-0000-0000-0000-0000000f8140','00000000-0000-0000-0000-0000000f8120',
   'rule_triggered','high','open','P8 referral signal','manual',
   'Complaint volume 14 exceeded threshold 10 over 30 days',
   ARRAY['00000000-0000-0000-0000-0000000f8121'::uuid],
   now() - interval '30 days', now(), 1, 10, NULL),
  ('00000000-0000-0000-0000-0000000f8141','00000000-0000-0000-0000-0000000f8120',
   'rule_triggered','medium','open','P8 not-under-review signal','manual','probe',
   '{}'::uuid[], now() - interval '7 days', now(), 1, 5, NULL)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.conduct_signal_evidence (id, signal_id, label, note)
VALUES ('00000000-0000-0000-0000-0000000f8150','00000000-0000-0000-0000-0000000f8140',
        'Complaint extract','14 complaints in window')
ON CONFLICT (id) DO NOTHING;

SET LOCAL ROLE authenticated;

-- ---------------------------------------------------------------------------
-- Gating
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8101","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.refer_conduct_signal_to_investigation(
      '00000000-0000-0000-0000-0000000f8141'::uuid,'Alleged mis-selling')$$,
  NULL, NULL, 'a signal that is not UNDER_REVIEW cannot be referred');

SELECT lives_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8140'::uuid,'UNDER_REVIEW','triaging')$$,
  'supervisor can take the signal under review');

SELECT throws_ok(
  $$SELECT public.refer_conduct_signal_to_investigation(
      '00000000-0000-0000-0000-0000000f8140'::uuid,'   ')$$,
  NULL, NULL, 'a blank allegation summary is refused');

SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8102","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.refer_conduct_signal_to_investigation(
      '00000000-0000-0000-0000-0000000f8140'::uuid,'Alleged mis-selling')$$,
  NULL, NULL, 'a reviewer without initiate_investigation cannot refer a signal');
SELECT is((SELECT disposition FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8140'), 'UNDER_REVIEW',
          'refused referral leaves the signal untouched');

-- ---------------------------------------------------------------------------
-- Successful referral
-- ---------------------------------------------------------------------------
SET LOCAL "request.jwt.claims" = '{"sub":"00000000-0000-0000-0000-0000000f8101","role":"authenticated"}';

SELECT lives_ok(
  $$SELECT public.refer_conduct_signal_to_investigation(
      '00000000-0000-0000-0000-0000000f8140'::uuid,
      'Alleged mis-selling of an investment product',
      'Volume and pattern warrant formal investigation','high', CURRENT_DATE + 30)$$,
  'supervisor can refer an UNDER_REVIEW signal to investigation');

SELECT isnt((SELECT investigation_id FROM public.conduct_alerts
              WHERE id='00000000-0000-0000-0000-0000000f8140'), NULL,
            'signal is linked back to the created investigation');
SELECT is((SELECT disposition FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8140'), 'ESCALATED',
          'signal disposition becomes ESCALATED');
SELECT is((SELECT reviewed_by FROM public.conduct_alerts
            WHERE id='00000000-0000-0000-0000-0000000f8140'),
          '00000000-0000-0000-0000-0000000f8101'::uuid,
          'referring supervisor recorded as reviewer');
SELECT is((SELECT count(*)::int FROM public.conduct_signal_events
            WHERE signal_id='00000000-0000-0000-0000-0000000f8140'
              AND to_disposition='ESCALATED'), 1,
          'referral written to the event ledger with the investigation id');
SELECT isnt((SELECT investigation_id FROM public.conduct_signal_events
              WHERE signal_id='00000000-0000-0000-0000-0000000f8140'
                AND to_disposition='ESCALATED'), NULL,
            'event row carries the investigation id');

-- Provenance on the investigation.
SELECT is((SELECT i.source_type FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          'surveillance_signal', 'investigation source_type is surveillance_signal');
SELECT is((SELECT i.source_id FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          '00000000-0000-0000-0000-0000000f8140'::uuid,
          'investigation source_id points at the originating signal');
SELECT is((SELECT i.licensee_id FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          '00000000-0000-0000-0000-0000000f8120'::uuid,
          'investigation inherits the signal entity');
SELECT is((SELECT i.severity FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          'high', 'investigation inherits the signal severity');
SELECT is((SELECT i.metadata->>'signal_explanation' FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          'Complaint volume 14 exceeded threshold 10 over 30 days',
          'investigation retains the signal explanation');
SELECT is((SELECT (i.metadata->>'signal_threshold')::numeric FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          10::numeric, 'investigation retains the threshold that was crossed');
SELECT is((SELECT (i.metadata->>'signal_rule_version')::int FROM public.conduct_investigations i
            JOIN public.conduct_alerts a ON a.investigation_id = i.id
           WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          1, 'investigation retains the rule version that fired');
SELECT is((SELECT jsonb_array_length(i.metadata->'signal_source_record_ids')
             FROM public.conduct_investigations i
             JOIN public.conduct_alerts a ON a.investigation_id = i.id
            WHERE a.id='00000000-0000-0000-0000-0000000f8140'),
          1, 'investigation retains the source record ids');
SELECT isnt((SELECT i.metadata->>'signal_observation_start' FROM public.conduct_investigations i
              JOIN public.conduct_alerts a ON a.investigation_id = i.id
             WHERE a.id='00000000-0000-0000-0000-0000000f8140'), NULL,
            'investigation retains the observation window');

-- Original signal evidence is not mutated by the referral.
SELECT is((SELECT note FROM public.conduct_signal_evidence
            WHERE id='00000000-0000-0000-0000-0000000f8150'),
          '14 complaints in window', 'signal evidence is untouched by the referral');

-- An escalated signal is terminal for further disposition changes.
SELECT throws_ok(
  $$SELECT public.set_conduct_signal_disposition(
      '00000000-0000-0000-0000-0000000f8140'::uuid,'MONITOR','walk it back')$$,
  NULL, NULL, 'an escalated signal cannot be re-dispositioned');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
