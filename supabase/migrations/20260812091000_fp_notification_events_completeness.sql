-- ─────────────────────────────────────────────────────────────────────────────
-- Two F&P event_keys have been dispatched from the client for a while with
-- no matching notification_event_configs row — same silent no-op class of
-- bug the 20260709160000 migration fixed for the first 8 events:
--   fp_assessment_submitted    (PinnedPqForm.tsx, on PQ submission)
--   fp_high_finding_confirmed  (FpScreeningPanel.tsx, on confirming a HIGH
--                                severity finding as a true positive)
--
-- Also adding two events for real gaps identified in the 17-step process
-- audit: committee decisions and determination finalizations were never
-- notified at all (only appeal decisions were). Dispatch calls for these
-- two are added alongside this migration in FpaCommittee.tsx and
-- FpaDeterminations.tsx/FpDeterminationsPanel.tsx.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.notification_event_configs
  (event_key, description, channels, notification_type, title_template, message_template, recipient_rules, is_active)
VALUES
  ('fp_assessment_submitted',
   'A Fit & Proper personal questionnaire (PQ) was submitted.',
   ARRAY['in_app']::text[], 'fp_assessment',
   'F&P declaration submitted',
   'A personal questionnaire was submitted and is ready for screening.',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_high_finding_confirmed',
   'A HIGH-severity Fit & Proper screening finding was confirmed as a true positive.',
   ARRAY['in_app']::text[], 'fp_finding',
   'F&P high-severity finding confirmed',
   'Finding "{{finding_title}}" was confirmed as a true positive ({{severity}}).',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_committee_decision_recorded',
   'A Fit & Proper committee recorded and froze its final decision on an assessment.',
   ARRAY['in_app']::text[], 'fp_assessment',
   'F&P committee decision recorded',
   'The committee recorded a decision: {{outcome}} ({{votes_counted}} vote(s) counted).',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_determination_finalized',
   'A Fit & Proper determination was finalized for an individual.',
   ARRAY['in_app']::text[], 'fp_determination',
   'F&P determination finalized',
   'Determination recorded: {{outcome}}.',
   '[{"type":"payload_user","key":"initiated_by"},{"type":"role","role":"supervisor"}]'::jsonb,
   true)

ON CONFLICT (event_key) DO NOTHING;
