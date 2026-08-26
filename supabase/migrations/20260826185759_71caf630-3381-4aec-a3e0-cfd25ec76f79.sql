-- ============================================================================
-- MC-11 Part 2 — deterministic supervisory MI engine
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.conduct_evidence_pack_version_immutable() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Canonical record set. EVERY management figure is a count over this
--    function, and the drill-down lists exactly the same rows, so a headline
--    number can never disagree with its underlying records.
--    Scope is passed in already-resolved; direct execution is revoked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_mi_records(
  _metric_code text,
  _sectors uuid[],
  _period_start date,
  _period_end date
) RETURNS TABLE (
  record_id uuid,
  record_type text,
  reference text,
  title text,
  sector_id uuid,
  occurred_at timestamptz,
  route text,
  detail jsonb
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _p_start timestamptz := _period_start::timestamptz;
        _p_end   timestamptz := (_period_end + 1)::timestamptz;
BEGIN
  -- Regulated population -----------------------------------------------------
  IF _metric_code IN ('MI_ENTITIES_IN_SCOPE','MI_ENTITIES_WITH_ATTENTION','MI_ENTITIES_WITH_ACTIVE_PLAN',
                      'MI_ENTITIES_WITH_INTERVENTION','MI_ENTITIES_IN_EMERGING_RISK') THEN
    RETURN QUERY
      SELECT l.id, 'licensee', l.name, l.name, l.sector_id, NULL::timestamptz,
             '/licensees/' || l.id::text,
             jsonb_build_object('sector_id', l.sector_id, 'status', l.status)
        FROM public.licensees l
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND (
           _metric_code = 'MI_ENTITIES_IN_SCOPE'
           OR (_metric_code = 'MI_ENTITIES_WITH_ATTENTION' AND EXISTS (
                 SELECT 1 FROM public.conduct_attention_items a
                  WHERE a.status <> 'CLOSED' AND l.id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))
                    AND (_sectors IS NULL OR a.sector_id = ANY(_sectors))))
           OR (_metric_code = 'MI_ENTITIES_WITH_ACTIVE_PLAN' AND EXISTS (
                 SELECT 1 FROM public.conduct_supervisory_plans p
                  WHERE p.status IN ('APPROVED','ACTIVE') AND l.id = ANY(COALESCE(p.entity_ids,'{}'::uuid[]))
                    AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))))
           OR (_metric_code = 'MI_ENTITIES_WITH_INTERVENTION' AND EXISTS (
                 SELECT 1 FROM public.conduct_interventions i
                  WHERE i.status IN ('ENDORSED','ACTIVE') AND i.licensee_id = l.id
                    AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))))
           OR (_metric_code = 'MI_ENTITIES_IN_EMERGING_RISK' AND EXISTS (
                 SELECT 1 FROM public.conduct_attention_items a
                  WHERE a.emerging_risk_id IS NOT NULL AND a.status <> 'CLOSED'
                    AND l.id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))
                    AND (_sectors IS NULL OR a.sector_id = ANY(_sectors))))
         );
    RETURN;
  END IF;

  -- Emerging risk ------------------------------------------------------------
  IF _metric_code LIKE 'MI_RISK_%' THEN
    RETURN QUERY
      SELECT r.id, 'emerging_risk', r.reference, r.title, r.sector_id,
             COALESCE(r.closed_at, r.created_at),
             '/conduct/emerging-risks/' || r.id::text,
             jsonb_build_object('status', r.status, 'severity', r.severity,
               'entity_count', r.entity_count, 'window_start', r.window_start, 'window_end', r.window_end)
        FROM public.conduct_emerging_risks r
       WHERE (_sectors IS NULL OR r.sector_id = ANY(_sectors))
         AND (
           (_metric_code = 'MI_RISK_IDENTIFIED' AND r.status = 'IDENTIFIED')
           OR (_metric_code = 'MI_RISK_ASSESSING' AND r.status = 'ASSESSING')
           OR (_metric_code = 'MI_RISK_CONFIRMED' AND r.status = 'CONFIRMED')
           OR (_metric_code = 'MI_RISK_MONITORING' AND r.status = 'MONITORING')
           OR (_metric_code = 'MI_RISK_CLOSED_IN_PERIOD' AND r.status IN ('CLOSED','DISMISSED')
               AND r.closed_at >= _p_start AND r.closed_at < _p_end)
           OR (_metric_code = 'MI_RISK_CONFIRMED_NO_RESPONSE' AND r.status = 'CONFIRMED'
               AND NOT EXISTS (SELECT 1 FROM public.conduct_attention_items a
                                WHERE a.emerging_risk_id = r.id AND a.status <> 'CLOSED'))
         );
    RETURN;
  END IF;

  -- Supervisory attention ----------------------------------------------------
  IF _metric_code LIKE 'MI_ATTENTION_%' THEN
    RETURN QUERY
      SELECT a.id, 'attention_item', a.reference, a.title, a.sector_id, a.created_at,
             '/conduct/supervisory-attention/' || a.id::text,
             jsonb_build_object('status', a.status, 'confirmed_priority', a.confirmed_priority,
               'calculated_priority', a.calculated_priority, 'theme', a.theme,
               'target_review_date', a.target_review_date, 'source_type', a.source_type)
        FROM public.conduct_attention_items a
       WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
         AND (
           (_metric_code = 'MI_ATTENTION_OPEN' AND a.status <> 'CLOSED')
           OR (_metric_code = 'MI_ATTENTION_CREATED_IN_PERIOD' AND a.created_at >= _p_start AND a.created_at < _p_end)
           OR (_metric_code = 'MI_ATTENTION_CLOSED_IN_PERIOD' AND a.status = 'CLOSED'
               AND a.closed_at >= _p_start AND a.closed_at < _p_end)
           OR (_metric_code = 'MI_ATTENTION_PRIORITY_IMMEDIATE' AND a.status <> 'CLOSED' AND a.confirmed_priority = 'IMMEDIATE')
           OR (_metric_code = 'MI_ATTENTION_PRIORITY_HIGH' AND a.status <> 'CLOSED' AND a.confirmed_priority = 'HIGH')
           OR (_metric_code = 'MI_ATTENTION_PRIORITY_PLANNED' AND a.status <> 'CLOSED' AND a.confirmed_priority = 'PLANNED')
           OR (_metric_code = 'MI_ATTENTION_PRIORITY_MONITOR' AND a.status <> 'CLOSED' AND a.confirmed_priority = 'MONITOR')
           OR (_metric_code = 'MI_ATTENTION_PRIORITY_UNCONFIRMED' AND a.status <> 'CLOSED' AND a.confirmed_priority IS NULL)
           OR (_metric_code = 'MI_ATTENTION_HIGH_NO_PLAN' AND a.status <> 'CLOSED'
               AND a.confirmed_priority IN ('IMMEDIATE','HIGH')
               AND NOT EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p
                                WHERE p.attention_id = a.id AND p.status <> 'CANCELLED'))
           OR (_metric_code = 'MI_ATTENTION_REVIEW_OVERDUE' AND a.status <> 'CLOSED'
               AND a.target_review_date IS NOT NULL AND a.target_review_date < current_date)
         );
    RETURN;
  END IF;

  -- Supervisory plans --------------------------------------------------------
  IF _metric_code LIKE 'MI_PLANS_%' THEN
    RETURN QUERY
      SELECT p.id, 'supervisory_plan', p.reference, p.title, p.sector_id, p.created_at,
             '/conduct/supervisory-plans/' || p.id::text,
             jsonb_build_object('status', p.status, 'priority', p.priority,
               'target_completion', p.target_completion, 'attention_id', p.attention_id,
               'approved_at', p.approved_at, 'completed_at', p.completed_at)
        FROM public.conduct_supervisory_plans p
       WHERE (_sectors IS NULL OR p.sector_id = ANY(_sectors))
         AND (
           (_metric_code = 'MI_PLANS_DRAFT' AND p.status = 'DRAFT')
           OR (_metric_code = 'MI_PLANS_SUBMITTED' AND p.status = 'SUBMITTED')
           OR (_metric_code = 'MI_PLANS_APPROVED' AND p.status = 'APPROVED')
           OR (_metric_code = 'MI_PLANS_ACTIVE' AND p.status = 'ACTIVE')
           OR (_metric_code = 'MI_PLANS_OVERDUE' AND p.status IN ('APPROVED','ACTIVE')
               AND p.target_completion IS NOT NULL AND p.target_completion < current_date)
           OR (_metric_code = 'MI_PLANS_COMPLETED_IN_PERIOD' AND p.status = 'COMPLETED'
               AND p.completed_at >= _p_start AND p.completed_at < _p_end)
           OR (_metric_code = 'MI_PLANS_WITHOUT_INTERVENTION' AND p.status IN ('APPROVED','ACTIVE')
               AND NOT EXISTS (SELECT 1 FROM public.conduct_interventions i
                                WHERE i.plan_id = p.id AND i.status <> 'REJECTED'))
         );
    RETURN;
  END IF;

  -- Interventions, outcomes, follow-up ---------------------------------------
  IF _metric_code LIKE 'MI_INTV_%' OR _metric_code LIKE 'MI_OUTCOME%' OR _metric_code LIKE 'MI_FOLLOWUP_%'
     OR _metric_code = 'MI_REASSESS_PENDING' THEN
    RETURN QUERY
      SELECT i.id, 'intervention', i.reference, i.title, i.sector_id,
             COALESCE(i.outcome_recorded_at, i.activated_at, i.created_at),
             '/conduct/interventions/' || i.id::text,
             jsonb_build_object('status', i.status, 'catalogue_code', COALESCE(i.catalogue_code, i.intervention_type),
               'licensee_id', i.licensee_id, 'theme', i.theme, 'emerging_risk_id', i.emerging_risk_id,
               'outcome_result', i.outcome_result, 'outcome_rationale_recorded', (i.outcome_rationale IS NOT NULL),
               'planned_end', i.planned_end, 'followup_due_date', i.followup_due_date,
               'followup_completed_at', i.followup_completed_at, 'attention_id', i.attention_id, 'plan_id', i.plan_id)
        FROM public.conduct_interventions i
       WHERE (_sectors IS NULL OR i.sector_id = ANY(_sectors))
         AND (
           (_metric_code = 'MI_INTV_PROPOSED' AND i.status = 'PROPOSED')
           OR (_metric_code = 'MI_INTV_PLANNED' AND i.status = 'ENDORSED')
           OR (_metric_code = 'MI_INTV_ACTIVE' AND i.status = 'ACTIVE')
           OR (_metric_code = 'MI_INTV_OVERDUE' AND i.status = 'ACTIVE'
               AND i.planned_end IS NOT NULL AND i.planned_end < current_date)
           OR (_metric_code = 'MI_INTV_COMPLETED_IN_PERIOD' AND i.status = 'COMPLETED'
               AND i.completed_at >= _p_start AND i.completed_at < _p_end)
           OR (_metric_code = 'MI_INTV_AWAITING_OUTCOME' AND i.status = 'COMPLETED' AND i.outcome_result IS NULL)
           OR (_metric_code = 'MI_INTV_FOLLOWUP_REQUIRED' AND i.followup_due_date IS NOT NULL
               AND i.followup_completed_at IS NULL)
           OR (_metric_code = 'MI_OUTCOMES_RECORDED_IN_PERIOD' AND i.outcome_result IS NOT NULL
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_OUTCOME_NO_FURTHER_ACTION' AND i.outcome_result = 'no_further_action'
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_OUTCOME_CONTINUE_MONITORING' AND i.outcome_result = 'continue_monitoring'
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_OUTCOME_REMEDIATION_REQUIRED' AND i.outcome_result = 'remediation_required'
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_OUTCOME_FURTHER_REVIEW' AND i.outcome_result IN ('further_review_required','investigation_required','information_required')
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_OUTCOME_ESCALATION_REQUIRED' AND i.outcome_result IN ('escalation_required','finding_raised')
               AND i.outcome_recorded_at >= _p_start AND i.outcome_recorded_at < _p_end)
           OR (_metric_code = 'MI_FOLLOWUP_DUE' AND i.followup_due_date IS NOT NULL AND i.followup_completed_at IS NULL)
           OR (_metric_code = 'MI_FOLLOWUP_OVERDUE' AND i.followup_due_date IS NOT NULL
               AND i.followup_completed_at IS NULL AND i.followup_due_date < current_date)
           OR (_metric_code = 'MI_FOLLOWUP_COMPLETED_IN_PERIOD' AND i.followup_completed_at IS NOT NULL
               AND i.followup_completed_at >= _p_start AND i.followup_completed_at < _p_end)
           OR (_metric_code = 'MI_REASSESS_PENDING' AND i.followup_completed_at IS NOT NULL
               AND i.attention_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r
                                WHERE r.attention_id = i.attention_id AND r.intervention_id = i.id))
         );
    RETURN;
  END IF;

  -- Reassessments ------------------------------------------------------------
  IF _metric_code LIKE 'MI_REASSESS_%' THEN
    RETURN QUERY
      SELECT r.id, 'reassessment', a.reference, a.title, a.sector_id, r.assessed_at,
             '/conduct/supervisory-attention/' || a.id::text,
             jsonb_build_object('next_step', r.next_step, 'concern_state', r.concern_state,
               'intervention_id', r.intervention_id, 'next_review_date', r.next_review_date)
        FROM public.conduct_attention_reassessments r
        JOIN public.conduct_attention_items a ON a.id = r.attention_id
       WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
         AND r.assessed_at >= _p_start AND r.assessed_at < _p_end
         AND (
           _metric_code = 'MI_REASSESS_COMPLETED_IN_PERIOD'
           OR (_metric_code = 'MI_REASSESS_NEXT_CONTINUE_MONITORING' AND r.next_step = 'continue_monitoring')
           OR (_metric_code = 'MI_REASSESS_NEXT_FURTHER_INTERVENTION' AND r.next_step = 'further_intervention')
           OR (_metric_code = 'MI_REASSESS_NEXT_CLOSE' AND r.next_step = 'close')
           OR (_metric_code = 'MI_REASSESS_NEXT_REFER' AND r.next_step = 'refer')
         );
    RETURN;
  END IF;

  -- Findings -----------------------------------------------------------------
  IF _metric_code LIKE 'MI_FINDINGS_%' THEN
    RETURN QUERY
      SELECT f.id, 'finding', f.finding_reference, f.title, l.sector_id, f.opened_at,
             '/conduct/findings/' || f.id::text,
             jsonb_build_object('status', f.status, 'severity', f.severity, 'entity_id', f.entity_id)
        FROM public.conduct_findings f
        LEFT JOIN public.licensees l ON l.id = f.entity_id
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND (
           (_metric_code = 'MI_FINDINGS_OPEN' AND f.status NOT IN ('closed','dismissed'))
           OR (_metric_code = 'MI_FINDINGS_HIGH_UNRESOLVED' AND f.status NOT IN ('closed','dismissed')
               AND f.severity IN ('high','critical'))
           OR (_metric_code = 'MI_FINDINGS_RAISED_IN_PERIOD' AND f.opened_at >= _p_start AND f.opened_at < _p_end)
         );
    RETURN;
  END IF;

  -- Remediation actions ------------------------------------------------------
  IF _metric_code = 'MI_REMEDIATION_OVERDUE' THEN
    RETURN QUERY
      SELECT c.id, 'remediation_action', COALESCE(c.title, c.id::text), c.title, l.sector_id, c.created_at,
             '/conduct/actions/' || c.id::text,
             jsonb_build_object('status', c.status, 'due_date', c.due_date, 'entity_id', c.entity_id)
        FROM public.conduct_actions c
        LEFT JOIN public.licensees l ON l.id = c.entity_id
       WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
         AND c.due_date IS NOT NULL AND c.due_date < current_date
         AND c.closed_at IS NULL;
    RETURN;
  END IF;

  RAISE EXCEPTION 'unknown_metric: %', _metric_code USING ERRCODE = '22023';
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_mi_records(text, uuid[], date, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Scope header — the population every reporting page must display.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_mi_scope_header(_sectors uuid[], _period_start date, _period_end date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _names text[]; _entities integer;
BEGIN
  SELECT COALESCE(array_agg(s.name ORDER BY s.name), '{}'::text[]) INTO _names
    FROM public.sectors s WHERE _sectors IS NULL OR s.id = ANY(_sectors);
  SELECT count(*) INTO _entities FROM public.licensees l
   WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors));
  RETURN jsonb_build_object(
    'sector_ids', COALESCE(to_jsonb(_sectors), 'null'::jsonb),
    'sectors_in_view', to_jsonb(_names),
    'sector_scope', CASE WHEN _sectors IS NULL THEN 'all_authorised' ELSE 'restricted' END,
    'entity_population', _entities,
    'period_start', _period_start,
    'period_end', _period_end,
    'report_date', current_date,
    'calculated_at', now());
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_mi_scope_header(uuid[], date, date) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Management dashboard — deterministic metric package + facts signature.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_mi_dashboard(
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[]; _ps date; _pe date;
        _metrics jsonb := '{}'::jsonb; _groups jsonb := '{}'::jsonb;
        _defs jsonb; _def record; _n integer; _pack jsonb; _defver text;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  _pe := COALESCE(_period_end, current_date);
  _ps := COALESCE(_period_start, (_pe - interval '90 days')::date);
  IF _pe < _ps THEN
    RAISE EXCEPTION 'invalid_period: the period end precedes the period start' USING ERRCODE = '22023';
  END IF;

  FOR _def IN
    SELECT code, metric_group FROM public.conduct_mi_definitions
     WHERE is_active AND effective_from <= _pe ORDER BY sort_order, code
  LOOP
    SELECT count(*) INTO _n FROM public.conduct_mi_records(_def.code, _sectors, _ps, _pe);
    _metrics := _metrics || jsonb_build_object(_def.code, _n);
    _groups := jsonb_set(_groups, ARRAY[_def.metric_group],
                 COALESCE(_groups -> _def.metric_group, '{}'::jsonb) || jsonb_build_object(_def.code, _n), true);
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', d.code, 'name', d.name, 'metric_group', d.metric_group,
           'business_meaning', d.business_meaning, 'source_object', d.source_object,
           'numerator', d.numerator, 'denominator', d.denominator,
           'inclusion_criteria', d.inclusion_criteria, 'exclusion_criteria', d.exclusion_criteria,
           'time_basis', d.time_basis, 'grouping_dimensions', to_jsonb(d.grouping_dimensions),
           'calculation_note', d.calculation_note, 'calculation_version', d.calculation_version,
           'drilldown_supported', d.drilldown_supported, 'effective_from', d.effective_from)
           ORDER BY d.sort_order, d.code), '[]'::jsonb)
    INTO _defs FROM public.conduct_mi_definitions d WHERE d.is_active AND d.effective_from <= _pe;

  SELECT 'mi.v' || COALESCE(max(calculation_version), 1)::text || '.' || count(*)::text
    INTO _defver FROM public.conduct_mi_definitions WHERE is_active;

  _pack := jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _ps, _pe),
    'metrics', _metrics,
    'metric_groups', _groups,
    'definitions', _defs,
    'definition_version', _defver,
    'coverage', public.conduct_planning_coverage(_sector_id, _regulator_id));

  RETURN _pack || jsonb_build_object(
    'facts_signature', public.conduct_360_fingerprint(
        jsonb_build_object('metrics', _metrics, 'scope',
          (_pack -> 'scope') - 'calculated_at', 'definition_version', _defver)),
    'generated_at', now(),
    'provenance', jsonb_build_object('source', 'conduct_mi_dashboard', 'content_class', 'fact',
                                     'ai_content', false));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_mi_dashboard(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_mi_dashboard(date, date, uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Metric drill-down — the exact contributing records.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_mi_drilldown(
  _metric_code text,
  _period_start date DEFAULT NULL,
  _period_end date DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _limit integer DEFAULT 500
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[]; _ps date; _pe date; _def public.conduct_mi_definitions;
        _rows jsonb; _n integer;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  SELECT * INTO _def FROM public.conduct_mi_definitions WHERE code = _metric_code;
  IF _def.code IS NULL THEN
    RAISE EXCEPTION 'unknown_metric: % has no published definition', _metric_code USING ERRCODE = '22023';
  END IF;
  _pe := COALESCE(_period_end, current_date);
  _ps := COALESCE(_period_start, (_pe - interval '90 days')::date);

  SELECT count(*) INTO _n FROM public.conduct_mi_records(_metric_code, _sectors, _ps, _pe);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', q.record_id, 'record_type', q.record_type, 'reference', q.reference,
           'title', q.title, 'sector_id', q.sector_id, 'occurred_at', q.occurred_at,
           'route', q.route, 'detail', q.detail) ORDER BY q.occurred_at DESC NULLS LAST, q.reference), '[]'::jsonb)
    INTO _rows
    FROM (SELECT * FROM public.conduct_mi_records(_metric_code, _sectors, _ps, _pe)
           ORDER BY occurred_at DESC NULLS LAST, reference
           LIMIT GREATEST(1, LEAST(COALESCE(_limit, 500), 2000))) q;

  RETURN jsonb_build_object(
    'metric', jsonb_build_object('code', _def.code, 'name', _def.name,
      'business_meaning', _def.business_meaning, 'source_object', _def.source_object,
      'numerator', _def.numerator, 'denominator', _def.denominator,
      'inclusion_criteria', _def.inclusion_criteria, 'exclusion_criteria', _def.exclusion_criteria,
      'time_basis', _def.time_basis, 'calculation_note', _def.calculation_note,
      'calculation_version', _def.calculation_version),
    'scope', public.conduct_mi_scope_header(_sectors, _ps, _pe),
    'value', _n,
    'returned', jsonb_array_length(_rows),
    'records', _rows,
    'provenance', jsonb_build_object('source', 'conduct_mi_records', 'content_class', 'fact', 'ai_content', false));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_mi_drilldown(text, date, date, uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_mi_drilldown(text, date, date, uuid, uuid, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Period comparison.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_mi_period_compare(
  _period_start date,
  _period_end date,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid; _sectors uuid[]; _len integer; _pps date; _ppe date;
        _def record; _cur integer; _prev integer; _items jsonb := '[]'::jsonb; _small boolean;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  IF _period_end < _period_start THEN
    RAISE EXCEPTION 'invalid_period: the period end precedes the period start' USING ERRCODE = '22023';
  END IF;
  _len := (_period_end - _period_start) + 1;
  _ppe := _period_start - 1;
  _pps := _ppe - (_len - 1);

  FOR _def IN
    SELECT code, name, metric_group, time_basis FROM public.conduct_mi_definitions
     WHERE is_active AND time_basis = 'period' ORDER BY sort_order, code
  LOOP
    SELECT count(*) INTO _cur FROM public.conduct_mi_records(_def.code, _sectors, _period_start, _period_end);
    SELECT count(*) INTO _prev FROM public.conduct_mi_records(_def.code, _sectors, _pps, _ppe);
    _small := (_prev + _cur) < 5;
    _items := _items || jsonb_build_array(jsonb_build_object(
      'code', _def.code, 'name', _def.name, 'metric_group', _def.metric_group,
      'current_value', _cur, 'previous_value', _prev, 'absolute_change', _cur - _prev,
      'percentage_change', CASE WHEN _prev = 0 THEN NULL ELSE round(((_cur - _prev)::numeric / _prev) * 100, 1) END,
      'interpretation_limited', _small,
      'limitation', CASE WHEN _small
        THEN 'The population is too small for a percentage movement to be treated as material.'
        WHEN _prev = 0 THEN 'No comparable activity in the previous period, so no percentage movement is shown.'
        ELSE NULL END));
  END LOOP;

  RETURN jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _period_start, _period_end),
    'current_period', jsonb_build_object('start', _period_start, 'end', _period_end, 'days', _len),
    'previous_period', jsonb_build_object('start', _pps, 'end', _ppe, 'days', _len),
    'comparisons', _items,
    'note', 'Only period-basis measures are comparable. A percentage movement is not automatically material.',
    'provenance', jsonb_build_object('source', 'conduct_mi_period_compare', 'content_class', 'fact', 'ai_content', false));
END $$;

REVOKE EXECUTE ON FUNCTION public.conduct_mi_period_compare(date, date, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_mi_period_compare(date, date, uuid, uuid) TO authenticated;