-- Complaint tracking is authenticated and identity-gated.
BEGIN;
SELECT plan(5);

SELECT has_function('public','get_public_complaint_tracking',
  'public tracking RPC exists');

SELECT is(
  has_function_privilege('anon', 'public.get_public_complaint_tracking(text,text)', 'EXECUTE'),
  false,
  'anonymous users cannot execute complaint tracking'
);

DO $$
DECLARE
  owner_id uuid := '00000000-0000-0000-0000-000000090001';
  other_id uuid := '00000000-0000-0000-0000-000000090002';
  complaint_id uuid := '00000000-0000-0000-0000-000000090101';
  ref text := 'CMP-TRACK-RLS-OWNER';
  res jsonb;
BEGIN
  INSERT INTO auth.users(id, email)
  VALUES
    (owner_id, 'complaint-owner@rls.test'),
    (other_id, 'complaint-other@rls.test')
  ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

  INSERT INTO public.user_roles(user_id, role)
  VALUES
    (owner_id, 'applicant'::public.app_role),
    (other_id, 'applicant'::public.app_role)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.complaints(
    id, complaint_number, complainant_id, subject, description, email, status, created_at
  )
  VALUES (
    complaint_id,
    ref,
    owner_id,
    'Owner-only tracking test',
    'A complaint used to verify tracking privacy for applicants.',
    'complaint-owner@rls.test',
    'submitted',
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    complaint_number = EXCLUDED.complaint_number,
    complainant_id = EXCLUDED.complainant_id,
    email = EXCLUDED.email,
    status = EXCLUDED.status;
END $$;

SET LOCAL ROLE authenticated;

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000090001', 'role', 'authenticated')::text,
  true
);

SELECT ok(
  COALESCE((public.get_public_complaint_tracking('CMP-TRACK-RLS-OWNER', 'wrong-email@rls.test')->>'found')::boolean, false),
  'complaint owner can track their own complaint without trusting supplied email'
);

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000090002', 'role', 'authenticated')::text,
  true
);

SELECT ok(
  COALESCE((public.get_public_complaint_tracking('CMP-TRACK-RLS-OWNER', NULL)->>'found')::boolean, false) IS NOT TRUE,
  'unrelated applicant cannot track by reference alone'
);

SELECT ok(
  COALESCE((public.get_public_complaint_tracking('CMP-TRACK-RLS-OWNER', 'complaint-owner@rls.test')->>'found')::boolean, false) IS NOT TRUE,
  'unrelated applicant cannot bypass tracking by supplying the owner email'
);

RESET role;

SELECT * FROM finish();
ROLLBACK;
