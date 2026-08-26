CREATE OR REPLACE FUNCTION public.mc01_runtime_certify()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_regulator uuid := gen_random_uuid();
  v_sector uuid := gen_random_uuid();
  v_licensee uuid := gen_random_uuid();
  v_stale_staff uuid := gen_random_uuid();
  v_result jsonb;
  v_tracking jsonb;
  v_complaint_id uuid;
BEGIN
  INSERT INTO public.regulators (id, name, code, status)
  VALUES (v_regulator, 'MC01 Runtime Certification Regulator',
          'MC01-' || left(v_regulator::text, 8), 'active');
  INSERT INTO public.sectors (id, name, regulator_id)
  VALUES (v_sector, 'MC01 Runtime Certification Sector', v_regulator);
  INSERT INTO auth.users (id, email)
  VALUES (v_stale_staff, 'mc01-stale-supervisor@runtime.test');
  INSERT INTO public.licensees (id, name, sector_id, status, lead_regulator_id)
  VALUES (v_licensee, 'MC01 Runtime Certification Provider', v_sector, 'active', v_stale_staff);

  v_result := public.public_complaint_intake_submit(
    jsonb_build_object(
      'subject', 'MC-01 matched-provider runtime certification',
      'description', 'Non-sensitive certification fixture validating canonical public complaint persistence.',
      'email', 'mc01-runtime@cert.test',
      'anonymous', false,
      'parties', jsonb_build_array(jsonb_build_object(
        'party_role', 'affected_consumer', 'party_type', 'individual',
        'is_primary_contact', true, 'full_name', 'Runtime Consumer',
        'email', 'mc01-runtime@cert.test')),
      'respondents', jsonb_build_array(jsonb_build_object(
        'is_primary', true, 'match_state', 'MATCHED_REGULATED',
        'respondent_role', 'provider', 'licensee_id', v_licensee,
        'legal_name', 'MC01 Runtime Certification Provider')),
      'contact_preference', jsonb_build_object(
        'preferred_method', 'email', 'email', 'mc01-runtime@cert.test'),
      'intake_details', jsonb_build_object(
        'service_description', 'Runtime certification service',
        'declaration_accepted', true,
        'privacy_notice_acknowledged', true,
        'information_sharing_acknowledged', true)
    ), '{}'::uuid[], 'mc01-runtime-cert-' || v_licensee::text
  );
  v_complaint_id := (v_result->>'id')::uuid;

  IF (SELECT regulator_id FROM public.complaints WHERE id = v_complaint_id) IS DISTINCT FROM v_regulator THEN
    RAISE EXCEPTION 'MC01_CERT_ROUTING_FAILED';
  END IF;
  IF coalesce(v_result->>'tracking_access_code','') !~ '^[A-F0-9]{12}$' THEN
    RAISE EXCEPTION 'MC01_CERT_TRACKING_CODE_FAILED';
  END IF;
  IF (SELECT status FROM public.complaint_jurisdiction_assessments WHERE complaint_id = v_complaint_id)
     IS DISTINCT FROM 'PENDING_ASSESSMENT' THEN
    RAISE EXCEPTION 'MC01_CERT_JURISDICTION_FAILED';
  END IF;
  IF (SELECT count(*) FROM public.workflow_instances WHERE entity_type='complaint' AND entity_id=v_complaint_id) <> 1
     OR (SELECT count(*) FROM public.audit_logs WHERE entity_type='complaint' AND entity_id=v_complaint_id::text AND action='complaint.created') <> 1
     OR (SELECT count(*) FROM public.notification_outbox WHERE entity_type='complaint' AND entity_id=v_complaint_id) <> 1 THEN
    RAISE EXCEPTION 'MC01_CERT_OPERATIONS_FAILED';
  END IF;

  v_tracking := public.get_public_complaint_tracking_v2(
    v_result->>'reference', v_result->>'tracking_access_code', NULL);
  IF coalesce((v_tracking->>'found')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'MC01_CERT_PUBLIC_TRACKING_FAILED';
  END IF;
  IF v_tracking ?| ARRAY['email','complainant_id','description','internal_notes'] THEN
    RAISE EXCEPTION 'MC01_CERT_PUBLIC_REDACTION_FAILED';
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'MC001',
    MESSAGE = 'MC01_CERT_PASS';
EXCEPTION
  WHEN SQLSTATE 'MC001' THEN
    RETURN jsonb_build_object('certified', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.mc01_runtime_certify() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mc01_runtime_certify() TO service_role;

DO $certification$
DECLARE v_result jsonb;
BEGIN
  v_result := public.mc01_runtime_certify();
  IF coalesce((v_result->>'certified')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'MC-01 runtime certification did not pass';
  END IF;
END;
$certification$;

DROP FUNCTION public.mc01_runtime_certify();