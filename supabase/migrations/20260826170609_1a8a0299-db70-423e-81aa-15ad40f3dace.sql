-- =====================================================================
-- MC-10 part 2 — governed supervisory planning operations.
-- Every mutation is SECURITY DEFINER, authority-checked, scope-checked and
-- history-writing. The browser has no direct write path.
-- =====================================================================

-- ---------------------------------------------------------------- helpers
CREATE OR REPLACE FUNCTION public.conduct_attention_guard(_id uuid, _actions text[])
RETURNS public.conduct_attention_items
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_attention_items;
BEGIN
  _uid := public.market_conduct_require(_actions);
  SELECT * INTO _row FROM public.conduct_attention_items WHERE id = _id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'not_found: attention item does not exist' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', _actions[1],
               _row.regulator_id, _row.sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: attention item out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_plan_guard(_id uuid, _actions text[])
RETURNS public.conduct_supervisory_plans
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_supervisory_plans;
BEGIN
  _uid := public.market_conduct_require(_actions);
  SELECT * INTO _row FROM public.conduct_supervisory_plans WHERE id = _id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'not_found: supervisory plan does not exist' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', _actions[1],
               _row.regulator_id, _row.sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: supervisory plan out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _row;
END $$;

-- ------------------------------------------------- attention: human creation
CREATE OR REPLACE FUNCTION public.conduct_attention_create(
  _title text,
  _source_type text,
  _source_module text,
  _supervisory_basis text,
  _source_id uuid DEFAULT NULL,
  _source_reference text DEFAULT NULL,
  _emerging_risk_id uuid DEFAULT NULL,
  _theme text DEFAULT NULL,
  _entity_ids uuid[] DEFAULT '{}',
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _materiality text DEFAULT 'medium',
  _urgency text DEFAULT 'routine',
  _linked_evidence jsonb DEFAULT '[]'::jsonb,
  _target_review_date date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _team_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid; _sectors uuid[]; _risk public.conduct_emerging_risks;
BEGIN
  -- Creating an authoritative attention item is a human supervisory act.
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics','manage_complaints']);

  IF length(btrim(COALESCE(_supervisory_basis,''))) < 20 THEN
    RAISE EXCEPTION 'A supervisory basis of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(btrim(_title),'') = '' THEN
    RAISE EXCEPTION 'A title is required' USING ERRCODE = '22023';
  END IF;
  IF _emerging_risk_id IS NULL AND _source_id IS NULL
     AND nullif(btrim(COALESCE(_theme,'')),'') IS NULL
     AND COALESCE(array_length(_entity_ids,1),0) = 0 THEN
    RAISE EXCEPTION 'An attention item must name a source record, a theme, an entity or an emerging risk'
      USING ERRCODE = '22023';
  END IF;

  _sector := _sector_id; _reg := _regulator_id;
  IF _emerging_risk_id IS NOT NULL THEN
    SELECT * INTO _risk FROM public.conduct_emerging_risks WHERE id = _emerging_risk_id;
    IF _risk.id IS NULL THEN
      RAISE EXCEPTION 'not_found: emerging risk does not exist' USING ERRCODE = '22023';
    END IF;
    _sector := COALESCE(_sector, _risk.sector_id);
    _reg := COALESCE(_reg, _risk.regulator_id);
  ELSIF COALESCE(array_length(_entity_ids,1),0) > 0 THEN
    SELECT COALESCE(_sector, l.sector_id), COALESCE(_reg, s.regulator_id)
      INTO _sector, _reg
      FROM public.licensees l LEFT JOIN public.sectors s ON s.id = l.sector_id
     WHERE l.id = _entity_ids[1];
  END IF;

  -- Fails closed on an unknown sector and on an out-of-remit sector.
  _sectors := public.conduct_planning_scope(_uid, _sector, _reg);

  -- Every named entity must sit inside the supervisor's permitted population.
  IF _sectors IS NOT NULL AND COALESCE(array_length(_entity_ids,1),0) > 0
     AND EXISTS (SELECT 1 FROM public.licensees l
                  WHERE l.id = ANY(_entity_ids)
                    AND (l.sector_id IS NULL OR NOT (l.sector_id = ANY(_sectors)))) THEN
    RAISE EXCEPTION 'not_authorized: an entity named is outside the permitted supervisory population'
      USING ERRCODE = '42501';
  END IF;

  _ref := 'SA-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_attention_ref_seq')::text, 5, '0');

  INSERT INTO public.conduct_attention_items(
    reference, regulator_id, sector_id, title, source_type, source_module, source_id,
    source_reference, supervisory_basis, entity_ids, sector_ids, theme, emerging_risk_id,
    linked_evidence, materiality, urgency,
    breadth, owner_id, team_id, target_review_date, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), _source_type, _source_module, _source_id,
    _source_reference, btrim(_supervisory_basis), COALESCE(_entity_ids,'{}'),
    CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    nullif(btrim(COALESCE(_theme,'')),''), _emerging_risk_id,
    COALESCE(_linked_evidence,'[]'::jsonb), _materiality, _urgency,
    COALESCE(array_length(_entity_ids,1),0), _owner_id, _team_id, _target_review_date, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.conduct_attention_events(attention_id, event_type, to_state, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'OPEN', btrim(_supervisory_basis),
    jsonb_build_object('source_type', _source_type, 'source_module', _source_module,
                       'source_id', _source_id, 'emerging_risk_id', _emerging_risk_id), _uid);

  PERFORM public.log_compliance_audit('CREATE', 'conduct_attention_item', _id, NULL,
    jsonb_build_object('reference', _ref, 'source_type', _source_type), 
    'Supervisory attention ' || _ref || ' created');

  RETURN jsonb_build_object('id', _id, 'reference', _ref, 'status', 'OPEN',
    'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END);
END $$;

-- --------------------------------------- attention: deterministic prioritisation
CREATE OR REPLACE FUNCTION public.conduct_attention_priority_compute(_id uuid, _window_days integer DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _row public.conduct_attention_items;
  _from date; _to date; _prev_from date;
  _mat int; _urg int; _breadth int; _recur int; _exposure int; _trend int;
  _recent int; _prior int; _score numeric; _band text; _factors jsonb; _sig text; _calc_id uuid;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _window_days IS NULL OR _window_days <= 0 OR _window_days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;
  _to := current_date; _from := _to - _window_days; _prev_from := _from - _window_days;

  _mat := CASE _row.materiality WHEN 'severe' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END;
  _urg := CASE _row.urgency WHEN 'urgent' THEN 3 WHEN 'elevated' THEN 2 ELSE 1 END;
  _breadth := LEAST(COALESCE(array_length(_row.entity_ids,1),0), 10);

  -- Recurrence: recorded conduct findings against the named entities.
  SELECT COALESCE(count(*),0)::int INTO _recur
    FROM public.conduct_findings f
   WHERE f.entity_id = ANY(COALESCE(_row.entity_ids,'{}'))
     AND f.created_at::date >= _prev_from;

  -- Unresolved exposure: open findings requiring remediation, plus interventions
  -- whose recorded outcome still carries outstanding follow-up.
  SELECT COALESCE(count(*),0)::int INTO _exposure
    FROM public.conduct_findings f
   WHERE f.entity_id = ANY(COALESCE(_row.entity_ids,'{}'))
     AND f.closed_at IS NULL
     AND COALESCE(f.remediation_required, false);
  _exposure := _exposure + (
    SELECT COALESCE(count(*),0)::int FROM public.conduct_interventions i
     WHERE i.attention_id = _id
       AND i.followup_due_date IS NOT NULL
       AND i.followup_completed_at IS NULL);

  -- Trend: recorded complaint movement across two equal windows.
  SELECT COALESCE(count(*),0)::int INTO _recent
    FROM public.complaints c
   WHERE c.created_at::date BETWEEN _from AND _to
     AND ((COALESCE(array_length(_row.entity_ids,1),0) > 0 AND c.licensee_id = ANY(_row.entity_ids))
       OR (COALESCE(array_length(_row.entity_ids,1),0) = 0 AND _row.sector_id IS NOT NULL
           AND c.licensee_id IN (SELECT id FROM public.licensees WHERE sector_id = _row.sector_id)));
  SELECT COALESCE(count(*),0)::int INTO _prior
    FROM public.complaints c
   WHERE c.created_at::date >= _prev_from AND c.created_at::date < _from
     AND ((COALESCE(array_length(_row.entity_ids,1),0) > 0 AND c.licensee_id = ANY(_row.entity_ids))
       OR (COALESCE(array_length(_row.entity_ids,1),0) = 0 AND _row.sector_id IS NOT NULL
           AND c.licensee_id IN (SELECT id FROM public.licensees WHERE sector_id = _row.sector_id)));
  _trend := CASE WHEN _recent > _prior THEN 2 WHEN _recent = _prior THEN 1 ELSE 0 END;

  _score := ROUND((_mat * 3 + _urg * 3 + LEAST(_breadth,10) * 1
                 + LEAST(_recur,10) * 1.5 + LEAST(_exposure,10) * 2 + _trend * 2)::numeric, 2);
  _band := CASE
    WHEN _score >= 30 OR (_row.urgency = 'urgent' AND _row.materiality IN ('high','severe')) THEN 'IMMEDIATE'
    WHEN _score >= 20 THEN 'HIGH'
    WHEN _score >= 12 THEN 'PLANNED'
    ELSE 'MONITOR' END;

  _factors := jsonb_build_object(
    'materiality', jsonb_build_object('value', _row.materiality, 'points', _mat, 'weight', 3),
    'urgency', jsonb_build_object('value', _row.urgency, 'points', _urg, 'weight', 3),
    'breadth', jsonb_build_object('value', _breadth, 'points', LEAST(_breadth,10), 'weight', 1,
                                  'basis', 'entities named on the attention item'),
    'recurrence', jsonb_build_object('value', _recur, 'points', LEAST(_recur,10), 'weight', 1.5,
                                  'basis', 'recorded conduct findings in the observation window'),
    'unresolved_exposure', jsonb_build_object('value', _exposure, 'points', LEAST(_exposure,10), 'weight', 2,
                                  'basis', 'open findings requiring remediation and outstanding follow-up'),
    'trend', jsonb_build_object('recent_complaints', _recent, 'prior_complaints', _prior,
                                  'points', _trend, 'weight', 2,
                                  'basis', 'recorded complaint movement across two equal windows'));

  _sig := md5(_factors::text || COALESCE(_row.emerging_risk_id::text,'') ||
              COALESCE(_row.linked_evidence::text,'') || COALESCE(_row.confirmed_priority,'') ||
              COALESCE(_row.entity_ids::text,'') ||
              (SELECT COALESCE(md5(string_agg(code || active::text, ',' ORDER BY code)),'')
                 FROM public.conduct_intervention_types));

  INSERT INTO public.conduct_attention_priority_calcs(
    attention_id, method, factors, score, band, facts_signature, window_start, window_end, computed_by)
  VALUES (_id,
    'Deterministic weighted sum of six recorded factors: materiality, urgency, breadth, recurrence, unresolved exposure and complaint trend. No estimation and no AI involvement.',
    _factors, _score, _band, _sig, _from, _to, _uid)
  RETURNING id INTO _calc_id;

  UPDATE public.conduct_attention_items
     SET calculated_priority = _band, calculated_score = _score, calculated_factors = _factors,
         calculated_at = now(), facts_signature = _sig, recurrence = _recur,
         breadth = _breadth, updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
  VALUES (_id, 'PRIORITY_CALCULATED', 'Deterministic prioritisation computed',
          jsonb_build_object('band', _band, 'score', _score, 'calc_id', _calc_id), _uid);

  RETURN jsonb_build_object('id', _id, 'calc_id', _calc_id, 'band', _band, 'score', _score,
    'factors', _factors, 'facts_signature', _sig,
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _window_days),
    'method', 'Deterministic. The accountable supervisor confirms the supervisory priority.');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_attention_priority_confirm(
  _id uuid, _priority text, _rationale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_attention_items; _override boolean;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _row.calculated_priority IS NULL THEN
    RAISE EXCEPTION 'prioritisation_required: calculate the deterministic priority first' USING ERRCODE = '22023';
  END IF;
  IF _priority NOT IN ('IMMEDIATE','HIGH','PLANNED','MONITOR') THEN
    RAISE EXCEPTION 'unsupported_priority: %', _priority USING ERRCODE = '22023';
  END IF;
  _override := _priority <> _row.calculated_priority;
  IF _override AND length(btrim(COALESCE(_rationale,''))) < 20 THEN
    RAISE EXCEPTION 'A written rationale of at least 20 characters is required to override the calculated priority'
      USING ERRCODE = '22023';
  END IF;

  -- The calculated result is never overwritten: it is retained alongside.
  UPDATE public.conduct_attention_items
     SET confirmed_priority = _priority, confirmed_by = _uid, confirmed_at = now(),
         confirmation_rationale = COALESCE(nullif(btrim(COALESCE(_rationale,'')),''),
           'Deterministic calculation confirmed by the supervisor without change.'),
         priority_overridden = _override,
         status = CASE WHEN status = 'OPEN' THEN 'PRIORITISED' ELSE status END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_attention_events(attention_id, event_type, from_state, to_state, rationale, detail, actor_id)
  VALUES (_id, CASE WHEN _override THEN 'PRIORITY_OVERRIDDEN' ELSE 'PRIORITY_CONFIRMED' END,
          _row.calculated_priority, _priority, btrim(COALESCE(_rationale,'')),
          jsonb_build_object('calculated', _row.calculated_priority, 'confirmed', _priority), _uid);

  PERFORM public.log_compliance_audit('UPDATE', 'conduct_attention_item', _id,
    jsonb_build_object('confirmed_priority', _row.confirmed_priority),
    jsonb_build_object('confirmed_priority', _priority),
    'Supervisory priority confirmed for ' || _row.reference);

  RETURN jsonb_build_object('id', _id, 'calculated_priority', _row.calculated_priority,
    'confirmed_priority', _priority, 'overridden', _override);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_attention_assign(
  _id uuid, _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _target_review_date date DEFAULT NULL, _rationale text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_attention_items;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  UPDATE public.conduct_attention_items
     SET owner_id = COALESCE(_owner_id, owner_id),
         team_id = COALESCE(_team_id, team_id),
         target_review_date = COALESCE(_target_review_date, target_review_date),
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
  VALUES (_id, 'ASSIGNED', nullif(btrim(COALESCE(_rationale,'')),''),
          jsonb_build_object('owner_id', _owner_id, 'team_id', _team_id,
                             'target_review_date', _target_review_date), _uid);
  RETURN jsonb_build_object('id', _id, 'owner_id', COALESCE(_owner_id, _row.owner_id));
END $$;

CREATE OR REPLACE FUNCTION public.conduct_attention_transition(
  _id uuid, _to_status text, _rationale text,
  _disposition text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_attention_items; _allowed boolean;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _to_status NOT IN ('PRIORITISED','PLANNED','IN_PROGRESS','MONITORING','CLOSED') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023';
  END IF;
  _allowed := CASE _row.status
    WHEN 'OPEN' THEN _to_status IN ('PRIORITISED','CLOSED')
    WHEN 'PRIORITISED' THEN _to_status IN ('PLANNED','MONITORING','CLOSED')
    WHEN 'PLANNED' THEN _to_status IN ('IN_PROGRESS','MONITORING','CLOSED')
    WHEN 'IN_PROGRESS' THEN _to_status IN ('MONITORING','CLOSED')
    WHEN 'MONITORING' THEN _to_status IN ('IN_PROGRESS','CLOSED')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to_status USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'CLOSED' THEN
    IF COALESCE(btrim(COALESCE(_disposition,'')),'') = '' THEN
      RAISE EXCEPTION 'A disposition is required to close a supervisory attention item' USING ERRCODE = '22023';
    END IF;
    -- Closing requires a recorded human reassessment: intervention completion
    -- alone never closes the underlying supervisory concern.
    IF NOT EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r WHERE r.attention_id = _id) THEN
      RAISE EXCEPTION 'reassessment_required: record a supervisory reassessment before closing'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.conduct_attention_items
     SET status = _to_status,
         disposition = CASE WHEN _to_status = 'CLOSED' THEN btrim(_disposition) ELSE disposition END,
         disposition_rationale = CASE WHEN _to_status = 'CLOSED' THEN btrim(_rationale) ELSE disposition_rationale END,
         closed_at = CASE WHEN _to_status = 'CLOSED' THEN now() ELSE NULL END,
         closed_by = CASE WHEN _to_status = 'CLOSED' THEN _uid ELSE NULL END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_attention_events(attention_id, event_type, from_state, to_state, rationale, actor_id)
  VALUES (_id, 'STATUS_CHANGE', _row.status, _to_status, btrim(_rationale), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_attention_item', _id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to_status),
    'Supervisory attention ' || _row.reference || ': ' || _row.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id', _id, 'from_status', _row.status, 'to_status', _to_status);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_attention_reassess(
  _id uuid, _concern_state text, _assessment text, _next_step text,
  _intervention_id uuid DEFAULT NULL, _next_review_date date DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_attention_items; _rid uuid;
BEGIN
  _row := public.conduct_attention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF length(btrim(COALESCE(_assessment,''))) < 20 THEN
    RAISE EXCEPTION 'A reassessment of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  -- Append-only. A prior reassessment is always retained. The linked emerging
  -- risk is referenced, never transitioned: that remains an MC-09 human act.
  INSERT INTO public.conduct_attention_reassessments(
    attention_id, intervention_id, concern_state, assessment, evidence, next_step,
    next_review_date, emerging_risk_id, assessed_by)
  VALUES (_id, _intervention_id, _concern_state, btrim(_assessment), COALESCE(_evidence,'[]'::jsonb),
    _next_step, _next_review_date, _row.emerging_risk_id, _uid)
  RETURNING id INTO _rid;

  UPDATE public.conduct_attention_items
     SET target_review_date = COALESCE(_next_review_date, target_review_date),
         status = CASE WHEN _next_step = 'continue_monitoring' AND status <> 'CLOSED'
                       THEN 'MONITORING' ELSE status END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
  VALUES (_id, 'REASSESSED', btrim(_assessment),
    jsonb_build_object('concern_state', _concern_state, 'next_step', _next_step,
                       'intervention_id', _intervention_id, 'reassessment_id', _rid), _uid);

  PERFORM public.log_compliance_audit('CREATE', 'conduct_attention_reassessment', _rid, NULL,
    jsonb_build_object('attention', _row.reference, 'concern_state', _concern_state),
    'Supervisory reassessment recorded for ' || _row.reference);

  RETURN jsonb_build_object('id', _rid, 'attention_id', _id, 'concern_state', _concern_state,
    'next_step', _next_step,
    'note', 'The linked emerging risk is unchanged. Its lifecycle remains a separate human decision.');
END $$;

-- ------------------------------------------------------- supervisory plans
CREATE OR REPLACE FUNCTION public.conduct_plan_create(
  _title text, _factual_basis text,
  _attention_id uuid DEFAULT NULL, _emerging_risk_id uuid DEFAULT NULL,
  _objective text DEFAULT NULL, _scope text DEFAULT NULL, _theme text DEFAULT NULL,
  _entity_ids uuid[] DEFAULT '{}', _sector_id uuid DEFAULT NULL, _regulator_id uuid DEFAULT NULL,
  _planning_period text DEFAULT 'ad_hoc', _period_label text DEFAULT NULL,
  _lead_officer_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _start_date date DEFAULT NULL, _target_completion date DEFAULT NULL,
  _next_review_date date DEFAULT NULL, _objective_source text DEFAULT 'human',
  _objective_ai_insight_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _ref text; _att public.conduct_attention_items;
        _sector uuid; _reg uuid; _sectors uuid[]; _entities uuid[]; _priority text;
BEGIN
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics','manage_complaints']);
  IF length(btrim(COALESCE(_factual_basis,''))) < 20 THEN
    RAISE EXCEPTION 'A factual basis of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;

  _sector := _sector_id; _reg := _regulator_id; _entities := COALESCE(_entity_ids,'{}');
  IF _attention_id IS NOT NULL THEN
    _att := public.conduct_attention_guard(_attention_id, ARRAY['run_conduct_analytics','manage_complaints']);
    _sector := COALESCE(_sector, _att.sector_id);
    _reg := COALESCE(_reg, _att.regulator_id);
    IF COALESCE(array_length(_entities,1),0) = 0 THEN _entities := _att.entity_ids; END IF;
    _priority := _att.confirmed_priority;
  END IF;

  _sectors := public.conduct_planning_scope(_uid, _sector, _reg);
  IF _sectors IS NOT NULL AND COALESCE(array_length(_entities,1),0) > 0
     AND EXISTS (SELECT 1 FROM public.licensees l
                  WHERE l.id = ANY(_entities)
                    AND (l.sector_id IS NULL OR NOT (l.sector_id = ANY(_sectors)))) THEN
    RAISE EXCEPTION 'not_authorized: plan scope includes an entity outside the permitted population'
      USING ERRCODE = '42501';
  END IF;

  _ref := 'SP-' || to_char(now(),'YYYY') || '-' ||
          lpad(nextval('public.conduct_plan_ref_seq')::text, 5, '0');

  INSERT INTO public.conduct_supervisory_plans(
    reference, regulator_id, sector_id, title, objective, objective_source, objective_ai_insight_id,
    scope, attention_id, emerging_risk_id, theme, entity_ids, sector_ids, factual_basis, priority,
    planning_period, period_label, lead_officer_id, team_id, start_date, target_completion,
    next_review_date, created_by)
  VALUES (_ref, _reg, _sector, btrim(_title), nullif(btrim(COALESCE(_objective,'')),''),
    _objective_source, _objective_ai_insight_id, _scope, _attention_id,
    COALESCE(_emerging_risk_id, _att.emerging_risk_id), nullif(btrim(COALESCE(_theme,'')),''),
    _entities, CASE WHEN _sector IS NULL THEN '{}'::uuid[] ELSE ARRAY[_sector] END,
    btrim(_factual_basis), _priority, _planning_period, _period_label, _lead_officer_id, _team_id,
    _start_date, _target_completion, _next_review_date, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.conduct_plan_events(plan_id, event_type, to_status, rationale, detail, actor_id)
  VALUES (_id, 'CREATED', 'DRAFT', btrim(_factual_basis),
          jsonb_build_object('attention_id', _attention_id, 'objective_source', _objective_source), _uid);

  IF _attention_id IS NOT NULL THEN
    INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
    VALUES (_attention_id, 'PLAN_LINKED', 'Supervisory plan ' || _ref || ' created',
            jsonb_build_object('plan_id', _id, 'plan_reference', _ref), _uid);
    UPDATE public.conduct_attention_items
       SET status = CASE WHEN status IN ('OPEN','PRIORITISED') THEN 'PLANNED' ELSE status END,
           updated_at = now()
     WHERE id = _attention_id;
  END IF;

  PERFORM public.log_compliance_audit('CREATE', 'conduct_supervisory_plan', _id, NULL,
    jsonb_build_object('reference', _ref), 'Supervisory plan ' || _ref || ' created');

  RETURN jsonb_build_object('id', _id, 'reference', _ref, 'status', 'DRAFT');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_plan_update(
  _id uuid, _objective text DEFAULT NULL, _scope text DEFAULT NULL, _title text DEFAULT NULL,
  _lead_officer_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _start_date date DEFAULT NULL, _target_completion date DEFAULT NULL,
  _next_review_date date DEFAULT NULL, _planning_period text DEFAULT NULL,
  _period_label text DEFAULT NULL, _objective_source text DEFAULT NULL,
  _objective_ai_insight_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_supervisory_plans;
BEGIN
  _row := public.conduct_plan_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _row.status NOT IN ('DRAFT','SUBMITTED') THEN
    RAISE EXCEPTION 'transition_not_permitted: an approved plan cannot be edited in place' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conduct_supervisory_plans
     SET objective = COALESCE(nullif(btrim(COALESCE(_objective,'')),''), objective),
         scope = COALESCE(_scope, scope),
         title = COALESCE(nullif(btrim(COALESCE(_title,'')),''), title),
         lead_officer_id = COALESCE(_lead_officer_id, lead_officer_id),
         team_id = COALESCE(_team_id, team_id),
         start_date = COALESCE(_start_date, start_date),
         target_completion = COALESCE(_target_completion, target_completion),
         next_review_date = COALESCE(_next_review_date, next_review_date),
         planning_period = COALESCE(_planning_period, planning_period),
         period_label = COALESCE(_period_label, period_label),
         objective_source = COALESCE(_objective_source, objective_source),
         objective_ai_insight_id = COALESCE(_objective_ai_insight_id, objective_ai_insight_id),
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.conduct_plan_events(plan_id, event_type, rationale, detail, actor_id)
  VALUES (_id, 'UPDATED', NULL,
    jsonb_build_object('objective_changed', _objective IS NOT NULL,
                       'objective_source', COALESCE(_objective_source, _row.objective_source)), _uid);
  RETURN jsonb_build_object('id', _id, 'status', _row.status);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_plan_transition(
  _id uuid, _to_status text, _rationale text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_supervisory_plans; _allowed boolean;
BEGIN
  IF _to_status = 'APPROVED' THEN
    -- Checker authority. Separation of duties applies below.
    _row := public.conduct_plan_guard(_id, ARRAY['approve']);
  ELSE
    _row := public.conduct_plan_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  END IF;
  _uid := auth.uid();

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _to_status NOT IN ('SUBMITTED','APPROVED','ACTIVE','COMPLETED','CANCELLED','DRAFT') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023';
  END IF;
  _allowed := CASE _row.status
    WHEN 'DRAFT' THEN _to_status IN ('SUBMITTED','CANCELLED')
    WHEN 'SUBMITTED' THEN _to_status IN ('APPROVED','DRAFT','CANCELLED')
    WHEN 'APPROVED' THEN _to_status IN ('ACTIVE','CANCELLED')
    WHEN 'ACTIVE' THEN _to_status IN ('COMPLETED','CANCELLED')
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to_status USING ERRCODE = '22023';
  END IF;

  IF _to_status IN ('SUBMITTED','APPROVED','ACTIVE')
     AND COALESCE(btrim(COALESCE(_row.objective,'')),'') = '' THEN
    RAISE EXCEPTION 'objective_required: the supervisory objective is a human-owned statement and must be recorded'
      USING ERRCODE = '22023';
  END IF;
  IF _to_status = 'APPROVED' AND _row.submitted_by = _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'not_authorized: the officer who submitted the plan cannot approve it' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conduct_supervisory_plans
     SET status = _to_status,
         submitted_by = CASE WHEN _to_status = 'SUBMITTED' THEN _uid ELSE submitted_by END,
         submitted_at = CASE WHEN _to_status = 'SUBMITTED' THEN now() ELSE submitted_at END,
         approved_by = CASE WHEN _to_status = 'APPROVED' THEN _uid ELSE approved_by END,
         approved_at = CASE WHEN _to_status = 'APPROVED' THEN now() ELSE approved_at END,
         approval_rationale = CASE WHEN _to_status = 'APPROVED' THEN btrim(_rationale) ELSE approval_rationale END,
         activated_at = CASE WHEN _to_status = 'ACTIVE' THEN now() ELSE activated_at END,
         completed_at = CASE WHEN _to_status IN ('COMPLETED','CANCELLED') THEN now() ELSE completed_at END,
         outcome_summary = CASE WHEN _to_status = 'COMPLETED' THEN btrim(_rationale) ELSE outcome_summary END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_plan_events(plan_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_id, CASE WHEN _to_status = 'APPROVED' THEN 'APPROVAL' ELSE 'STATUS_CHANGE' END,
          _row.status, _to_status, btrim(_rationale), _uid);

  IF _row.attention_id IS NOT NULL AND _to_status = 'ACTIVE' THEN
    UPDATE public.conduct_attention_items
       SET status = CASE WHEN status IN ('OPEN','PRIORITISED','PLANNED') THEN 'IN_PROGRESS' ELSE status END,
           updated_at = now()
     WHERE id = _row.attention_id;
  END IF;

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_supervisory_plan', _id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to_status),
    'Supervisory plan ' || _row.reference || ': ' || _row.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id', _id, 'reference', _row.reference,
    'from_status', _row.status, 'to_status', _to_status);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_plan_milestone_upsert(
  _plan_id uuid, _title text, _due_date date DEFAULT NULL, _detail text DEFAULT NULL,
  _milestone_id uuid DEFAULT NULL, _status text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_supervisory_plans; _id uuid;
BEGIN
  _row := public.conduct_plan_guard(_plan_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _milestone_id IS NULL THEN
    IF COALESCE(btrim(COALESCE(_title,'')),'') = '' THEN
      RAISE EXCEPTION 'A milestone title is required' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.conduct_plan_milestones(plan_id, title, detail, due_date, created_by)
    VALUES (_plan_id, btrim(_title), _detail, _due_date, _uid) RETURNING id INTO _id;
    INSERT INTO public.conduct_plan_events(plan_id, event_type, rationale, detail, actor_id)
    VALUES (_plan_id, 'MILESTONE_ADDED', btrim(_title), jsonb_build_object('milestone_id', _id), _uid);
  ELSE
    UPDATE public.conduct_plan_milestones
       SET title = COALESCE(nullif(btrim(COALESCE(_title,'')),''), title),
           detail = COALESCE(_detail, detail),
           due_date = COALESCE(_due_date, due_date),
           status = COALESCE(_status, status),
           completed_at = CASE WHEN _status = 'COMPLETED' THEN now() ELSE completed_at END,
           completed_by = CASE WHEN _status = 'COMPLETED' THEN _uid ELSE completed_by END,
           updated_at = now()
     WHERE id = _milestone_id AND plan_id = _plan_id
     RETURNING id INTO _id;
    IF _id IS NULL THEN
      RAISE EXCEPTION 'not_found: milestone does not belong to this plan' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.conduct_plan_events(plan_id, event_type, detail, actor_id)
    VALUES (_plan_id, 'MILESTONE_UPDATED', jsonb_build_object('milestone_id', _id, 'status', _status), _uid);
  END IF;
  RETURN jsonb_build_object('id', _id, 'plan_id', _plan_id);
END $$;

-- ------------------------------------------- interventions from the catalogue
CREATE OR REPLACE FUNCTION public.conduct_intervention_initiate(
  _catalogue_code text, _title text, _basis text,
  _attention_id uuid DEFAULT NULL, _plan_id uuid DEFAULT NULL,
  _licensee_id uuid DEFAULT NULL, _theme text DEFAULT NULL, _emerging_risk_id uuid DEFAULT NULL,
  _purpose text DEFAULT NULL, _expected_outcome text DEFAULT NULL,
  _planned_start date DEFAULT NULL, _planned_end date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL, _team_id uuid DEFAULT NULL,
  _ai_insight_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _type public.conduct_intervention_types; _att public.conduct_attention_items;
        _plan public.conduct_supervisory_plans; _res jsonb; _iid uuid;
BEGIN
  -- The intervention type must exist in the approved catalogue and be active.
  -- Free-form types are refused: regulatory powers are server-defined.
  SELECT * INTO _type FROM public.conduct_intervention_types WHERE code = _catalogue_code;
  IF _type.code IS NULL OR NOT _type.active THEN
    RAISE EXCEPTION 'unsupported_intervention_type: % is not an active approved intervention', _catalogue_code
      USING ERRCODE = '22023';
  END IF;
  -- The authority the catalogue records for this power is enforced.
  _uid := public.market_conduct_require(ARRAY[_type.authority_action]);

  IF _attention_id IS NOT NULL THEN
    _att := public.conduct_attention_guard(_attention_id, ARRAY['run_conduct_analytics','manage_complaints']);
  END IF;
  IF _plan_id IS NOT NULL THEN
    _plan := public.conduct_plan_guard(_plan_id, ARRAY['run_conduct_analytics','manage_complaints']);
    IF _plan.status NOT IN ('APPROVED','ACTIVE') THEN
      RAISE EXCEPTION 'transition_not_permitted: interventions may only be raised under an approved or active plan'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  _res := public.conduct_intervention_propose(
    _intervention_type => _catalogue_code,
    _title => _title,
    _basis => _basis,
    _licensee_id => COALESCE(_licensee_id, CASE WHEN COALESCE(array_length(_att.entity_ids,1),0) = 1
                                                THEN _att.entity_ids[1] ELSE NULL END),
    _theme => COALESCE(_theme, _att.theme, _plan.theme),
    _emerging_risk_id => COALESCE(_emerging_risk_id, _att.emerging_risk_id, _plan.emerging_risk_id),
    _expected_outcome => _expected_outcome,
    _planned_start => _planned_start,
    _planned_end => _planned_end,
    _owner_id => _owner_id,
    _sector_id => COALESCE(_att.sector_id, _plan.sector_id),
    _regulator_id => COALESCE(_att.regulator_id, _plan.regulator_id));

  _iid := (_res->>'id')::uuid;
  UPDATE public.conduct_interventions
     SET attention_id = _attention_id, plan_id = _plan_id, catalogue_code = _catalogue_code,
         team_id = _team_id, purpose = COALESCE(_purpose, _type.purpose),
         canonical_module = _type.canonical_module, canonical_route = _type.canonical_route,
         ai_insight_id = _ai_insight_id, updated_at = now()
   WHERE id = _iid;

  IF _attention_id IS NOT NULL THEN
    INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
    VALUES (_attention_id, 'INTERVENTION_RAISED', btrim(_basis),
      jsonb_build_object('intervention_id', _iid, 'catalogue_code', _catalogue_code,
                         'reference', _res->>'reference'), _uid);
  END IF;
  IF _plan_id IS NOT NULL THEN
    INSERT INTO public.conduct_plan_events(plan_id, event_type, rationale, detail, actor_id)
    VALUES (_plan_id, 'INTERVENTION_RAISED', btrim(_basis),
      jsonb_build_object('intervention_id', _iid, 'catalogue_code', _catalogue_code), _uid);
  END IF;

  RETURN _res || jsonb_build_object('catalogue_code', _catalogue_code,
    'canonical_module', _type.canonical_module, 'canonical_route', _type.canonical_route,
    'requires_canonical_record', _type.requires_canonical_record);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_link_canonical(
  _id uuid, _module text, _record_id uuid, _reference text DEFAULT NULL, _route text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _module IS NULL OR _record_id IS NULL THEN
    RAISE EXCEPTION 'A canonical module and record are required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conduct_interventions
     SET canonical_module = _module, canonical_record_id = _record_id,
         canonical_reference = _reference, canonical_route = COALESCE(_route, canonical_route),
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, rationale, actor_id)
  VALUES (_id, 'CANONICAL_LINKED', 'Linked to ' || _module || ' record', _uid);
  RETURN jsonb_build_object('id', _id, 'canonical_module', _module, 'canonical_record_id', _record_id);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_record_outcome(
  _id uuid, _result text, _rationale text,
  _findings text DEFAULT NULL, _outstanding_actions text DEFAULT NULL,
  _evidence jsonb DEFAULT '[]'::jsonb, _followup_due_date date DEFAULT NULL,
  _followup_note text DEFAULT NULL, _actual_start date DEFAULT NULL, _actual_end date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _row.status NOT IN ('ACTIVE','COMPLETED') THEN
    RAISE EXCEPTION 'transition_not_permitted: an outcome may only be recorded on an active intervention'
      USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 20 THEN
    RAISE EXCEPTION 'An outcome rationale of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _result NOT IN ('no_further_action','continue_monitoring','information_required',
                     'remediation_required','further_review_required','investigation_required',
                     'finding_raised','escalation_required') THEN
    RAISE EXCEPTION 'unsupported_outcome: %', _result USING ERRCODE = '22023';
  END IF;

  UPDATE public.conduct_interventions
     SET outcome_result = _result, outcome_rationale = btrim(_rationale),
         outcome_findings = _findings, outstanding_actions = _outstanding_actions,
         evidence = COALESCE(_evidence, evidence),
         outcome_recorded_by = _uid, outcome_recorded_at = now(),
         followup_due_date = COALESCE(_followup_due_date, followup_due_date),
         followup_note = COALESCE(_followup_note, followup_note),
         actual_start = COALESCE(_actual_start, actual_start),
         actual_end = COALESCE(_actual_end, actual_end, current_date),
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, rationale, actor_id)
  VALUES (_id, 'OUTCOME_RECORDED', btrim(_rationale), _uid);

  IF _row.attention_id IS NOT NULL THEN
    INSERT INTO public.conduct_attention_events(attention_id, event_type, rationale, detail, actor_id)
    VALUES (_row.attention_id, 'INTERVENTION_OUTCOME', btrim(_rationale),
      jsonb_build_object('intervention_id', _id, 'result', _result), _uid);
  END IF;

  PERFORM public.log_compliance_audit('UPDATE', 'conduct_intervention', _id, NULL,
    jsonb_build_object('outcome', _result), 'Intervention outcome recorded for ' || _row.reference);

  RETURN jsonb_build_object('id', _id, 'outcome_result', _result,
    'note', 'Recording an outcome does not close the underlying supervisory concern. A human reassessment is required.');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_record_followup(
  _id uuid, _note text, _due_date date DEFAULT NULL, _completed boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF length(btrim(COALESCE(_note,''))) < 10 THEN
    RAISE EXCEPTION 'A follow-up note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  UPDATE public.conduct_interventions
     SET followup_note = btrim(_note),
         followup_due_date = COALESCE(_due_date, followup_due_date),
         followup_completed_at = CASE WHEN _completed THEN now() ELSE followup_completed_at END,
         updated_at = now()
   WHERE id = _id;
  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, rationale, actor_id)
  VALUES (_id, CASE WHEN _completed THEN 'FOLLOWUP_COMPLETED' ELSE 'FOLLOWUP_RECORDED' END, btrim(_note), _uid);
  RETURN jsonb_build_object('id', _id, 'followup_due_date', COALESCE(_due_date, _row.followup_due_date),
    'completed', _completed);
END $$;

-- --------------------------------------------------- read models for planning
CREATE OR REPLACE FUNCTION public.conduct_planning_snapshot(
  _attention_id uuid DEFAULT NULL, _plan_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _att public.conduct_attention_items; _plan public.conduct_supervisory_plans;
        _snap jsonb; _catalogue jsonb; _interventions jsonb; _evidence jsonb; _risk jsonb; _sig text;
BEGIN
  IF _attention_id IS NULL AND _plan_id IS NULL THEN
    RAISE EXCEPTION 'An attention item or a supervisory plan is required' USING ERRCODE = '22023';
  END IF;
  IF _attention_id IS NOT NULL THEN
    _att := public.conduct_attention_guard(_attention_id, ARRAY['view']);
  END IF;
  IF _plan_id IS NOT NULL THEN
    _plan := public.conduct_plan_guard(_plan_id, ARRAY['view']);
    IF _att.id IS NULL AND _plan.attention_id IS NOT NULL THEN
      _att := public.conduct_attention_guard(_plan.attention_id, ARRAY['view']);
    END IF;
  END IF;
  _uid := auth.uid();

  SELECT COALESCE(jsonb_agg(jsonb_build_object('code', t.code, 'name', t.name, 'purpose', t.purpose,
           'applicability', t.applicability, 'canonical_module', t.canonical_module) ORDER BY t.sort_order), '[]'::jsonb)
    INTO _catalogue FROM public.conduct_intervention_types t WHERE t.active;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reference', i.reference, 'type', i.catalogue_code,
           'status', i.status, 'outcome', i.outcome_result, 'planned_start', i.planned_start,
           'planned_end', i.planned_end, 'followup_due', i.followup_due_date) ORDER BY i.created_at), '[]'::jsonb)
    INTO _interventions FROM public.conduct_interventions i
   WHERE (_att.id IS NOT NULL AND i.attention_id = _att.id)
      OR (_plan.id IS NOT NULL AND i.plan_id = _plan.id);

  IF _att.emerging_risk_id IS NOT NULL THEN
    SELECT to_jsonb(jsonb_build_object('reference', r.reference, 'title', r.title, 'status', r.status,
             'severity', r.severity, 'entity_count', r.entity_count, 'fact_basis', r.fact_basis))
      INTO _risk FROM public.conduct_emerging_risks r WHERE r.id = _att.emerging_risk_id;
  END IF;

  _evidence := COALESCE(_att.linked_evidence, '[]'::jsonb);

  _snap := jsonb_build_object(
    'attention', CASE WHEN _att.id IS NULL THEN NULL ELSE jsonb_build_object(
      'reference', _att.reference, 'title', _att.title, 'source_type', _att.source_type,
      'source_module', _att.source_module, 'source_reference', _att.source_reference,
      'supervisory_basis', _att.supervisory_basis, 'theme', _att.theme,
      'materiality', _att.materiality, 'urgency', _att.urgency, 'status', _att.status,
      'identified_on', _att.identified_on,
      'calculated_priority', _att.calculated_priority, 'calculated_factors', _att.calculated_factors,
      'confirmed_priority', _att.confirmed_priority,
      'entity_count', COALESCE(array_length(_att.entity_ids,1),0)) END,
    'plan', CASE WHEN _plan.id IS NULL THEN NULL ELSE jsonb_build_object(
      'reference', _plan.reference, 'title', _plan.title, 'objective', _plan.objective,
      'scope', _plan.scope, 'status', _plan.status, 'factual_basis', _plan.factual_basis,
      'planning_period', _plan.planning_period) END,
    'emerging_risk', _risk,
    'linked_evidence', _evidence,
    'interventions', _interventions,
    'intervention_catalogue', _catalogue,
    'external_data', 'none');

  _sig := md5(_snap::text);
  RETURN jsonb_build_object('snapshot', _snap, 'facts_signature', _sig, 'generated_at', now());
END $$;

CREATE OR REPLACE FUNCTION public.conduct_planning_coverage(
  _sector_id uuid DEFAULT NULL, _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _sectors uuid[]; _in_scope boolean;
        _gaps jsonb; _overview jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  WITH att AS (
    SELECT a.* FROM public.conduct_attention_items a
     WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
  ), pl AS (
    SELECT p.* FROM public.conduct_supervisory_plans p
     WHERE (_sectors IS NULL OR p.sector_id = ANY(_sectors))
  ), iv AS (
    SELECT i.* FROM public.conduct_interventions i
     WHERE (_sectors IS NULL OR i.sector_id = ANY(_sectors))
  )
  SELECT jsonb_build_object(
    'high_priority_without_plan', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'reference', a.reference,
               'title', a.title, 'priority', a.confirmed_priority)), '[]'::jsonb)
        FROM att a WHERE a.confirmed_priority IN ('IMMEDIATE','HIGH') AND a.status <> 'CLOSED'
          AND NOT EXISTS (SELECT 1 FROM pl p WHERE p.attention_id = a.id AND p.status <> 'CANCELLED')),
    'approved_plan_without_intervention', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title)), '[]'::jsonb)
        FROM pl p WHERE p.status IN ('APPROVED','ACTIVE')
          AND NOT EXISTS (SELECT 1 FROM iv i WHERE i.plan_id = p.id AND i.status <> 'REJECTED')),
    'overdue_intervention', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'planned_end', i.planned_end)), '[]'::jsonb)
        FROM iv i WHERE i.status = 'ACTIVE' AND i.planned_end IS NOT NULL AND i.planned_end < current_date),
    'completed_without_outcome', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference)), '[]'::jsonb)
        FROM iv i WHERE i.status = 'COMPLETED' AND i.outcome_result IS NULL),
    'outstanding_followup', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'followup_due', i.followup_due_date)), '[]'::jsonb)
        FROM iv i WHERE i.followup_due_date IS NOT NULL AND i.followup_completed_at IS NULL),
    'confirmed_risk_without_response', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'title', r.title)), '[]'::jsonb)
        FROM public.conduct_emerging_risks r
       WHERE r.status = 'CONFIRMED' AND (_sectors IS NULL OR r.sector_id = ANY(_sectors))
         AND NOT EXISTS (SELECT 1 FROM att a WHERE a.emerging_risk_id = r.id AND a.status <> 'CLOSED')),
    'reassessment_overdue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'reference', a.reference,
               'target_review_date', a.target_review_date)), '[]'::jsonb)
        FROM att a WHERE a.status <> 'CLOSED' AND a.target_review_date IS NOT NULL
          AND a.target_review_date < current_date)
  ) INTO _gaps;

  SELECT jsonb_build_object(
    'attention_by_priority', (
      SELECT COALESCE(jsonb_object_agg(k, n), '{}'::jsonb) FROM (
        SELECT COALESCE(a.confirmed_priority, 'UNCONFIRMED') k, count(*) n
          FROM public.conduct_attention_items a
         WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors)) AND a.status <> 'CLOSED'
         GROUP BY 1) s),
    'active_plans', (SELECT count(*) FROM public.conduct_supervisory_plans p
                      WHERE p.status = 'ACTIVE' AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'active_interventions', (SELECT count(*) FROM public.conduct_interventions i
                      WHERE i.status = 'ACTIVE' AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'entities_covered', (SELECT count(DISTINCT i.licensee_id) FROM public.conduct_interventions i
                      WHERE i.licensee_id IS NOT NULL AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'sectors_covered', (SELECT count(DISTINCT p.sector_id) FROM public.conduct_supervisory_plans p
                      WHERE p.sector_id IS NOT NULL AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'upcoming_milestones', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('plan_id', m.plan_id, 'title', m.title,
               'due_date', m.due_date) ORDER BY m.due_date), '[]'::jsonb)
        FROM public.conduct_plan_milestones m
        JOIN public.conduct_supervisory_plans p ON p.id = m.plan_id
       WHERE m.status = 'OPEN' AND m.due_date IS NOT NULL
         AND m.due_date BETWEEN current_date AND current_date + 60
         AND (_sectors IS NULL OR p.sector_id = ANY(_sectors)))
  ) INTO _overview;

  RETURN jsonb_build_object(
    'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END,
    'overview', _overview,
    'gaps', _gaps,
    'caveat', 'Supervisory activity statistics support planning and governance and should not be interpreted in isolation as employee-performance measures.',
    'method', 'Deterministic workflow control exceptions computed from recorded planning data. No AI involvement.');
END $$;

-- --------------------------------------------------------------- privileges
REVOKE ALL ON FUNCTION public.conduct_attention_guard(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_plan_guard(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_create(text,text,text,text,uuid,text,uuid,text,uuid[],uuid,uuid,text,text,jsonb,date,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_priority_compute(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_priority_confirm(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_assign(uuid, uuid, uuid, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_transition(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_attention_reassess(uuid,text,text,text,uuid,date,jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_plan_create(text,text,uuid,uuid,text,text,text,uuid[],uuid,uuid,text,text,uuid,uuid,date,date,date,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_plan_update(uuid,text,text,text,uuid,uuid,date,date,date,text,text,text,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_plan_transition(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_plan_milestone_upsert(uuid,text,date,text,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intervention_initiate(text,text,text,uuid,uuid,uuid,text,uuid,text,text,date,date,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intervention_link_canonical(uuid,text,uuid,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intervention_record_outcome(uuid,text,text,text,text,jsonb,date,text,date,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_intervention_record_followup(uuid,text,date,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_planning_snapshot(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_planning_coverage(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.conduct_attention_guard(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_guard(uuid, text[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_create(text,text,text,text,uuid,text,uuid,text,uuid[],uuid,uuid,text,text,jsonb,date,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_priority_compute(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_priority_confirm(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_assign(uuid, uuid, uuid, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_transition(uuid, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_attention_reassess(uuid,text,text,text,uuid,date,jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_create(text,text,uuid,uuid,text,text,text,uuid[],uuid,uuid,text,text,uuid,uuid,date,date,date,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_update(uuid,text,text,text,uuid,uuid,date,date,date,text,text,text,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_transition(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_plan_milestone_upsert(uuid,text,date,text,uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intervention_initiate(text,text,text,uuid,uuid,uuid,text,uuid,text,text,date,date,uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intervention_link_canonical(uuid,text,uuid,text,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intervention_record_outcome(uuid,text,text,text,text,jsonb,date,text,date,date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_intervention_record_followup(uuid,text,date,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_planning_snapshot(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.conduct_planning_coverage(uuid, uuid) TO authenticated, service_role;