DO $$
BEGIN
  PERFORM public.notification_enqueue_event(
    'registration.approved','registration','a541f31f-cd2b-4547-a816-935417a49931',
    jsonb_build_object(
      'registration_reference','REG-2026-000032',
      'applicant_name','MIPL Entity Five',
      'applicant_email','entity5@yopmail.com',
      'sector_id','d90ffa53-709b-41e8-a6d9-efd1bbac69bc',
      'portal_url','https://boj.skntreasury.com',
      'login_url','https://boj.skntreasury.com/login',
      'cta_url','https://boj.skntreasury.com/login',
      'cta_label','Login'),
    'approved');
END $$;