-- MC-06 defect fix: licensees has no legal_name column; use licensees.name.
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
         b.systemic_member_count, b.distinct_entity_count, b.licensee_id, l.name,
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
      'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = _row.licensee_id),
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