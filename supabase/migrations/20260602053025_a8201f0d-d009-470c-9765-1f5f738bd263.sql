
-- 1. Extend notification_dispatch_log with delivery / retry tracking
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS provider_message_id text,
  ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_window text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE INDEX IF NOT EXISTS idx_notif_dispatch_log_status_created
  ON public.notification_dispatch_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_dispatch_log_entity
  ON public.notification_dispatch_log(entity_type, entity_id);

-- Admin/super_admin can update (retry button) and delete
DROP POLICY IF EXISTS "Admins update dispatch log" ON public.notification_dispatch_log;
CREATE POLICY "Admins update dispatch log"
  ON public.notification_dispatch_log
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- 2. Helper: recipient user ids for a license (holder + licensee primary users)
CREATE OR REPLACE FUNCTION public.license_recipients_for_holder(_license_id uuid)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH lic AS (
    SELECT id, holder_id FROM public.licenses WHERE id = _license_id
  ),
  -- Direct holder profile
  holder AS (
    SELECT p.id AS user_id, p.email
    FROM lic JOIN public.profiles p ON p.id = lic.holder_id
  ),
  -- If holder is a licensee record, find its primary users
  licensee_users AS (
    SELECT p.id AS user_id, p.email
    FROM lic
    JOIN public.licensees l ON l.id = lic.holder_id
    JOIN public.profiles p ON p.licensee_id = l.id AND p.user_type = 'primary'
  )
  SELECT user_id, email FROM holder
  UNION
  SELECT user_id, email FROM licensee_users;
$$;

GRANT EXECUTE ON FUNCTION public.license_recipients_for_holder(uuid) TO authenticated, service_role;

-- 3. Add missing license/user event configs
INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type, dedupe_window_seconds)
VALUES
  ('license.suspended',
   'License has been suspended',
   'License {{license_number}} suspended',
   'Your license {{license_number}} has been suspended. Reason: {{reason}}',
   'License {{license_number}} suspended',
   E'Hello,\n\nLicense {{license_number}} ({{license_type}}) has been suspended.\nReason: {{reason}}\n\nPlease log in to {{app_url}}/licenses/{{license_id}} for details.\n\nIf you have questions, contact support.',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"},{"type":"role","role":"super_admin"}]'::jsonb,
   'warning', 0),
  ('license.revoked',
   'License has been revoked',
   'License {{license_number}} revoked',
   'License {{license_number}} has been revoked. Reason: {{reason}}',
   'License {{license_number}} revoked',
   E'Hello,\n\nLicense {{license_number}} ({{license_type}}) has been revoked.\nReason: {{reason}}\n\nView details: {{app_url}}/licenses/{{license_id}}',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"},{"type":"role","role":"super_admin"}]'::jsonb,
   'error', 0),
  ('license.renewed',
   'License has been renewed',
   'License {{license_number}} renewed',
   'Your license {{license_number}} has been renewed. New validity until {{valid_until}}.',
   'License {{license_number}} renewed',
   E'Hello,\n\nGood news — license {{license_number}} ({{license_type}}) has been renewed.\nValid until: {{valid_until}}\n\nView: {{app_url}}/licenses/{{license_id}}',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"}]'::jsonb,
   'success', 0),
  ('license.reinstated',
   'License has been reinstated',
   'License {{license_number}} reinstated',
   'Your license {{license_number}} has been reinstated and is now active.',
   'License {{license_number}} reinstated',
   E'Hello,\n\nLicense {{license_number}} ({{license_type}}) has been reinstated and is now active.\n\nView: {{app_url}}/licenses/{{license_id}}',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"}]'::jsonb,
   'success', 0),
  ('license.cancelled',
   'License has been cancelled',
   'License {{license_number}} cancelled',
   'License {{license_number}} has been cancelled. Reason: {{reason}}',
   'License {{license_number}} cancelled',
   E'Hello,\n\nLicense {{license_number}} ({{license_type}}) has been cancelled.\nReason: {{reason}}\n\nView: {{app_url}}/licenses/{{license_id}}',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"},{"type":"role","role":"super_admin"}]'::jsonb,
   'warning', 0),
  ('license.expiring_soon',
   'License expiring soon reminder',
   'License {{license_number}} expires in {{days_until_expiry}} day(s)',
   'Your license {{license_number}} expires on {{valid_until}} ({{days_until_expiry}} days remaining). Please initiate renewal.',
   'Reminder: License {{license_number}} expires in {{days_until_expiry}} day(s)',
   E'Hello,\n\nThis is a reminder that license {{license_number}} ({{license_type}}) will expire on {{valid_until}} — {{days_until_expiry}} day(s) from now.\n\nPlease log in to {{app_url}}/licenses/{{license_id}} to initiate renewal.\n\nIf you have already renewed, you can ignore this message.',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"}]'::jsonb,
   'warning', 0),
  ('license.expired',
   'License has expired',
   'License {{license_number}} expired',
   'Your license {{license_number}} expired on {{valid_until}}.',
   'License {{license_number}} has expired',
   E'Hello,\n\nLicense {{license_number}} ({{license_type}}) expired on {{valid_until}}.\n\nPlease contact the regulator or log in to {{app_url}}/licenses/{{license_id}} for next steps.',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"holder_user_id"},{"type":"role","role":"super_admin"}]'::jsonb,
   'error', 0),
  ('user.invited',
   'A new user was invited',
   'Welcome to {{app_name}}',
   'You have been invited to {{app_name}}. Use {{invite_link}} to set your password.',
   'You have been invited to {{app_name}}',
   E'Hello {{full_name}},\n\nYou have been invited to {{app_name}}.\n\nClick the link below to set your password and sign in:\n{{invite_link}}\n\nIf you did not expect this email, please ignore it.',
   ARRAY['in_app','email'],
   '[{"type":"payload_user","key":"invited_user_id"}]'::jsonb,
   'info', 0),
  ('notification.admin_failure_alert',
   'Repeated email delivery failures',
   '⚠ Email delivery failures detected',
   '{{failure_count}} email notifications have failed in the last hour. Latest event: {{latest_event_key}}',
   '⚠ Email delivery failures detected on {{app_name}}',
   E'Multiple email notifications have failed to deliver in the last hour.\n\nFailure count: {{failure_count}}\nLatest event: {{latest_event_key}}\nLatest error: {{latest_error}}\n\nReview the notification log at {{app_url}}/admin/notification-logs',
   ARRAY['in_app','email'],
   '[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,
   'error', 3600)
ON CONFLICT (event_key) DO NOTHING;

-- 4. Enable pg_cron and pg_net for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 5. Schedule daily license expiry reminder job (02:30 UTC)
-- Unschedule any previous job with the same name (safe no-op if not present)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'license-expiry-reminders-daily';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'license-expiry-reminders-daily',
  '30 2 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/license-expiry-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZGZ0dHpxbWJrbWtjbnJ2cGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDI5MjUsImV4cCI6MjA4NjAxODkyNX0.i8z3U8j6NO19dBmXTiHykQuqF0GSeEa4Ge7bgvDvJNI'
    ),
    body := jsonb_build_object('triggered_by','cron','at', now())
  );
  $cron$
);

-- 6. Schedule hourly admin failure-alert sweep (checks notification_dispatch_log for repeated failures)
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'notification-failure-sweep-hourly';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.unschedule(v_jobid);
  END IF;
END $$;

SELECT cron.schedule(
  'notification-failure-sweep-hourly',
  '5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/notification-failure-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuZGZ0dHpxbWJrbWtjbnJ2cGZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0NDI5MjUsImV4cCI6MjA4NjAxODkyNX0.i8z3U8j6NO19dBmXTiHykQuqF0GSeEa4Ge7bgvDvJNI'
    ),
    body := jsonb_build_object('triggered_by','cron','at', now())
  );
  $cron$
);
