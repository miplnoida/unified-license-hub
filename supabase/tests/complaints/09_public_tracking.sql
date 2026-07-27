-- Complaint tracking is authenticated and identity-gated.
BEGIN;
SELECT plan(6);

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
  consumer_role_id uuid := '00000000-0000-0000-0000-000000090201';
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

  INSERT INTO public.roles(id, name, system_role, role_type, is_system, status)
  VALUES (
    consumer_role_id,
    'Consumer / Complainant RLS Test',
    'applicant',
    'internal',
    false,
    'active'
  )
  ON CONFLICT (name) DO UPDATE SET
    system_role = EXCLUDED.system_role,
    role_type = EXCLUDED.role_type,
    status = EXCLUDED.status;

  INSERT INTO public.user_dynamic_roles(user_id, role_id)
  VALUES (other_id, consumer_role_id)
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

SELECT ok(
  COALESCE((public.get_public_complaint_tracking('CMP-TRACK-RLS-OWNER', NULL)->>'found')::boolean, false) IS NOT TRUE,
  'consumer/applicant dynamic roles do not receive the internal staff override'
);

RESET role;

SELECT * FROM finish();
ROLLBACK;
