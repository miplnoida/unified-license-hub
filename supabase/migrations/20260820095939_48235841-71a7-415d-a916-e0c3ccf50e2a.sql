
-- ============================================================
-- WAVE C — LEGACY CLASSIFICATION, MIGRATION & OPERATIONAL READS
-- ============================================================

-- 1. Classification report: no silent transformation of legacy returns -----
CREATE OR REPLACE FUNCTION public.returns_legacy_classification_report()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  PERFORM public.returns_require('view');
  SELECT jsonb_build_object(
    'return_types', (SELECT count(*) FROM public.return_types),
    'return_configs', (SELECT count(*) FROM public.return_configs),
    'legacy_filings', (SELECT count(*) FROM public.returns_filed),
    'definitions_mapped', (SELECT count(*) FROM public.return_definitions
                            WHERE legacy_return_config_id IS NOT NULL),
    'filings_migrated', (SELECT count(*) FROM public.return_filings
                          WHERE legacy_return_filed_id IS NOT NULL),
    'classification', (
      SELECT COALESCE(jsonb_object_agg(classification, n), '{}'::jsonb) FROM (
        SELECT classification, count(*) n FROM public.returns_legacy_mappings GROUP BY 1) s),
    'unclassified_filings', (
      SELECT count(*) FROM public.returns_filed rf
       WHERE NOT EXISTS (SELECT 1 FROM public.returns_legacy_mappings m
                          WHERE m.legacy_table = 'returns_filed' AND m.legacy_id = rf.id)),
    'blockers', (
      SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('issue','LEGACY_FILING_WITHOUT_ENTITY','count',count(*)) b
          FROM public.returns_filed rf
         WHERE rf.entity_id IS NULL OR NOT EXISTS (
            SELECT 1 FROM public.licensees l WHERE l.id = rf.entity_id)
        HAVING count(*) > 0
        UNION ALL
        SELECT jsonb_build_object('issue','LEGACY_FILING_WITHOUT_PERIOD_DATES','count',count(*))
          FROM public.returns_filed rf
         WHERE rf.period_start_date IS NULL OR rf.period_end_date IS NULL
        HAVING count(*) > 0
        UNION ALL
        SELECT jsonb_build_object('issue','LEGACY_CONFIG_WITHOUT_RETURN_TYPE','count',count(*))
          FROM public.return_configs c WHERE c.return_type_id IS NULL
        HAVING count(*) > 0) x)
  ) INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.returns_legacy_classification_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_legacy_classification_report() TO authenticated;

-- 2. Classify legacy returns explicitly ----------------------------------
CREATE OR REPLACE FUNCTION public.returns_classify_legacy()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  PERFORM public.returns_require('manage_config');

  -- Configurations: exact when they carry a return type and sector
  INSERT INTO public.returns_legacy_mappings(
    legacy_table, legacy_id, classification, evidence, decided_by)
  SELECT 'return_configs', c.id,
    CASE WHEN c.return_type_id IS NOT NULL AND c.sector_id IS NOT NULL
           THEN 'EXACT_CANONICAL_MAPPING'
         WHEN c.return_type_id IS NOT NULL THEN 'DERIVABLE_WITH_EVIDENCE'
         ELSE 'AMBIGUOUS' END,
    jsonb_build_object('name', c.name, 'return_type_id', c.return_type_id,
                       'sector_id', c.sector_id, 'status', c.status),
    auth.uid()
    FROM public.return_configs c
  ON CONFLICT (legacy_table, legacy_id) DO NOTHING;

  -- Filings: exact when entity, config and period dates are all present
  INSERT INTO public.returns_legacy_mappings(
    legacy_table, legacy_id, classification, evidence, decided_by)
  SELECT 'returns_filed', rf.id,
    CASE WHEN rf.entity_id IS NOT NULL AND rf.return_configuration_id IS NOT NULL
              AND rf.period_start_date IS NOT NULL AND rf.period_end_date IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = rf.entity_id)
           THEN 'EXACT_CANONICAL_MAPPING'
         WHEN rf.entity_id IS NOT NULL AND rf.return_configuration_id IS NOT NULL
           THEN 'DERIVABLE_WITH_EVIDENCE'
         WHEN rf.entity_id IS NULL THEN 'LEGACY_ONLY'
         ELSE 'AMBIGUOUS' END,
    jsonb_build_object('unique_id', rf.unique_id, 'workflow_status', rf.workflow_status,
                       'return_year', rf.return_year, 'return_period', rf.return_period,
                       'period_start', rf.period_start_date, 'period_end', rf.period_end_date),
    auth.uid()
    FROM public.returns_filed rf
  ON CONFLICT (legacy_table, legacy_id) DO NOTHING;

  SELECT count(*) INTO v_n FROM public.returns_legacy_mappings;
  PERFORM public.create_audit_log('returns_legacy_mappings', gen_random_uuid(), 'CLASSIFY',
    jsonb_build_object('total', v_n));
  RETURN jsonb_build_object('total_classified', v_n);
END $$;
REVOKE ALL ON FUNCTION public.returns_classify_legacy() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_classify_legacy() TO authenticated;

-- 3. Adopt an exactly-mapped legacy configuration as a canonical definition
CREATE OR REPLACE FUNCTION public.returns_adopt_legacy_config(_config_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; t record; v_def uuid; v_code text; v_freq text;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT * INTO c FROM public.return_configs WHERE id = _config_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Legacy configuration not found'; END IF;
  IF c.return_type_id IS NULL THEN
    RAISE EXCEPTION 'This legacy configuration has no return type and cannot be adopted without a decision';
  END IF;
  SELECT * INTO t FROM public.return_types WHERE id = c.return_type_id;

  SELECT id INTO v_def FROM public.return_definitions WHERE legacy_return_config_id = _config_id;
  IF v_def IS NOT NULL THEN RETURN v_def; END IF;

  v_code := upper(regexp_replace(COALESCE(t.code, t.name, 'RETURN') || '-' ||
                                 left(regexp_replace(c.name, '[^A-Za-z0-9]+','','g'), 12),
                                 '[^A-Z0-9\-]', '', 'g'));
  WHILE EXISTS (SELECT 1 FROM public.return_definitions WHERE code = v_code) LOOP
    v_code := v_code || '-' || substr(replace(gen_random_uuid()::text,'-',''),1,3);
  END LOOP;

  v_freq := CASE
    WHEN COALESCE(t.name,'') ILIKE '%month%' THEN 'MONTHLY'
    WHEN COALESCE(t.name,'') ILIKE '%quarter%' THEN 'QUARTERLY'
    WHEN COALESCE(t.name,'') ILIKE '%annual%' OR COALESCE(t.name,'') ILIKE '%year%' THEN 'ANNUAL'
    ELSE 'QUARTERLY' END;

  INSERT INTO public.return_definitions(
    code, name, description, frequency, status, is_active,
    legacy_return_type_id, legacy_return_config_id, created_by)
  VALUES (v_code, c.name, 'Adopted from the legacy return configuration', v_freq,
          CASE WHEN c.status = 'active' THEN 'ACTIVE' ELSE 'DRAFT' END, true,
          c.return_type_id, c.id, auth.uid())
  RETURNING id INTO v_def;

  INSERT INTO public.return_definition_forms(
    return_definition_id, form_template_id, sequence, is_required, tab_name)
  SELECT v_def, cf.form_id, COALESCE(cf.display_order, 1), true, cf.tab_name
    FROM public.return_config_forms cf
   WHERE cf.return_configuration_id = _config_id
     AND EXISTS (SELECT 1 FROM public.form_templates ft WHERE ft.id = cf.form_id)
  ON CONFLICT DO NOTHING;

  UPDATE public.returns_legacy_mappings
     SET canonical_table = 'return_definitions', canonical_id = v_def
   WHERE legacy_table = 'return_configs' AND legacy_id = _config_id;

  PERFORM public.create_audit_log('return_definition', v_def, 'ADOPT_LEGACY_CONFIG',
    jsonb_build_object('legacy_config_id', _config_id));
  RETURN v_def;
END $$;
REVOKE ALL ON FUNCTION public.returns_adopt_legacy_config(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_adopt_legacy_config(uuid) TO authenticated;

-- 4. Migrate an exactly-mapped legacy filing as historical evidence -------
CREATE OR REPLACE FUNCTION public.returns_migrate_legacy_filing(_legacy_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rf record; v_def uuid; v_ob uuid; v_period uuid; v_filing uuid; v_version uuid;
        v_map record; v_status text; v_due date;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT * INTO rf FROM public.returns_filed WHERE id = _legacy_id;
  IF rf.id IS NULL THEN RAISE EXCEPTION 'Legacy filing not found'; END IF;

  SELECT * INTO v_map FROM public.returns_legacy_mappings
   WHERE legacy_table = 'returns_filed' AND legacy_id = _legacy_id;
  IF v_map.id IS NULL THEN
    RAISE EXCEPTION 'This legacy filing has not been classified yet';
  END IF;
  IF v_map.classification NOT IN ('EXACT_CANONICAL_MAPPING','DERIVABLE_WITH_EVIDENCE') THEN
    RETURN jsonb_build_object('migrated', false,
      'reason', 'Left in place for review: ' || v_map.classification);
  END IF;

  SELECT id INTO v_filing FROM public.return_filings WHERE legacy_return_filed_id = _legacy_id;
  IF v_filing IS NOT NULL THEN
    RETURN jsonb_build_object('migrated', true, 'filing_id', v_filing, 'already', true);
  END IF;

  v_def := public.returns_adopt_legacy_config(rf.return_configuration_id);

  SELECT id INTO v_ob FROM public.entity_reporting_obligations
   WHERE entity_id = rf.entity_id AND return_definition_id = v_def
   ORDER BY effective_from LIMIT 1;
  IF v_ob IS NULL THEN
    INSERT INTO public.entity_reporting_obligations(
      entity_id, return_definition_id, origin, frequency, due_days_after_period_end,
      effective_from, created_by)
    SELECT rf.entity_id, v_def, 'LEGACY_MIGRATION', d.frequency, d.due_days_after_period_end,
           COALESCE(rf.period_start_date, CURRENT_DATE), auth.uid()
      FROM public.return_definitions d WHERE d.id = v_def
    RETURNING id INTO v_ob;
  END IF;

  v_due := COALESCE(rf.due_date, rf.period_end_date + 30);
  SELECT id INTO v_period FROM public.reporting_periods
   WHERE entity_reporting_obligation_id = v_ob
     AND period_start = rf.period_start_date AND period_end = rf.period_end_date;
  IF v_period IS NULL THEN
    INSERT INTO public.reporting_periods(
      entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status)
    VALUES (v_ob,
      COALESCE(NULLIF(rf.return_period,''), rf.return_year::text, to_char(rf.period_end_date,'YYYY-MM')),
      rf.period_start_date, rf.period_end_date, v_due, 'CLOSED')
    RETURNING id INTO v_period;
  END IF;

  v_status := CASE rf.workflow_status::text
    WHEN 'VAL' THEN 'ACCEPTED' WHEN 'SUB' THEN 'SUBMITTED'
    WHEN 'REJ' THEN 'REJECTED' WHEN 'TBR' THEN 'CORRECTION_REQUESTED' ELSE 'DRAFT' END;

  INSERT INTO public.return_filings(
    filing_reference, entity_id, entity_reporting_obligation_id, reporting_period_id,
    return_definition_id, status, current_version_number, submitted_at,
    legacy_return_filed_id, created_by, created_at)
  VALUES (COALESCE(NULLIF(rf.unique_id,''), 'LEG-' || left(replace(rf.id::text,'-',''),12)),
    rf.entity_id, v_ob, v_period, v_def, v_status, 1, rf.submit_date, rf.id,
    rf.created_by, rf.created_at)
  RETURNING id INTO v_filing;

  INSERT INTO public.return_filing_versions(
    return_filing_id, version_number, status, is_immutable, legacy_origin,
    submitted_at, submitted_by, created_at)
  VALUES (v_filing, 1,
    CASE WHEN v_status = 'DRAFT' THEN 'DRAFT' ELSE v_status END,
    v_status <> 'DRAFT', 'LEGACY_SINGLE_VERSION', rf.submit_date, rf.created_by, rf.created_at)
  RETURNING id INTO v_version;

  IF v_status = 'ACCEPTED' THEN
    UPDATE public.return_filings SET accepted_version_id = v_version, accepted_at = rf.submit_date
     WHERE id = v_filing;
  END IF;

  UPDATE public.returns_legacy_mappings
     SET canonical_table = 'return_filings', canonical_id = v_filing,
         notes = 'Migrated as a single historical version; legacy record retained'
   WHERE id = v_map.id;

  PERFORM public.create_audit_log('return_filing', v_filing, 'MIGRATE_LEGACY',
    jsonb_build_object('legacy_return_filed_id', _legacy_id, 'classification', v_map.classification));

  RETURN jsonb_build_object('migrated', true, 'filing_id', v_filing, 'version_id', v_version);
END $$;
REVOKE ALL ON FUNCTION public.returns_migrate_legacy_filing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_migrate_legacy_filing(uuid) TO authenticated;

-- 5. Operational queue read ----------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_filing_queue(
  _status text DEFAULT NULL, _entity_id uuid DEFAULT NULL, _limit int DEFAULT 200)
RETURNS TABLE(
  filing_id uuid, filing_reference text, entity_id uuid, entity_name text,
  definition_code text, definition_name text, frequency text,
  period_label text, period_end date, due_date date, status text,
  current_version_number integer, current_version_id uuid,
  submitted_at timestamptz, is_overdue boolean, days_late integer,
  blocking_errors bigint, open_requests bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.filing_reference, f.entity_id, l.name, d.code, d.name, o.frequency,
         p.period_label, p.period_end, p.due_date, f.status, f.current_version_number,
         (SELECT v.id FROM public.return_filing_versions v
           WHERE v.return_filing_id = f.id ORDER BY v.version_number DESC LIMIT 1),
         f.submitted_at,
         (f.status NOT IN ('ACCEPTED','WITHDRAWN') AND p.due_date < CURRENT_DATE),
         GREATEST(0, (COALESCE(f.submitted_at::date, CURRENT_DATE) - p.due_date)),
         (SELECT count(*) FROM public.return_filing_validation_results r
           WHERE r.return_filing_id = f.id AND r.is_blocking),
         (SELECT count(*) FROM public.return_filing_requests rq
           WHERE rq.return_filing_id = f.id AND rq.status = 'OPEN')
    FROM public.return_filings f
    JOIN public.reporting_periods p ON p.id = f.reporting_period_id
    JOIN public.entity_reporting_obligations o ON o.id = f.entity_reporting_obligation_id
    JOIN public.return_definitions d ON d.id = f.return_definition_id
    LEFT JOIN public.licensees l ON l.id = f.entity_id
   WHERE (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','view')
          OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view'))
     AND (_status IS NULL OR f.status = _status)
     AND (_entity_id IS NULL OR f.entity_id = _entity_id)
   ORDER BY p.due_date DESC
   LIMIT LEAST(COALESCE(_limit, 200), 500);
$$;
REVOKE ALL ON FUNCTION public.returns_filing_queue(text, uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_filing_queue(text, uuid, int) TO authenticated;

-- 6. Entity obligation calendar (licensee facing) ------------------------
CREATE OR REPLACE FUNCTION public.returns_entity_calendar(_entity_id uuid)
RETURNS TABLE(
  obligation_id uuid, period_id uuid, definition_code text, definition_name text,
  frequency text, period_label text, period_start date, period_end date, due_date date,
  period_status text, filing_id uuid, filing_reference text, filing_status text,
  current_version_id uuid, is_overdue boolean, days_remaining integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, p.id, d.code, d.name, o.frequency, p.period_label, p.period_start,
         p.period_end, p.due_date, p.status, f.id, f.filing_reference, f.status,
         (SELECT v.id FROM public.return_filing_versions v
           WHERE v.return_filing_id = f.id ORDER BY v.version_number DESC LIMIT 1),
         (p.due_date < CURRENT_DATE AND COALESCE(f.status,'DRAFT') NOT IN ('ACCEPTED','SUBMITTED','UNDER_REVIEW')),
         (p.due_date - CURRENT_DATE)
    FROM public.entity_reporting_obligations o
    JOIN public.reporting_periods p ON p.entity_reporting_obligation_id = o.id
    JOIN public.return_definitions d ON d.id = o.return_definition_id
    LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
   WHERE o.entity_id = _entity_id
     AND o.status = 'ACTIVE'
     AND (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','view')
          OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.view'))
   ORDER BY p.due_date DESC
   LIMIT 300;
$$;
REVOKE ALL ON FUNCTION public.returns_entity_calendar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_entity_calendar(uuid) TO authenticated;

-- 7. Filing detail (single read for the workspace) -----------------------
CREATE OR REPLACE FUNCTION public.returns_filing_detail(_filing_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE f record; v jsonb;
BEGIN
  SELECT * INTO f FROM public.return_filings WHERE id = _filing_id;
  IF f.id IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','view')
          OR public.entity_membership_capability(auth.uid(), f.entity_id, 'returns.view')) THEN
    RAISE EXCEPTION 'Not authorised to view this filing' USING ERRCODE='42501';
  END IF;

  SELECT jsonb_build_object(
    'filing', to_jsonb(f),
    'entity_name', (SELECT name FROM public.licensees WHERE id = f.entity_id),
    'definition', (SELECT to_jsonb(d) FROM public.return_definitions d WHERE d.id = f.return_definition_id),
    'period', (SELECT to_jsonb(p) FROM public.reporting_periods p WHERE p.id = f.reporting_period_id),
    'versions', (SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.version_number DESC), '[]'::jsonb)
                   FROM public.return_filing_versions v WHERE v.return_filing_id = f.id),
    'forms', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'id', r.id, 'form_template_id', r.form_template_id,
                    'form_version_id', r.form_version_id, 'template_name', t.name,
                    'form_version', fv.version, 'is_required', r.is_required,
                    'sequence', r.sequence, 'tab_name', r.tab_name,
                    'form_response_id', r.form_response_id,
                    'completion_status', r.completion_status,
                    'return_filing_version_id', r.return_filing_version_id) ORDER BY r.sequence), '[]'::jsonb)
                 FROM public.return_filing_form_requirements r
                 LEFT JOIN public.form_templates t ON t.id = r.form_template_id
                 LEFT JOIN public.form_versions fv ON fv.id = r.form_version_id
                WHERE r.return_filing_version_id = (
                  SELECT id FROM public.return_filing_versions
                   WHERE return_filing_id = f.id ORDER BY version_number DESC LIMIT 1)),
    'metrics', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                    'code', m.code, 'name', m.name, 'unit', m.unit,
                    'value_numeric', mv.value_numeric, 'value_text', mv.value_text,
                    'availability', mv.availability, 'availability_reason', mv.availability_reason,
                    'source_kind', mv.source_kind,
                    'calculation_inputs', mv.calculation_inputs) ORDER BY m.code), '[]'::jsonb)
                  FROM public.return_metric_values mv
                  JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
                 WHERE mv.return_filing_version_id = (
                   SELECT id FROM public.return_filing_versions
                    WHERE return_filing_id = f.id ORDER BY version_number DESC LIMIT 1)),
    'findings', (SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.severity, r.detected_at), '[]'::jsonb)
                   FROM public.return_filing_validation_results r WHERE r.return_filing_id = f.id),
    'requests', (SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC), '[]'::jsonb)
                   FROM public.return_filing_requests q WHERE q.return_filing_id = f.id)
  ) INTO v;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.returns_filing_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_filing_detail(uuid) TO authenticated;

-- 8. Respond to a correction request (external) --------------------------
CREATE OR REPLACE FUNCTION public.returns_respond_to_request(_request_id uuid, _response text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid;
BEGIN
  IF COALESCE(length(trim(_response)),0) < 10 THEN
    RAISE EXCEPTION 'Please provide a response of at least 10 characters';
  END IF;
  SELECT f.entity_id INTO v_entity FROM public.return_filing_requests q
    JOIN public.return_filings f ON f.id = q.return_filing_id WHERE q.id = _request_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT public.returns_can_file(v_entity) THEN
    RAISE EXCEPTION 'You are not authorised to respond for this entity' USING ERRCODE='42501';
  END IF;
  UPDATE public.return_filing_requests
     SET response_text = _response, status = 'RESPONDED', responded_at = now(),
         responded_by = auth.uid(), updated_at = now()
   WHERE id = _request_id AND status = 'OPEN';
END $$;
REVOKE ALL ON FUNCTION public.returns_respond_to_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_respond_to_request(uuid, text) TO authenticated;
