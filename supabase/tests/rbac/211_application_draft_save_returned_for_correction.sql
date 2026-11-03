-- Regression: owner can save while returned_for_correction; outsiders still refused.
-- Run inside a transaction that is rolled back.
BEGIN;
DO $$
DECLARE v_app uuid; v_owner uuid; v_other uuid; v_ok boolean := false;
BEGIN
  SELECT id, applicant_id INTO v_app, v_owner FROM public.applications
   WHERE applicant_id IS NOT NULL LIMIT 1;
  SELECT id INTO v_other FROM auth.users WHERE id <> v_owner
     AND NOT public.is_super_admin(id)
     AND NOT public.has_permission(id,'application_management','edit')
     AND NOT EXISTS (SELECT 1 FROM public.entity_user_memberships m, public.applications a
                      WHERE a.id=v_app AND m.user_id=auth.users.id AND m.entity_id=a.entity_id)
   LIMIT 1;
  UPDATE public.applications SET status='returned_for_correction' WHERE id=v_app;

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_owner,'role','authenticated')::text, true);
  PERFORM public.application_draft_save(v_app, NULL);

  PERFORM set_config('request.jwt.claims', json_build_object('sub',v_other,'role','authenticated')::text, true);
  BEGIN
    PERFORM public.application_draft_save(v_app, NULL);
  EXCEPTION WHEN others THEN
    v_ok := SQLERRM LIKE 'APPLICATION_EDIT_FORBIDDEN%';
  END;
  IF NOT v_ok THEN RAISE EXCEPTION 'non-member was not refused'; END IF;
END $$;
ROLLBACK;
