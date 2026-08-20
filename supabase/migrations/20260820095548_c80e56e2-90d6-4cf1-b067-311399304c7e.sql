
-- ============================================================
-- WAVE C — GOVERNED OPERATIONAL LAYER (RPCs)
-- ============================================================

-- Guard helper -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.returns_require(_action text)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501';
  END IF;
  IF public.is_super_admin(auth.uid()) THEN RETURN; END IF;
  IF public.has_permission(auth.uid(), 'returns_management', _action) THEN RETURN; END IF;
  RAISE EXCEPTION 'Not authorised for returns %', _action USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION public.returns_require(text) FROM PUBLIC, anon;

-- ---------------- CONFIGURATION WRITES ---------------------------------
CREATE OR REPLACE FUNCTION public.returns_save_definition(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := NULLIF(_payload->>'id','')::uuid;
BEGIN
  PERFORM public.returns_require('manage_config');
  IF COALESCE(_payload->>'code','') = '' OR COALESCE(_payload->>'name','') = '' THEN
    RAISE EXCEPTION 'Code and name are required';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.return_definitions(
      code, name, description, regulator_id, frequency, filing_basis, consolidation_basis,
      currency_basis, due_days_after_period_end, requires_declaration, declaration_text,
      status, effective_from, effective_to, created_by)
    VALUES (
      upper(_payload->>'code'), _payload->>'name', _payload->>'description',
      NULLIF(_payload->>'regulator_id','')::uuid,
      COALESCE(_payload->>'frequency','QUARTERLY'),
      COALESCE(_payload->>'filing_basis','SOLO'),
      _payload->>'consolidation_basis', _payload->>'currency_basis',
      COALESCE((_payload->>'due_days_after_period_end')::int, 30),
      COALESCE((_payload->>'requires_declaration')::boolean, true),
      _payload->>'declaration_text',
      COALESCE(_payload->>'status','DRAFT'),
      COALESCE((_payload->>'effective_from')::date, CURRENT_DATE),
      NULLIF(_payload->>'effective_to','')::date, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    IF EXISTS (SELECT 1 FROM public.return_definitions d
                WHERE d.id = v_id AND d.code <> upper(_payload->>'code')
                  AND EXISTS (SELECT 1 FROM public.return_filings f WHERE f.return_definition_id = v_id)) THEN
      RAISE EXCEPTION 'Definition code is immutable once filings exist';
    END IF;
    UPDATE public.return_definitions SET
      code = upper(_payload->>'code'), name = _payload->>'name',
      description = _payload->>'description',
      regulator_id = NULLIF(_payload->>'regulator_id','')::uuid,
      frequency = COALESCE(_payload->>'frequency', frequency),
      filing_basis = COALESCE(_payload->>'filing_basis', filing_basis),
      consolidation_basis = _payload->>'consolidation_basis',
      currency_basis = _payload->>'currency_basis',
      due_days_after_period_end = COALESCE((_payload->>'due_days_after_period_end')::int, due_days_after_period_end),
      requires_declaration = COALESCE((_payload->>'requires_declaration')::boolean, requires_declaration),
      declaration_text = _payload->>'declaration_text',
      status = COALESCE(_payload->>'status', status),
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active),
      effective_from = COALESCE((_payload->>'effective_from')::date, effective_from),
      effective_to = NULLIF(_payload->>'effective_to','')::date,
      updated_at = now()
    WHERE id = v_id;
  END IF;

  IF _payload ? 'forms' THEN
    DELETE FROM public.return_definition_forms WHERE return_definition_id = v_id;
    INSERT INTO public.return_definition_forms(
      return_definition_id, form_template_id, sequence, is_required, section_label, tab_name)
    SELECT v_id, (f->>'form_template_id')::uuid,
           COALESCE((f->>'sequence')::int, 1),
           COALESCE((f->>'is_required')::boolean, true),
           f->>'section_label', f->>'tab_name'
      FROM jsonb_array_elements(_payload->'forms') f;
  END IF;

  PERFORM public.create_audit_log('return_definition', v_id, 'SAVE', _payload);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.returns_save_definition(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_save_definition(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.returns_save_obligation_rule(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := NULLIF(_payload->>'id','')::uuid;
BEGIN
  PERFORM public.returns_require('manage_config');
  IF NULLIF(_payload->>'return_definition_id','') IS NULL THEN
    RAISE EXCEPTION 'A rule must belong to a return definition';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.reporting_obligation_rules(
      return_definition_id, code, name, description, regulator_id, sector_id, sub_sector_id,
      category_id, license_type_id, classification_value_id, lifecycle_stage_id,
      requires_active_license, jurisdiction, priority, frequency_override, due_days_override,
      effective_from, effective_to, created_by)
    VALUES (
      (_payload->>'return_definition_id')::uuid, upper(_payload->>'code'), _payload->>'name',
      _payload->>'description', NULLIF(_payload->>'regulator_id','')::uuid,
      NULLIF(_payload->>'sector_id','')::uuid, NULLIF(_payload->>'sub_sector_id','')::uuid,
      NULLIF(_payload->>'category_id','')::uuid, NULLIF(_payload->>'license_type_id','')::uuid,
      NULLIF(_payload->>'classification_value_id','')::uuid, NULLIF(_payload->>'lifecycle_stage_id','')::uuid,
      COALESCE((_payload->>'requires_active_license')::boolean, true),
      _payload->>'jurisdiction', COALESCE((_payload->>'priority')::int, 100),
      NULLIF(_payload->>'frequency_override',''), NULLIF(_payload->>'due_days_override','')::int,
      COALESCE((_payload->>'effective_from')::date, CURRENT_DATE),
      NULLIF(_payload->>'effective_to','')::date, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.reporting_obligation_rules SET
      name = _payload->>'name', description = _payload->>'description',
      regulator_id = NULLIF(_payload->>'regulator_id','')::uuid,
      sector_id = NULLIF(_payload->>'sector_id','')::uuid,
      sub_sector_id = NULLIF(_payload->>'sub_sector_id','')::uuid,
      category_id = NULLIF(_payload->>'category_id','')::uuid,
      license_type_id = NULLIF(_payload->>'license_type_id','')::uuid,
      classification_value_id = NULLIF(_payload->>'classification_value_id','')::uuid,
      lifecycle_stage_id = NULLIF(_payload->>'lifecycle_stage_id','')::uuid,
      requires_active_license = COALESCE((_payload->>'requires_active_license')::boolean, requires_active_license),
      jurisdiction = _payload->>'jurisdiction',
      priority = COALESCE((_payload->>'priority')::int, priority),
      frequency_override = NULLIF(_payload->>'frequency_override',''),
      due_days_override = NULLIF(_payload->>'due_days_override','')::int,
      effective_from = COALESCE((_payload->>'effective_from')::date, effective_from),
      effective_to = NULLIF(_payload->>'effective_to','')::date,
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active),
      updated_at = now()
    WHERE id = v_id;
  END IF;
  PERFORM public.create_audit_log('reporting_obligation_rule', v_id, 'SAVE', _payload);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.returns_save_obligation_rule(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_save_obligation_rule(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.returns_save_metric(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := NULLIF(_payload->>'id','')::uuid;
        v_expr text := NULLIF(_payload->>'expression','');
        v_deps text[];
BEGIN
  PERFORM public.returns_require('manage_config');
  IF COALESCE(_payload->>'code','') = '' OR COALESCE(_payload->>'name','') = '' THEN
    RAISE EXCEPTION 'Metric code and name are required';
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.regulatory_metrics(
      code, name, description, data_domain_id, data_type, unit, aggregation_type,
      sensitivity, is_calculated, calculation_strategy, effective_from, effective_to, created_by)
    VALUES (upper(_payload->>'code'), _payload->>'name', _payload->>'description',
      NULLIF(_payload->>'data_domain_id','')::uuid,
      COALESCE(_payload->>'data_type','NUMERIC'), _payload->>'unit',
      COALESCE(_payload->>'aggregation_type','POINT_IN_TIME'),
      COALESCE(_payload->>'sensitivity','INTERNAL'),
      COALESCE((_payload->>'is_calculated')::boolean, v_expr IS NOT NULL),
      _payload->>'calculation_strategy',
      COALESCE((_payload->>'effective_from')::date, CURRENT_DATE),
      NULLIF(_payload->>'effective_to','')::date, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.regulatory_metrics SET
      code = upper(_payload->>'code'), name = _payload->>'name',
      description = _payload->>'description',
      data_domain_id = NULLIF(_payload->>'data_domain_id','')::uuid,
      data_type = COALESCE(_payload->>'data_type', data_type),
      unit = _payload->>'unit',
      aggregation_type = COALESCE(_payload->>'aggregation_type', aggregation_type),
      sensitivity = COALESCE(_payload->>'sensitivity', sensitivity),
      is_calculated = COALESCE((_payload->>'is_calculated')::boolean, is_calculated),
      calculation_strategy = _payload->>'calculation_strategy',
      effective_from = COALESCE((_payload->>'effective_from')::date, effective_from),
      effective_to = NULLIF(_payload->>'effective_to','')::date,
      is_active = COALESCE((_payload->>'is_active')::boolean, is_active)
    WHERE id = v_id;
  END IF;

  IF v_expr IS NOT NULL THEN
    IF v_expr !~ '^[A-Za-z0-9_+\-*/(). ]+$' THEN
      RAISE EXCEPTION 'A formula may only reference metric codes, numbers and + - * / ( )';
    END IF;
    SELECT array_agg(DISTINCT upper(m[1])) INTO v_deps
      FROM regexp_matches(v_expr, '([A-Za-z_][A-Za-z0-9_]*)', 'g') m;
    v_deps := COALESCE(v_deps, '{}');
    IF EXISTS (SELECT 1 FROM unnest(v_deps) d
                WHERE NOT EXISTS (SELECT 1 FROM public.regulatory_metrics rm WHERE rm.code = d)) THEN
      RAISE EXCEPTION 'Formula references a metric that does not exist';
    END IF;
    IF upper(_payload->>'code') = ANY(v_deps) THEN
      RAISE EXCEPTION 'A metric formula cannot reference itself';
    END IF;
    UPDATE public.metric_calculation_rules SET is_active = false WHERE regulatory_metric_id = v_id;
    INSERT INTO public.metric_calculation_rules(
      regulatory_metric_id, version, expression, dependency_metric_codes,
      on_missing_dependency, notes, created_by)
    VALUES (v_id,
      COALESCE((SELECT max(version) FROM public.metric_calculation_rules WHERE regulatory_metric_id = v_id), 0) + 1,
      v_expr, v_deps,
      COALESCE(_payload->>'on_missing_dependency','NOT_AVAILABLE'),
      _payload->>'formula_notes', auth.uid());
    UPDATE public.regulatory_metrics SET is_calculated = true WHERE id = v_id;
  END IF;

  PERFORM public.create_audit_log('regulatory_metric', v_id, 'SAVE', _payload);
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.returns_save_metric(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_save_metric(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.returns_bind_field_metric(_field_definition_id uuid, _metric_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.returns_require('manage_config');
  UPDATE public.form_field_definitions SET regulatory_metric_id = _metric_id, updated_at = now()
   WHERE id = _field_definition_id;
  PERFORM public.create_audit_log('form_field_definition', _field_definition_id, 'BIND_METRIC',
    jsonb_build_object('regulatory_metric_id', _metric_id));
END $$;
REVOKE ALL ON FUNCTION public.returns_bind_field_metric(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_bind_field_metric(uuid, uuid) TO authenticated;

-- ---------------- OBLIGATION DERIVATION --------------------------------
CREATE OR REPLACE FUNCTION public.returns_derive_entity_obligations(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_created int := 0; v_closed int := 0; r record; v_ent record;
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT id, sector_id, sub_sector_id, category_id, license_id, lifecycle_stage_id, status
    INTO v_ent FROM public.licensees WHERE id = _entity_id;
  IF v_ent.id IS NULL THEN RAISE EXCEPTION 'Entity not found'; END IF;

  FOR r IN
    SELECT DISTINCT ON (ru.return_definition_id) ru.*, d.frequency AS def_frequency,
           d.due_days_after_period_end AS def_due_days
      FROM public.reporting_obligation_rules ru
      JOIN public.return_definitions d ON d.id = ru.return_definition_id
     WHERE ru.is_active AND d.is_active AND d.status = 'ACTIVE'
       AND ru.effective_from <= CURRENT_DATE
       AND (ru.effective_to IS NULL OR ru.effective_to >= CURRENT_DATE)
       AND (ru.sector_id IS NULL OR ru.sector_id = v_ent.sector_id)
       AND (ru.sub_sector_id IS NULL OR ru.sub_sector_id = v_ent.sub_sector_id)
       AND (ru.category_id IS NULL OR ru.category_id = v_ent.category_id)
       AND (ru.lifecycle_stage_id IS NULL OR ru.lifecycle_stage_id = v_ent.lifecycle_stage_id)
       AND (NOT ru.requires_active_license OR EXISTS (
              SELECT 1 FROM public.entity_licenses el
               WHERE el.entity_id = _entity_id
                 AND (el.effective_to IS NULL OR el.effective_to > now())))
     ORDER BY ru.return_definition_id, ru.priority ASC, ru.effective_from DESC
  LOOP
    IF EXISTS (SELECT 1 FROM public.entity_reporting_obligations o
                WHERE o.entity_id = _entity_id AND o.return_definition_id = r.return_definition_id
                  AND o.status = 'ACTIVE') THEN
      CONTINUE;
    END IF;
    INSERT INTO public.entity_reporting_obligations(
      entity_id, return_definition_id, source_rule_id, origin, frequency,
      due_days_after_period_end, effective_from, created_by)
    VALUES (_entity_id, r.return_definition_id, r.id, 'RULE',
      COALESCE(r.frequency_override, r.def_frequency),
      COALESCE(r.due_days_override, r.def_due_days),
      GREATEST(r.effective_from, CURRENT_DATE), auth.uid())
    ON CONFLICT DO NOTHING;
    v_created := v_created + 1;
  END LOOP;

  -- close obligations whose source rule no longer applies and which have no filings
  UPDATE public.entity_reporting_obligations o
     SET status = 'CLOSED', closed_reason = 'Applicability rule no longer matches', effective_to = CURRENT_DATE
   WHERE o.entity_id = _entity_id AND o.status = 'ACTIVE' AND o.origin = 'RULE'
     AND NOT EXISTS (SELECT 1 FROM public.return_filings f WHERE f.entity_reporting_obligation_id = o.id)
     AND (o.source_rule_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.reporting_obligation_rules ru
         WHERE ru.id = o.source_rule_id AND ru.is_active
           AND (ru.effective_to IS NULL OR ru.effective_to >= CURRENT_DATE)));
  v_closed := 0;

  PERFORM public.create_audit_log('entity', _entity_id, 'DERIVE_REPORTING_OBLIGATIONS',
    jsonb_build_object('created', v_created));
  RETURN jsonb_build_object('created', v_created, 'closed', v_closed);
END $$;
REVOKE ALL ON FUNCTION public.returns_derive_entity_obligations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_derive_entity_obligations(uuid) TO authenticated;

-- ---------------- PERIOD GENERATION ------------------------------------
CREATE OR REPLACE FUNCTION public.returns_generate_periods(_obligation_id uuid, _through date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; v_start date; v_end date; v_step interval; v_label text; v_count int := 0;
        v_through date := COALESCE(_through, CURRENT_DATE);
BEGIN
  PERFORM public.returns_require('manage_config');
  SELECT * INTO o FROM public.entity_reporting_obligations WHERE id = _obligation_id;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Obligation not found'; END IF;
  IF o.frequency IN ('EVENT_DRIVEN','AD_HOC') THEN
    RETURN jsonb_build_object('created', 0, 'reason', 'Event-driven obligations have no calendar periods');
  END IF;

  v_step := CASE o.frequency
    WHEN 'MONTHLY' THEN interval '1 month'
    WHEN 'QUARTERLY' THEN interval '3 months'
    WHEN 'SEMI_ANNUAL' THEN interval '6 months'
    ELSE interval '1 year' END;

  v_start := date_trunc(CASE o.frequency WHEN 'MONTHLY' THEN 'month'
                                         WHEN 'ANNUAL' THEN 'year' ELSE 'quarter' END,
                        o.effective_from)::date;
  IF o.frequency = 'SEMI_ANNUAL' THEN
    v_start := make_date(EXTRACT(YEAR FROM o.effective_from)::int,
                         CASE WHEN EXTRACT(MONTH FROM o.effective_from) <= 6 THEN 1 ELSE 7 END, 1);
  END IF;

  WHILE v_start <= v_through LOOP
    v_end := (v_start + v_step - interval '1 day')::date;
    v_label := CASE o.frequency
      WHEN 'MONTHLY' THEN to_char(v_start, 'YYYY-MM')
      WHEN 'QUARTERLY' THEN to_char(v_start, 'YYYY') || '-Q' || EXTRACT(QUARTER FROM v_start)::int
      WHEN 'SEMI_ANNUAL' THEN to_char(v_start, 'YYYY') || '-H' ||
        CASE WHEN EXTRACT(MONTH FROM v_start) <= 6 THEN 1 ELSE 2 END
      ELSE to_char(v_start, 'YYYY') END;

    INSERT INTO public.reporting_periods(
      entity_reporting_obligation_id, period_label, period_start, period_end, due_date, status, opened_at)
    VALUES (_obligation_id, v_label, v_start, v_end,
            v_end + o.due_days_after_period_end,
            CASE WHEN v_end <= CURRENT_DATE THEN 'OPEN' ELSE 'SCHEDULED' END,
            CASE WHEN v_end <= CURRENT_DATE THEN now() END)
    ON CONFLICT (entity_reporting_obligation_id, period_start, period_end) DO NOTHING;
    IF FOUND THEN v_count := v_count + 1; END IF;
    v_start := (v_start + v_step)::date;
  END LOOP;

  UPDATE public.entity_reporting_obligations SET next_due_date = (
    SELECT min(p.due_date) FROM public.reporting_periods p
      LEFT JOIN public.return_filings f ON f.reporting_period_id = p.id
     WHERE p.entity_reporting_obligation_id = _obligation_id
       AND p.status IN ('OPEN','SCHEDULED')
       AND (f.id IS NULL OR f.status NOT IN ('ACCEPTED','WITHDRAWN')))
   WHERE id = _obligation_id;

  RETURN jsonb_build_object('created', v_count);
END $$;
REVOKE ALL ON FUNCTION public.returns_generate_periods(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.returns_generate_periods(uuid, date) TO authenticated;
