CREATE OR REPLACE FUNCTION public.prudential_group_consolidated(_group_id uuid, _period_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period text;
  v_group jsonb;
  v_members jsonb;
  v_snapshot jsonb;
  v_score jsonb;
  v_alerts jsonb;
  v_heatmap jsonb;
  v_breaches jsonb;
  v_member_metrics jsonb;
  v_method jsonb;
BEGIN
  IF NOT public.can_read_financial_group(auth.uid(), _group_id) THEN
    RAISE EXCEPTION 'not authorised to view this financial group';
  END IF;

  v_period := COALESCE(_period_key,
    (SELECT w.period_label
       FROM public.financial_group_members m
       JOIN public.v_return_filing_workflow_state w ON w.entity_id = m.licensee_id
      WHERE m.group_id = _group_id
        AND w.status <> 'WITHDRAWN'
        AND w.period_label IS NOT NULL
      ORDER BY w.period_end DESC NULLS LAST LIMIT 1));

  SELECT to_jsonb(g) || jsonb_build_object('holding_entity_name', l.name)
    INTO v_group
  FROM public.financial_groups g
  LEFT JOIN public.licensees l ON l.id = g.holding_entity_id
  WHERE g.id = _group_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'member_id', m.id, 'licensee_id', m.licensee_id, 'name', l.name,
      'parent_member_id', m.parent_member_id, 'member_role', m.member_role,
      'ownership_percentage', m.ownership_percentage,
      'consolidation_treatment', m.consolidation_treatment,
      'effective_date', m.effective_date, 'end_date', m.end_date,
      'exclusion_rationale', m.exclusion_rationale,
      'ownership_variance_reason', m.ownership_variance_reason,
      'ownership_variance_note', m.ownership_variance_note,
      'notes', m.notes,
      'licensee_status', l.status, 'sector_id', l.sector_id,
      'sector_name', s.name,
      'systemic_importance', l.systemic_importance,
      'risk_score', rs.score, 'risk_band', rs.band
    ) ORDER BY CASE m.member_role WHEN 'ultimate_holding' THEN 0 ELSE 1 END, l.name), '[]'::jsonb)
    INTO v_members
  FROM public.financial_group_members m
  JOIN public.licensees l ON l.id = m.licensee_id
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  LEFT JOIN public.entity_risk_scores rs ON rs.entity_id = m.licensee_id AND rs.is_current
  WHERE m.group_id = _group_id;

  SELECT to_jsonb(x) INTO v_snapshot FROM public.group_consolidated_snapshots x
   WHERE x.group_id = _group_id AND x.period_key = v_period;

  SELECT to_jsonb(x) INTO v_score FROM public.group_risk_scores x
   WHERE x.group_id = _group_id AND x.period_key = v_period;

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb) INTO v_alerts
    FROM public.group_ewi_alerts a WHERE a.group_id = _group_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', h.licensee_id, 'name', h.name,
      'ratings', h.ratings, 'overall_rating', h.overall_rating) ORDER BY h.name), '[]'::jsonb)
    INTO v_heatmap
    FROM public.group_member_camels(_group_id) h;

  SELECT COALESCE(jsonb_agg(to_jsonb(b)), '[]'::jsonb) INTO v_breaches
    FROM public.group_member_breaches(_group_id, v_period) b;

  SELECT COALESCE(jsonb_agg(to_jsonb(r)), '[]'::jsonb) INTO v_member_metrics
    FROM public.group_member_ratios(_group_id, v_period) r;

  SELECT to_jsonb(x) INTO v_method FROM public.group_consolidation_methods x
   WHERE x.group_id = _group_id AND x.is_active ORDER BY x.version DESC LIMIT 1;

  RETURN jsonb_build_object(
    'group', v_group,
    'period_key', v_period,
    'members', v_members,
    'snapshot', v_snapshot,
    'score', v_score,
    'alerts', v_alerts,
    'heatmap', v_heatmap,
    'breaches', v_breaches,
    'member_metrics', v_member_metrics,
    'methodology', v_method,
    'matrix', public.intragroup_exposure_matrix(_group_id, v_period));
END;
$function$;