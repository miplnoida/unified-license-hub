CREATE OR REPLACE FUNCTION public.create_application_draft(
  _license_type text,
  _data jsonb DEFAULT '{}'::jsonb,
  _regulator_id uuid DEFAULT NULL
)
RETURNS public.applications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_application public.applications;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: You must be signed in to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.is_super_admin(v_uid)
    OR public.has_permission(v_uid, 'application_management', 'create')
    OR public.has_role(v_uid, 'applicant'::public.app_role)
    OR public.has_role(v_uid, 'pre_licensee'::public.app_role)
    OR public.has_role(v_uid, 'licensee_primary'::public.app_role)
    OR public.has_role(v_uid, 'licensee_secondary'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'APPLICATION_CREATE_FORBIDDEN: You do not have permission to create an application draft.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.applications (
    applicant_id,
    license_type,
    status,
    data,
    regulator_id
  )
  VALUES (
    v_uid,
    COALESCE(NULLIF(trim(_license_type), ''), 'Application'),
    'draft',
    COALESCE(_data, '{}'::jsonb),
    _regulator_id
  )
  RETURNING * INTO v_application;

  RETURN v_application;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_application_draft(text, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_application_draft(text, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_application_draft(text, jsonb, uuid) TO service_role;