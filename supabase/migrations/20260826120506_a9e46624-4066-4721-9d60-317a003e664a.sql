-- MC-06 defect fix: conduct_alerts.kind/generated_by only accept the canonical
-- allow-lists; pattern escalation must use 'thematic_spike' / 'thematic_sweep'.
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
      'thematic_spike', _row.severity, 'open',
      'Pattern ' || _row.reference || ': ' || _row.title,
      jsonb_build_object('cluster_id', _cluster_id, 'cluster_reference', _row.reference,
                         'pattern_type', _row.pattern_type, 'metric', _row.metric,
                         'metric_value', _row.metric_value, 'threshold_value', _row.threshold_value,
                         'origin', 'conduct_pattern',
                         'rationale', btrim(_rationale)),
      'thematic_sweep', 'conduct_pattern', _dedupe, _row.window_start, _row.window_end,
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