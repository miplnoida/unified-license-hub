-- 1. Portal URL setting (editable by admins)
INSERT INTO public.site_settings (key, value)
VALUES ('portal', jsonb_build_object(
  'base_url', 'https://boj.skntreasury.com',
  'login_url', 'https://boj.skntreasury.com/login'))
ON CONFLICT (key) DO NOTHING;

-- 2. user.role_changed → internal staff only (no email to the affected external user)
UPDATE public.notification_event_configs
SET recipient_rules = '[{"role": "super_admin", "type": "role"}]'::jsonb
WHERE event_key = 'user.role_changed';

-- 3. registration.workflow_completed → internal, in-app only
UPDATE public.notification_event_configs
SET recipient_rules = '[{"role": "super_admin", "type": "role"}, {"role": "admin", "type": "role"}]'::jsonb,
    channels = ARRAY['in_app']::text[]
WHERE event_key = 'registration.workflow_completed';

-- 4. registration.final_approved → in-app only (avoid duplicate applicant email)
UPDATE public.notification_event_configs
SET channels = ARRAY['in_app']::text[]
WHERE event_key = 'registration.final_approved';

-- 5. Single applicant-facing approval email with login link
UPDATE public.notification_templates
SET subject = 'Your registration {{registration_reference}} has been approved',
    body = 'Dear {{applicant_name}},' || E'\n\n' ||
           'Your registration {{registration_reference}} has been approved.' || E'\n\n' ||
           'You can now sign in to the portal using the link below:' || E'\n' ||
           '{{login_url}}' || E'\n\n' ||
           'Please sign in with the email address used during registration.' || E'\n\n' ||
           'Regards,' || E'\n' || 'Regulatory Licensing Portal',
    variables = '["registration_reference","applicant_name","login_url"]'::jsonb,
    updated_at = now()
WHERE id = '5b988c5f-01e4-4a16-a0fd-eb1530c4e154';

-- 6. Include login_url / portal_url in the approval payload
CREATE OR REPLACE FUNCTION public.trg_registration_approved_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_portal jsonb;
  v_base text;
  v_login text;
BEGIN
  IF NEW.status <> 'approved' OR OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;

  SELECT value INTO v_portal FROM public.site_settings WHERE key = 'portal';
  v_base := COALESCE(v_portal->>'base_url', 'https://boj.skntreasury.com');
  v_login := COALESCE(v_portal->>'login_url', v_base || '/login');

  PERFORM public.notification_enqueue_event('registration.approved', 'registration', NEW.id,
    jsonb_build_object('registration_id', NEW.id, 'registration_reference', NEW.registration_reference,
      'applicant_id', NEW.user_id, 'applicant_name', COALESCE(NEW.applicant_name, 'Applicant'),
      'applicant_email', NEW.email,
      'sector_id', NEW.sector_id,
      'portal_url', v_base, 'login_url', v_login,
      'cta_url', '/dashboard', 'cta_label', 'Open portal'),
    'approved');
  RETURN NEW;
END $function$;