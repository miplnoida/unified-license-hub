
-- ============================================================
-- WAVE C — FILING LIFECYCLE, METRIC EXTRACTION & CALCULATION
-- ============================================================

CREATE OR REPLACE FUNCTION public.returns_can_file(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'returns_management', 'create')
    OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.submit')
  );
$$;
REVOKE ALL ON FUNCTION public.returns_can_file(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_can_file(uuid) TO authenticated;

-- ---------------- OPEN / RESUME A FILING -------------------------------
CREATE OR REPLACE FUNCTION public.returns_open_filing(_period_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; o record; d record; v_filing public.return_filings;
        v_version_id uuid; v_ref text; v_seq int;
BEGIN
  SELECT * INTO p FROM public.reporting_periods WHERE id = _period_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Reporting period not found'; END IF;
  SELECT * INTO o FROM public.entity_reporting_obligations WHERE id = p.entity_reporting_obligation_id;
  SELECT * INTO d FROM public.return_definitions WHERE id = o.return_definition_id;

  IF NOT public.returns_can_file(o.entity_id) THEN
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
END $$;
REVOKE ALL ON FUNCTION public.returns_open_filing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_open_filing(uuid) TO authenticated;

-- ---------------- ATTACH A COMPLETED FORM RESPONSE ---------------------
CREATE OR REPLACE FUNCTION public.returns_attach_form_response(
  _requirement_id uuid, _form_response_id uuid, _completion text DEFAULT 'COMPLETED')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid; v_status text;
BEGIN
  SELECT f.entity_id, v.status INTO v_entity, v_status
    FROM public.return_filing_form_requirements r
    JOIN public.return_filing_versions v ON v.id = r.return_filing_version_id
    JOIN public.return_filings f ON f.id = v.return_filing_id
   WHERE r.id = _requirement_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Form requirement not found'; END IF;
  IF NOT public.returns_can_file(v_entity) THEN
    RAISE EXCEPTION 'You are not authorised to file returns for this entity' USING ERRCODE='42501';
  END IF;
  IF v_status NOT IN ('DRAFT','CORRECTION_REQUESTED') THEN
    RAISE EXCEPTION 'This filing version is no longer editable';
  END IF;

  UPDATE public.return_filing_form_requirements
     SET form_response_id = _form_response_id,
         completion_status = COALESCE(_completion, 'COMPLETED')
   WHERE id = _requirement_id;
END $$;
REVOKE ALL ON FUNCTION public.returns_attach_form_response(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_attach_form_response(uuid, uuid, text) TO authenticated;

-- ---------------- METRIC EXTRACTION ------------------------------------
CREATE OR REPLACE FUNCTION public.returns_extract_metrics(_version_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_count int := 0;
BEGIN
  SELECT v2.id, f.entity_id, f.reporting_period_id INTO v
    FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  DELETE FROM public.return_metric_values
   WHERE return_filing_version_id = _version_id AND source_kind <> 'LEGACY_EVIDENCE';

  INSERT INTO public.return_metric_values(
    return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
    value_numeric, value_text, value_boolean, value_date, availability, source_kind,
    source_form_response_id, source_form_version_id, source_field_definition_id)
  SELECT DISTINCT ON (fd.regulatory_metric_id)
         _version_id, v.entity_id, fd.regulatory_metric_id, v.reporting_period_id,
         sv.value_number, sv.value_text, sv.value_boolean, sv.value_date,
         CASE WHEN sv.value_number IS NULL AND sv.value_text IS NULL
                   AND sv.value_boolean IS NULL AND sv.value_date IS NULL
              THEN 'NOT_AVAILABLE' ELSE 'AVAILABLE' END,
         'REPORTED', sv.response_id, sv.form_version_id, fd.id
    FROM public.return_filing_form_requirements r
    JOIN public.form_submission_values sv ON sv.response_id = r.form_response_id
    JOIN public.form_field_definitions fd ON fd.id = sv.form_field_definition_id
   WHERE r.return_filing_version_id = _version_id
     AND fd.regulatory_metric_id IS NOT NULL
     AND COALESCE(sv.repeat_index, 0) = 0
   ORDER BY fd.regulatory_metric_id, sv.created_at DESC
  ON CONFLICT (return_filing_version_id, regulatory_metric_id) DO NOTHING;

  SELECT count(*) INTO v_count FROM public.return_metric_values
   WHERE return_filing_version_id = _version_id;
  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.returns_extract_metrics(uuid) FROM PUBLIC, anon;

-- ---------------- METRIC CALCULATION -----------------------------------
CREATE OR REPLACE FUNCTION public.returns_calculate_metrics(_version_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; rule record; dep text; v_expr text; v_val numeric;
        v_missing boolean; v_dep_val numeric; v_count int := 0;
BEGIN
  SELECT v2.id, f.entity_id, f.reporting_period_id INTO v
    FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  FOR rule IN
    SELECT mcr.*, rm.id AS metric_id FROM public.metric_calculation_rules mcr
      JOIN public.regulatory_metrics rm ON rm.id = mcr.regulatory_metric_id
     WHERE mcr.is_active AND rm.is_active
     ORDER BY array_length(mcr.dependency_metric_codes, 1) NULLS FIRST
  LOOP
    v_expr := rule.expression; v_missing := false;
    FOREACH dep IN ARRAY rule.dependency_metric_codes LOOP
      SELECT mv.value_numeric INTO v_dep_val
        FROM public.return_metric_values mv
        JOIN public.regulatory_metrics m2 ON m2.id = mv.regulatory_metric_id
       WHERE mv.return_filing_version_id = _version_id AND m2.code = dep
         AND mv.availability = 'AVAILABLE';
      IF v_dep_val IS NULL THEN v_missing := true; EXIT; END IF;
      v_expr := regexp_replace(v_expr, '\m' || dep || '\M', '(' || v_dep_val::text || ')', 'gi');
    END LOOP;

    IF v_missing THEN
      INSERT INTO public.return_metric_values(
        return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
        availability, availability_reason, source_kind, calculation_rule_id, calculated_at)
      VALUES (_version_id, v.entity_id, rule.metric_id, v.reporting_period_id,
        CASE WHEN rule.on_missing_dependency = 'ERROR' THEN 'ERROR' ELSE 'NOT_AVAILABLE' END,
        'A required input measurement was not reported for this period',
        'CALCULATED', rule.id, now())
      ON CONFLICT (return_filing_version_id, regulatory_metric_id) DO UPDATE
        SET availability = EXCLUDED.availability,
            availability_reason = EXCLUDED.availability_reason,
            calculation_rule_id = EXCLUDED.calculation_rule_id,
            calculated_at = now();
      CONTINUE;
    END IF;

    IF v_expr !~ '^[0-9+\-*/(). ]+$' THEN
      RAISE EXCEPTION 'Formula for metric % could not be resolved safely', rule.metric_id;
    END IF;

    BEGIN
      EXECUTE format('SELECT (%s)::numeric', v_expr) INTO v_val;
    EXCEPTION WHEN OTHERS THEN
      v_val := NULL;
    END;

    INSERT INTO public.return_metric_values(
      return_filing_version_id, entity_id, regulatory_metric_id, reporting_period_id,
      value_numeric, availability, availability_reason, source_kind,
      calculation_rule_id, calculation_inputs, calculated_at)
    VALUES (_version_id, v.entity_id, rule.metric_id, v.reporting_period_id, v_val,
      CASE WHEN v_val IS NULL THEN 'ERROR' ELSE 'AVAILABLE' END,
      CASE WHEN v_val IS NULL THEN 'The formula could not be evaluated for this period' END,
      'CALCULATED', rule.id,
      jsonb_build_object('expression', rule.expression, 'resolved', v_expr), now())
    ON CONFLICT (return_filing_version_id, regulatory_metric_id) DO UPDATE
      SET value_numeric = EXCLUDED.value_numeric,
          availability = EXCLUDED.availability,
          availability_reason = EXCLUDED.availability_reason,
          calculation_rule_id = EXCLUDED.calculation_rule_id,
          calculation_inputs = EXCLUDED.calculation_inputs,
          calculated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.returns_calculate_metrics(uuid) FROM PUBLIC, anon;

-- ---------------- VALIDATION -------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_validate_filing(_version_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_errors int; v_warnings int;
BEGIN
  SELECT v2.id, v2.return_filing_id, f.entity_id INTO v
    FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;

  DELETE FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_id;

  INSERT INTO public.return_filing_validation_results(
    return_filing_id, return_filing_version_id, severity, rule_code, scope,
    form_template_id, message, is_blocking)
  SELECT v.return_filing_id, _version_id, 'ERROR', 'REQUIRED_FORM_INCOMPLETE', 'FORM',
         r.form_template_id,
         'A required part of this return has not been completed: ' || COALESCE(t.name, 'form'), true
    FROM public.return_filing_form_requirements r
    LEFT JOIN public.form_templates t ON t.id = r.form_template_id
   WHERE r.return_filing_version_id = _version_id
     AND r.is_required AND (r.form_response_id IS NULL OR r.completion_status <> 'COMPLETED');

  INSERT INTO public.return_filing_validation_results(
    return_filing_id, return_filing_version_id, severity, rule_code, scope,
    regulatory_metric_id, message, is_blocking)
  SELECT v.return_filing_id, _version_id, 'WARNING', 'METRIC_NOT_AVAILABLE', 'METRIC',
         mv.regulatory_metric_id,
         'A measurement could not be determined for this period: ' || m.name, false
    FROM public.return_metric_values mv
    JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
   WHERE mv.return_filing_version_id = _version_id AND mv.availability <> 'AVAILABLE';

  SELECT count(*) FILTER (WHERE severity = 'ERROR'), count(*) FILTER (WHERE severity = 'WARNING')
    INTO v_errors, v_warnings
    FROM public.return_filing_validation_results WHERE return_filing_version_id = _version_id;

  RETURN jsonb_build_object('errors', v_errors, 'warnings', v_warnings,
                            'can_submit', v_errors = 0);
END $$;
REVOKE ALL ON FUNCTION public.returns_validate_filing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_validate_filing(uuid) TO authenticated;

-- ---------------- SUBMIT -----------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_submit_filing(
  _version_id uuid, _declaration_accepted boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; d record; v_check jsonb;
BEGIN
  SELECT v2.id, v2.status, v2.return_filing_id, f.entity_id, f.return_definition_id, f.id AS filing_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF NOT public.returns_can_file(v.entity_id) THEN
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
END $$;
REVOKE ALL ON FUNCTION public.returns_submit_filing(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_submit_filing(uuid, boolean) TO authenticated;

-- ---------------- REVIEW DECISION --------------------------------------
CREATE OR REPLACE FUNCTION public.returns_review_filing(
  _version_id uuid, _action text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_new_version uuid;
BEGIN
  PERFORM public.returns_require('review');
  IF _action NOT IN ('START_REVIEW','ACCEPT','REJECT','REQUEST_CORRECTION') THEN
    RAISE EXCEPTION 'Unsupported review action';
  END IF;
  IF _action IN ('REJECT','REQUEST_CORRECTION') AND COALESCE(length(trim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'Please record a reason of at least 10 characters';
  END IF;

  SELECT v2.id, v2.status, v2.return_filing_id, v2.version_number, f.entity_id
    INTO v FROM public.return_filing_versions v2
    JOIN public.return_filings f ON f.id = v2.return_filing_id
   WHERE v2.id = _version_id FOR UPDATE;
  IF v.id IS NULL THEN RAISE EXCEPTION 'Filing version not found'; END IF;
  IF v.status NOT IN ('SUBMITTED','UNDER_REVIEW') THEN
    RAISE EXCEPTION 'Only a submitted filing version can be reviewed';
  END IF;

  IF _action = 'START_REVIEW' THEN
    UPDATE public.return_filing_versions SET status = 'UNDER_REVIEW' WHERE id = _version_id;
    UPDATE public.return_filings SET status = 'UNDER_REVIEW', assigned_reviewer_id = auth.uid(),
           updated_at = now() WHERE id = v.return_filing_id;

  ELSIF _action = 'ACCEPT' THEN
    UPDATE public.return_filing_versions SET status = 'ACCEPTED', accepted_at = now(),
           accepted_by = auth.uid() WHERE id = _version_id;
    UPDATE public.return_filing_versions SET status = 'SUPERSEDED'
     WHERE return_filing_id = v.return_filing_id AND id <> _version_id
       AND status NOT IN ('SUPERSEDED','REJECTED');
    UPDATE public.return_filings SET status = 'ACCEPTED', accepted_at = now(),
           accepted_version_id = _version_id, updated_at = now() WHERE id = v.return_filing_id;
    UPDATE public.reporting_periods p SET status = 'CLOSED', closed_at = now()
     WHERE p.id = (SELECT reporting_period_id FROM public.return_filings WHERE id = v.return_filing_id);

  ELSIF _action = 'REJECT' THEN
    UPDATE public.return_filing_versions SET status = 'REJECTED', rejected_at = now(),
           rejected_by = auth.uid(), rejection_reason = _reason WHERE id = _version_id;
    UPDATE public.return_filings SET status = 'REJECTED', rejected_at = now(), updated_at = now()
     WHERE id = v.return_filing_id;

  ELSE -- REQUEST_CORRECTION: open a fresh editable version, preserving the submitted one
    UPDATE public.return_filing_versions SET status = 'SUPERSEDED' WHERE id = _version_id;
    INSERT INTO public.return_filing_versions(
      return_filing_id, version_number, status, supersedes_version_id)
    VALUES (v.return_filing_id, v.version_number + 1, 'CORRECTION_REQUESTED', _version_id)
    RETURNING id INTO v_new_version;

    INSERT INTO public.return_filing_form_requirements(
      return_filing_version_id, form_template_id, form_version_id, is_required, sequence,
      tab_name, form_response_id, completion_status)
    SELECT v_new_version, form_template_id, form_version_id, is_required, sequence,
           tab_name, form_response_id, 'IN_PROGRESS'
      FROM public.return_filing_form_requirements WHERE return_filing_version_id = _version_id;

    INSERT INTO public.return_filing_requests(
      return_filing_id, return_filing_version_id, request_kind, message, created_by)
    VALUES (v.return_filing_id, v_new_version, 'CORRECTION', _reason, auth.uid());

    UPDATE public.return_filings
       SET status = 'CORRECTION_REQUESTED', current_version_number = v.version_number + 1,
           updated_at = now() WHERE id = v.return_filing_id;
  END IF;

  PERFORM public.create_audit_log('return_filing', v.return_filing_id, _action,
    jsonb_build_object('version_id', _version_id, 'reason', _reason, 'new_version_id', v_new_version));

  RETURN jsonb_build_object('action', _action, 'new_version_id', v_new_version);
END $$;
REVOKE ALL ON FUNCTION public.returns_review_filing(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_review_filing(uuid, text, text) TO authenticated;

-- ---------------- METRIC TIME SERIES (supervision reads) ---------------
CREATE OR REPLACE FUNCTION public.returns_metric_series(
  _entity_id uuid, _metric_codes text[] DEFAULT NULL, _limit int DEFAULT 24)
RETURNS TABLE(metric_code text, metric_name text, unit text, period_label text,
              period_end date, value_numeric numeric, availability text, source_kind text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.code, m.name, m.unit, p.period_label, p.period_end,
         mv.value_numeric, mv.availability, mv.source_kind
    FROM public.return_metric_values mv
    JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
    JOIN public.reporting_periods p ON p.id = mv.reporting_period_id
    JOIN public.return_filing_versions v ON v.id = mv.return_filing_version_id
   WHERE mv.entity_id = _entity_id
     AND v.status IN ('SUBMITTED','UNDER_REVIEW','ACCEPTED','SUPERSEDED')
     AND (_metric_codes IS NULL OR m.code = ANY(_metric_codes))
     AND (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','view')
          OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.view'))
   ORDER BY m.code, p.period_end DESC
   LIMIT GREATEST(COALESCE(_limit, 24), 1) * 40;
$$;
REVOKE ALL ON FUNCTION public.returns_metric_series(uuid, text[], int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_metric_series(uuid, text[], int) TO authenticated;
