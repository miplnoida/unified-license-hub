DO $$
DECLARE v_portal jsonb; v_base text; v_login text; r record;
BEGIN
  SELECT value INTO v_portal FROM public.site_settings WHERE key = 'portal';
  v_base := COALESCE(v_portal->>'base_url', 'https://boj.skntreasury.com');
  v_login := COALESCE(v_portal->>'login_url', v_base || '/login');
  SELECT * INTO r FROM public.registrations WHERE email = 'entity5@yopmail.com' LIMIT 1;
  PERFORM public.notification_enqueue_event('registration.approved','registration', r.id,
    jsonb_build_object(
      'registration_reference', r.registration_reference,
      'applicant_name', COALESCE(r.applicant_name, 'Applicant'),
      'applicant_email', r.email,
      'sector_id', r.sector_id,
      'portal_url', v_base, 'login_url', v_login,
      'cta_url', v_login, 'cta_label', 'Login'),
    'manual-verify-' || to_char(now(), 'YYYYMMDDHH24MISS'));
END $$;