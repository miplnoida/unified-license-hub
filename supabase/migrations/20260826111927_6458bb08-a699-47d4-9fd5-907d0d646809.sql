-- ============================================================
-- MC-06 — deterministic pattern engine: governed operations
-- ============================================================

CREATE OR REPLACE FUNCTION public.conduct_pattern_require(_actions text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF public.is_super_admin(_uid) THEN RETURN _uid; END IF;
  FOREACH _a IN ARRAY _actions LOOP
    IF public.has_permission(_uid, 'market_conduct', _a) THEN RETURN _uid; END IF;
  END LOOP;
  RAISE EXCEPTION 'not_authorized: market_conduct.%', _actions[1] USING ERRCODE = '42501';
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_pattern_matches(_value numeric, _op text, _threshold numeric)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE _op
    WHEN '>=' THEN _value >= _threshold
    WHEN '>'  THEN _value >  _threshold
    WHEN '='  THEN _value =  _threshold
    WHEN '<=' THEN _value <= _threshold
    WHEN '<'  THEN _value <  _threshold
    ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_next_reference()
RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT 'PAT-' || to_char(now(), 'YYYY') || '-' ||
         lpad(nextval('public.conduct_cluster_reference_seq')::text, 6, '0');
$$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_log(
  _cluster_id uuid, _event_type text, _from text, _to text,
  _reason text, _detail jsonb, _actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.conduct_cluster_history(cluster_id, event_type, from_status, to_status, reason, detail, actor_id)
  VALUES (_cluster_id, _event_type, _from, _to, _reason, coalesce(_detail, '{}'::jsonb), _actor);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_guard(_cluster_id uuid, _actions text[])
RETURNS public.conduct_clusters LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_clusters;
BEGIN
  _uid := public.conduct_pattern_require(_actions);
  SELECT * INTO _row FROM public.conduct_clusters WHERE id = _cluster_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Pattern not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin(_uid) THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', _actions[1],
           _row.regulator_id, _row.sector_id, NULL, _row.licensee_id, _uid) THEN
      RAISE EXCEPTION 'not_authorized: pattern out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN _row;
END; $$;

-- ------------------------------------------------------------
-- Pattern rule definition (reuses monitoring rule tables)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_pattern_rule_upsert(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _id uuid; _ver integer; _code text; _ptype text;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['manage_monitoring_rules']);
  _code  := btrim(coalesce(_payload->>'code',''));
  _ptype := btrim(coalesce(_payload->>'pattern_type',''));
  IF _code = '' OR _ptype = '' THEN
    RAISE EXCEPTION 'A rule code and pattern type are required' USING ERRCODE = '22023';
  END IF;
  IF _ptype NOT IN ('entity_signal_recurrence','entity_product_signal_recurrence',
                    'entity_channel_signal_recurrence','complaint_issue_recurrence',
                    'complaint_outcome_recurrence','rising_signal_frequency',
                    'severity_concentration','systemic_potential_recurrence',
                    'sector_product_cross_entity') THEN
    RAISE EXCEPTION 'Unsupported pattern type: %', _ptype USING ERRCODE = '22023';
  END IF;

  SELECT id INTO _id FROM public.conduct_monitoring_rules WHERE code = _code;

  IF _id IS NULL THEN
    INSERT INTO public.conduct_monitoring_rules(
      name, description, scope, rule_type, pattern_type, definition, frequency,
      code, metric, source_dataset, threshold_value, comparison_operator,
      lookback_days, active, current_version, created_by)
    VALUES (
      coalesce(nullif(_payload->>'name',''), _code),
      nullif(_payload->>'description',''),
      coalesce(nullif(_payload->>'scope',''), 'entity'),
      'pattern', _ptype,
      coalesce(_payload->'definition', '{}'::jsonb),
      coalesce(nullif(_payload->>'frequency',''), 'daily'),
      _code,
      coalesce(nullif(_payload->>'metric',''), _ptype),
      coalesce(nullif(_payload->>'source_dataset',''), 'conduct_signals'),
      coalesce((_payload->>'threshold_value')::numeric, 3),
      coalesce(nullif(_payload->>'comparison_operator',''), '>='),
      coalesce((_payload->>'lookback_days')::integer, 90),
      coalesce((_payload->>'active')::boolean, true),
      1, _uid)
    RETURNING id, current_version INTO _id, _ver;
  ELSE
    UPDATE public.conduct_monitoring_rules SET
      name = coalesce(nullif(_payload->>'name',''), name),
      description = coalesce(nullif(_payload->>'description',''), description),
      rule_type = 'pattern',
      pattern_type = _ptype,
      definition = coalesce(_payload->'definition', definition),
      threshold_value = coalesce((_payload->>'threshold_value')::numeric, threshold_value),
      comparison_operator = coalesce(nullif(_payload->>'comparison_operator',''), comparison_operator),
      lookback_days = coalesce((_payload->>'lookback_days')::integer, lookback_days),
      metric = coalesce(nullif(_payload->>'metric',''), metric),
      active = coalesce((_payload->>'active')::boolean, active),
      current_version = current_version + 1,
      updated_at = now()
    WHERE id = _id
    RETURNING current_version INTO _ver;
  END IF;

  INSERT INTO public.conduct_monitoring_rule_versions(rule_id, version, snapshot, effective_from, created_by)
  SELECT _id, _ver, to_jsonb(r), now(), _uid FROM public.conduct_monitoring_rules r WHERE r.id = _id
  ON CONFLICT DO NOTHING;

  PERFORM public.log_compliance_audit('UPDATE', 'conduct_pattern_rule', _id, NULL,
    (SELECT to_jsonb(r) FROM public.conduct_monitoring_rules r WHERE r.id = _id),
    'Conduct pattern rule saved: ' || _code);

  RETURN jsonb_build_object('id', _id, 'version', _ver, 'code', _code, 'pattern_type', _ptype);
END; $$;

-- ------------------------------------------------------------
-- Deterministic detection run
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_pattern_detect(
  _rule_id uuid, _as_of timestamptz DEFAULT now(), _dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid; _rule public.conduct_monitoring_rules; _snapshot jsonb;
  _ptype text; _metric text; _op text; _thr numeric; _days integer;
  _w_end timestamptz; _w_start timestamptz; _p_start timestamptz;
  _min_volume numeric; _run_id uuid;
  _cand record; _cluster_id uuid; _created integer := 0; _updated integer := 0;
  _matched integer := 0; _ref text; _dedupe text; _existing uuid; _unit text;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['run_conduct_analytics','manage_monitoring_rules']);

  SELECT * INTO _rule FROM public.conduct_monitoring_rules WHERE id = _rule_id;
  IF _rule.id IS NULL THEN
    RAISE EXCEPTION 'Pattern rule not found' USING ERRCODE = 'P0002';
  END IF;
  _ptype := coalesce(_rule.pattern_type, _rule.definition->>'pattern_type');
  IF _ptype IS NULL THEN
    RAISE EXCEPTION 'Rule % is not a pattern rule', _rule.code USING ERRCODE = '22023';
  END IF;
  IF NOT _rule.active THEN
    RAISE EXCEPTION 'Pattern rule % is inactive', _rule.code USING ERRCODE = '22023';
  END IF;

  _metric := coalesce(_rule.metric, _ptype);
  _op     := coalesce(_rule.comparison_operator, '>=');
  _thr    := coalesce(_rule.threshold_value, 3);
  _days   := coalesce(_rule.lookback_days, 90);
  _min_volume := coalesce((_rule.definition->>'min_volume')::numeric, 3);
  _unit   := CASE WHEN _ptype IN ('rising_signal_frequency','severity_concentration') THEN 'percent' ELSE 'count' END;

  -- day-truncated window keeps reruns on the same day fully idempotent
  _w_end   := date_trunc('day', _as_of) + interval '1 day';
  _w_start := _w_end - make_interval(days => _days);
  _p_start := _w_start - make_interval(days => _days);

  SELECT to_jsonb(r) INTO _snapshot FROM public.conduct_monitoring_rules r WHERE r.id = _rule_id;

  INSERT INTO public.conduct_monitoring_rule_runs(rule_id, started_at, executed_by, status, summary)
  VALUES (_rule_id, now(), _uid, 'running',
          jsonb_build_object('pattern_type', _ptype, 'window_start', _w_start,
                             'window_end', _w_end, 'dry_run', _dry_run))
  RETURNING id INTO _run_id;

  CREATE TEMP TABLE _mc06_cand (
    licensee_id uuid, sector_id uuid, product_id uuid, channel_id uuid,
    complaint_type_id uuid, regulator_id uuid, outcome_key text,
    metric_value numeric, member_type text, member_ids uuid[],
    distinct_entities integer, systemic_count integer,
    high_count integer, total_count integer, label text, detail jsonb
  ) ON COMMIT DROP;

  IF _ptype IN ('entity_signal_recurrence','entity_product_signal_recurrence',
                'entity_channel_signal_recurrence','systemic_potential_recurrence',
                'severity_concentration','sector_product_cross_entity') THEN
    INSERT INTO _mc06_cand
    SELECT
      CASE WHEN _ptype = 'sector_product_cross_entity' THEN NULL ELSE s.licensee_id END,
      max(s.sector_id) FILTER (WHERE true),
      CASE WHEN _ptype IN ('entity_product_signal_recurrence','sector_product_cross_entity') THEN s.product_id ELSE NULL END,
      CASE WHEN _ptype = 'entity_channel_signal_recurrence' THEN s.channel_id ELSE NULL END,
      NULL::uuid,
      max(s.regulator_id),
      NULL::text,
      CASE
        WHEN _ptype = 'severity_concentration'
          THEN round(100.0 * count(*) FILTER (WHERE s.severity IN ('high','critical')) / greatest(count(*), 1), 2)
        WHEN _ptype = 'systemic_potential_recurrence'
          THEN count(*) FILTER (WHERE s.systemic_potential IN ('high','confirmed','likely'))
        WHEN _ptype = 'sector_product_cross_entity'
          THEN count(DISTINCT s.licensee_id)
        ELSE count(*)
      END,
      'signal',
      array_agg(s.id ORDER BY s.created_at),
      count(DISTINCT s.licensee_id),
      count(*) FILTER (WHERE s.systemic_potential IN ('high','confirmed','likely')),
      count(*) FILTER (WHERE s.severity IN ('high','critical')),
      count(*),
      NULL::text,
      jsonb_build_object(
        'signal_count', count(*),
        'high_severity_count', count(*) FILTER (WHERE s.severity IN ('high','critical')),
        'systemic_count', count(*) FILTER (WHERE s.systemic_potential IN ('high','confirmed','likely')),
        'distinct_entities', count(DISTINCT s.licensee_id),
        'min_volume', _min_volume)
    FROM public.conduct_signals s
    WHERE s.created_at >= _w_start AND s.created_at < _w_end
      AND coalesce(s.status, 'new') <> 'withdrawn'
    GROUP BY
      CASE WHEN _ptype = 'sector_product_cross_entity' THEN NULL ELSE s.licensee_id END,
      CASE WHEN _ptype = 'sector_product_cross_entity' THEN s.sector_id ELSE NULL END,
      CASE WHEN _ptype IN ('entity_product_signal_recurrence','sector_product_cross_entity') THEN s.product_id ELSE NULL END,
      CASE WHEN _ptype = 'entity_channel_signal_recurrence' THEN s.channel_id ELSE NULL END
    HAVING (_ptype = 'sector_product_cross_entity' OR bool_and(s.licensee_id IS NOT NULL))
       AND (_ptype <> 'severity_concentration' OR count(*) >= _min_volume);

  ELSIF _ptype = 'rising_signal_frequency' THEN
    INSERT INTO _mc06_cand
    SELECT
      cur.licensee_id, cur.sector_id, NULL, NULL, NULL, cur.regulator_id, NULL,
      CASE WHEN coalesce(prev.cnt, 0) = 0 THEN 100.0 * cur.cnt
           ELSE round(100.0 * (cur.cnt - prev.cnt) / prev.cnt, 2) END,
      'signal', cur.ids, 1, cur.systemic_count, cur.high_count, cur.cnt::integer, NULL,
      jsonb_build_object('current_count', cur.cnt, 'previous_count', coalesce(prev.cnt, 0),
                         'previous_window_start', _p_start, 'previous_window_end', _w_start,
                         'min_volume', _min_volume)
    FROM (
      SELECT s.licensee_id, max(s.sector_id) AS sector_id, max(s.regulator_id) AS regulator_id,
             count(*) AS cnt, array_agg(s.id ORDER BY s.created_at) AS ids,
             count(*) FILTER (WHERE s.severity IN ('high','critical'))::integer AS high_count,
             count(*) FILTER (WHERE s.systemic_potential IN ('high','confirmed','likely'))::integer AS systemic_count
        FROM public.conduct_signals s
       WHERE s.created_at >= _w_start AND s.created_at < _w_end AND s.licensee_id IS NOT NULL
       GROUP BY s.licensee_id
    ) cur
    LEFT JOIN (
      SELECT s.licensee_id, count(*) AS cnt
        FROM public.conduct_signals s
       WHERE s.created_at >= _p_start AND s.created_at < _w_start AND s.licensee_id IS NOT NULL
       GROUP BY s.licensee_id
    ) prev ON prev.licensee_id = cur.licensee_id
    WHERE cur.cnt >= _min_volume;

  ELSIF _ptype = 'complaint_issue_recurrence' THEN
    INSERT INTO _mc06_cand
    SELECT c.licensee_id, max(l.sector_id), max(c.product_id), max(c.channel_id),
           c.complaint_type_id, max(c.regulator_id), NULL,
           count(*), 'complaint', array_agg(c.id ORDER BY c.created_at),
           1, 0, count(*) FILTER (WHERE c.severity IN ('high','critical'))::integer, count(*)::integer,
           max(ct.name),
           jsonb_build_object('complaint_count', count(*), 'issue', max(ct.name))
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
      LEFT JOIN public.complaint_types ct ON ct.id = c.complaint_type_id
     WHERE c.created_at >= _w_start AND c.created_at < _w_end
       AND c.licensee_id IS NOT NULL AND c.complaint_type_id IS NOT NULL
     GROUP BY c.licensee_id, c.complaint_type_id;

  ELSIF _ptype = 'complaint_outcome_recurrence' THEN
    INSERT INTO _mc06_cand
    SELECT c.licensee_id, max(l.sector_id), NULL, NULL, NULL, max(c.regulator_id),
           o.overall_outcome,
           count(*), 'complaint_outcome', array_agg(o.id ORDER BY o.created_at),
           1, 0, 0, count(*)::integer, o.overall_outcome,
           jsonb_build_object('outcome_count', count(*), 'outcome', o.overall_outcome)
      FROM public.complaint_outcomes o
      JOIN public.complaints c ON c.id = o.complaint_id
      LEFT JOIN public.licensees l ON l.id = c.licensee_id
     WHERE o.created_at >= _w_start AND o.created_at < _w_end
       AND coalesce(o.is_current, true)
       AND c.licensee_id IS NOT NULL AND o.overall_outcome IS NOT NULL
     GROUP BY c.licensee_id, o.overall_outcome;
  END IF;

  FOR _cand IN SELECT * FROM _mc06_cand LOOP
    IF NOT public.conduct_pattern_matches(_cand.metric_value, _op, _thr) THEN
      CONTINUE;
    END IF;
    _matched := _matched + 1;

    _dedupe := _rule.code || '|' || _ptype || '|v' || _rule.current_version || '|'
      || coalesce(_cand.licensee_id::text, '-') || '|' || coalesce(_cand.sector_id::text, '-') || '|'
      || coalesce(_cand.product_id::text, '-') || '|' || coalesce(_cand.channel_id::text, '-') || '|'
      || coalesce(_cand.complaint_type_id::text, '-') || '|' || coalesce(_cand.outcome_key, '-') || '|'
      || to_char(_w_start, 'YYYYMMDD') || '-' || to_char(_w_end, 'YYYYMMDD');

    IF _dry_run THEN CONTINUE; END IF;

    SELECT id INTO _existing FROM public.conduct_clusters WHERE dedupe_key = _dedupe;

    IF _existing IS NULL THEN
      _ref := public.conduct_cluster_next_reference();
      INSERT INTO public.conduct_clusters(
        reference, dedupe_key, rule_id, rule_code, rule_version, rule_snapshot,
        pattern_type, title, regulator_id, licensee_id, sector_id, product_id, channel_id,
        complaint_type_id, group_key, metric, metric_value, metric_unit,
        threshold_value, comparison_operator, window_start, window_end, window_days,
        member_count, severity, severity_mix, systemic_member_count, distinct_entity_count,
        match_explanation, status, created_by)
      VALUES (
        _ref, _dedupe, _rule_id, _rule.code, _rule.current_version, _snapshot,
        _ptype,
        coalesce(_rule.name, _ptype) || coalesce(' — ' || _cand.label, ''),
        _cand.regulator_id, _cand.licensee_id, _cand.sector_id, _cand.product_id, _cand.channel_id,
        _cand.complaint_type_id,
        jsonb_strip_nulls(jsonb_build_object(
          'licensee_id', _cand.licensee_id, 'sector_id', _cand.sector_id,
          'product_id', _cand.product_id, 'channel_id', _cand.channel_id,
          'complaint_type_id', _cand.complaint_type_id, 'outcome', _cand.outcome_key)),
        _metric, _cand.metric_value, _unit, _thr, _op, _w_start, _w_end, _days,
        coalesce(array_length(_cand.member_ids, 1), 0),
        CASE WHEN _cand.systemic_count > 0 OR _cand.high_count >= 3 THEN 'high'
             WHEN _cand.high_count > 0 THEN 'medium' ELSE 'low' END,
        jsonb_build_object('high_or_critical', _cand.high_count, 'total', _cand.total_count),
        _cand.systemic_count, _cand.distinct_entities,
        format('Rule %s (v%s) measured %s = %s over %s day(s) from %s to %s; threshold %s %s was met by %s contributing record(s).',
               _rule.code, _rule.current_version, _metric, _cand.metric_value, _days,
               to_char(_w_start, 'YYYY-MM-DD'), to_char(_w_end, 'YYYY-MM-DD'), _op, _thr,
               coalesce(array_length(_cand.member_ids, 1), 0)),
        'open', _uid)
      RETURNING id INTO _cluster_id;
      _created := _created + 1;
      PERFORM public.conduct_cluster_log(_cluster_id, 'DETECTED', NULL, 'open',
        'Pattern detected by rule ' || _rule.code,
        jsonb_build_object('run_id', _run_id, 'metric_value', _cand.metric_value,
                           'threshold', _thr, 'detail', _cand.detail), _uid);
    ELSE
      _cluster_id := _existing;
      UPDATE public.conduct_clusters SET
        metric_value = _cand.metric_value,
        member_count = coalesce(array_length(_cand.member_ids, 1), 0),
        severity_mix = jsonb_build_object('high_or_critical', _cand.high_count, 'total', _cand.total_count),
        systemic_member_count = _cand.systemic_count,
        distinct_entity_count = _cand.distinct_entities,
        rule_snapshot = _snapshot,
        last_evaluated_at = now(),
        evaluation_count = evaluation_count + 1
      WHERE id = _cluster_id;
      _updated := _updated + 1;
      PERFORM public.conduct_cluster_log(_cluster_id, 'RE_EVALUATED', NULL, NULL,
        'Pattern re-evaluated by rule ' || _rule.code,
        jsonb_build_object('run_id', _run_id, 'metric_value', _cand.metric_value), _uid);
    END IF;

    -- contributing records (idempotent)
    IF _cand.member_type = 'signal' THEN
      INSERT INTO public.conduct_cluster_members(
        cluster_id, member_type, member_table, member_id, member_reference,
        member_title, member_severity, occurred_at, detail)
      SELECT _cluster_id, 'signal', 'conduct_signals', s.id, s.reference, s.title,
             s.severity, s.created_at,
             jsonb_build_object('systemic_potential', s.systemic_potential, 'source_type', s.source_type)
        FROM public.conduct_signals s WHERE s.id = ANY (_cand.member_ids)
      ON CONFLICT (cluster_id, member_type, member_id)
        DO UPDATE SET last_seen_at = now();
    ELSIF _cand.member_type = 'complaint' THEN
      INSERT INTO public.conduct_cluster_members(
        cluster_id, member_type, member_table, member_id, member_reference,
        member_title, member_severity, occurred_at, detail)
      SELECT _cluster_id, 'complaint', 'complaints', c.id, c.complaint_number, c.subject,
             c.severity, c.created_at, jsonb_build_object('status', c.status)
        FROM public.complaints c WHERE c.id = ANY (_cand.member_ids)
      ON CONFLICT (cluster_id, member_type, member_id)
        DO UPDATE SET last_seen_at = now();
    ELSIF _cand.member_type = 'complaint_outcome' THEN
      INSERT INTO public.conduct_cluster_members(
        cluster_id, member_type, member_table, member_id, member_reference,
        member_title, member_severity, occurred_at, detail)
      SELECT _cluster_id, 'complaint_outcome', 'complaint_outcomes', o.id, c.complaint_number,
             o.overall_outcome, o.harm_level, o.created_at,
             jsonb_build_object('complaint_id', o.complaint_id, 'status', o.status)
        FROM public.complaint_outcomes o
        JOIN public.complaints c ON c.id = o.complaint_id
       WHERE o.id = ANY (_cand.member_ids)
      ON CONFLICT (cluster_id, member_type, member_id)
        DO UPDATE SET last_seen_at = now();
    END IF;

    -- metric evidence for this evaluation (idempotent on identical inputs)
    INSERT INTO public.conduct_cluster_metrics(
      cluster_id, run_id, rule_id, rule_version, metric, metric_value, threshold_value,
      comparison_operator, window_start, window_end, matched, member_count, detail)
    VALUES (_cluster_id, _run_id, _rule_id, _rule.current_version, _metric, _cand.metric_value,
            _thr, _op, _w_start, _w_end, true,
            coalesce(array_length(_cand.member_ids, 1), 0), _cand.detail)
    ON CONFLICT (cluster_id, rule_version, metric, window_start, window_end, metric_value)
      DO NOTHING;

    -- monitoring result trail on the existing infrastructure
    INSERT INTO public.conduct_monitoring_results(
      rule_id, entity_id, product_id, evaluated_at, matched, metrics, notes)
    VALUES (_rule_id, _cand.licensee_id, _cand.product_id, now(), true,
            jsonb_build_object('pattern_type', _ptype, 'metric', _metric,
                               'metric_value', _cand.metric_value, 'threshold', _thr,
                               'cluster_id', _cluster_id, 'run_id', _run_id),
            'MC-06 deterministic pattern evaluation');
  END LOOP;

  UPDATE public.conduct_monitoring_rule_runs SET
    completed_at = now(), status = 'completed', matched_count = _matched, alerts_created = 0,
    summary = jsonb_build_object('pattern_type', _ptype, 'window_start', _w_start,
                                 'window_end', _w_end, 'dry_run', _dry_run,
                                 'clusters_created', _created, 'clusters_updated', _updated,
                                 'candidates', (SELECT count(*) FROM _mc06_cand),
                                 'rule_version', _rule.current_version)
  WHERE id = _run_id;

  DROP TABLE IF EXISTS _mc06_cand;

  RETURN jsonb_build_object('run_id', _run_id, 'rule_code', _rule.code,
    'pattern_type', _ptype, 'rule_version', _rule.current_version,
    'window_start', _w_start, 'window_end', _w_end,
    'matched', _matched, 'clusters_created', _created, 'clusters_updated', _updated,
    'dry_run', _dry_run);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_pattern_run_all(_as_of timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _r record; _out jsonb := '[]'::jsonb;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['run_conduct_analytics','manage_monitoring_rules']);
  FOR _r IN SELECT id FROM public.conduct_monitoring_rules
             WHERE active AND (rule_type = 'pattern' OR pattern_type IS NOT NULL)
             ORDER BY code LOOP
    _out := _out || jsonb_build_array(public.conduct_pattern_detect(_r.id, _as_of, false));
  END LOOP;
  RETURN jsonb_build_object('runs', _out);
END; $$;

-- ------------------------------------------------------------
-- Review / governed outcomes
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_cluster_review(
  _cluster_id uuid, _status text, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _row public.conduct_clusters;
BEGIN
  _row := public.conduct_cluster_guard(_cluster_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  IF _status NOT IN ('under_review','confirmed','dismissed','open') THEN
    RAISE EXCEPTION 'Unsupported review status' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(coalesce(_note,''))) < 10 THEN
    RAISE EXCEPTION 'A review note of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _row.status = 'dismissed' AND _status <> 'open' THEN
    RAISE EXCEPTION 'A dismissed pattern must be reopened first' USING ERRCODE = '22023';
  END IF;

  UPDATE public.conduct_clusters
     SET status = _status, reviewer_id = _uid, reviewed_at = now(), review_note = btrim(_note)
   WHERE id = _cluster_id;

  PERFORM public.conduct_cluster_log(_cluster_id, 'REVIEW', _row.status, _status, btrim(_note), '{}'::jsonb, _uid);
  PERFORM public.log_compliance_audit('UPDATE', 'conduct_cluster', _cluster_id, to_jsonb(_row),
    (SELECT to_jsonb(c) FROM public.conduct_clusters c WHERE c.id = _cluster_id),
    'Conduct pattern reviewed: ' || _row.reference);
  RETURN jsonb_build_object('id', _cluster_id, 'status', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_link_evidence(
  _cluster_id uuid, _evidence_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_clusters;
BEGIN
  _row := public.conduct_cluster_guard(_cluster_id, ARRAY['run_conduct_analytics','manage_complaints']);
  _uid := auth.uid();
  UPDATE public.conduct_evidence SET cluster_id = _cluster_id, updated_at = now()
   WHERE id = _evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evidence not found' USING ERRCODE = 'P0002';
  END IF;
  PERFORM public.conduct_cluster_log(_cluster_id, 'EVIDENCE_LINKED', NULL, NULL, _note,
    jsonb_build_object('evidence_id', _evidence_id), _uid);
  RETURN jsonb_build_object('cluster_id', _cluster_id, 'evidence_id', _evidence_id);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_raise_signal(
  _cluster_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_clusters; _res jsonb; _sid uuid;
BEGIN
  _row := public.conduct_cluster_guard(_cluster_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF length(btrim(coalesce(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _row.raised_signal_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', _row.raised_signal_id, 'already_exists', true);
  END IF;

  _res := public.conduct_signal_create(jsonb_build_object(
    'title', 'Pattern ' || _row.reference || ': ' || _row.title,
    'summary', _row.match_explanation,
    'source_type', 'supervisory_observation',
    'signal_category', 'pattern_detection',
    'rationale', btrim(_rationale),
    'regulator_id', _row.regulator_id,
    'licensee_id', _row.licensee_id,
    'sector_id', _row.sector_id,
    'product_id', _row.product_id,
    'channel_id', _row.channel_id,
    'severity', _row.severity,
    'systemic_potential', CASE WHEN _row.systemic_member_count > 0 THEN 'high' ELSE 'unassessed' END,
    'metadata', jsonb_build_object('cluster_id', _cluster_id, 'cluster_reference', _row.reference,
                                   'rule_code', _row.rule_code, 'rule_version', _row.rule_version,
                                   'metric', _row.metric, 'metric_value', _row.metric_value,
                                   'threshold_value', _row.threshold_value,
                                   'window_start', _row.window_start, 'window_end', _row.window_end)));
  _sid := (_res->>'id')::uuid;

  UPDATE public.conduct_clusters SET raised_signal_id = _sid WHERE id = _cluster_id;
  PERFORM public.conduct_cluster_log(_cluster_id, 'SIGNAL_RAISED', NULL, NULL, btrim(_rationale),
    jsonb_build_object('signal_id', _sid), _uid);
  RETURN jsonb_build_object('id', _sid, 'reference', _res->>'reference', 'already_exists', false);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_raise_alert(
  _cluster_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_clusters; _aid uuid; _dedupe text;
BEGIN
  _row := public.conduct_cluster_guard(_cluster_id, ARRAY['manage_complaints','run_conduct_analytics']);
  _uid := auth.uid();
  IF length(btrim(coalesce(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'A rationale of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _row.raised_alert_id IS NOT NULL THEN
    RETURN jsonb_build_object('id', _row.raised_alert_id, 'already_exists', true);
  END IF;

  _dedupe := 'pattern:' || _row.dedupe_key;
  SELECT id INTO _aid FROM public.conduct_alerts WHERE dedupe_key = _dedupe;

  IF _aid IS NULL THEN
    INSERT INTO public.conduct_alerts(
      regulator_id, licensee_id, product_id, channel_id, kind, severity, status, title,
      detail, generated_by, source, dedupe_key, window_start, window_end,
      explanation, rule_snapshot, source_record_ids, observation_start, observation_end,
      rule_version, threshold_value)
    VALUES (
      _row.regulator_id, _row.licensee_id, _row.product_id, _row.channel_id,
      'pattern', _row.severity, 'open',
      'Pattern ' || _row.reference || ': ' || _row.title,
      jsonb_build_object('cluster_id', _cluster_id, 'cluster_reference', _row.reference,
                         'pattern_type', _row.pattern_type, 'metric', _row.metric,
                         'metric_value', _row.metric_value, 'threshold_value', _row.threshold_value,
                         'rationale', btrim(_rationale)),
      'pattern_engine', 'conduct_pattern', _dedupe, _row.window_start, _row.window_end,
      _row.match_explanation, _row.rule_snapshot,
      (SELECT array_agg(m.member_id) FROM public.conduct_cluster_members m WHERE m.cluster_id = _cluster_id),
      _row.window_start, _row.window_end, _row.rule_version, _row.threshold_value)
    RETURNING id INTO _aid;
  END IF;

  UPDATE public.conduct_clusters SET raised_alert_id = _aid WHERE id = _cluster_id;
  PERFORM public.conduct_cluster_log(_cluster_id, 'ALERT_RAISED', NULL, NULL, btrim(_rationale),
    jsonb_build_object('alert_id', _aid), _uid);
  PERFORM public.log_compliance_audit('CREATE', 'conduct_alert', _aid, NULL,
    (SELECT to_jsonb(a) FROM public.conduct_alerts a WHERE a.id = _aid),
    'Conduct alert raised from pattern ' || _row.reference);
  RETURN jsonb_build_object('id', _aid, 'already_exists', false);
END; $$;

-- ------------------------------------------------------------
-- Read models
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_cluster_register(
  _statuses text[] DEFAULT NULL,
  _pattern_types text[] DEFAULT NULL,
  _severities text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _rule_id uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, reference text, title text, pattern_type text, rule_id uuid, rule_code text,
  rule_version integer, metric text, metric_value numeric, metric_unit text,
  threshold_value numeric, comparison_operator text, window_start timestamptz,
  window_end timestamptz, window_days integer, member_count integer, severity text,
  systemic_member_count integer, distinct_entity_count integer, entity_id uuid,
  entity_name text, sector_id uuid, product_name text, channel_name text,
  status text, reviewer_id uuid, reviewer_name text, reviewed_at timestamptz,
  raised_signal_id uuid, raised_alert_id uuid, match_explanation text,
  first_detected_at timestamptz, last_evaluated_at timestamptz, evaluation_count integer,
  evidence_count bigint, canonical_href text, total_count bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  RETURN QUERY
  WITH base AS (
    SELECT c.* FROM public.conduct_clusters c
     WHERE (_statuses IS NULL OR c.status = ANY (_statuses))
       AND (_pattern_types IS NULL OR c.pattern_type = ANY (_pattern_types))
       AND (_severities IS NULL OR c.severity = ANY (_severities))
       AND (_entity_id IS NULL OR c.licensee_id = _entity_id)
       AND (_rule_id IS NULL OR c.rule_id = _rule_id)
       AND (_search IS NULL OR c.reference ILIKE '%' || _search || '%'
            OR c.title ILIKE '%' || _search || '%')
       AND (public.is_super_admin(_uid)
            OR public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
                 c.regulator_id, c.sector_id, NULL, c.licensee_id, _uid))
  ), counted AS (SELECT count(*) AS n FROM base)
  SELECT b.id, b.reference, b.title, b.pattern_type, b.rule_id, b.rule_code, b.rule_version,
         b.metric, b.metric_value, b.metric_unit, b.threshold_value, b.comparison_operator,
         b.window_start, b.window_end, b.window_days, b.member_count, b.severity,
         b.systemic_member_count, b.distinct_entity_count, b.licensee_id, l.legal_name,
         b.sector_id, p.name, ch.name, b.status, b.reviewer_id, pr.full_name, b.reviewed_at,
         b.raised_signal_id, b.raised_alert_id, b.match_explanation,
         b.first_detected_at, b.last_evaluated_at, b.evaluation_count,
         (SELECT count(*) FROM public.conduct_evidence e WHERE e.cluster_id = b.id),
         '/conduct/patterns/' || b.id::text,
         (SELECT n FROM counted)
    FROM base b
    LEFT JOIN public.licensees l ON l.id = b.licensee_id
    LEFT JOIN public.conduct_products p ON p.id = b.product_id
    LEFT JOIN public.conduct_channels ch ON ch.id = b.channel_id
    LEFT JOIN public.profiles pr ON pr.id = b.reviewer_id
   ORDER BY b.last_evaluated_at DESC, b.reference DESC
   LIMIT coalesce(_limit, 50) OFFSET coalesce(_offset, 0);
END; $$;

CREATE OR REPLACE FUNCTION public.conduct_cluster_detail(_cluster_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.conduct_clusters;
BEGIN
  _uid := public.conduct_pattern_require(ARRAY['view','run_conduct_analytics','manage_complaints']);
  SELECT * INTO _row FROM public.conduct_clusters WHERE id = _cluster_id;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Pattern not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_super_admin(_uid) THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
           _row.regulator_id, _row.sector_id, NULL, _row.licensee_id, _uid) THEN
      RAISE EXCEPTION 'not_authorized: pattern out of regulatory scope' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'cluster', to_jsonb(_row) || jsonb_build_object(
      'entity_name', (SELECT l.legal_name FROM public.licensees l WHERE l.id = _row.licensee_id),
      'product_name', (SELECT p.name FROM public.conduct_products p WHERE p.id = _row.product_id),
      'channel_name', (SELECT ch.name FROM public.conduct_channels ch WHERE ch.id = _row.channel_id),
      'reviewer_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = _row.reviewer_id)),
    'rule', (SELECT to_jsonb(r) FROM public.conduct_monitoring_rules r WHERE r.id = _row.rule_id),
    'rule_version_snapshot', _row.rule_snapshot,
    'members', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.occurred_at)
                           FROM public.conduct_cluster_members m WHERE m.cluster_id = _cluster_id), '[]'::jsonb),
    'metrics', coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.evaluated_at DESC)
                           FROM public.conduct_cluster_metrics x WHERE x.cluster_id = _cluster_id), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC)
                           FROM public.conduct_cluster_history h WHERE h.cluster_id = _cluster_id), '[]'::jsonb),
    'evidence', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'title', e.title,
                                    'evidence_type', e.evidence_type, 'uploaded_at', e.uploaded_at))
                            FROM public.conduct_evidence e WHERE e.cluster_id = _cluster_id), '[]'::jsonb),
    'raised', jsonb_build_object(
      'signal', (SELECT jsonb_build_object('id', s.id, 'reference', s.reference, 'status', s.status)
                   FROM public.conduct_signals s WHERE s.id = _row.raised_signal_id),
      'alert', (SELECT jsonb_build_object('id', a.id, 'title', a.title, 'status', a.status)
                  FROM public.conduct_alerts a WHERE a.id = _row.raised_alert_id)));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_pattern_require(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conduct_cluster_log(uuid, text, text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conduct_cluster_guard(uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.conduct_cluster_next_reference() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.conduct_pattern_rule_upsert(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_pattern_detect(uuid, timestamptz, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_pattern_run_all(timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_review(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_link_evidence(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_raise_signal(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_raise_alert(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_register(text[], text[], text[], uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.conduct_cluster_detail(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.conduct_pattern_rule_upsert(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_pattern_detect(uuid, timestamptz, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_pattern_run_all(timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_review(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_link_evidence(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_raise_signal(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_raise_alert(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_register(text[], text[], text[], uuid, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.conduct_cluster_detail(uuid) TO authenticated;
