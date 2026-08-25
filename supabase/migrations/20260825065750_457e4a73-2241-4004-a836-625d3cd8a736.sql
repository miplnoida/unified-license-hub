CREATE OR REPLACE FUNCTION public.returns_open_filing(_period_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE p record; o record; d record; v_filing public.return_filings;
        v_version_id uuid; v_ref text; v_seq int;
BEGIN
  SELECT * INTO p FROM public.reporting_periods WHERE id = _period_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
  SELECT * INTO o FROM public.entity_reporting_obligations WHERE id = p.entity_reporting_obligation_id;
  SELECT * INTO d FROM public.return_definitions WHERE id = o.return_definition_id;

  IF NOT public.returns_can_file_obligation(o.id) THEN
    RAISE EXCEPTION 'You are not authorised to file returns for this entity' USING ERRCODE='42501';
  END IF;
  IF o.status <> 'ACTIVE' THEN RAISE EXCEPTION 'This reporting obligation is not active'; END IF;
  IF p.status = 'WAIVED' THEN RAISE EXCEPTION 'This period has been waived'; END IF;

  SELECT * INTO v_filing FROM public.return_filings WHERE reporting_period_id = _period_id;
  IF v_filing.id IS NULL THEN
    SELECT count(*) + 1 INTO v_seq FROM public.return_filings WHERE entity_id = o.entity_id;
    v_ref := 'FIL-' || to_char(now(),'YYYY') || '-' || lpad(v_seq::text, 6, '0') || '-' ||
             substr(replace(gen_random_uuid()::text,'-',''), 1, 4);
    INSERT INTO public.return_filings(
      filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
      return_definition_id, status, created_by)
    VALUES (v_ref, o.entity_id, o.id, p.id, d.id, 'DRAFT', auth.uid())
    RETURNING * INTO v_filing;
  END IF;

  SELECT id INTO v_version_id FROM public.return_filing_versions
   WHERE return_filing_id = v_filing.id AND status IN ('DRAFT','CORRECTION_REQUESTED')
   ORDER BY version_number DESC LIMIT 1;

  IF v_version_id IS NULL THEN
    INSERT INTO public.return_filing_versions(return_filing_id, version_number, status)
    VALUES (v_filing.id,
      COALESCE((SELECT max(version_number) FROM public.return_filing_versions
                 WHERE return_filing_id = v_filing.id), 0) + 1, 'DRAFT')
    RETURNING id INTO v_version_id;

    UPDATE public.return_filings
       SET current_version_number = (SELECT max(version_number) FROM public.return_filing_versions
                                      WHERE return_filing_id = v_filing.id),
           status = CASE WHEN status = 'ACCEPTED' THEN status ELSE 'DRAFT' END,
           updated_at = now()
     WHERE id = v_filing.id;

    -- pin the form versions in force for this period
    INSERT INTO public.return_filing_form_requirements(
      return_filing_version_id, form_template_id, form_version_id, is_required, sequence, tab_name)
    SELECT v_version_id, df.form_template_id, fv.id, df.is_required, df.sequence,
           COALESCE(df.tab_name, df.section_label)
      FROM public.return_definition_forms df
      JOIN LATERAL (
        SELECT v.id FROM public.form_versions v
         WHERE v.template_id = df.form_template_id AND v.status = 'published'
           AND (v.effective_from IS NULL OR v.effective_from::date <= p.period_end)
         ORDER BY v.version DESC LIMIT 1) fv ON true
     WHERE df.return_definition_id = d.id
       AND df.effective_from <= p.period_end
       AND (df.effective_to IS NULL OR df.effective_to >= p.period_end)
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM public.create_audit_log('return_filing', v_filing.id, 'OPEN',
    jsonb_build_object('version_id', v_version_id, 'period', p.period_label));

  RETURN jsonb_build_object('filing_id', v_filing.id, 'filing_reference', v_filing.filing_reference,
                            'version_id', v_version_id);
END $function$;

CREATE OR REPLACE FUNCTION public.returns_submit_filing(_version_id uuid, _declaration_accepted boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v record; d record; v_check jsonb;
BEGIN
  SELECT v2.id, v2.status, v2.return_filing_id, f.entity_id, f.return_definition_id, f.id AS filing_id, f.entity_reporting_obligation_id AS obligation_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF NOT public.returns_can_file_obligation(v.obligation_id) THEN
    RAISE EXCEPTION 'You are not authorised to submit returns for this entity' USING ERRCODE='42501';
  END IF;
  IF v.status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
    RAISE EXCEPTION 'This filing version has already been submitted';
  END IF;

  SELECT * INTO d FROM public.return_definitions WHERE id = v.return_definition_id;
  IF d.requires_declaration AND NOT _declaration_accepted THEN
    RAISE EXCEPTION 'The declaration must be accepted before submission';
  END IF;

  PERFORM public.returns_extract_metrics(_version_id);
  PERFORM public.returns_calculate_metrics(_version_id);
  v_check := public.returns_validate_filing(_version_id);
  IF NOT (v_check->>'can_submit')::boolean THEN
    RETURN jsonb_build_object('submitted', false, 'validation', v_check);
  END IF;

  UPDATE public.return_filing_versions
     SET status = 'SUBMITTED', is_immutable = true, submitted_at = now(), submitted_by = auth.uid(),
         declaration_accepted_at = CASE WHEN _declaration_accepted THEN now() END,
         declaration_accepted_by = CASE WHEN _declaration_accepted THEN auth.uid() END
   WHERE id = _version_id;

  UPDATE public.return_filings
     SET status = 'SUBMITTED', submitted_at = COALESCE(submitted_at, now()), updated_at = now()
   WHERE id = v.filing_id;

  UPDATE public.return_filing_requests SET status = 'RESOLVED', updated_at = now()
   WHERE return_filing_id = v.filing_id AND status IN ('OPEN','RESPONDED') AND request_kind = 'CORRECTION';

  PERFORM public.create_audit_log('return_filing', v.filing_id, 'SUBMIT',
    jsonb_build_object('version_id', _version_id, 'validation', v_check));

  RETURN jsonb_build_object('submitted', true, 'validation', v_check);
END $function$;

CREATE OR REPLACE FUNCTION public.returns_attach_form_response(_requirement_id uuid, _form_response_id uuid, _completion text DEFAULT 'COMPLETED'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_entity uuid; v_status text; v_obligation uuid;
BEGIN
  SELECT f.entity_id, v.status, f.entity_reporting_obligation_id INTO v_entity, v_status, v_obligation
    FROM public.return_filing_form_requirements r
    JOIN public.return_filing_versions v ON v.id = r.return_filing_version_id
    JOIN public.return_filings f ON f.id = v.return_filing_id
   WHERE r.id = _requirement_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Form requirement not found'; END IF;
  IF NOT public.returns_can_prepare_obligation(v_obligation) THEN
    RAISE EXCEPTION 'You are not authorised to prepare returns for this entity' USING ERRCODE='42501';
  END IF;
  IF v_status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
    RAISE EXCEPTION 'This filing version is no longer editable';
  END IF;

  UPDATE public.return_filing_form_requirements
     SET form_response_id = _form_response_id,
         completion_status = COALESCE(_completion, 'COMPLETED')
   WHERE id = _requirement_id;
END $function$;
