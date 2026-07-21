
CREATE OR REPLACE FUNCTION public.reset_system_role_permissions(p_role_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_count integer := 0;
  v_bypass text := current_setting('app.rbac_bypass', true);
BEGIN
  IF v_bypass IS DISTINCT FROM 'reset' THEN
    PERFORM public.assert_role_management_action('reset');
    PERFORM set_config('app.rbac_bypass', 'reset', true);
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE name = p_role_name AND is_system = true;
  IF v_role_id IS NULL THEN
    PERFORM set_config('app.rbac_bypass', '', true);
    RAISE EXCEPTION 'System role % not found', p_role_name;
  END IF;

  DELETE FROM public.role_permissions WHERE role_id = v_role_id;

  WITH matrix(role_name, module, action) AS (
    VALUES
      ('Applicant','application_management','view'),
      ('Applicant','application_management','create'),
      ('Applicant','application_management','edit'),
      ('Applicant','licensing','view'),
      ('Applicant','licensing','submit'),
      ('Applicant','licensing','respond_rfi'),
      ('Applicant','licensing','upload_documents'),
      ('Regulated Entity User','application_management','view'),
      ('Regulated Entity User','license_management','view'),
      ('Regulated Entity User','returns_management','view'),
      ('Regulated Entity User','returns_management','create'),
      ('Regulated Entity User','returns_management','edit'),
      ('Regulated Entity User','returns_management','submit'),
      ('Regulated Entity User','returns_management','upload_documents'),
      ('Regulated Entity User','returns_management','respond_rfi'),
      ('Regulated Entity User','returns_management','view_status'),
      ('Regulated Entity User','complaint_management','view'),
      ('Regulated Entity User','complaint_management','create'),
      ('Regulated Entity User','complaint_management','edit'),
      ('Regulated Entity User','complaint_management','submit'),
      ('Regulated Entity User','complaint_management','upload_documents'),
      ('Regulated Entity User','complaint_management','view_status'),
      ('Regulated Entity User','fit_and_proper','view'),
      ('Regulated Entity User','fit_and_proper','submit'),
      ('Regulated Entity User','fit_and_proper','upload_documents'),
      ('Regulated Entity User','fit_and_proper','view_status'),
      ('Licensing Officer','application_management','view'),
      ('Licensing Officer','application_management','create'),
      ('Licensing Officer','application_management','edit'),
      ('Licensing Officer','license_management','view'),
      ('Licensing Officer','license_management','edit'),
      ('Licensing Officer','registration_management','view'),
      ('Licensing Officer','registration_management','edit'),
      ('Licensing Officer','licensing','view'),
      ('Licensing Officer','licensing','respond_rfi'),
      ('Licensing Officer','licensing','add_legal_notes'),
      ('Licensing Officer','licensing','flag_concern'),
      ('Licensing Officer','licensing','recommend_conditions'),
      ('Licensing Officer','licensing','upload_documents'),
      ('Licensing Officer','report_management','view'),
      ('Analyst','application_management','view'),
      ('Analyst','application_management','edit'),
      ('Analyst','license_management','view'),
      ('Analyst','registration_management','view'),
      ('Analyst','returns_management','view'),
      ('Analyst','complaint_management','view'),
      ('Analyst','report_management','view'),
      ('Analyst','licensing','view'),
      ('Analyst','licensing','flag_concern'),
      ('Legal/Compliance Reviewer','application_management','view'),
      ('Legal/Compliance Reviewer','application_management','edit'),
      ('Legal/Compliance Reviewer','license_management','view'),
      ('Legal/Compliance Reviewer','registration_management','view'),
      ('Legal/Compliance Reviewer','returns_management','view'),
      ('Legal/Compliance Reviewer','complaint_management','view'),
      ('Legal/Compliance Reviewer','complaint_management','edit'),
      ('Legal/Compliance Reviewer','report_management','view'),
      ('Legal/Compliance Reviewer','licensing','view'),
      ('Legal/Compliance Reviewer','licensing','add_legal_notes'),
      ('Legal/Compliance Reviewer','licensing','recommend_conditions'),
      ('Legal/Compliance Reviewer','licensing','flag_concern'),
      ('Approver/Decision-Maker','application_management','view'),
      ('Approver/Decision-Maker','application_management','approve'),
      ('Approver/Decision-Maker','application_management','reject'),
      ('Approver/Decision-Maker','license_management','view'),
      ('Approver/Decision-Maker','license_management','approve'),
      ('Approver/Decision-Maker','registration_management','view'),
      ('Approver/Decision-Maker','registration_management','approve'),
      ('Approver/Decision-Maker','registration_management','reject'),
      ('Approver/Decision-Maker','returns_management','view'),
      ('Approver/Decision-Maker','returns_management','approve'),
      ('Approver/Decision-Maker','complaint_management','view'),
      ('Approver/Decision-Maker','complaint_management','edit'),
      ('Approver/Decision-Maker','report_management','view'),
      ('Approver/Decision-Maker','licensing','view'),
      ('Approver/Decision-Maker','licensing','approve'),
      ('Approver/Decision-Maker','licensing','reject'),
      ('Approver/Decision-Maker','licensing','conditional_approve'),
      ('Approver/Decision-Maker','licensing','issue_digital_license'),
      ('Approver/Decision-Maker','licensing','override_ai_recommendation'),
      ('Approver/Decision-Maker','licensing','sign_enforcement_order'),
      ('Prudential Supervisor','application_management','view'),
      ('Prudential Supervisor','license_management','view'),
      ('Prudential Supervisor','returns_management','view'),
      ('Prudential Supervisor','returns_management','edit'),
      ('Prudential Supervisor','returns_management','approve'),
      ('Prudential Supervisor','complaint_management','view'),
      ('Prudential Supervisor','report_management','view'),
      ('Market Conduct Supervisor','application_management','view'),
      ('Market Conduct Supervisor','license_management','view'),
      ('Market Conduct Supervisor','complaint_management','view'),
      ('Market Conduct Supervisor','complaint_management','create'),
      ('Market Conduct Supervisor','complaint_management','edit'),
      ('Market Conduct Supervisor','report_management','view'),
      ('Committee Member','application_management','view'),
      ('Committee Member','application_management','approve'),
      ('Committee Member','license_management','view'),
      ('Committee Member','license_management','approve'),
      ('Committee Member','registration_management','view'),
      ('Committee Member','registration_management','approve'),
      ('Committee Member','returns_management','view'),
      ('Committee Member','returns_management','approve'),
      ('Committee Member','complaint_management','view'),
      ('Committee Member','report_management','view'),
      ('Committee Member','fit_and_proper_committee','view'),
      ('Committee Member','fit_and_proper_committee','cast_weighted_vote'),
      ('Committee Member','fit_and_proper_committee','provide_rationale')
  )
  INSERT INTO public.role_permissions (role_id, permission_id)
  SELECT v_role_id, p.id
  FROM matrix m
  JOIN public.permissions p ON p.module = m.module AND p.name = m.action
  WHERE m.role_name = p_role_name
    AND COALESCE(p.deprecated, false) = false
    AND p.enforced = true
  ON CONFLICT DO NOTHING;

  IF p_role_name = 'Executive Supervisor' THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM public.permissions p
    WHERE (p.name IN ('view','approve','view_status')
       OR p.module = 'executive_oversight'
       OR (p.module = 'settings' AND p.name = 'view'))
      AND COALESCE(p.deprecated, false) = false
      AND p.enforced = true
    ON CONFLICT DO NOTHING;
  END IF;

  IF p_role_name = 'System Administrator' THEN
    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, p.id FROM public.permissions p
    WHERE COALESCE(p.deprecated, false) = false AND p.enforced = true
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO v_count FROM public.role_permissions WHERE role_id = v_role_id;
  PERFORM set_config('app.rbac_bypass', '', true);
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reset_system_role_permissions(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_system_role_permissions(text) TO authenticated, service_role;
