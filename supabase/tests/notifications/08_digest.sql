-- Digest workers: eligibility, duplicate prevention, retry-safe failures, audit.
BEGIN;
SELECT plan(10);

INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, channels, notification_type, severity, allow_mute, system_required)
VALUES
  ('dig8_medium',   'digestible',  'Medium', 'M', ARRAY['in_app','email'], 'info',    'medium',   true,  false),
  ('dig8_low',      'digestible',  'Low',    'M', ARRAY['in_app','email'], 'success', 'low',      true,  false),
  ('dig8_high',     'urgent',      'High',   'M', ARRAY['in_app','email'], 'warning', 'high',     false, false),
  ('dig8_critical', 'urgent',      'Crit',   'M', ARRAY['in_app','email'], 'error',   'critical', false, false),
  ('dig8_sysreq',   'mandatory',   'Sys',    'M', ARRAY['in_app','email'], 'info',    'medium',   false, true)
ON CONFLICT (event_key) DO UPDATE
  SET severity = EXCLUDED.severity, allow_mute = EXCLUDED.allow_mute,
      system_required = EXCLUDED.system_required, channels = EXCLUDED.channels, is_active = true;

-- Two users: one on hourly digest, one on immediate
INSERT INTO public.notification_user_event_preferences
  (user_id, event_key, in_app_enabled, email_enabled, digest_frequency, effective_from)
VALUES
  ('00000000-0000-0000-0000-0000000008a1','dig8_medium', true, true, 'hourly', now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000008a1','dig8_low',    true, true, 'daily',  now() - interval '10 days'),
  ('00000000-0000-0000-0000-0000000008a2','dig8_medium', true, true, 'immediate', now() - interval '10 days');

UPDATE public.notification_user_event_preferences
SET effective_from = now() - interval '10 days'
WHERE user_id IN ('00000000-0000-0000-0000-0000000008a1','00000000-0000-0000-0000-0000000008a2');

-- Notifications inside the previous full hour
INSERT INTO public.notifications (user_id, title, message, event_key, channel, severity, created_at)
VALUES
  ('00000000-0000-0000-0000-0000000008a1','Digestible A','body','dig8_medium','in_app','medium', date_trunc('hour', now()) - interval '30 minutes'),
  ('00000000-0000-0000-0000-0000000008a1','Digestible B','body','dig8_medium','in_app','medium', date_trunc('hour', now()) - interval '20 minutes'),
  ('00000000-0000-0000-0000-0000000008a1','Urgent high','body','dig8_high','in_app','high',      date_trunc('hour', now()) - interval '25 minutes'),
  ('00000000-0000-0000-0000-0000000008a1','Urgent crit','body','dig8_critical','in_app','critical', date_trunc('hour', now()) - interval '25 minutes'),
  ('00000000-0000-0000-0000-0000000008a1','Mandatory','body','dig8_sysreq','in_app','medium',    date_trunc('hour', now()) - interval '25 minutes'),
  ('00000000-0000-0000-0000-0000000008a1','Daily item','body','dig8_low','in_app','low',         date_trunc('hour', now()) - interval '15 minutes'),
  ('00000000-0000-0000-0000-0000000008a2','Immediate item','body','dig8_medium','in_app','medium', date_trunc('hour', now()) - interval '15 minutes');

-- 1. hourly digest groups only eligible messages for the digest user
SELECT is(
  (SELECT (r->>'item_count')::int
   FROM jsonb_array_elements(
     public.notification_digest_build('hourly', date_trunc('hour', now()) - interval '1 hour')->'runs') r
   WHERE r->>'user_id' = '00000000-0000-0000-0000-0000000008a1'),
  2,
  'hourly digest includes only the two hourly-preference notifications'
);

-- 2. urgent severities excluded
SELECT is(
  (SELECT count(*)::int FROM public.notification_digest_items di
   JOIN public.notifications n ON n.id = di.notification_id
   WHERE n.severity IN ('critical','high')),
  0,
  'critical and high notifications are never included in a digest'
);

-- 3. system-required immediate events excluded
SELECT is(
  (SELECT count(*)::int FROM public.notification_digest_items di
   JOIN public.notifications n ON n.id = di.notification_id
   WHERE n.event_key = 'dig8_sysreq'),
  0,
  'mandatory (system-required) notifications are excluded from digests'
);

-- 4. immediate preferences bypass the digest entirely
SELECT is(
  (SELECT count(*)::int FROM public.notification_digest_runs
   WHERE user_id = '00000000-0000-0000-0000-0000000008a2'),
  0,
  'users on immediate delivery never receive a digest run'
);

-- 5. every included notification is recorded
SELECT is(
  (SELECT count(*)::int FROM public.notification_digest_items di
   JOIN public.notification_digest_runs r ON r.id = di.run_id
   WHERE r.period = 'hourly'),
  2,
  'each notification included in the digest is recorded'
);

-- 6. one digest per user and period — a second build is a no-op
SELECT is(
  (SELECT jsonb_array_length(
     public.notification_digest_build('hourly', date_trunc('hour', now()) - interval '1 hour')->'runs')),
  0,
  'a repeated build for the same period produces no duplicate digest'
);

SELECT is(
  (SELECT count(*)::int FROM public.notification_digest_runs
   WHERE user_id = '00000000-0000-0000-0000-0000000008a1' AND period = 'hourly'),
  1,
  'only one digest run exists per user, channel and period window'
);

-- 7. individual in-app notifications are preserved untouched
SELECT is(
  (SELECT count(*)::int FROM public.notifications
   WHERE user_id = '00000000-0000-0000-0000-0000000008a1' AND dismissed_at IS NULL AND archived_at IS NULL),
  6,
  'individual in-app notification records are preserved'
);

-- 8. failures are logged and remain retryable
SELECT public.notification_digest_mark(
  (SELECT id FROM public.notification_digest_runs WHERE period = 'hourly' LIMIT 1),
  'failed', 'smtp timeout');

SELECT ok(
  (SELECT status = 'failed' AND attempts = 1 AND error = 'smtp timeout'
   FROM public.notification_digest_runs WHERE period = 'hourly' LIMIT 1)
  AND (SELECT count(*) FROM public.notification_digest_items di
       JOIN public.notification_digest_runs r ON r.id = di.run_id WHERE r.period='hourly') = 0,
  'failed digests are logged with an error and release their items for retry'
);

-- 9. daily digest groups only its own eligible messages
SELECT is(
  (SELECT (r->>'item_count')::int
   FROM jsonb_array_elements(
     public.notification_digest_build('daily', date_trunc('hour', now()) - interval '1 hour')->'runs') r
   WHERE r->>'user_id' = '00000000-0000-0000-0000-0000000008a1'),
  1,
  'daily digest includes only the daily-preference notification'
);

ROLLBACK;
