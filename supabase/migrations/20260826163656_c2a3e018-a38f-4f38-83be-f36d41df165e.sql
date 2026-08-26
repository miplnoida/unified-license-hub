-- ============================================================================
-- MC-10 governed operations
-- ============================================================================

-- Resolve sector remit, failing closed. Mirrors MC-09 semantics so a
-- portfolio-scoped supervisor gets their own population, never someone else's.
CREATE OR REPLACE FUNCTION public.conduct_planning_scope(_uid uuid, _sector_id uuid, _regulator_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _sectors uuid[];
BEGIN
  IF public.is_super_admin(_uid) THEN RETURN NULL; END IF;
  IF _sector_id IS NOT NULL THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
             _regulator_id, _sector_id, NULL, NULL, _uid) THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
    RETURN ARRAY[_sector_id];
  END IF;
  _sectors := public.market_conduct_visible_sectors(_uid, _regulator_id);
  IF _sectors IS NULL OR array_length(_sectors, 1) IS NULL THEN
    RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _sectors;
END $$;

-- ------------------------------------------------------------- compute run
CREATE OR REPLACE FUNCTION public.conduct_priority_compute(
  _window_days integer DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _config_code text DEFAULT 'MC_DEFAULT')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid; _cfg public.conduct_priority_configs; _sectors uuid[];
  _from date; _to date; _days integer; _run_id uuid; _count integer;
BEGIN
  -- Commissioning a prioritisation run is an analytical act: read-only
  -- officers may read runs but may not create them.
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics','manage_complaints']);

  SELECT * INTO _cfg FROM public.conduct_priority_configs
   WHERE code = _config_code AND active;
  IF _cfg.id IS NULL THEN
    RAISE EXCEPTION 'unknown_configuration: %', _config_code USING ERRCODE = '22023';
  END IF;

  _days := COALESCE(_window_days, _cfg.window_days);
  IF _days <= 0 OR _days > 1095 THEN
    RAISE EXCEPTION 'unsupported_window: the observation window must be between 1 and 1095 days'
      USING ERRCODE = '22023';
  END IF;

  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);
  _to := current_date;
  _from := _to - _days;

  INSERT INTO public.conduct_priority_runs(
    config_id, regulator_id, sector_id, sectors_in_view, all_sectors,
    window_start, window_end, window_days, method, computed_by)
  VALUES (_cfg.id, _regulator_id, _sector_id, COALESCE(_sectors, '{}'::uuid[]), _sectors IS NULL,
    _from, _to, _days,
    'Deterministic weighted count of recorded complaints, conduct signals, detected patterns and confirmed emerging risks for the stated window and sector remit. No estimation and no AI involvement.',
    _uid)
  RETURNING id INTO _run_id;

  WITH pop AS (
    SELECT l.id, l.name, l.sector_id
      FROM public.licensees l
     WHERE (_sectors IS NULL OR l.sector_id = ANY(_sectors))
  ),
  comp AS (
    SELECT c.licensee_id, count(*)::int AS n
      FROM public.complaints c
     WHERE c.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR c.regulator_id = _regulator_id)
       AND c.licensee_id IS NOT NULL
     GROUP BY c.licensee_id
  ),
  sig AS (
    SELECT s.licensee_id, count(*)::int AS n
      FROM public.conduct_signals s
     WHERE s.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR s.regulator_id = _regulator_id)
       AND s.licensee_id IS NOT NULL
     GROUP BY s.licensee_id
  ),
  pat AS (
    SELECT p.licensee_id, count(*)::int AS n
      FROM public.conduct_clusters p
     WHERE p.created_at::date BETWEEN _from AND _to
       AND (_regulator_id IS NULL OR p.regulator_id = _regulator_id)
       AND p.licensee_id IS NOT NULL
     GROUP BY p.licensee_id
  ),
  er AS (
    SELECT r.sector_id, count(*)::int AS n
      FROM public.conduct_emerging_risks r
     WHERE r.status IN ('CONFIRMED','MONITORING')
       AND (_regulator_id IS NULL OR r.regulator_id = _regulator_id)
       AND r.sector_id IS NOT NULL
     GROUP BY r.sector_id
  ),
  scored AS (
    SELECT pop.id, pop.name, pop.sector_id,
           COALESCE(comp.n,0) AS c_n, COALESCE(sig.n,0) AS s_n,
           COALESCE(pat.n,0) AS p_n, COALESCE(er.n,0) AS e_n,
           ROUND((COALESCE(comp.n,0) * _cfg.complaint_weight
                + COALESCE(sig.n,0)  * _cfg.signal_weight
                + COALESCE(pat.n,0)  * _cfg.pattern_weight
                + COALESCE(er.n,0)   * _cfg.emerging_risk_weight)::numeric, 2) AS score
      FROM pop
      LEFT JOIN comp ON comp.licensee_id = pop.id
      LEFT JOIN sig  ON sig.licensee_id  = pop.id
      LEFT JOIN pat  ON pat.licensee_id  = pop.id
      LEFT JOIN er   ON er.sector_id     = pop.sector_id
  )
  INSERT INTO public.conduct_priority_scores(
    run_id, licensee_id, licensee_name, sector_id,
    complaint_count, signal_count, pattern_count, emerging_risk_count, score, rank, drivers)
  SELECT _run_id, id, name, sector_id, c_n, s_n, p_n, e_n, score,
         ROW_NUMBER() OVER (ORDER BY score DESC, name)::int,
         jsonb_build_object(
           'complaints', jsonb_build_object('count', c_n, 'weight', _cfg.complaint_weight),
           'signals', jsonb_build_object('count', s_n, 'weight', _cfg.signal_weight),
           'patterns', jsonb_build_object('count', p_n, 'weight', _cfg.pattern_weight),
           'sector_emerging_risks', jsonb_build_object('count', e_n, 'weight', _cfg.emerging_risk_weight))
    FROM scored
   WHERE score > 0;

  SELECT count(*)::int INTO _count FROM public.conduct_priority_scores WHERE run_id = _run_id;
  UPDATE public.conduct_priority_runs SET entity_count = _count WHERE id = _run_id;

  PERFORM public.log_compliance_audit('CREATE', 'conduct_priority_run', _run_id,
    NULL, jsonb_build_object('window_days', _days, 'entities', _count, 'config', _config_code),
    'Conduct supervisory prioritisation run computed');

  RETURN jsonb_build_object(
    'run_id', _run_id, 'config_code', _config_code,
    'window', jsonb_build_object('from', _from, 'to', _to, 'days', _days),
    'scope', jsonb_build_object('sector_id', _sector_id, 'regulator_id', _regulator_id,
      'sectors_in_view', CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END),
    'entity_count', _count,
    'weights', jsonb_build_object('complaint', _cfg.complaint_weight, 'signal', _cfg.signal_weight,
      'pattern', _cfg.pattern_weight, 'emerging_risk', _cfg.emerging_risk_weight),
    'method', 'Deterministic weighted count of recorded conduct facts. No estimation and no AI involvement.');
END $$;

-- ------------------------------------------------------------- read register
CREATE OR REPLACE FUNCTION public.conduct_priority_register(
  _run_id uuid DEFAULT NULL,
  _limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _run public.conduct_priority_runs; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view','run_conduct_analytics','manage_complaints']);

  IF _run_id IS NOT NULL THEN
    SELECT * INTO _run FROM public.conduct_priority_runs WHERE id = _run_id;
  ELSE
    SELECT * INTO _run FROM public.conduct_priority_runs
     ORDER BY computed_at DESC LIMIT 1;
  END IF;
  IF _run.id IS NULL THEN
    RETURN jsonb_build_object('run', NULL, 'entries', '[]'::jsonb,
      'method', 'No prioritisation run has been computed yet.');
  END IF;

  -- Scope is recalculated for the reader, never inherited from the run.
  _sectors := public.conduct_planning_scope(_uid, NULL, _run.regulator_id);

  SELECT COALESCE(jsonb_agg(e ORDER BY (e->>'rank')::int), '[]'::jsonb) INTO _rows
    FROM (
      SELECT jsonb_build_object(
               'score_id', s.id, 'rank', s.rank, 'licensee_id', s.licensee_id,
               'licensee_name', s.licensee_name, 'sector_id', s.sector_id,
               'complaint_count', s.complaint_count, 'signal_count', s.signal_count,
               'pattern_count', s.pattern_count, 'emerging_risk_count', s.emerging_risk_count,
               'score', s.score, 'drivers', s.drivers) AS e
        FROM public.conduct_priority_scores s
       WHERE s.run_id = _run.id
         AND (_sectors IS NULL OR s.sector_id = ANY(_sectors))
       ORDER BY s.rank
       LIMIT GREATEST(COALESCE(_limit, 50), 1)
    ) q;

  RETURN jsonb_build_object(
    'run', jsonb_build_object('id', _run.id, 'computed_at', _run.computed_at,
      'window', jsonb_build_object('from', _run.window_start, 'to', _run.window_end, 'days', _run.window_days),
      'entity_count', _run.entity_count, 'method', _run.method),
    'scope', jsonb_build_object('sectors_in_view',
      CASE WHEN _sectors IS NULL THEN to_jsonb('all'::text) ELSE to_jsonb(_sectors) END),
    'entries', _rows);
END $$;

-- ------------------------------------------------------------- interventions
CREATE OR REPLACE FUNCTION public.conduct_intervention_guard(_id uuid, _actions text[])
RETURNS public.conduct_interventions
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions;
BEGIN
  _uid := public.market_conduct_require(_actions);
  SELECT * INTO _row FROM public.conduct_interventions WHERE id = _id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'intervention_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', _actions[1],
               _row.regulator_id, _row.sector_id, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: intervention out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _row;
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_propose(
  _intervention_type text,
  _title text,
  _basis text,
  _licensee_id uuid DEFAULT NULL,
  _theme text DEFAULT NULL,
  _emerging_risk_id uuid DEFAULT NULL,
  _priority_score_id uuid DEFAULT NULL,
  _expected_outcome text DEFAULT NULL,
  _planned_start date DEFAULT NULL,
  _planned_end date DEFAULT NULL,
  _owner_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _id uuid; _ref text; _sector uuid; _reg uuid;
BEGIN
  _uid := public.market_conduct_require(ARRAY['run_conduct_analytics','manage_complaints']);

  IF length(btrim(COALESCE(_basis,''))) < 20 THEN
    RAISE EXCEPTION 'A supervisory basis of at least 20 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _licensee_id IS NULL AND _emerging_risk_id IS NULL
     AND nullif(btrim(COALESCE(_theme,'')),'') IS NULL THEN
    RAISE EXCEPTION 'An intervention must name an entity, a theme or an emerging risk' USING ERRCODE = '22023';
  END IF;

  _sector := _sector_id;
  _reg := _regulator_id;
  IF _licensee_id IS NOT NULL THEN
    SELECT COALESCE(_sector, l.sector_id), COALESCE(_reg, l.regulator_id)
      INTO _sector, _reg FROM public.licensees l WHERE l.id = _licensee_id;
  ELSIF _emerging_risk_id IS NOT NULL THEN
    SELECT COALESCE(_sector, r.sector_id), COALESCE(_reg, r.regulator_id)
      INTO _sector, _reg FROM public.conduct_emerging_risks r WHERE r.id = _emerging_risk_id;
  END IF;

  IF NOT public.is_super_admin(_uid)
     AND NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'run_conduct_analytics',
               _reg, _sector, NULL, NULL, _uid) THEN
    RAISE EXCEPTION 'not_authorized: subject out of regulatory scope' USING ERRCODE = '42501';
  END IF;

  _ref := 'CI-' || to_char(now(), 'YYYY') || '-' ||
          lpad(nextval('public.conduct_intervention_ref_seq')::text, 5, '0');

  INSERT INTO public.conduct_interventions(
    reference, regulator_id, sector_id, licensee_id, theme, emerging_risk_id,
    priority_score_id, intervention_type, title, basis, expected_outcome,
    planned_start, planned_end, owner_id, proposed_by)
  VALUES (_ref, _reg, _sector, _licensee_id, nullif(btrim(COALESCE(_theme,'')),''), _emerging_risk_id,
    _priority_score_id, _intervention_type, btrim(_title), btrim(_basis), _expected_outcome,
    _planned_start, _planned_end, _owner_id, _uid)
  RETURNING id INTO _id;

  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, to_status, rationale, actor_id)
  VALUES (_id, 'PROPOSED', 'PROPOSED', btrim(_basis), _uid);

  PERFORM public.log_compliance_audit('CREATE', 'conduct_intervention', _id, NULL,
    jsonb_build_object('reference', _ref, 'type', _intervention_type, 'status', 'PROPOSED'),
    'Supervisory intervention ' || _ref || ' proposed');

  RETURN jsonb_build_object('id', _id, 'reference', _ref, 'status', 'PROPOSED');
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_decide(
  _id uuid, _decision text, _rationale text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions; _to text;
BEGIN
  -- Checker authority: deciding an intervention requires approval rights.
  _row := public.conduct_intervention_guard(_id, ARRAY['approve']);
  _uid := auth.uid();

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A decision rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _row.status <> 'PROPOSED' THEN
    RAISE EXCEPTION 'transition_not_permitted: intervention is %', _row.status USING ERRCODE = '22023';
  END IF;
  -- Maker-checker separation is absolute.
  IF _row.proposed_by = _uid AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'not_authorized: the proposing officer cannot decide their own intervention'
      USING ERRCODE = '42501';
  END IF;
  _to := CASE lower(_decision) WHEN 'endorse' THEN 'ENDORSED' WHEN 'reject' THEN 'REJECTED'
         ELSE NULL END;
  IF _to IS NULL THEN
    RAISE EXCEPTION 'unsupported_decision: %', _decision USING ERRCODE = '22023';
  END IF;

  UPDATE public.conduct_interventions
     SET status = _to, decided_by = _uid, decided_at = now(),
         decision_rationale = btrim(_rationale), updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_id, 'DECISION', _row.status, _to, btrim(_rationale), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_intervention', _id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to),
    'Supervisory intervention ' || _row.reference || ': ' || _row.status || ' -> ' || _to);

  RETURN jsonb_build_object('id', _id, 'reference', _row.reference, 'status', _to);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_transition(
  _id uuid, _to_status text, _rationale text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _row public.conduct_interventions; _allowed boolean;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();

  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _to_status NOT IN ('ACTIVE','COMPLETED','CANCELLED') THEN
    RAISE EXCEPTION 'unsupported_status: %', _to_status USING ERRCODE = '22023';
  END IF;

  _allowed := CASE _row.status
    WHEN 'ENDORSED' THEN _to_status IN ('ACTIVE','CANCELLED')
    WHEN 'ACTIVE'   THEN _to_status IN ('COMPLETED','CANCELLED')
    WHEN 'PROPOSED' THEN _to_status = 'CANCELLED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.conduct_interventions
     SET status = _to_status,
         activated_at = CASE WHEN _to_status = 'ACTIVE' THEN now() ELSE activated_at END,
         completed_at = CASE WHEN _to_status IN ('COMPLETED','CANCELLED') THEN now() ELSE completed_at END,
         outcome_note = CASE WHEN _to_status IN ('COMPLETED','CANCELLED') THEN btrim(_rationale) ELSE outcome_note END,
         updated_at = now()
   WHERE id = _id;

  INSERT INTO public.conduct_intervention_events(intervention_id, event_type, from_status, to_status, rationale, actor_id)
  VALUES (_id, 'STATUS_CHANGE', _row.status, _to_status, btrim(_rationale), _uid);

  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_intervention', _id,
    jsonb_build_object('status', _row.status), jsonb_build_object('status', _to_status),
    'Supervisory intervention ' || _row.reference || ': ' || _row.status || ' -> ' || _to_status);

  RETURN jsonb_build_object('id', _id, 'reference', _row.reference,
    'from_status', _row.status, 'to_status', _to_status);
END $$;

CREATE OR REPLACE FUNCTION public.conduct_intervention_case(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.conduct_interventions; _events jsonb;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['view','run_conduct_analytics','manage_complaints']);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status,
           'to_status', e.to_status, 'rationale', e.rationale, 'actor_id', e.actor_id,
           'actor_name', p.full_name, 'created_at', e.created_at) ORDER BY e.created_at), '[]'::jsonb)
    INTO _events
    FROM public.conduct_intervention_events e
    LEFT JOIN public.profiles p ON p.id = e.actor_id
   WHERE e.intervention_id = _id;

  RETURN jsonb_build_object(
    'intervention', to_jsonb(_row),
    'licensee_name', (SELECT name FROM public.licensees WHERE id = _row.licensee_id),
    'emerging_risk_reference', (SELECT reference FROM public.conduct_emerging_risks WHERE id = _row.emerging_risk_id),
    'proposed_by_name', (SELECT full_name FROM public.profiles WHERE id = _row.proposed_by),
    'decided_by_name', (SELECT full_name FROM public.profiles WHERE id = _row.decided_by),
    'owner_name', (SELECT full_name FROM public.profiles WHERE id = _row.owner_id),
    'events', _events);
END $$;

REVOKE EXECUTE ON FUNCTION public.market_conduct_require(text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_planning_scope(uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_priority_compute(integer, uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_priority_register(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_guard(uuid, text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_propose(text, text, text, uuid, text, uuid, uuid, text, date, date, uuid, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_decide(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_transition(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_case(uuid) FROM anon;
