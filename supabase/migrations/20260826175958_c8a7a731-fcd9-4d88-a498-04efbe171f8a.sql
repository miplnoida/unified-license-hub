-- MC-10 — completion of the planning read models.
-- Read-only, sector-scoped, deterministic. No AI involvement anywhere here.

CREATE OR REPLACE FUNCTION public.conduct_intervention_case(_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row public.conduct_interventions; _type public.conduct_intervention_types;
        _events jsonb; _exceptions jsonb;
BEGIN
  _row := public.conduct_intervention_guard(_id, ARRAY['view','run_conduct_analytics','manage_complaints']);

  SELECT * INTO _type FROM public.conduct_intervention_types
   WHERE code = COALESCE(_row.catalogue_code, _row.intervention_type);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', e.id, 'event_type', e.event_type, 'from_status', e.from_status,
           'to_status', e.to_status, 'rationale', e.rationale, 'actor_id', e.actor_id,
           'actor_name', p.full_name, 'created_at', e.created_at) ORDER BY e.created_at DESC), '[]'::jsonb)
    INTO _events
    FROM public.conduct_intervention_events e
    LEFT JOIN public.profiles p ON p.id = e.actor_id
   WHERE e.intervention_id = _id;

  -- Deterministic control exceptions. Computed, never stored, never AI-derived.
  _exceptions := jsonb_build_object(
    'delivery_overdue', (_row.status = 'ACTIVE' AND _row.planned_end IS NOT NULL
                         AND _row.planned_end < current_date),
    'outcome_missing', (_row.status = 'COMPLETED' AND _row.outcome_result IS NULL),
    'followup_missing', (_row.outcome_result IN ('remediation_required','information_required',
                            'further_review_required','investigation_required','escalation_required',
                            'continue_monitoring')
                         AND _row.followup_due_date IS NULL AND _row.followup_completed_at IS NULL),
    'followup_overdue', (_row.followup_due_date IS NOT NULL AND _row.followup_completed_at IS NULL
                         AND _row.followup_due_date < current_date),
    'reassessment_outstanding', (_row.outcome_result IS NOT NULL AND _row.attention_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r
                       WHERE r.attention_id = _row.attention_id AND r.intervention_id = _row.id)));

  RETURN jsonb_build_object(
    'intervention', to_jsonb(_row),
    'catalogue', CASE WHEN _type.code IS NULL THEN NULL ELSE jsonb_build_object(
        'code', _type.code, 'name', _type.name, 'purpose', _type.purpose,
        'applicability', _type.applicability, 'authority_action', _type.authority_action,
        'canonical_module', _type.canonical_module, 'canonical_route', _type.canonical_route,
        'requires_canonical_record', _type.requires_canonical_record) END,
    'licensee_name', (SELECT entity_name FROM public.licensees WHERE id = _row.licensee_id),
    'sector_name', (SELECT name FROM public.sectors WHERE id = _row.sector_id),
    'emerging_risk', (SELECT jsonb_build_object('id', r.id, 'reference', r.reference, 'title', r.title,
                               'status', r.status, 'severity', r.severity)
                        FROM public.conduct_emerging_risks r WHERE r.id = _row.emerging_risk_id),
    'emerging_risk_reference', (SELECT reference FROM public.conduct_emerging_risks WHERE id = _row.emerging_risk_id),
    'attention', (SELECT jsonb_build_object('id', a.id, 'reference', a.reference, 'title', a.title,
                            'status', a.status, 'confirmed_priority', a.confirmed_priority,
                            'calculated_priority', a.calculated_priority,
                            'supervisory_basis', a.supervisory_basis,
                            'emerging_risk_id', a.emerging_risk_id,
                            'entity_ids', a.entity_ids, 'linked_evidence', a.linked_evidence)
                    FROM public.conduct_attention_items a WHERE a.id = _row.attention_id),
    'plan', (SELECT jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title,
                       'status', p.status, 'objective', p.objective, 'objective_source', p.objective_source)
               FROM public.conduct_supervisory_plans p WHERE p.id = _row.plan_id),
    'entities', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.entity_name)
                          ORDER BY l.entity_name), '[]'::jsonb)
                   FROM public.licensees l
                  WHERE l.id = _row.licensee_id
                     OR l.id = ANY(COALESCE((SELECT a.entity_ids FROM public.conduct_attention_items a
                                              WHERE a.id = _row.attention_id), '{}'))),
    'reassessments', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id,
                               'concern_state', r.concern_state, 'assessment', r.assessment,
                               'next_step', r.next_step, 'next_review_date', r.next_review_date,
                               'intervention_id', r.intervention_id,
                               'assessed_by_name', (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = r.assessed_by),
                               'assessed_at', r.assessed_at) ORDER BY r.assessed_at DESC), '[]'::jsonb)
                        FROM public.conduct_attention_reassessments r
                       WHERE r.attention_id = _row.attention_id),
    'proposed_by_name', (SELECT full_name FROM public.profiles WHERE id = _row.proposed_by),
    'decided_by_name', (SELECT full_name FROM public.profiles WHERE id = _row.decided_by),
    'outcome_recorded_by_name', (SELECT full_name FROM public.profiles WHERE id = _row.outcome_recorded_by),
    'owner_name', (SELECT full_name FROM public.profiles WHERE id = _row.owner_id),
    'exceptions', _exceptions,
    'events', _events,
    'method', 'Governed intervention case file. Control exceptions are computed from recorded dates and states.');
END $function$;

GRANT EXECUTE ON FUNCTION public.conduct_intervention_case(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.conduct_intervention_case(uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- Management / coverage view: adds the remaining governance measures.
CREATE OR REPLACE FUNCTION public.conduct_planning_coverage(_sector_id uuid DEFAULT NULL::uuid, _regulator_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _sectors uuid[]; _gaps jsonb; _overview jsonb;
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
    'plans_awaiting_approval', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference,
               'title', p.title, 'submitted_at', p.submitted_at)), '[]'::jsonb)
        FROM pl p WHERE p.status = 'SUBMITTED'),
    'approved_plan_without_intervention', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title)), '[]'::jsonb)
        FROM pl p WHERE p.status IN ('APPROVED','ACTIVE')
          AND NOT EXISTS (SELECT 1 FROM iv i WHERE i.plan_id = p.id AND i.status <> 'REJECTED')),
    'overdue_intervention', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'title', i.title, 'planned_end', i.planned_end)), '[]'::jsonb)
        FROM iv i WHERE i.status = 'ACTIVE' AND i.planned_end IS NOT NULL AND i.planned_end < current_date),
    'completed_without_outcome', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'title', i.title)), '[]'::jsonb)
        FROM iv i WHERE i.status = 'COMPLETED' AND i.outcome_result IS NULL),
    'outstanding_followup', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'title', i.title, 'followup_due', i.followup_due_date)), '[]'::jsonb)
        FROM iv i WHERE i.followup_due_date IS NOT NULL AND i.followup_completed_at IS NULL),
    'followup_overdue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'title', i.title, 'followup_due', i.followup_due_date)), '[]'::jsonb)
        FROM iv i WHERE i.followup_due_date IS NOT NULL AND i.followup_completed_at IS NULL
          AND i.followup_due_date < current_date),
    'followup_done_awaiting_reassessment', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference,
               'title', i.title)), '[]'::jsonb)
        FROM iv i
       WHERE i.followup_completed_at IS NOT NULL AND i.attention_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM public.conduct_attention_reassessments r
                          WHERE r.attention_id = i.attention_id AND r.intervention_id = i.id)),
    'confirmed_risk_without_response', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'title', r.title)), '[]'::jsonb)
        FROM public.conduct_emerging_risks r
       WHERE r.status = 'CONFIRMED' AND (_sectors IS NULL OR r.sector_id = ANY(_sectors))
         AND NOT EXISTS (SELECT 1 FROM att a WHERE a.emerging_risk_id = r.id AND a.status <> 'CLOSED')),
    'reassessment_overdue', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'reference', a.reference,
               'title', a.title, 'target_review_date', a.target_review_date)), '[]'::jsonb)
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
    'attention_open', (SELECT count(*) FROM public.conduct_attention_items a
                        WHERE a.status <> 'CLOSED' AND (_sectors IS NULL OR a.sector_id = ANY(_sectors))),
    'plans_awaiting_approval', (SELECT count(*) FROM public.conduct_supervisory_plans p
                        WHERE p.status = 'SUBMITTED' AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'active_plans', (SELECT count(*) FROM public.conduct_supervisory_plans p
                      WHERE p.status = 'ACTIVE' AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'active_interventions', (SELECT count(*) FROM public.conduct_interventions i
                      WHERE i.status = 'ACTIVE' AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'completed_interventions', (SELECT count(*) FROM public.conduct_interventions i
                      WHERE i.status = 'COMPLETED' AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'entities_covered', (SELECT count(DISTINCT i.licensee_id) FROM public.conduct_interventions i
                      WHERE i.licensee_id IS NOT NULL AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'sectors_covered', (SELECT count(DISTINCT p.sector_id) FROM public.conduct_supervisory_plans p
                      WHERE p.sector_id IS NOT NULL AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'upcoming_milestones', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('plan_id', m.plan_id, 'plan_reference', p.reference,
               'title', m.title, 'due_date', m.due_date) ORDER BY m.due_date), '[]'::jsonb)
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
END $function$;

GRANT EXECUTE ON FUNCTION public.conduct_planning_coverage(uuid, uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.conduct_planning_coverage(uuid, uuid) FROM anon;

-- ---------------------------------------------------------------------------
-- Entity planning links — restrained drill-through for an entity profile.
CREATE OR REPLACE FUNCTION public.conduct_entity_planning_links(_licensee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid; _sectors uuid[]; _att jsonb; _risk_ids uuid[];
BEGIN
  _uid := public.market_conduct_require(ARRAY['view']);
  _sectors := public.conduct_planning_scope(_uid, NULL, NULL);
  IF _licensee_id IS NULL THEN
    RAISE EXCEPTION 'An entity is required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', a.id, 'reference', a.reference, 'title', a.title,
           'status', a.status, 'confirmed_priority', a.confirmed_priority,
           'calculated_priority', a.calculated_priority, 'target_review_date', a.target_review_date)
           ORDER BY a.created_at DESC), '[]'::jsonb),
         COALESCE(array_agg(DISTINCT a.emerging_risk_id) FILTER (WHERE a.emerging_risk_id IS NOT NULL), '{}')
    INTO _att, _risk_ids
    FROM public.conduct_attention_items a
   WHERE _licensee_id = ANY(COALESCE(a.entity_ids, '{}'))
     AND a.status <> 'CLOSED'
     AND (_sectors IS NULL OR a.sector_id = ANY(_sectors));

  RETURN jsonb_build_object(
    'attention_items', _att,
    'plans', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'reference', p.reference, 'title', p.title,
               'status', p.status, 'target_completion', p.target_completion) ORDER BY p.created_at DESC), '[]'::jsonb)
        FROM public.conduct_supervisory_plans p
       WHERE p.status IN ('DRAFT','SUBMITTED','APPROVED','ACTIVE')
         AND (_licensee_id = ANY(COALESCE(p.entity_ids, '{}'))
              OR p.attention_id IN (SELECT a.id FROM public.conduct_attention_items a
                                     WHERE _licensee_id = ANY(COALESCE(a.entity_ids, '{}'))))
         AND (_sectors IS NULL OR p.sector_id = ANY(_sectors))),
    'interventions', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'reference', i.reference, 'title', i.title,
               'catalogue_code', i.catalogue_code, 'status', i.status, 'outcome_result', i.outcome_result,
               'planned_end', i.planned_end, 'followup_due_date', i.followup_due_date,
               'followup_completed_at', i.followup_completed_at) ORDER BY i.created_at DESC), '[]'::jsonb)
        FROM public.conduct_interventions i
       WHERE i.licensee_id = _licensee_id
         AND i.status IN ('PROPOSED','ENDORSED','ACTIVE','COMPLETED')
         AND (_sectors IS NULL OR i.sector_id = ANY(_sectors))),
    'emerging_risks', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'reference', r.reference, 'title', r.title,
               'status', r.status, 'severity', r.severity) ORDER BY r.created_at DESC), '[]'::jsonb)
        FROM public.conduct_emerging_risks r
       WHERE r.id = ANY(_risk_ids) AND (_sectors IS NULL OR r.sector_id = ANY(_sectors))),
    'method', 'Governed drill-through of recorded supervisory planning records involving this entity.');
END $function$;

GRANT EXECUTE ON FUNCTION public.conduct_entity_planning_links(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.conduct_entity_planning_links(uuid) FROM anon;