-- EPR-01 / P07: canonical Returns truth for Prudential supervision.
-- All read models are SECURITY INVOKER (RLS-scoped) and aggregate server-side.
-- Detection mathematics (A2) are untouched: these functions only READ
-- v_prudential_current_breaches / return_threshold_breaches.

CREATE OR REPLACE FUNCTION public.prudential_entity_universe(
  _sector_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _search text DEFAULT NULL
)
RETURNS TABLE (
  entity_id uuid,
  entity_name text,
  status text,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  license_id text,
  assigned_supervisor_id uuid,
  systemic_importance text,
  latest_filing_id uuid,
  latest_filing_reference text,
  latest_period_label text,
  latest_period_end date,
  latest_filing_status text,
  latest_submitted_at timestamptz,
  latest_accepted_filing_id uuid,
  latest_accepted_period_end date,
  breach_count bigint,
  worst_breach text,
  open_ewi bigint,
  open_actions bigint,
  overdue_actions bigint,
  open_escalations bigint,
  stress_open bigint,
  latest_rating text,
  latest_rating_status text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH ent AS (
    SELECT l.id, l.name, l.status, l.sector_id, l.sub_sector_id, l.category_id,
           l.license_id, l.assigned_supervisor_id, l.systemic_importance
      FROM public.licensees l
     WHERE (_sector_id IS NULL OR l.sector_id = _sector_id)
       AND (_status IS NULL OR l.status = _status)
       AND (_search IS NULL OR l.name ILIKE '%' || _search || '%')
  ),
  latest AS (
    SELECT DISTINCT ON (w.entity_id)
           w.entity_id, w.filing_id, w.filing_reference, w.period_label,
           w.period_end, w.status, w.submitted_at
      FROM public.v_return_filing_workflow_state w
      JOIN ent ON ent.id = w.entity_id
     WHERE w.status <> 'WITHDRAWN'
     ORDER BY w.entity_id, w.period_end DESC NULLS LAST, w.updated_at DESC NULLS LAST
  ),
  latest_accepted AS (
    SELECT DISTINCT ON (w.entity_id) w.entity_id, w.filing_id, w.period_end
      FROM public.v_return_filing_workflow_state w
      JOIN ent ON ent.id = w.entity_id
     WHERE w.status = 'ACCEPTED'
     ORDER BY w.entity_id, w.period_end DESC NULLS LAST
  ),
  breach AS (
    SELECT b.entity_id,
           count(*) AS breach_count,
           min(CASE lower(coalesce(b.risk_level, b.level, ''))
                 WHEN 'red' THEN 1 WHEN 'breach' THEN 1 WHEN 'critical' THEN 1 WHEN 'high' THEN 1
                 WHEN 'amber' THEN 2 WHEN 'warn' THEN 2 WHEN 'warning' THEN 2 WHEN 'medium' THEN 2
                 ELSE 3 END) AS worst_rank
      FROM public.v_prudential_current_breaches b
      JOIN ent ON ent.id = b.entity_id
     GROUP BY b.entity_id
  ),
  ewi AS (
    SELECT a.entity_id, count(*) AS open_ewi
      FROM public.prudential_ewi_alerts a
      JOIN ent ON ent.id = a.entity_id
     WHERE a.status = 'open'
     GROUP BY a.entity_id
  ),
  acts AS (
    SELECT a.entity_id,
           count(*) FILTER (WHERE a.status IN ('open','in_progress','overdue')) AS open_actions,
           count(*) FILTER (WHERE a.status = 'overdue') AS overdue_actions
      FROM public.prudential_actions a
      JOIN ent ON ent.id = a.entity_id
     GROUP BY a.entity_id
  ),
  esc AS (
    SELECT e.entity_id, count(*) AS open_escalations
      FROM public.prudential_escalations e
      JOIN ent ON ent.id = e.entity_id
     WHERE e.status IN ('open','under_review')
     GROUP BY e.entity_id
  ),
  stress AS (
    SELECT s.entity_id, count(*) AS stress_open
      FROM public.prudential_stress_events s
      JOIN ent ON ent.id = s.entity_id
     WHERE s.resolved_at IS NULL
     GROUP BY s.entity_id
  ),
  rated AS (
    SELECT DISTINCT ON (a.entity_id) a.entity_id, a.overall_rating, a.status
      FROM public.prudential_assessments a
      JOIN ent ON ent.id = a.entity_id
     WHERE a.status IN ('submitted','reviewed','approved','closed')
     ORDER BY a.entity_id,
              CASE WHEN a.status IN ('approved','closed') THEN 0 ELSE 1 END,
              coalesce(a.approved_at, a.reviewed_at, a.submitted_at, a.created_at) DESC
  )
  SELECT ent.id, ent.name, ent.status, ent.sector_id, ent.sub_sector_id, ent.category_id,
         ent.license_id, ent.assigned_supervisor_id, ent.systemic_importance,
         latest.filing_id, latest.filing_reference, latest.period_label, latest.period_end,
         latest.status, latest.submitted_at,
         latest_accepted.filing_id, latest_accepted.period_end,
         COALESCE(breach.breach_count, 0),
         CASE breach.worst_rank WHEN 1 THEN 'red' WHEN 2 THEN 'amber' WHEN 3 THEN 'green' ELSE NULL END,
         COALESCE(ewi.open_ewi, 0),
         COALESCE(acts.open_actions, 0),
         COALESCE(acts.overdue_actions, 0),
         COALESCE(esc.open_escalations, 0),
         COALESCE(stress.stress_open, 0),
         rated.overall_rating, rated.status
    FROM ent
    LEFT JOIN latest ON latest.entity_id = ent.id
    LEFT JOIN latest_accepted ON latest_accepted.entity_id = ent.id
    LEFT JOIN breach ON breach.entity_id = ent.id
    LEFT JOIN ewi ON ewi.entity_id = ent.id
    LEFT JOIN acts ON acts.entity_id = ent.id
    LEFT JOIN esc ON esc.entity_id = ent.id
    LEFT JOIN stress ON stress.entity_id = ent.id
    LEFT JOIN rated ON rated.entity_id = ent.id
   ORDER BY ent.name;
$$;

REVOKE ALL ON FUNCTION public.prudential_entity_universe(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_entity_universe(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_entity_returns_profile(_entity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH filings AS (
    SELECT w.*
      FROM public.v_return_filing_workflow_state w
     WHERE w.entity_id = _entity_id
  ),
  metrics AS (
    SELECT f.filing_id,
           COALESCE(f.accepted_version_id, f.current_version_id) AS version_id,
           f.reporting_period_id, f.period_label, f.period_end, f.status AS filing_status,
           m.id AS regulatory_metric_id, m.code, m.name, m.unit,
           mv.value_numeric, mv.availability, mv.source_kind, mv.recorded_at, mv.calculated_at
      FROM filings f
      JOIN public.return_metric_values mv
        ON mv.return_filing_version_id = COALESCE(f.accepted_version_id, f.current_version_id)
      JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
     WHERE f.status <> 'WITHDRAWN'
       AND mv.value_numeric IS NOT NULL
  )
  SELECT jsonb_build_object(
    'filings', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'filing_id', f.filing_id,
        'filing_reference', f.filing_reference,
        'definition_name', f.definition_name,
        'reporting_period_id', f.reporting_period_id,
        'period_label', f.period_label,
        'period_start', f.period_start,
        'period_end', f.period_end,
        'due_date', f.due_date,
        'status', f.status,
        'status_label', f.status_label,
        'submitted_at', f.submitted_at,
        'accepted_at', f.accepted_at,
        'current_version_id', f.current_version_id,
        'current_version_number', f.current_version_number,
        'accepted_version_id', f.accepted_version_id,
        'is_overdue', f.is_overdue,
        'days_late', f.days_late
      ) ORDER BY f.period_end DESC NULLS LAST), '[]'::jsonb)
      FROM filings f
    ),
    'metrics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'filing_id', x.filing_id,
        'return_filing_version_id', x.version_id,
        'reporting_period_id', x.reporting_period_id,
        'period_label', x.period_label,
        'period_end', x.period_end,
        'filing_status', x.filing_status,
        'regulatory_metric_id', x.regulatory_metric_id,
        'metric_code', x.code,
        'metric_name', x.name,
        'unit', x.unit,
        'value_numeric', x.value_numeric,
        'availability', x.availability,
        'source_kind', x.source_kind,
        'recorded_at', COALESCE(x.calculated_at, x.recorded_at)
      ) ORDER BY x.period_end DESC NULLS LAST, x.code), '[]'::jsonb)
      FROM metrics x
    ),
    'current_breaches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'entity_id', b.entity_id,
        'return_filing_id', b.return_filing_id,
        'return_filing_version_id', b.return_filing_version_id,
        'reporting_period_id', b.reporting_period_id,
        'regulatory_metric_id', b.regulatory_metric_id,
        'detection_run_id', b.detection_run_id,
        'metric_key', b.metric_key,
        'level', b.level,
        'risk_level', b.risk_level,
        'value', b.value,
        'threshold_value', b.threshold_value,
        'comparator', b.comparator,
        'detected_at', b.detected_at,
        'period_label', b.period_label,
        'period_end', b.period_end,
        'filing_reference', b.filing_reference,
        'filing_status', b.filing_status,
        'acknowledged_at', COALESCE(b.acknowledged_at_ts, b.acknowledged_at),
        'acknowledged_by', COALESCE(b.acknowledged_by_user, b.acknowledged_by),
        'escalated_enforcement_id', b.escalated_enforcement_id
      ) ORDER BY b.detected_at DESC), '[]'::jsonb)
      FROM public.v_prudential_current_breaches b
     WHERE b.entity_id = _entity_id
    ),
    'breach_history', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'return_filing_id', b.return_filing_id,
        'return_filing_version_id', b.return_filing_version_id,
        'reporting_period_id', b.reporting_period_id,
        'detection_run_id', b.detection_run_id,
        'metric_key', b.metric_key,
        'level', b.level,
        'risk_level', b.risk_level,
        'value', b.value,
        'threshold_value', b.threshold_value,
        'comparator', b.comparator,
        'detected_at', b.detected_at
      ) ORDER BY b.detected_at DESC), '[]'::jsonb)
      FROM public.return_threshold_breaches b
     WHERE b.entity_id = _entity_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.prudential_entity_returns_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_entity_returns_profile(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_filing_metric_facts(_return_filing_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  WITH f AS (
    SELECT w.* FROM public.v_return_filing_workflow_state w WHERE w.filing_id = _return_filing_id
  )
  SELECT jsonb_build_object(
    'filing', (SELECT to_jsonb(f) FROM f),
    'metrics', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'filing_id', f.filing_id,
        'return_filing_version_id', mv.return_filing_version_id,
        'reporting_period_id', mv.reporting_period_id,
        'period_label', f.period_label,
        'period_end', f.period_end,
        'regulatory_metric_id', m.id,
        'metric_code', m.code,
        'metric_name', m.name,
        'unit', m.unit,
        'value_numeric', mv.value_numeric,
        'availability', mv.availability,
        'source_kind', mv.source_kind,
        'recorded_at', COALESCE(mv.calculated_at, mv.recorded_at)
      ) ORDER BY m.code), '[]'::jsonb)
      FROM f
      JOIN public.return_metric_values mv
        ON mv.return_filing_version_id = COALESCE(f.accepted_version_id, f.current_version_id)
      JOIN public.regulatory_metrics m ON m.id = mv.regulatory_metric_id
     WHERE mv.value_numeric IS NOT NULL
    ),
    'breaches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', b.id,
        'return_filing_id', b.return_filing_id,
        'return_filing_version_id', b.return_filing_version_id,
        'reporting_period_id', b.reporting_period_id,
        'regulatory_metric_id', b.regulatory_metric_id,
        'detection_run_id', b.detection_run_id,
        'metric_key', b.metric_key,
        'level', b.level,
        'risk_level', b.risk_level,
        'value', b.value,
        'threshold_value', b.threshold_value,
        'comparator', b.comparator,
        'detected_at', b.detected_at
      ) ORDER BY b.detected_at DESC), '[]'::jsonb)
      FROM public.v_prudential_current_breaches b
     WHERE b.return_filing_id = _return_filing_id
    ),
    'stress_events', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', s.id,
        'indicator_id', s.indicator_id,
        'entity_id', s.entity_id,
        'return_filing_id', s.return_filing_id,
        'observed_value', s.observed_value,
        'triggered_at', s.triggered_at,
        'resolved_at', s.resolved_at,
        'label', i.label,
        'severity', i.severity,
        'metric_key', i.metric_key
      ) ORDER BY s.triggered_at DESC), '[]'::jsonb)
      FROM public.prudential_stress_events s
      LEFT JOIN public.prudential_stress_indicators i ON i.id = s.indicator_id
     WHERE s.return_filing_id = _return_filing_id
    )
  );
$$;

REVOKE ALL ON FUNCTION public.prudential_filing_metric_facts(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_filing_metric_facts(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prudential_group_periods(_group_id uuid)
RETURNS TABLE (period_key text, period_end date)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT DISTINCT ON (w.period_label) w.period_label, w.period_end
    FROM public.financial_group_members m
    JOIN public.v_return_filing_workflow_state w ON w.entity_id = m.licensee_id
   WHERE m.group_id = _group_id
     AND w.status <> 'WITHDRAWN'
     AND w.period_label IS NOT NULL
   ORDER BY w.period_label, w.period_end DESC;
$$;

REVOKE ALL ON FUNCTION public.prudential_group_periods(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prudential_group_periods(uuid) TO authenticated, service_role;

-- Financial-group consolidated payload moves off legacy returns_filed /
-- legacy return_id breach joins onto canonical truth. Consolidation
-- MATHEMATICS are unchanged; only Return-derived inputs become canonical.
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

  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.fired_at DESC), '[]'::jsonb) INTO v_alerts
  FROM public.group_ewi_alerts a WHERE a.group_id = _group_id AND a.status <> 'closed';

  SELECT to_jsonb(x) INTO v_method FROM public.group_consolidation_methods x
   WHERE x.group_id = _group_id AND x.is_active ORDER BY x.version DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', t.licensee_id, 'name', t.name,
      'overall_rating', t.overall_rating, 'ratings', t.ratings,
      'assessed_at', t.updated_at) ORDER BY t.name), '[]'::jsonb)
    INTO v_heatmap
  FROM (
    SELECT DISTINCT ON (m.licensee_id) m.licensee_id, l.name, a.overall_rating, a.ratings, a.updated_at
    FROM public.financial_group_members m
    JOIN public.licensees l ON l.id = m.licensee_id
    LEFT JOIN public.prudential_assessments a ON a.entity_id = m.licensee_id
    WHERE m.group_id = _group_id
    ORDER BY m.licensee_id,
             CASE WHEN a.status IN ('approved','closed') THEN 0 ELSE 1 END,
             a.updated_at DESC NULLS LAST
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', b.entity_id, 'name', l.name, 'metric_key', b.metric_key,
      'risk_level', b.risk_level, 'level', b.level, 'value', b.value,
      'threshold_value', b.threshold_value, 'comparator', b.comparator,
      'detected_at', b.detected_at,
      'return_filing_id', b.return_filing_id,
      'return_filing_version_id', b.return_filing_version_id,
      'reporting_period_id', b.reporting_period_id,
      'period', b.period_label) ORDER BY b.detected_at DESC), '[]'::jsonb)
    INTO v_breaches
  FROM public.financial_group_members m
  JOIN public.licensees l ON l.id = m.licensee_id
  JOIN public.v_prudential_current_breaches b ON b.entity_id = m.licensee_id
  WHERE m.group_id = _group_id
    AND (v_period IS NULL OR b.period_label = v_period);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'licensee_id', w.entity_id, 'name', l.name,
      'return_filing_id', w.filing_id, 'filing_reference', w.filing_reference,
      'return_filing_version_id', COALESCE(w.accepted_version_id, w.current_version_id),
      'reporting_period_id', w.reporting_period_id,
      'period', w.period_label, 'period_end', w.period_end,
      'filing_status', w.status,
      'metric_code', rm.code, 'metric_name', rm.name, 'unit', rm.unit,
      'value', mv.value_numeric) ORDER BY l.name, rm.code), '[]'::jsonb)
    INTO v_member_metrics
  FROM public.financial_group_members m
  JOIN public.licensees l ON l.id = m.licensee_id
  JOIN public.v_return_filing_workflow_state w ON w.entity_id = m.licensee_id
  JOIN public.return_metric_values mv
    ON mv.return_filing_version_id = COALESCE(w.accepted_version_id, w.current_version_id)
  JOIN public.regulatory_metrics rm ON rm.id = mv.regulatory_metric_id
  WHERE m.group_id = _group_id
    AND w.status <> 'WITHDRAWN'
    AND mv.value_numeric IS NOT NULL
    AND (v_period IS NULL OR w.period_label = v_period);

  RETURN jsonb_build_object(
    'group', v_group,
    'period_key', v_period,
    'members', v_members,
    'methodology', v_method,
    'snapshot', v_snapshot,
    'score', v_score,
    'alerts', v_alerts,
    'heatmap', v_heatmap,
    'breaches', v_breaches,
    'member_metrics', v_member_metrics,
    'matrix', public.intragroup_exposure_matrix(_group_id, v_period)
  );
END;
$function$;