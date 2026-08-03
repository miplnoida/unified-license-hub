-- Preference matrix + save RPCs (functional user preferences).
BEGIN;
SELECT plan(9);

-- Fixtures: one mandatory critical event, one low optional, one low required
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, channels, notification_type, severity, allow_mute, system_required)
VALUES
  ('pref7_critical', 'critical fixture', 'Critical fixture', 'M', ARRAY['in_app','email'], 'error',   'critical', false, true),
  ('pref7_low_opt',  'low optional',     'Low optional',     'M', ARRAY['in_app','email'], 'success', 'low',      true,  false),
  ('pref7_low_req',  'low required',     'Low required',     'M', ARRAY['in_app','email'], 'success', 'low',      false, false),
  ('pref7_medium',   'medium fixture',   'Medium fixture',   'M', ARRAY['in_app','email'], 'info',    'medium',   true,  false)
ON CONFLICT (event_key) DO UPDATE
  SET severity = EXCLUDED.severity, allow_mute = EXCLUDED.allow_mute,
      system_required = EXCLUDED.system_required, channels = EXCLUDED.channels,
      title_template = EXCLUDED.title_template, is_active = true;

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-0000000007a1","role":"authenticated"}';

-- 1. matrix loads from event configuration (not hardcoded samples)
SELECT ok(
  (SELECT count(*) FROM jsonb_array_elements(public.notification_preference_matrix()->'events')) >= 4,
  'preference matrix is built from active notification event configuration'
);

-- 2. lock reasons are supplied for mandatory/critical events
SELECT ok(
  (SELECT (e->'locks'->>'digest') IS NOT NULL AND (e->'locks'->>'in_app') IS NOT NULL
   FROM jsonb_array_elements(public.notification_preference_matrix()->'events') e
   WHERE e->>'event_key' = 'pref7_critical'),
  'critical mandatory event reports locked in-app and locked frequency with reasons'
);

-- 3. SMS availability is reported by the server
SELECT ok(
  (public.notification_preference_matrix()->>'sms_available') IN ('true','false'),
  'matrix reports server-derived SMS availability'
);

-- 4. save persists preferences
SELECT ok(
  (public.notification_preferences_save(
    '[{"event_key":"pref7_medium","in_app_enabled":true,"email_enabled":true,"sms_enabled":false,"digest_frequency":"daily","muted":false}]'::jsonb
  )->>'updated')::int = 1,
  'save persists a changed preference'
);

SELECT is(
  (SELECT digest_frequency::text FROM public.notification_user_event_preferences
   WHERE user_id = '00000000-0000-0000-0000-0000000007a1' AND event_key = 'pref7_medium'),
  'daily',
  'saved preference round-trips through the matrix model'
);

-- 5. mandatory notifications cannot be disabled
SELECT throws_ok(
  $$ SELECT public.notification_preferences_save(
       '[{"event_key":"pref7_critical","in_app_enabled":false,"email_enabled":true,"digest_frequency":"immediate","muted":false}]'::jsonb) $$,
  'P0001', NULL,
  'mandatory/critical notifications cannot be disabled server-side'
);

-- 6. critical/high cannot use a digest
SELECT throws_ok(
  $$ SELECT public.notification_preferences_save(
       '[{"event_key":"pref7_critical","in_app_enabled":true,"email_enabled":true,"digest_frequency":"hourly","muted":false}]'::jsonb) $$,
  'P0001', NULL,
  'critical notifications cannot be moved into a digest'
);

-- 7. low optional may be muted, low required may not
SELECT lives_ok(
  $$ SELECT public.notification_preferences_save(
       '[{"event_key":"pref7_low_opt","in_app_enabled":true,"email_enabled":true,"digest_frequency":"immediate","muted":true}]'::jsonb) $$,
  'low severity events configured as optional may be muted'
);

SELECT throws_ok(
  $$ SELECT public.notification_preferences_save(
       '[{"event_key":"pref7_low_req","in_app_enabled":true,"email_enabled":true,"digest_frequency":"immediate","muted":true}]'::jsonb) $$,
  'P0001', NULL,
  'low severity events configured as required cannot be muted'
);

ROLLBACK;
