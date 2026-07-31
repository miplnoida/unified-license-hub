-- Phase 2 — notification preference rules.
-- Critical must stay in-app, critical/high must stay immediate, system-required
-- events cannot be disabled, and mute is only allowed where configuration permits.
BEGIN;
SELECT plan(6);

INSERT INTO public.notification_event_configs (event_key, description, title_template, message_template, channels, notification_type, severity, allow_mute, system_required)
VALUES
  ('phase2_critical_breach', 'critical test', 'T', 'M', ARRAY['in_app','email'], 'error', 'critical', false, true),
  ('phase2_high_overdue',    'high test',     'T', 'M', ARRAY['in_app','email'], 'warning', 'high', false, false),
  ('phase2_low_optional',    'low test',      'T', 'M', ARRAY['in_app'],         'success', 'low',  true,  false)
ON CONFLICT (event_key) DO UPDATE
  SET severity = EXCLUDED.severity,
      allow_mute = EXCLUDED.allow_mute,
      system_required = EXCLUDED.system_required;

SELECT throws_ok(
  $$ INSERT INTO public.notification_user_event_preferences (user_id, event_key, in_app_enabled)
     VALUES ('00000000-0000-0000-0000-00000000b001','phase2_critical_breach', false) $$,
  NULL, NULL,
  'critical notifications cannot have in-app delivery disabled'
);

SELECT throws_ok(
  $$ INSERT INTO public.notification_user_event_preferences (user_id, event_key, digest_frequency)
     VALUES ('00000000-0000-0000-0000-00000000b001','phase2_high_overdue', 'daily') $$,
  'P0001', NULL,
  'high severity cannot be placed into a digest'
);

SELECT throws_ok(
  $$ INSERT INTO public.notification_user_event_preferences (user_id, event_key, digest_frequency)
     VALUES ('00000000-0000-0000-0000-00000000b002','phase2_critical_breach', 'hourly') $$,
  NULL, NULL,
  'critical severity cannot be placed into a digest'
);

SELECT throws_ok(
  $$ INSERT INTO public.notification_user_event_preferences (user_id, event_key, muted)
     VALUES ('00000000-0000-0000-0000-00000000b003','phase2_high_overdue', true) $$,
  'P0001', NULL,
  'non-low severity events cannot be muted'
);

SELECT lives_ok(
  $$ INSERT INTO public.notification_user_event_preferences (user_id, event_key, muted, digest_frequency)
     VALUES ('00000000-0000-0000-0000-00000000b004','phase2_low_optional', true, 'daily') $$,
  'low severity optional events may be muted and digested'
);

-- resolver never lets a preference override a mandatory notification
SELECT ok(
  (public.notification_effective_preference('00000000-0000-0000-0000-00000000b004','phase2_critical_breach') ->> 'in_app')::boolean
  AND (public.notification_effective_preference('00000000-0000-0000-0000-00000000b004','phase2_critical_breach') ->> 'digest') = 'immediate',
  'resolver forces in-app + immediate for mandatory critical events'
);

SELECT * FROM finish();
ROLLBACK;
