-- Application draft creation must derive ownership from auth.uid().
BEGIN;
SELECT plan(5);

SELECT has_function('public','create_application_draft',ARRAY['text','jsonb','uuid'],
  'create_application_draft(text,jsonb,uuid) exists');

SELECT set_config('request.jwt.claims', '{}', true);

SELECT throws_ok(
  $$SELECT (public.create_application_draft('General', '{}'::jsonb, NULL)).id$$,
  '42501', NULL,
  'create_application_draft rejects unauthenticated callers'
);

DO $$
DECLARE
  v_applicant uuid := '00000000-0000-0000-0000-00000000d285';
  v_denied uuid := '00000000-0000-0000-0000-00000000d286';
  v_spoofed uuid := '00000000-0000-0000-0000-00000000d287';
  v_app public.applications;
BEGIN
  INSERT INTO auth.users(id, email)
    VALUES (v_applicant, 'application-draft-owner@example.com')
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles(user_id, role)
    VALUES (v_applicant, 'applicant')
    ON CONFLICT DO NOTHING;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_applicant::text, 'role', 'authenticated')::text, true);

  v_app := public.create_application_draft(
    'Test License',
    jsonb_build_object('applicant_id', v_spoofed::text, 'sector_id', ''),
    NULL
  );

  PERFORM is(v_app.applicant_id, v_applicant,
    'created draft owner is derived from auth.uid(), not caller data');

  PERFORM ok(
    EXISTS (
      SELECT 1
      FROM public.applications a
      WHERE a.id = v_app.id
        AND a.applicant_id = v_applicant
        AND a.status = 'draft'
        AND a.license_type = 'Test License'
    ),
    'created draft is persisted with expected draft fields'
  );

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_denied::text, 'role', 'authenticated')::text, true);

  BEGIN
    PERFORM public.create_application_draft('Denied License', '{}'::jsonb, NULL);
    PERFORM ok(false, 'expected unprivileged authenticated caller to be denied');
  EXCEPTION WHEN insufficient_privilege THEN
    PERFORM ok(true, 'unprivileged authenticated caller is denied');
  END;
END $$;

SELECT * FROM finish();
ROLLBACK;