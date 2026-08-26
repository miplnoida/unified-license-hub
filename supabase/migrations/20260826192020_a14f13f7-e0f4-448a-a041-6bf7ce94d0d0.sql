CREATE OR REPLACE FUNCTION public.conduct_mi_entity_coverage(
  _period_start date DEFAULT (current_date - 90),
  _period_end   date DEFAULT current_date,
  _sector_id    uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL,
  _limit        integer DEFAULT 200
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  WITH pop AS (
    SELECT r.record_id AS entity_id, r.title AS entity_name, r.sector_id
      FROM public.conduct_mi_records('MI_ENTITIES_IN_SCOPE', _sectors, _period_start, _period_end) r
  ), att AS (
    SELECT a.* FROM public.conduct_attention_items a
     WHERE (_sectors IS NULL OR a.sector_id = ANY(_sectors))
  ), pl AS (
    SELECT p.* FROM public.conduct_supervisory_plans p
     WHERE (_sectors IS NULL OR p.sector_id = ANY(_sectors))
  ), iv AS (
    SELECT i.* FROM public.conduct_interventions i
     WHERE (_sectors IS NULL OR i.sector_id = ANY(_sectors))
  )
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'entity_name'), '[]'::jsonb) INTO _rows
    FROM (
      SELECT jsonb_build_object(
        'entity_id', pop.entity_id,
        'entity_name', pop.entity_name,
        'sector_id', pop.sector_id,
        'sector_name', (SELECT s.name FROM public.sectors s WHERE s.id = pop.sector_id),
        'open_attention', (SELECT count(*) FROM att a
                            WHERE a.status <> 'CLOSED' AND pop.entity_id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))),
        'highest_priority', (SELECT a.confirmed_priority FROM att a
                              WHERE a.status <> 'CLOSED' AND pop.entity_id = ANY(COALESCE(a.entity_ids,'{}'::uuid[]))
                              ORDER BY CASE a.confirmed_priority WHEN 'IMMEDIATE' THEN 1 WHEN 'HIGH' THEN 2
                                            WHEN 'MEDIUM' THEN 3 WHEN 'LOW' THEN 4 ELSE 5 END LIMIT 1),
        'active_plans', (SELECT count(*) FROM pl p
                          WHERE p.status IN ('APPROVED','ACTIVE') AND pop.entity_id = ANY(COALESCE(p.entity_ids,'{}'::uuid[]))),
        'active_interventions', (SELECT count(*) FROM iv i
                                  WHERE i.status IN ('ENDORSED','ACTIVE') AND i.licensee_id = pop.entity_id),
        'interventions_completed_in_period', (SELECT count(*) FROM iv i
                                  WHERE i.licensee_id = pop.entity_id AND i.completed_at IS NOT NULL
                                    AND i.completed_at >= _period_start::timestamptz
                                    AND i.completed_at < (_period_end + 1)::timestamptz),
        'outstanding_followups', (SELECT count(*) FROM iv i
                                  WHERE i.licensee_id = pop.entity_id AND i.followup_due_date IS NOT NULL
                                    AND i.followup_completed_at IS NULL),
        'coverage_state', CASE
            WHEN EXISTS (SELECT 1 FROM iv i WHERE i.licensee_id = pop.entity_id AND i.status IN ('ENDORSED','ACTIVE'))
              THEN 'INTERVENTION_IN_PROGRESS'
            WHEN EXISTS (SELECT 1 FROM pl p WHERE p.status IN ('APPROVED','ACTIVE')
                          AND pop.entity_id = ANY(COALESCE(p.entity_ids,'{}'::uuid[])))
              THEN 'PLANNED'
            WHEN EXISTS (SELECT 1 FROM att a WHERE a.status <> 'CLOSED'
                          AND pop.entity_id = ANY(COALESCE(a.entity_ids,'{}'::uuid[])))
              THEN 'ATTENTION_ONLY'
            ELSE 'NO_RECORDED_SUPERVISORY_ACTIVITY' END,
        'href', '/licensees/' || pop.entity_id::text
      ) AS x
      FROM pop
      LIMIT GREATEST(COALESCE(_limit, 200), 1)
    ) q;

  RETURN jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _period_start, _period_end),
    'basis', 'Coverage states are derived from recorded supervisory activity only. An entity with no recorded activity is not an assessed low-risk entity.',
    'entities', _rows,
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.conduct_mi_entity_coverage(date,date,uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_mi_entity_coverage(date,date,uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_mi_sector_coverage(
  _period_start date DEFAULT (current_date - 90),
  _period_end   date DEFAULT current_date,
  _sector_id    uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  WITH pop AS (
    SELECT r.record_id AS entity_id, r.sector_id
      FROM public.conduct_mi_records('MI_ENTITIES_IN_SCOPE', _sectors, _period_start, _period_end) r
  ), att AS (
    SELECT r.record_id AS entity_id, r.sector_id
      FROM public.conduct_mi_records('MI_ENTITIES_WITH_ATTENTION', _sectors, _period_start, _period_end) r
  ), plan AS (
    SELECT r.record_id AS entity_id, r.sector_id
      FROM public.conduct_mi_records('MI_ENTITIES_WITH_ACTIVE_PLAN', _sectors, _period_start, _period_end) r
  ), interv AS (
    SELECT r.record_id AS entity_id, r.sector_id
      FROM public.conduct_mi_records('MI_ENTITIES_WITH_INTERVENTION', _sectors, _period_start, _period_end) r
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'sector_id', p.sector_id,
      'sector_name', COALESCE((SELECT s.name FROM public.sectors s WHERE s.id = p.sector_id), 'Unassigned'),
      'entities_in_scope', p.n,
      'entities_with_attention', COALESCE(a.n, 0),
      'entities_with_active_plan', COALESCE(pl.n, 0),
      'entities_with_intervention', COALESCE(iv.n, 0),
      'entities_without_recorded_activity', p.n - COALESCE(a.n, 0),
      'material_for_percentages', p.n >= 5
    ) ORDER BY p.n DESC), '[]'::jsonb) INTO _rows
    FROM (SELECT sector_id, count(*) n FROM pop GROUP BY 1) p
    LEFT JOIN (SELECT sector_id, count(*) n FROM att GROUP BY 1) a ON a.sector_id IS NOT DISTINCT FROM p.sector_id
    LEFT JOIN (SELECT sector_id, count(*) n FROM plan GROUP BY 1) pl ON pl.sector_id IS NOT DISTINCT FROM p.sector_id
    LEFT JOIN (SELECT sector_id, count(*) n FROM interv GROUP BY 1) iv ON iv.sector_id IS NOT DISTINCT FROM p.sector_id;

  RETURN jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _period_start, _period_end),
    'basis', 'Counts share the MC-11 MI record set. Sectors with fewer than five entities in scope are flagged as immaterial for percentage presentation.',
    'sectors', _rows,
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.conduct_mi_sector_coverage(date,date,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_mi_sector_coverage(date,date,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_mi_risk_reporting(
  _period_start date DEFAULT (current_date - 90),
  _period_end   date DEFAULT current_date,
  _sector_id    uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'reference', e.reference,
      'title', e.title,
      'status', e.status,
      'severity', e.severity,
      'systemic_potential', e.systemic_potential,
      'sector_id', e.sector_id,
      'sector_name', (SELECT s.name FROM public.sectors s WHERE s.id = e.sector_id),
      'entity_count', e.entity_count,
      'window_start', e.window_start,
      'window_end', e.window_end,
      'attention_items', (SELECT count(*) FROM public.conduct_attention_items a WHERE a.emerging_risk_id = e.id),
      'attention_open', (SELECT count(*) FROM public.conduct_attention_items a
                          WHERE a.emerging_risk_id = e.id AND a.status <> 'CLOSED'),
      'plans', (SELECT count(*) FROM public.conduct_supervisory_plans p
                 WHERE p.emerging_risk_id = e.id AND p.status <> 'CANCELLED'),
      'interventions', (SELECT count(*) FROM public.conduct_interventions i
                         WHERE i.emerging_risk_id = e.id AND i.status <> 'REJECTED'),
      'interventions_with_outcome', (SELECT count(*) FROM public.conduct_interventions i
                         WHERE i.emerging_risk_id = e.id AND i.outcome_result IS NOT NULL),
      'reassessments', (SELECT count(*) FROM public.conduct_attention_reassessments r
                         WHERE r.emerging_risk_id = e.id),
      'chain_state', CASE
          WHEN EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r WHERE r.emerging_risk_id = e.id)
            THEN 'REASSESSED'
          WHEN EXISTS (SELECT 1 FROM public.conduct_interventions i WHERE i.emerging_risk_id = e.id AND i.outcome_result IS NOT NULL)
            THEN 'OUTCOME_RECORDED'
          WHEN EXISTS (SELECT 1 FROM public.conduct_interventions i WHERE i.emerging_risk_id = e.id AND i.status <> 'REJECTED')
            THEN 'INTERVENTION_UNDERWAY'
          WHEN EXISTS (SELECT 1 FROM public.conduct_supervisory_plans p WHERE p.emerging_risk_id = e.id AND p.status <> 'CANCELLED')
            THEN 'PLANNED'
          WHEN EXISTS (SELECT 1 FROM public.conduct_attention_items a WHERE a.emerging_risk_id = e.id)
            THEN 'ATTENTION_RECORDED'
          ELSE 'NO_SUPERVISORY_RESPONSE_RECORDED' END,
      'href', '/conduct/emerging-risks/' || e.id::text
    ) ORDER BY e.created_at DESC), '[]'::jsonb) INTO _rows
    FROM public.conduct_emerging_risks e
   WHERE (_sectors IS NULL OR e.sector_id = ANY(_sectors))
     AND e.created_at < (_period_end + 1)::timestamptz
     AND (e.closed_at IS NULL OR e.closed_at >= _period_start::timestamptz);

  RETURN jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _period_start, _period_end),
    'basis', 'Emerging risks open at any point in the reporting period, with the recorded supervisory response chain.',
    'risks', _rows,
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.conduct_mi_risk_reporting(date,date,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_mi_risk_reporting(date,date,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.conduct_mi_outcome_reporting(
  _period_start date DEFAULT (current_date - 90),
  _period_end   date DEFAULT current_date,
  _sector_id    uuid DEFAULT NULL,
  _regulator_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE _uid uuid; _sectors uuid[]; _rows jsonb;
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, _sector_id, _regulator_id);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'reference', i.reference,
      'title', i.title,
      'intervention_type', COALESCE(i.catalogue_code, i.intervention_type),
      'status', i.status,
      'entity_id', i.licensee_id,
      'entity_name', (SELECT l.name FROM public.licensees l WHERE l.id = i.licensee_id),
      'sector_id', i.sector_id,
      'planned_end', i.planned_end,
      'completed_at', i.completed_at,
      'outcome_result', i.outcome_result,
      'outcome_rationale', i.outcome_rationale,
      'outstanding_actions', i.outstanding_actions,
      'followup_due_date', i.followup_due_date,
      'followup_completed_at', i.followup_completed_at,
      'followup_state', CASE
          WHEN i.followup_due_date IS NULL THEN 'NO_FOLLOW_UP_REQUIRED'
          WHEN i.followup_completed_at IS NOT NULL THEN 'FOLLOW_UP_COMPLETED'
          WHEN i.followup_due_date < current_date THEN 'FOLLOW_UP_OVERDUE'
          ELSE 'FOLLOW_UP_DUE' END,
      'reassessed', EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r WHERE r.intervention_id = i.id),
      'outcome_state', CASE
          WHEN i.outcome_result IS NOT NULL THEN 'OUTCOME_RECORDED'
          WHEN i.status = 'COMPLETED' THEN 'COMPLETED_WITHOUT_RECORDED_OUTCOME'
          ELSE 'IN_PROGRESS' END,
      'href', '/conduct/interventions/' || i.id::text
    ) ORDER BY COALESCE(i.completed_at, i.updated_at) DESC), '[]'::jsonb) INTO _rows
    FROM public.conduct_interventions i
   WHERE (_sectors IS NULL OR i.sector_id = ANY(_sectors))
     AND i.status <> 'REJECTED'
     AND i.created_at < (_period_end + 1)::timestamptz
     AND (i.completed_at IS NULL OR i.completed_at >= _period_start::timestamptz);

  RETURN jsonb_build_object(
    'scope', public.conduct_mi_scope_header(_sectors, _period_start, _period_end),
    'basis', 'Interventions live or completed in the reporting period, with recorded outcome, outstanding actions, follow-up state and whether a reassessment exists.',
    'interventions', _rows,
    'generated_at', now()
  );
END $$;

REVOKE ALL ON FUNCTION public.conduct_mi_outcome_reporting(date,date,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.conduct_mi_outcome_reporting(date,date,uuid,uuid) TO authenticated;