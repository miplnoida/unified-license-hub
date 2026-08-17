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
    jsonb_build_object(
      'registration_reference', NEW.registration_reference,
      'applicant_name', COALESCE(NEW.contact_person_name, NEW.entity_name, 'Applicant'),
      'applicant_email', NEW.email,
      'sector_id', NEW.sector_id,
      'portal_url', v_base, 'login_url', v_login,
      'cta_url', v_login, 'cta_label', 'Login'),
    'approved');
  RETURN NEW;
END;
$function$;