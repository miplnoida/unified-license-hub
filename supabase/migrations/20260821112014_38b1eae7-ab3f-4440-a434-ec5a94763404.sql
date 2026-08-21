-- ============================================================
-- EPR-03 — Enforcement read models
-- ============================================================

CREATE OR REPLACE VIEW public.v_enforcement_case_state
WITH (security_invoker = true) AS
WITH stage_entry AS (
  SELECT ea.id AS case_id,
         coalesce(max(ev.created_at), ea.referred_at, ea.created_at) AS entered_stage_at,
         max(ev2.created_at) AS last_activity_at
    FROM enforcement_actions ea
    LEFT JOIN enforcement_case_events ev
           ON ev.case_id = ea.id AND ev.detail->>'to_stage' = ea.stage
    LEFT JOIN enforcement_case_events ev2 ON ev2.case_id = ea.id
   GROUP BY ea.id, ea.referred_at, ea.created_at
)
SELECT
  ea.id,
  ea.case_number,
  ea.entity_id,
  l.name                              AS entity_name,
  ea.enforcement_type,
  ea.stage,
  s.label                             AS stage_label,
  s.seq                               AS stage_seq,
  s.is_terminal,
  ea.status,
  ea.severity,
  ea.source_kind,
  ea.source_id,
  ea.source_reference,
  ea.referred_by,
  ea.referred_at,
  ea.referral_reason,
  ea.legal_basis,
  ea.findings,
  ea.assigned_to,
  ea.assigned_team,
  coalesce(pa.full_name, pa.email)    AS assigned_to_name,
  coalesce(pr.full_name, pr.email)    AS referred_by_name,
  ea.notice_issued_at,
  ea.notice_reference,
  ea.representation_deadline,
  ea.decision_at,
  ea.decision_outcome,
  ea.sanction_type,
  ea.sanction_imposed_at,
  ea.penalty_amount,
  ea.penalty_currency,
  ea.penalty_paid_amount,
  ea.penalty_waived_amount,
  ea.appeal_deadline,
  ea.monitoring_state,
  ea.non_compliance_flag,
  ea.closed_at,
  ea.closure_rationale,
  ea.withdrawn_at,
  ea.created_at,
  ea.updated_at,
  se.entered_stage_at,
  coalesce(se.last_activity_at, ea.updated_at, ea.created_at) AS last_activity_at,
  CASE WHEN s.is_terminal OR s.sla_days = 0 THEN NULL
       ELSE se.entered_stage_at + (s.sla_days || ' days')::interval END AS sla_due_at,
  CASE
    WHEN s.is_terminal OR s.sla_days = 0 THEN 'paused'
    WHEN now() > se.entered_stage_at + (s.sla_days || ' days')::interval THEN 'breached'
    WHEN now() > se.entered_stage_at + ((s.sla_days - s.due_soon_days) || ' days')::interval THEN 'due_soon'
    ELSE 'on_track' END AS sla_state,
  s.waiting_on,
  CASE
    WHEN ea.severity = 'critical' THEN 'critical'
    WHEN ea.severity = 'high' THEN 'high'
    WHEN coalesce(ea.penalty_amount,0) > 0 AND ea.stage = 'REMEDIATION_MONITORING' THEN 'high'
    ELSE coalesce(ea.severity, 'medium') END AS priority,
  (SELECT count(*) FROM enforcement_obligations o
    WHERE o.case_id = ea.id AND o.status NOT IN ('completed','waived','closed')) AS open_obligations,
  (SELECT count(*) FROM enforcement_appeals ap WHERE ap.case_id = ea.id AND ap.status = 'lodged') AS open_appeals,
  (SELECT count(*) FROM enforcement_representations rp WHERE rp.case_id = ea.id) AS representation_count
FROM enforcement_actions ea
JOIN stage_entry se ON se.case_id = ea.id
LEFT JOIN enforcement_workflow_stages s ON s.version = 1 AND s.stage = ea.stage
LEFT JOIN licensees l ON l.id = ea.entity_id
LEFT JOIN profiles pa ON pa.id = ea.assigned_to
LEFT JOIN profiles pr ON pr.id = ea.referred_by;

GRANT SELECT ON public.v_enforcement_case_state TO authenticated;

-- ---------- source href resolution (display only, never authoritative)
CREATE OR REPLACE FUNCTION public.enforcement_source_href(_kind text, _id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE _kind
    WHEN 'COMPLAINT' THEN '/complaints/' || _id
    WHEN 'CONDUCT_INVESTIGATION' THEN '/conduct/investigations/' || _id
    WHEN 'THEMATIC_FINDING' THEN '/supervision/thematic-reviews'
    WHEN 'PRUDENTIAL_BREACH' THEN '/supervision/breaches'
    WHEN 'PRUDENTIAL_ACTION' THEN '/prudential/actions'
    WHEN 'EXAMINATION_FINDING' THEN '/prudential/examinations'
    WHEN 'LICENSING_VIOLATION' THEN '/applications/' || _id
    WHEN 'FP_MATTER' THEN '/fpa/assessments/' || _id
    ELSE NULL END;
$$;

-- ---------- blockers for the current stage (server owned)
CREATE OR REPLACE FUNCTION public.enforcement_case_blockers(_case_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(b), '[]'::jsonb) FROM (
    SELECT jsonb_build_object('code','ASSESSMENT_FINDINGS','label','Record the assessment findings') AS b
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage = 'ASSESSMENT' AND c.findings IS NULL
    UNION ALL
    SELECT jsonb_build_object('code','LEGAL_BASIS','label','Record the legal basis for enforcement')
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage IN ('ASSESSMENT','NOTICE') AND c.legal_basis IS NULL
    UNION ALL
    SELECT jsonb_build_object('code','NO_DECISION','label','An enforcement decision must be recorded before a sanction')
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage = 'SANCTION' AND c.decision_at IS NULL
    UNION ALL
    SELECT jsonb_build_object('code','OPEN_OBLIGATIONS',
             'label', c.open_obligations || ' compliance obligation(s) remain open')
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage = 'REMEDIATION_MONITORING' AND c.open_obligations > 0
    UNION ALL
    SELECT jsonb_build_object('code','PENALTY_UNSETTLED','label','The monetary penalty is not fully settled or waived')
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage = 'REMEDIATION_MONITORING'
       AND coalesce(c.penalty_amount,0) > coalesce(c.penalty_paid_amount,0) + coalesce(c.penalty_waived_amount,0)
    UNION ALL
    SELECT jsonb_build_object('code','OPEN_APPEAL','label','An appeal is pending decision')
      FROM v_enforcement_case_state c WHERE c.id = _case_id AND c.stage = 'APPEAL' AND c.open_appeals > 0
  ) x;
$$;

-- ---------- work queue
CREATE OR REPLACE FUNCTION public.enforcement_work_queue(
  _stages text[] DEFAULT NULL,
  _source_kinds text[] DEFAULT NULL,
  _sla_states text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _sort text DEFAULT 'sla',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
) RETURNS TABLE (
  case_id uuid, case_number text, entity_id uuid, entity_name text, enforcement_type text,
  stage text, stage_label text, status text, source_kind text, source_reference text, source_href text,
  priority text, severity text, assigned_to uuid, assigned_to_name text, assigned_team text,
  sla_due_at timestamptz, sla_state text, waiting_on text, next_action_code text, next_action_label text,
  blockers jsonb, penalty_amount numeric, penalty_currency text, open_obligations bigint,
  last_activity_at timestamptz, canonical_href text, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH scoped AS (
    SELECT c.* FROM v_enforcement_case_state c
     WHERE (_include_closed OR NOT coalesce(c.is_terminal, false))
       AND (_stages IS NULL OR c.stage = ANY(_stages))
       AND (_source_kinds IS NULL OR c.source_kind = ANY(_source_kinds))
       AND (_sla_states IS NULL OR c.sla_state = ANY(_sla_states))
       AND (_entity_id IS NULL OR c.entity_id = _entity_id)
       AND (_assigned_to IS NULL OR c.assigned_to = _assigned_to)
       AND (_search IS NULL OR btrim(_search) = '' OR
            c.case_number ILIKE '%' || btrim(_search) || '%' OR
            coalesce(c.entity_name,'') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(c.source_reference,'') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, s.case_number, s.entity_id, s.entity_name, s.enforcement_type,
         s.stage, s.stage_label, s.status, s.source_kind, s.source_reference,
         public.enforcement_source_href(s.source_kind, s.source_id),
         s.priority, s.severity, s.assigned_to, s.assigned_to_name, s.assigned_team,
         s.sla_due_at, s.sla_state, s.waiting_on,
         t.action_code, t.label,
         public.enforcement_case_blockers(s.id),
         s.penalty_amount, s.penalty_currency, s.open_obligations,
         s.last_activity_at, '/enforcement/' || s.id, counted.n
    FROM scoped s
    CROSS JOIN counted
    LEFT JOIN LATERAL (
      SELECT wt.action_code, wt.label FROM enforcement_workflow_transitions wt
       WHERE wt.version = 1 AND wt.is_active AND wt.from_stage = s.stage AND wt.to_stage <> wt.from_stage
         AND wt.to_stage <> 'WITHDRAWN'
       ORDER BY wt.seq LIMIT 1
    ) t ON true
   ORDER BY
     CASE WHEN _sort = 'sla' THEN
       CASE s.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'priority' THEN
       CASE s.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'stage' THEN s.stage_seq ELSE NULL END NULLS LAST,
     s.sla_due_at NULLS LAST, s.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit,50), 200)) OFFSET greatest(0, coalesce(_offset,0));
$$;

-- ---------- queue KPI counts (same scoping source)
CREATE OR REPLACE FUNCTION public.enforcement_work_queue_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_open', count(*) FILTER (WHERE NOT coalesce(is_terminal,false)),
    'breached', count(*) FILTER (WHERE sla_state = 'breached' AND NOT coalesce(is_terminal,false)),
    'due_soon', count(*) FILTER (WHERE sla_state = 'due_soon' AND NOT coalesce(is_terminal,false)),
    'unassigned', count(*) FILTER (WHERE assigned_to IS NULL AND NOT coalesce(is_terminal,false)),
    'awaiting_entity', count(*) FILTER (WHERE waiting_on = 'entity' AND NOT coalesce(is_terminal,false)),
    'closed', count(*) FILTER (WHERE coalesce(is_terminal,false)),
    'by_stage', coalesce((SELECT jsonb_object_agg(stage, n) FROM (
        SELECT stage, count(*) n FROM v_enforcement_case_state
         WHERE NOT coalesce(is_terminal,false) GROUP BY stage) q), '{}'::jsonb),
    'by_source', coalesce((SELECT jsonb_object_agg(coalesce(source_kind,'UNKNOWN'), n) FROM (
        SELECT source_kind, count(*) n FROM v_enforcement_case_state
         WHERE NOT coalesce(is_terminal,false) GROUP BY source_kind) q), '{}'::jsonb),
    'penalty_outstanding', coalesce(sum(greatest(coalesce(penalty_amount,0)
        - coalesce(penalty_paid_amount,0) - coalesce(penalty_waived_amount,0), 0))
        FILTER (WHERE NOT coalesce(is_terminal,false)), 0)
  ) FROM v_enforcement_case_state;
$$;

-- ---------- authoritative case read model for the workspace
CREATE OR REPLACE FUNCTION public.enforcement_case(_case_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'case', to_jsonb(c) - 'id' || jsonb_build_object('id', c.id,
              'canonical_href', '/enforcement/' || c.id,
              'entity_href', CASE WHEN c.entity_id IS NOT NULL THEN '/entities/' || c.entity_id END,
              'source_href', public.enforcement_source_href(c.source_kind, c.source_id)),
    'blockers', public.enforcement_case_blockers(c.id),
    'stage_model', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                       'stage', s.stage, 'label', s.label, 'seq', s.seq,
                       'is_terminal', s.is_terminal, 'description', s.description,
                       'waiting_on', s.waiting_on, 'sla_days', s.sla_days)
                     ORDER BY s.seq), '[]'::jsonb)
                    FROM enforcement_workflow_stages s WHERE s.version = 1 AND s.is_active),
    'available_actions', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                             'action_code', t.action_code, 'label', t.label,
                             'to_stage', t.to_stage, 'description', t.description,
                             'permission_action', t.permission_action,
                             'requires_rationale', t.requires_rationale,
                             'min_rationale_length', t.min_rationale_length,
                             'requires_evidence', t.requires_evidence,
                             'requires_maker_checker', t.requires_maker_checker,
                             'advances_stage', t.to_stage <> t.from_stage,
                             'permitted', public.has_permission(auth.uid(), 'enforcement_management', t.permission_action))
                           ORDER BY t.seq), '[]'::jsonb)
                          FROM enforcement_workflow_transitions t
                         WHERE t.version = 1 AND t.is_active AND t.from_stage = c.stage),
    'obligations', (SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY o.created_at), '[]'::jsonb)
                     FROM enforcement_obligations o WHERE o.case_id = c.id),
    'representations', (SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.received_at DESC), '[]'::jsonb)
                     FROM enforcement_representations r WHERE r.case_id = c.id),
    'appeals', (SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.lodged_at DESC), '[]'::jsonb)
                     FROM enforcement_appeals a WHERE a.case_id = c.id),
    'payments', (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.paid_on DESC), '[]'::jsonb)
                     FROM enforcement_penalty_payments p WHERE p.case_id = c.id),
    'timeline', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                     'id', e.id, 'event_type', e.event_type, 'actor_id', e.actor_id,
                     'actor_name', coalesce(pf.full_name, pf.email), 'note', e.note,
                     'detail', e.detail, 'created_at', e.created_at)
                   ORDER BY e.created_at DESC), '[]'::jsonb)
                  FROM enforcement_case_events e LEFT JOIN profiles pf ON pf.id = e.actor_id
                 WHERE e.case_id = c.id)
  )
  FROM v_enforcement_case_state c WHERE c.id = _case_id;
$$;

-- ---------- Entity 360 enforcement summary
CREATE OR REPLACE FUNCTION public.enforcement_entity_summary(_entity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'open_cases', count(*) FILTER (WHERE NOT coalesce(is_terminal,false)),
    'closed_cases', count(*) FILTER (WHERE coalesce(is_terminal,false)),
    'breached_sla', count(*) FILTER (WHERE sla_state = 'breached' AND NOT coalesce(is_terminal,false)),
    'penalty_imposed', coalesce(sum(coalesce(penalty_amount,0)), 0),
    'penalty_outstanding', coalesce(sum(greatest(coalesce(penalty_amount,0)
        - coalesce(penalty_paid_amount,0) - coalesce(penalty_waived_amount,0), 0)), 0),
    'open_obligations', coalesce(sum(open_obligations) FILTER (WHERE NOT coalesce(is_terminal,false)), 0),
    'cases', coalesce(jsonb_agg(jsonb_build_object(
        'case_id', id, 'case_number', case_number, 'stage', stage, 'stage_label', stage_label,
        'status', status, 'source_kind', source_kind, 'source_reference', source_reference,
        'severity', severity, 'sla_state', sla_state, 'sla_due_at', sla_due_at,
        'penalty_amount', penalty_amount, 'penalty_currency', penalty_currency,
        'decision_outcome', decision_outcome, 'closed_at', closed_at,
        'canonical_href', '/enforcement/' || id)
      ORDER BY coalesce(is_terminal,false), stage_seq, created_at DESC), '[]'::jsonb)
  ) FROM v_enforcement_case_state WHERE entity_id = _entity_id;
$$;

REVOKE ALL ON FUNCTION public.enforcement_work_queue(text[],text[],text[],uuid,uuid,text,boolean,text,integer,integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforcement_work_queue_counts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforcement_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforcement_entity_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforcement_case_blockers(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforcement_source_href(text,uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.enforcement_work_queue(text[],text[],text[],uuid,uuid,text,boolean,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforcement_work_queue_counts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforcement_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforcement_entity_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforcement_case_blockers(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enforcement_source_href(text,uuid) TO authenticated;
