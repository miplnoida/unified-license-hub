-- MC-06 defect fix: Postgres has no max(uuid); use array_agg()[1] for uuid pickers.
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
      (array_agg(s.sector_id) FILTER (WHERE s.sector_id IS NOT NULL))[1],
      CASE WHEN _ptype IN ('entity_product_signal_recurrence','sector_product_cross_entity') THEN s.product_id ELSE NULL END,
      CASE WHEN _ptype = 'entity_channel_signal_recurrence' THEN s.channel_id ELSE NULL END,
      NULL::uuid,
      (array_agg(s.regulator_id) FILTER (WHERE s.regulator_id IS NOT NULL))[1],
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
      SELECT s.licensee_id, (array_agg(s.sector_id) FILTER (WHERE s.sector_id IS NOT NULL))[1] AS sector_id, (array_agg(s.regulator_id) FILTER (WHERE s.regulator_id IS NOT NULL))[1] AS regulator_id,
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
    SELECT c.licensee_id, (array_agg(l.sector_id) FILTER (WHERE l.sector_id IS NOT NULL))[1], (array_agg(c.product_id) FILTER (WHERE c.product_id IS NOT NULL))[1], (array_agg(c.channel_id) FILTER (WHERE c.channel_id IS NOT NULL))[1],
           c.complaint_type_id, (array_agg(c.regulator_id) FILTER (WHERE c.regulator_id IS NOT NULL))[1], NULL,
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
    SELECT c.licensee_id, (array_agg(l.sector_id) FILTER (WHERE l.sector_id IS NOT NULL))[1], NULL, NULL, NULL, (array_agg(c.regulator_id) FILTER (WHERE c.regulator_id IS NOT NULL))[1],
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