-- MC-10 part 3 — planning read models + governed AI recording.

CREATE OR REPLACE FUNCTION public.conduct_attention_register(
  _status text DEFAULT NULL, _priority text DEFAULT NULL,
  _sector_id uuid DEFAULT NULL, _regulator_id uuid DEFAULT NULL, _limit integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _sectors uuid[]; _items jsonb; _plans jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO _items
  FROM (
    SELECT jsonb_build_object(
      'id', a.id, 'reference', a.reference, 'title', a.title, 'status', a.status,
      'source_type', a.source_type, 'source_module', a.source_module,
      'source_reference', a.source_reference, 'theme', a.theme,
      'sector_id', a.sector_id, 'sector_name', s.name,
      'entity_count', COALESCE(array_length(a.entity_ids,1),0),
      'materiality', a.materiality, 'urgency', a.urgency,
      'calculated_priority', a.calculated_priority, 'calculated_score', a.calculated_score,
      'confirmed_priority', a.confirmed_priority, 'priority_overridden', a.priority_overridden,
      'owner_id', a.owner_id, 'target_review_date', a.target_review_date,
      'identified_on', a.identified_on, 'emerging_risk_id', a.emerging_risk_id,
      'plan_count', (SELECT count(*) FROM public.conduct_supervisory_plans p
                      WHERE p.attention_id = a.id AND p.status <> 'CANCELLED'),
      'intervention_count', (SELECT count(*) FROM public.conduct_interventions i
                      WHERE i.attention_id = a.id AND i.status <> 'REJECTED'),
      'created_at', a.created_at) x
      FROM public.conduct_attention_items a
      LEFT JOIN public.sectors s ON s.id = a.sector_id
     WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
       AND (_status IS NULL OR a.status = _status)
       AND (_priority IS NULL OR COALESCE(a.confirmed_priority, a.calculated_priority) = _priority)
     ORDER BY a.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit,200), 500))) t;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO _plans
  FROM (
    SELECT jsonb_build_object(
      'id', p.id, 'reference', p.reference, 'title', p.title, 'status', p.status,
      'objective', p.objective, 'objective_source', p.objective_source,
      'priority', p.priority, 'planning_period', p.planning_period, 'period_label', p.period_label,
      'theme', p.theme, 'sector_id', p.sector_id, 'sector_name', s.name,
      'attention_id', p.attention_id,
      'attention_reference', (SELECT a.reference FROM public.conduct_attention_items a WHERE a.id = p.attention_id),
      'start_date', p.start_date, 'target_completion', p.target_completion,
      'next_review_date', p.next_review_date,
      'milestone_open', (SELECT count(*) FROM public.conduct_plan_milestones m
                          WHERE m.plan_id = p.id AND m.status = 'OPEN'),
      'intervention_count', (SELECT count(*) FROM public.conduct_interventions i
                          WHERE i.plan_id = p.id AND i.status <> 'REJECTED'),
      'created_at', p.created_at) x
      FROM public.conduct_supervisory_plans p
      LEFT JOIN public.sectors s ON s.id = p.sector_id
     WHERE (_sectors IS NULL OR p.sector_id = ANY(_sectors))
     ORDER BY p.created_at DESC
     LIMIT GREATEST(1, LEAST(COALESCE(_limit,200), 500))) t;

  RETURN jsonb_build_object(
    'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END,
    'attention_items', _items,
    'plans', _plans,
    'intervention_catalogue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'purpose', t.purpose,
               'applicability', t.applicability, 'authority_action', t.authority_action,
               'canonical_module', t.canonical_module, 'canonical_route', t.canonical_route,
               'requires_canonical_record', t.requires_canonical_record) ORDER BY t.sort_order), '[]'::jsonb)
        FROM public.conduct_intervention_types t WHERE t.active),
    'method', 'Recorded supervisory planning data only. No estimation and no AI involvement.');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_attention_case(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.conduct_attention_items;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['view']);

  RETURN jsonb_build_object(
    'attention', to_jsonb(_row),
    'sector_name', (SELECT s.name FROM public.sectors s WHERE s.id = _row.sector_id),
    'entities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.entity_name,
               'sector_id', l.sector_id) ORDER BY l.entity_name), '[]'::jsonb)
        FROM public.licensees l WHERE l.id = ANY(COALESCE(_row.entity_ids,'{}'))),
    'owner_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.owner_id),
    'confirmed_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.confirmed_by),
    'emerging_risk', (
      SELECT jsonb_build_object('id', r.id, 'reference', r.reference, 'title', r.title,
               'status', r.status, 'severity', r.severity, 'entity_count', r.entity_count)
        FROM public.conduct_emerging_risks r WHERE r.id = _row.emerging_risk_id),
    'calculations', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'method', c.method, 'factors', c.factors,
               'score', c.score, 'band', c.band, 'facts_signature', c.facts_signature,
               'window_start', c.window_start, 'window_end', c.window_end,
               'computed_at', c.computed_at) ORDER BY c.computed_at DESC), '[]'::jsonb)
        FROM public.conduct_attention_priority_calcs c WHERE c.attention_id = _id),
    'events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type,
               'from_state', e.from_state, 'to_state', e.to_state, 'rationale', e.rationale,
               'detail', e.detail, 'actor_id', e.actor_id,
               'actor_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = e.actor_id),
               'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb)
        FROM public.conduct_attention_events e WHERE e.attention_id = _id),
    'reassessments', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'concern_state', r.concern_state,
               'assessment', r.assessment, 'next_step', r.next_step, 'next_review_date', r.next_review_date,
               'intervention_id', r.intervention_id, 'evidence', r.evidence,
               'assessed_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = r.assessed_by),
               'assessed_at', r.assessed_at) ORDER BY r.assessed_at DESC), '[]'::jsonb)
        FROM public.conduct_attention_reassessments r WHERE r.attention_id = _id),
    'plans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference,
               'title', p.title, 'status', p.status, 'objective', p.objective,
               'target_completion', p.target_completion) ORDER BY p.created_at DESC), '[]'::jsonb)
        FROM public.conduct_supervisory_plans p WHERE p.attention_id = _id),
    'interventions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'catalogue_code', i.catalogue_code, 'title', i.title, 'status', i.status,
               'outcome_result', i.outcome_result, 'planned_start', i.planned_start,
               'planned_end', i.planned_end, 'followup_due_date', i.followup_due_date,
               'followup_completed_at', i.followup_completed_at,
               'canonical_route', i.canonical_route, 'canonical_reference', i.canonical_reference,
               'plan_id', i.plan_id) ORDER BY i.created_at DESC), '[]'::jsonb)
        FROM public.conduct_interventions i WHERE i.attention_id = _id),
    'intervention_catalogue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'purpose', t.purpose,
               'applicability', t.applicability, 'authority_action', t.authority_action,
               'canonical_module', t.canonical_module, 'canonical_route', t.canonical_route,
               'requires_canonical_record', t.requires_canonical_record) ORDER BY t.sort_order), '[]'::jsonb)
        FROM public.conduct_intervention_types t WHERE t.active),
    'ai_suggestions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ci.id, 'use_case_code', ci.use_case_code,
               'ai_output', ci.ai_output, 'source_references', ci.source_references,
               'confidence', ci.confidence, 'uncertainty', ci.uncertainty, 'limitations', ci.limitations,
               'review_state', ci.review_state, 'staleness_state', ci.staleness_state,
               'snapshot_fingerprint', ci.snapshot_fingerprint,
               'model', ci.model, 'model_version', ci.model_version,
               'prompt_template_code', ci.prompt_template_code,
               'prompt_template_version', ci.prompt_template_version,
               'generated_at', ci.created_at) ORDER BY ci.created_at DESC), '[]'::jsonb)
        FROM public.conduct_ai_insights ci
       WHERE ci.subject_type = 'attention_item' AND ci.subject_key = _row.reference));
END $$;

CREATE OR REPLACE FUNCTION public.conduct_plan_case(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.conduct_supervisory_plans;
BEGIN
  _row := public.conduct_plan_guard(_id, ARRAY['view']);

  RETURN jsonb_build_object(
    'plan', to_jsonb(_row),
    'sector_name', (SELECT s.name FROM public.sectors s WHERE s.id = _row.sector_id),
    'lead_officer_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.lead_officer_id),
    'submitted_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.submitted_by),
    'approved_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.approved_by),
    'attention', (
      SELECT jsonb_build_object('id', a.id, 'reference', a.reference, 'title', a.title,
               'status', a.status, 'confirmed_priority', a.confirmed_priority,
               'calculated_priority', a.calculated_priority, 'supervisory_basis', a.supervisory_basis)
        FROM public.conduct_attention_items a WHERE a.id = _row.attention_id),
    'entities', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.entity_name) ORDER BY l.entity_name), '[]'::jsonb)
        FROM public.licensees l WHERE l.id = ANY(COALESCE(_row.entity_ids,'{}'))),
    'milestones', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', m.id, 'title', m.title, 'detail', m.detail,
               'due_date', m.due_date, 'status', m.status, 'completed_at', m.completed_at)
               ORDER BY m.due_date NULLS LAST, m.created_at), '[]'::jsonb)
        FROM public.conduct_plan_milestones m WHERE m.plan_id = _id),
    'events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', e.id, 'event_type', e.event_type,
               'from_status', e.from_status, 'to_status', e.to_status, 'rationale', e.rationale,
               'detail', e.detail,
               'actor_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = e.actor_id),
               'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb)
        FROM public.conduct_plan_events e WHERE e.plan_id = _id),
    'interventions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'catalogue_code', i.catalogue_code, 'title', i.title, 'status', i.status,
               'outcome_result', i.outcome_result, 'planned_start', i.planned_start,
               'planned_end', i.planned_end, 'canonical_route', i.canonical_route,
               'canonical_reference', i.canonical_reference) ORDER BY i.created_at DESC), '[]'::jsonb)
        FROM public.conduct_interventions i WHERE i.plan_id = _id),
    'intervention_catalogue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'purpose', t.purpose,
               'applicability', t.applicability, 'authority_action', t.authority_action,
               'canonical_module', t.canonical_module, 'canonical_route', t.canonical_route,
               'requires_canonical_record', t.requires_canonical_record) ORDER BY t.sort_order), '[]'::jsonb)
        FROM public.conduct_intervention_types t WHERE t.active),
    'ai_suggestions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ci.id, 'use_case_code', ci.use_case_code,
               'ai_output', ci.ai_output, 'source_references', ci.source_references,
               'confidence', ci.confidence, 'uncertainty', ci.uncertainty, 'limitations', ci.limitations,
               'review_state', ci.review_state, 'staleness_state', ci.staleness_state,
               'snapshot_fingerprint', ci.snapshot_fingerprint,
               'model', ci.model, 'model_version', ci.model_version,
               'prompt_template_code', ci.prompt_template_code,
               'prompt_template_version', ci.prompt_template_version,
               'generated_at', ci.created_at) ORDER BY ci.created_at DESC), '[]'::jsonb)
        FROM public.conduct_ai_insights ci
       WHERE ci.subject_type = 'supervisory_plan' AND ci.subject_key = _row.reference));
END $$;

-- The ONLY permitted persistence path for an MC-10 planning suggestion.
CREATE OR REPLACE FUNCTION public.conduct_planning_ai_insight_record(
  _use_case_code text,
  _subject_type text,
  _subject_key text,
  _attention_id uuid,
  _plan_id uuid,
  _sector_id uuid,
  _regulator_id uuid,
  _snapshot_fingerprint text,
  _ai_output jsonb,
  _source_references jsonb,
  _provider text,
  _model text,
  _model_version text,
  _prompt_template_version text,
  _confidence numeric,
  _uncertainty text,
  _limitations text[],
  _generated_by uuid,
  _title text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uc public.conduct_ai_use_cases; _insight_id uuid; _id uuid;
BEGIN
  SELECT * INTO _uc FROM public.conduct_ai_use_cases WHERE code = _use_case_code;
  IF _uc.code IS NULL THEN
    RAISE EXCEPTION 'unknown_use_case: %', _use_case_code USING ERRCODE = '22023';
  END IF;
  IF _uc.allowed_source <> 'conduct_planning_snapshot' THEN
    RAISE EXCEPTION 'fact_source_not_permitted: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF NOT _uc.is_enabled THEN
    RAISE EXCEPTION 'use_case_disabled: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF _uc.workflow_mutation_allowed THEN
    RAISE EXCEPTION 'mutation_policy_violation: %', _use_case_code USING ERRCODE = '42501';
  END IF;
  IF _subject_type NOT IN ('attention_item','supervisory_plan','intervention') THEN
    RAISE EXCEPTION 'unsupported_subject_type: %', _subject_type USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(COALESCE(_subject_key,'')),'') = '' THEN
    RAISE EXCEPTION 'subject_key_required' USING ERRCODE = '22023';
  END IF;
  IF _ai_output IS NULL OR _ai_output = '{}'::jsonb THEN
    RAISE EXCEPTION 'ai_output_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(COALESCE(_snapshot_fingerprint,'')),'') = '' THEN
    RAISE EXCEPTION 'fingerprint_required' USING ERRCODE = '22023';
  END IF;
  IF _uc.citations_required
     AND (_source_references IS NULL OR jsonb_array_length(COALESCE(_source_references,'[]'::jsonb)) = 0) THEN
    RAISE EXCEPTION 'citations_required: % needs at least one source reference', _use_case_code
      USING ERRCODE = '22023';
  END IF;
  IF _provider IS NOT NULL AND _uc.model_policy ? 'allowed_providers'
     AND NOT (_uc.model_policy -> 'allowed_providers' ? _provider) THEN
    RAISE EXCEPTION 'provider_not_permitted: %', _provider USING ERRCODE = '42501';
  END IF;
  IF _model IS NOT NULL AND _uc.model_policy ? 'allowed_models'
     AND NOT (_uc.model_policy -> 'allowed_models' ? _model) THEN
    RAISE EXCEPTION 'model_not_permitted: %', _model USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.ai_insights (
    title, module, entity_id, insight_kind, analysis_type, scope, scope_id,
    period_key, source_records, citations, provider, model, provider_state,
    confidence, input_fingerprint, payload, review_status, generated_at,
    generated_by, regulator_id, source_modules
  ) VALUES (
    COALESCE(_title, _uc.label || ' — ' || _subject_key),
    'market_conduct', NULL, 'conduct_intelligence', _use_case_code,
    'sector', _sector_id,
    to_char(now(),'YYYY-MM-DD'),
    COALESCE(_source_references,'[]'::jsonb), COALESCE(_source_references,'[]'::jsonb),
    _provider, _model, CASE WHEN _provider IS NULL THEN 'NOT_CONFIGURED' ELSE 'SUCCESS' END,
    _confidence, _snapshot_fingerprint, _ai_output, 'pending', now(),
    _generated_by, _regulator_id, ARRAY['market_conduct']
  ) RETURNING id INTO _insight_id;

  INSERT INTO public.conduct_ai_insights (
    insight_id, use_case_code, entity_id, regulator_id, sector_id,
    subject_type, subject_key, emerging_risk_id, subject_population,
    window_start, window_end, snapshot_fingerprint, source_references,
    provider, model, model_version, prompt_template_code, prompt_template_version,
    generated_by, ai_output, confidence, uncertainty, limitations
  ) VALUES (
    _insight_id, _uc.code, NULL, _regulator_id, _sector_id,
    _subject_type, btrim(_subject_key),
    (SELECT a.emerging_risk_id FROM public.conduct_attention_items a WHERE a.id = _attention_id),
    jsonb_build_object('attention_id', _attention_id, 'plan_id', _plan_id),
    current_date, current_date, _snapshot_fingerprint, COALESCE(_source_references,'[]'::jsonb),
    _provider, _model, _model_version, _uc.prompt_template_code,
    COALESCE(_prompt_template_version, _uc.prompt_template_version),
    _generated_by, _ai_output, _confidence, _uncertainty, COALESCE(_limitations,'{}'::text[])
  ) RETURNING id INTO _id;

  RETURN _id;
END $$;

GRANT EXECUTE ON FUNCTION public.conduct_attention_register(text, text, uuid, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_case(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_case(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.conduct_planning_ai_insight_record(text,text,text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_planning_ai_insight_record(text,text,text,uuid,uuid,uuid,uuid,text,jsonb,jsonb,text,text,text,text,numeric,text,text[],uuid,text) TO service_role;