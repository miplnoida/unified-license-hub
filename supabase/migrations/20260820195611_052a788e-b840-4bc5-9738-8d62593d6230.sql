create or replace function public.can_issue_decision_artifact(_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when _user is null then false
    when public.is_super_admin(_user) then true
    when public.has_external_role(_user) then false
    else public.has_permission(_user, 'license_management', 'manage_certificates')
      or public.has_permission(_user, 'license_management', 'approve')
      or public.has_permission(_user, 'application_management', 'approve')
  end
$$;

revoke all on function public.can_issue_decision_artifact(uuid) from public;
revoke all on function public.can_issue_decision_artifact(uuid) from anon;
grant execute on function public.can_issue_decision_artifact(uuid) to authenticated, service_role;

create or replace function public.issue_decision_artifact(
  _application_id uuid, _artifact_type text, _rendered_html text,
  _merge_data jsonb default '{}'::jsonb, _decision text default null,
  _template_id uuid default null, _template_version text default null,
  _rationale text default null, _conditions jsonb default '[]'::jsonb,
  _issuing_regulator_id uuid default null,
  _effective_date date default null, _expiry_date date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
DECLARE
  v_actor uuid := auth.uid();
  v_missing text[] := ARRAY[]::text[];
  v_version int;
  v_id uuid;
  v_exists boolean;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF public.has_external_role(v_actor) THEN
    PERFORM public.log_security_event(
      'ACCESS_DENIED'::security_event_type, 'issue_decision_artifact', NULL, NULL,
      jsonb_build_object('reason', 'external_role', 'application_id', _application_id),
      NULL, 'high', 'license_management', 'issue', 'decision_artifact', _application_id::text, NULL);
    RAISE EXCEPTION 'not authorised to issue decision artifacts';
  END IF;

  IF NOT public.can_issue_decision_artifact(v_actor) THEN
    PERFORM public.log_security_event(
      'ACCESS_DENIED'::security_event_type, 'issue_decision_artifact', NULL, NULL,
      jsonb_build_object('reason', 'no_licensing_decision_authority', 'application_id', _application_id),
      NULL, 'high', 'license_management', 'issue', 'decision_artifact', _application_id::text, NULL);
    RAISE EXCEPTION 'not authorised to issue decision artifacts';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.applications WHERE id = _application_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'application not found';
  END IF;

  IF NOT public.can_mutate_application(v_actor, _application_id) THEN
    PERFORM public.log_security_event(
      'ACCESS_DENIED'::security_event_type, 'issue_decision_artifact', NULL, NULL,
      jsonb_build_object('reason', 'no_application_decision_rights', 'application_id', _application_id),
      NULL, 'high', 'license_management', 'issue', 'decision_artifact', _application_id::text, NULL);
    RAISE EXCEPTION 'not authorised to issue decision artifacts for this application';
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
$fn$;

revoke all on function public.issue_decision_artifact(uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date) from public;
revoke all on function public.issue_decision_artifact(uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date) from anon;
grant execute on function public.issue_decision_artifact(uuid, text, text, jsonb, text, uuid, text, text, jsonb, uuid, date, date) to authenticated, service_role;