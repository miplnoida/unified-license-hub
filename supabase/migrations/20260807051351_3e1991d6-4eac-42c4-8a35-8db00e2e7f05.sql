CREATE OR REPLACE FUNCTION public.issue_decision_artifact(
  _application_id uuid,
  _artifact_type text,
  _rendered_html text,
  _merge_data jsonb DEFAULT '{}'::jsonb,
  _decision text DEFAULT NULL,
  _template_id uuid DEFAULT NULL,
  _template_version text DEFAULT NULL,
  _rationale text DEFAULT NULL,
  _conditions jsonb DEFAULT '[]'::jsonb,
  _issuing_regulator_id uuid DEFAULT NULL,
  _effective_date date DEFAULT NULL,
  _expiry_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_missing text[] := ARRAY[]::text[];
  v_version int;
  v_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF public.has_external_role(v_actor) THEN
    RAISE EXCEPTION 'not authorised to issue decision artifacts';
  END IF;
  IF _artifact_type NOT IN ('decision_letter', 'license_certificate') THEN
    RAISE EXCEPTION 'invalid artifact_type';
  END IF;

  IF btrim(coalesce(_merge_data->>'application_number', '')) = '' THEN
    v_missing := array_append(v_missing, 'application_number');
  END IF;
  IF btrim(coalesce(_merge_data->>'applicant_name', '')) = '' THEN
    v_missing := array_append(v_missing, 'applicant_name');
  END IF;
  IF btrim(coalesce(_merge_data->>'license_type', '')) = '' THEN
    v_missing := array_append(v_missing, 'license_type');
  END IF;
  IF _artifact_type = 'decision_letter' AND btrim(coalesce(_rationale, '')) = '' THEN
    v_missing := array_append(v_missing, 'rationale');
  END IF;
  IF _artifact_type = 'license_certificate' AND _effective_date IS NULL THEN
    v_missing := array_append(v_missing, 'effective_date');
  END IF;
  IF btrim(coalesce(_rendered_html, '')) = '' THEN
    v_missing := array_append(v_missing, 'rendered_document');
  END IF;

  IF array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'code', 'MISSING_MERGE_FIELDS', 'missing', to_jsonb(v_missing));
  END IF;

  SELECT coalesce(max(version), 0) + 1 INTO v_version
  FROM public.decision_artifacts
  WHERE application_id = _application_id AND artifact_type = _artifact_type;

  INSERT INTO public.decision_artifacts (
    application_id, artifact_type, version, decision, template_id, template_version,
    rendered_html, merge_data, rationale, conditions, issuing_regulator_id,
    effective_date, expiry_date, checksum, issued_by
  ) VALUES (
    _application_id, _artifact_type, v_version, _decision, _template_id, _template_version,
    _rendered_html, coalesce(_merge_data, '{}'::jsonb), _rationale, coalesce(_conditions, '[]'::jsonb),
    _issuing_regulator_id, _effective_date, _expiry_date,
    md5(coalesce(_rendered_html, '') || coalesce(_merge_data::text, '')), v_actor
  ) RETURNING id INTO v_id;

  PERFORM public.log_compliance_audit(
    'APPROVE'::compliance_audit_action,
    'decision_artifact',
    v_id::text,
    NULL,
    jsonb_build_object('application_id', _application_id, 'artifact_type', _artifact_type, 'version', v_version),
    NULL, NULL, NULL,
    jsonb_build_object('source', 'issue_decision_artifact')
  );

  RETURN jsonb_build_object('success', true, 'id', v_id, 'version', v_version);
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_decision_artifact(uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date) TO authenticated, service_role;