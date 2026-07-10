-- ─────────────────────────────────────────────────────────────────────────────
-- Fit & Proper module: every event-based notification dispatch call in this
-- module (fp-screening-run, fp-monitoring-sweep, fp-cycle-scheduler,
-- FpAppealsPanel/FpaAppeals, and the new manual-assignment/resolution calls
-- added alongside this migration) has always been correctly wired to POST to
-- dispatch-notification-event — but zero rows existed in
-- notification_event_configs for any fp_* event_key, so every single one has
-- silently no-op'd since it was written. This seeds real templates for all of
-- them in one pass.
--
-- Recipient targeting: events with a genuine per-record recipient available
-- in payload use payload_user (assignee, monitoring_owner, filed_by); events
-- with no natural individual recipient (a fresh finding, a cycle-opened
-- assessment) notify the supervisor role, which is a real, existing
-- recipient-resolution rule (recipientsForRole), not a placeholder.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.notification_event_configs
  (event_key, description, channels, notification_type, title_template, message_template, recipient_rules, is_active)
VALUES
  ('fp_high_severity_finding',
   'A high-severity Fit & Proper screening finding was raised.',
   ARRAY['in_app']::text[], 'fp_finding',
   'High-severity F&P finding',
   '{{high_count}} high-severity finding(s) raised for {{individual_name}}. Review in the Manual Review Queue.',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_monitoring_alert',
   'Ongoing-monitoring recheck produced a medium/high severity finding.',
   ARRAY['in_app']::text[], 'fp_finding',
   'F&P monitoring alert',
   'A monitoring recheck raised a new finding requiring review.',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_condition_overdue',
   'A Fit & Proper determination condition is overdue.',
   ARRAY['in_app']::text[], 'fp_condition',
   'F&P condition overdue',
   'A condition is {{days_overdue}} day(s) overdue.',
   '[{"type":"payload_user","key":"monitoring_owner"},{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_condition_reminder',
   'A Fit & Proper determination condition is due soon.',
   ARRAY['in_app']::text[], 'fp_condition',
   'F&P condition due soon',
   'A condition is due on {{due_date}}.',
   '[{"type":"payload_user","key":"monitoring_owner"},{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_cycle_assessment_opened',
   'The cycle scheduler opened a new Fit & Proper reassessment.',
   ARRAY['in_app']::text[], 'fp_assessment',
   'Cycle reassessment opened',
   'A new cycle-based reassessment was opened automatically.',
   '[{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_appeal_decided',
   'A Fit & Proper appeal decision was recorded.',
   ARRAY['in_app']::text[], 'fp_appeal',
   'F&P appeal decided',
   'Decision recorded on your appeal: {{decision}}.',
   '[{"type":"payload_user","key":"filed_by"},{"type":"role","role":"supervisor"}]'::jsonb,
   true),

  ('fp_finding_assigned',
   'A Fit & Proper screening finding was assigned for manual review.',
   ARRAY['in_app']::text[], 'fp_finding',
   'F&P finding assigned to you',
   'A screening finding was assigned to you for manual review.',
   '[{"type":"payload_user","key":"assigned_to"}]'::jsonb,
   true),

  ('fp_finding_resolved',
   'A Fit & Proper screening finding was resolved (cleared or confirmed adverse).',
   ARRAY['in_app']::text[], 'fp_finding',
   'F&P finding resolved',
   'A screening finding was resolved: {{outcome}}.',
   '[{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"}]'::jsonb,
   true)

ON CONFLICT (event_key) DO NOTHING;
