-- EPR-01 P06 Returns canonical convergence: workflow guidance, assignment, enterprise queue.

ALTER TABLE public.return_definitions
  ADD COLUMN IF NOT EXISTS review_sla_days integer NOT NULL DEFAULT 10;

ALTER TABLE public.return_filings
  ADD COLUMN IF NOT EXISTS assigned_team text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS assigned_by uuid;

-- Single derivation source for Returns workflow semantics. Not client readable;
-- consumed only by SECURITY DEFINER read models below.
CREATE OR REPLACE VIEW public.v_return_filing_workflow_state AS
WITH base AS (
  SELECT
    f.id                        AS filing_id,
    f.filing_reference,
    f.entity_id,
    l.name                      AS entity_name,
    f.return_definition_id,
    d.code                      AS definition_code,
    d.name                      AS definition_name,
    COALESCE(o.frequency, d.frequency) AS frequency,
    d.review_sla_days,
    d.requires_declaration,
    f.reporting_period_id,
    p.period_label,
    p.period_start,
    p.period_end,
    p.due_date,
    f.status,
    f.current_version_number,
    f.accepted_version_id,
    f.submitted_at,
    f.accepted_at,
    f.rejected_at,
    f.updated_at,
    f.assigned_reviewer_id      AS owner_user_id,
    pr.full_name                AS owner_name,
    f.assigned_team             AS team,
    cv.id                       AS current_version_id,
    cv.status                   AS current_version_status,
    cv.declaration_accepted_at,
    (SELECT count(*) FROM public.return_filing_validation_results r
      WHERE r.return_filing_id = f.id AND r.is_blocking)          AS blocking_validation_count,
    (SELECT count(*) FROM public.return_filing_requests rq
      WHERE rq.return_filing_id = f.id AND rq.status = 'OPEN')    AS open_request_count,
    (SELECT count(*) FROM public.return_filing_form_requirements fr
      WHERE fr.return_filing_version_id = cv.id
        AND fr.is_required AND COALESCE(fr.completion_status,'') <> 'COMPLETED')
                                                                  AS incomplete_required_forms
  FROM public.return_filings f
  JOIN public.reporting_periods p ON p.id = f.reporting_period_id
  JOIN public.return_definitions d ON d.id = f.return_definition_id
  LEFT JOIN public.entity_reporting_obligations o ON o.id = f.entity_reporting_obligation_id
  LEFT JOIN public.licensees l ON l.id = f.entity_id
  LEFT JOIN public.profiles pr ON pr.id = f.assigned_reviewer_id
  LEFT JOIN LATERAL (
    SELECT v.id, v.status, v.declaration_accepted_at
      FROM public.return_filing_versions v
     WHERE v.return_filing_id = f.id
     ORDER BY v.version_number DESC LIMIT 1
  ) cv ON true
), staged AS (
  SELECT b.*,
    CASE b.status
      WHEN 'DRAFT' THEN 'ENTITY_PREPARATION'
      WHEN 'CORRECTION_REQUESTED' THEN 'CORRECTION'
      WHEN 'SUBMITTED' THEN 'SUBMITTED_INTAKE'
      WHEN 'UNDER_REVIEW' THEN 'REGULATOR_REVIEW'
      WHEN 'ACCEPTED' THEN 'CLOSED'
      WHEN 'REJECTED' THEN 'CLOSED'
      WHEN 'WITHDRAWN' THEN 'CLOSED'
      ELSE 'ENTITY_PREPARATION'
    END AS stage,
    CASE b.status
      WHEN 'DRAFT' THEN 'ENTITY'
      WHEN 'CORRECTION_REQUESTED' THEN 'ENTITY'
      WHEN 'SUBMITTED' THEN 'REGULATOR'
      WHEN 'UNDER_REVIEW' THEN CASE WHEN b.open_request_count > 0 THEN 'ENTITY' ELSE 'REGULATOR' END
      ELSE 'NOBODY'
    END AS waiting_on,
    (b.status NOT IN ('ACCEPTED','WITHDRAWN','REJECTED') AND b.due_date < CURRENT_DATE) AS is_overdue,
    GREATEST(0, (COALESCE(b.submitted_at::date, CURRENT_DATE) - b.due_date)) AS days_late,
    CASE
      WHEN b.status IN ('ACCEPTED','REJECTED','WITHDRAWN') THEN NULL
      WHEN b.status IN ('SUBMITTED','UNDER_REVIEW')
        THEN COALESCE(b.submitted_at, b.updated_at) + make_interval(days => COALESCE(b.review_sla_days, 10))
      ELSE (b.due_date + 1)::timestamptz
    END AS sla_due_at
  FROM base b
)
SELECT s.*,
  CASE s.stage
    WHEN 'ENTITY_PREPARATION' THEN 'Entity preparation'
    WHEN 'CORRECTION' THEN 'Correction'
    WHEN 'SUBMITTED_INTAKE' THEN 'Submitted — intake'
    WHEN 'REGULATOR_REVIEW' THEN 'Regulator review'
    WHEN 'CLOSED' THEN 'Closed'
  END AS stage_label,
  CASE s.status
    WHEN 'DRAFT' THEN 'Draft'
    WHEN 'SUBMITTED' THEN 'Submitted'
    WHEN 'UNDER_REVIEW' THEN 'Under review'
    WHEN 'CORRECTION_REQUESTED' THEN 'Correction requested'
    WHEN 'ACCEPTED' THEN 'Accepted'
    WHEN 'REJECTED' THEN 'Rejected'
    WHEN 'WITHDRAWN' THEN 'Withdrawn'
    ELSE s.status
  END AS status_label,
  CASE
    WHEN s.sla_due_at IS NULL THEN 'NOT_APPLICABLE'
    WHEN s.sla_due_at < now() THEN 'BREACHED'
    WHEN s.sla_due_at < now() + interval '3 days' THEN 'DUE_SOON'
    ELSE 'ON_TRACK'
  END AS sla_state,
  (s.blocking_validation_count
    + s.open_request_count
    + CASE WHEN s.status IN ('DRAFT','CORRECTION_REQUESTED') THEN s.incomplete_required_forms ELSE 0 END
    + CASE WHEN s.status IN ('DRAFT','CORRECTION_REQUESTED') AND s.requires_declaration
                AND s.declaration_accepted_at IS NULL THEN 1 ELSE 0 END) AS blocker_count,
  CASE
    WHEN s.status IN ('ACCEPTED','REJECTED','WITHDRAWN') THEN 'NONE'
    WHEN s.sla_due_at IS NOT NULL AND s.sla_due_at < now() THEN 'CRITICAL'
    WHEN s.is_overdue THEN 'CRITICAL'
    WHEN s.blocking_validation_count > 0 THEN 'HIGH'
    WHEN s.sla_due_at IS NOT NULL AND s.sla_due_at < now() + interval '3 days' THEN 'HIGH'
    WHEN s.open_request_count > 0 THEN 'MEDIUM'
    ELSE 'NORMAL'
  END AS priority,
  CASE
    WHEN s.status IN ('ACCEPTED','REJECTED','WITHDRAWN') THEN 'Filing closed'
    WHEN s.sla_due_at IS NOT NULL AND s.sla_due_at < now() THEN 'Service level breached'
    WHEN s.is_overdue THEN 'Past the regulatory due date'
    WHEN s.blocking_validation_count > 0 THEN 'Blocking validation findings outstanding'
    WHEN s.sla_due_at IS NOT NULL AND s.sla_due_at < now() + interval '3 days' THEN 'Service level due within three days'
    WHEN s.open_request_count > 0 THEN 'Open correction request awaiting the entity'
    ELSE 'Within service level'
  END AS priority_reason,
  GREATEST(s.updated_at, COALESCE(s.submitted_at, s.updated_at)) AS last_activity_at,
  CASE s.status
    WHEN 'SUBMITTED' THEN 'START_REVIEW'
    WHEN 'UNDER_REVIEW' THEN
      CASE WHEN s.blocking_validation_count > 0 THEN 'RESOLVE_VALIDATION'
           WHEN s.open_request_count > 0 THEN 'AWAIT_ENTITY_RESPONSE'
           ELSE 'DECIDE' END
    WHEN 'CORRECTION_REQUESTED' THEN 'AWAIT_ENTITY_CORRECTION'
    WHEN 'DRAFT' THEN 'AWAIT_ENTITY_SUBMISSION'
    ELSE 'NONE'
  END AS next_action,
  CASE s.status
    WHEN 'SUBMITTED' THEN 'Start regulatory review'
    WHEN 'UNDER_REVIEW' THEN
      CASE WHEN s.blocking_validation_count > 0 THEN 'Resolve blocking validation findings'
           WHEN s.open_request_count > 0 THEN 'Awaiting the entity''s response to a correction request'
           ELSE 'Accept or reject the filing' END
    WHEN 'CORRECTION_REQUESTED' THEN 'Awaiting corrected submission from the entity'
    WHEN 'DRAFT' THEN 'Awaiting submission by the entity'
    ELSE 'No action required'
  END AS next_action_label,
  '/returns/filings/' || s.filing_id::text AS next_action_href,
  CASE s.status
    WHEN 'SUBMITTED' THEN 'returns_management.review'
    WHEN 'UNDER_REVIEW' THEN
      CASE WHEN s.blocking_validation_count > 0 OR s.open_request_count > 0
           THEN 'returns_management.review' ELSE 'returns_management.approve' END
    ELSE NULL
  END AS next_action_permission
FROM staged s;

REVOKE ALL ON public.v_return_filing_workflow_state FROM anon, authenticated;
GRANT SELECT ON public.v_return_filing_workflow_state TO service_role;

-- Canonical scope predicate for Returns read models.
CREATE OR REPLACE FUNCTION public.returns_can_view_filing_scope(_entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'returns_management','view')
      OR public.entity_membership_capability(auth.uid(), _entity_id, 'returns.view');
$$;

-- Enterprise queue contract (server-derived stage / SLA / owner / next action).
CREATE OR REPLACE FUNCTION public.returns_filing_queue_v2(
  _status text DEFAULT NULL,
  _stage text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _owner_user_id uuid DEFAULT NULL,
  _overdue_only boolean DEFAULT false,
  _limit integer DEFAULT 300
)
RETURNS TABLE(
  filing_id uuid, filing_reference text, entity_id uuid, entity_name text,
  return_definition_id uuid, definition_code text, definition_name text, frequency text,
  reporting_period_id uuid, period_label text, period_start date, period_end date, due_date date,
  stage text, stage_label text, status text, status_label text,
  owner_user_id uuid, owner_name text, team text,
  priority text, priority_reason text,
  sla_due_at timestamptz, sla_state text, waiting_on text,
  blocker_count integer, blocking_validation_count bigint, open_request_count bigint,
  incomplete_required_forms bigint,
  last_activity_at timestamptz,
  next_action text, next_action_label text, next_action_href text, next_action_permission text,
  current_version_id uuid, current_version_number integer,
  submitted_at timestamptz, is_overdue boolean, days_late integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.filing_id, w.filing_reference, w.entity_id, w.entity_name,
         w.return_definition_id, w.definition_code, w.definition_name, w.frequency,
         w.reporting_period_id, w.period_label, w.period_start, w.period_end, w.due_date,
         w.stage, w.stage_label, w.status, w.status_label,
         w.owner_user_id, w.owner_name, w.team,
         w.priority, w.priority_reason,
         w.sla_due_at, w.sla_state, w.waiting_on,
         w.blocker_count::integer, w.blocking_validation_count, w.open_request_count,
         w.incomplete_required_forms,
         w.last_activity_at,
         w.next_action, w.next_action_label, w.next_action_href, w.next_action_permission,
         w.current_version_id, w.current_version_number,
         w.submitted_at, w.is_overdue, w.days_late
    FROM public.v_return_filing_workflow_state w
   WHERE public.returns_can_view_filing_scope(w.entity_id)
     AND (_status IS NULL OR w.status = _status)
     AND (_stage IS NULL OR w.stage = _stage)
     AND (_entity_id IS NULL OR w.entity_id = _entity_id)
     AND (_owner_user_id IS NULL OR w.owner_user_id = _owner_user_id)
     AND (NOT COALESCE(_overdue_only,false) OR w.is_overdue)
   ORDER BY CASE w.priority WHEN 'CRITICAL' THEN 0 WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2
                            WHEN 'NORMAL' THEN 3 ELSE 4 END,
            w.due_date
   LIMIT LEAST(COALESCE(_limit, 300), 1000);
$$;

-- KPI counts derived from the SAME filtered server source as the queue rows.
CREATE OR REPLACE FUNCTION public.returns_filing_queue_counts(
  _status text DEFAULT NULL,
  _stage text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _owner_user_id uuid DEFAULT NULL,
  _overdue_only boolean DEFAULT false
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'overdue', count(*) FILTER (WHERE w.is_overdue),
    'sla_breached', count(*) FILTER (WHERE w.sla_state = 'BREACHED'),
    'blocking_validations', count(*) FILTER (WHERE w.blocking_validation_count > 0),
    'open_requests', count(*) FILTER (WHERE w.open_request_count > 0),
    'unassigned', count(*) FILTER (WHERE w.owner_user_id IS NULL AND w.waiting_on = 'REGULATOR'),
    'awaiting_regulator', count(*) FILTER (WHERE w.waiting_on = 'REGULATOR'),
    'awaiting_entity', count(*) FILTER (WHERE w.waiting_on = 'ENTITY'),
    'by_stage', COALESCE((SELECT jsonb_object_agg(t.stage, t.n) FROM (
        SELECT w2.stage, count(*) AS n FROM public.v_return_filing_workflow_state w2
         WHERE public.returns_can_view_filing_scope(w2.entity_id)
           AND (_entity_id IS NULL OR w2.entity_id = _entity_id)
         GROUP BY w2.stage) t), '{}'::jsonb)
  )
  FROM public.v_return_filing_workflow_state w
  WHERE public.returns_can_view_filing_scope(w.entity_id)
    AND (_status IS NULL OR w.status = _status)
    AND (_stage IS NULL OR w.stage = _stage)
    AND (_entity_id IS NULL OR w.entity_id = _entity_id)
    AND (_owner_user_id IS NULL OR w.owner_user_id = _owner_user_id)
    AND (NOT COALESCE(_overdue_only,false) OR w.is_overdue);
$$;

-- Current-step guidance for the filing workspace.
CREATE OR REPLACE FUNCTION public.returns_filing_workflow_state(_filing_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE w record; v_blockers jsonb := '[]'::jsonb; v_actions jsonb := '[]'::jsonb;
        v_can_review boolean; v_can_approve boolean;
BEGIN
  SELECT * INTO w FROM public.v_return_filing_workflow_state WHERE filing_id = _filing_id;
  IF w.filing_id IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;
  IF NOT public.returns_can_view_filing_scope(w.entity_id) THEN
    RAISE EXCEPTION 'Not authorised to view this filing' USING ERRCODE = '42501';
  END IF;

  v_can_review  := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'returns_management','review');
  v_can_approve := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'returns_management','approve');

  IF w.blocking_validation_count > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','BLOCKING_VALIDATION',
      'label', w.blocking_validation_count || ' blocking validation finding(s)',
      'detail','The filing cannot be accepted until these findings are cleared or the entity resubmits.',
      'severity','critical');
  END IF;
  IF w.open_request_count > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','OPEN_REQUEST',
      'label', w.open_request_count || ' open information request(s)',
      'detail','Awaiting a response from the regulated entity.','severity','warning');
  END IF;
  IF w.status IN ('DRAFT','CORRECTION_REQUESTED') AND w.incomplete_required_forms > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('code','INCOMPLETE_FORMS',
      'label', w.incomplete_required_forms || ' required form(s) incomplete',
      'detail','The entity must complete every required form before submission.','severity','warning');
  END IF;
  IF w.status IN ('DRAFT','CORRECTION_REQUESTED') AND w.requires_declaration
     AND w.declaration_accepted_at IS NULL THEN
    v_blockers := v_blockers || jsonb_build_object('code','DECLARATION_OUTSTANDING',
      'label','Filer declaration not accepted',
      'detail','This return requires the filer declaration before submission.','severity','warning');
  END IF;

  IF w.status = 'SUBMITTED' AND v_can_review THEN
    v_actions := v_actions || jsonb_build_object('code','START_REVIEW','label','Start regulatory review','variant','primary');
  END IF;
  IF w.status IN ('SUBMITTED','UNDER_REVIEW') AND (v_can_review OR v_can_approve) THEN
    v_actions := v_actions || jsonb_build_object('code','VALIDATE','label','Re-run validation','variant','outline');
  END IF;
  IF w.status IN ('SUBMITTED','UNDER_REVIEW') AND v_can_review THEN
    v_actions := v_actions || jsonb_build_object('code','REQUEST_CORRECTION','label','Request correction','variant','outline','requires_reason',true);
  END IF;
  IF w.status IN ('SUBMITTED','UNDER_REVIEW') AND v_can_approve THEN
    IF w.blocking_validation_count = 0 THEN
      v_actions := v_actions || jsonb_build_object('code','ACCEPT','label','Accept filing','variant','primary');
    END IF;
    v_actions := v_actions || jsonb_build_object('code','REJECT','label','Reject filing','variant','destructive','requires_reason',true);
  END IF;
  IF v_can_review THEN
    v_actions := v_actions || jsonb_build_object('code','ASSIGN','label','Assign owner','variant','outline');
  END IF;

  RETURN jsonb_build_object(
    'filing_id', w.filing_id,
    'stage', w.stage, 'stage_label', w.stage_label,
    'status', w.status, 'status_label', w.status_label,
    'waiting_on', w.waiting_on,
    'owner_user_id', w.owner_user_id, 'owner_name', w.owner_name, 'team', w.team,
    'priority', w.priority, 'priority_reason', w.priority_reason,
    'sla_due_at', w.sla_due_at, 'sla_state', w.sla_state,
    'due_date', w.due_date, 'is_overdue', w.is_overdue, 'days_late', w.days_late,
    'last_activity_at', w.last_activity_at,
    'current_version_id', w.current_version_id,
    'current_version_number', w.current_version_number,
    'accepted_version_id', w.accepted_version_id,
    'blocker_count', w.blocker_count,
    'blockers', v_blockers,
    'available_actions', v_actions,
    'next_action', w.next_action,
    'next_action_label', w.next_action_label,
    'next_action_href', w.next_action_href,
    'next_action_permission', w.next_action_permission,
    'completed', jsonb_build_object(
      'submitted_at', w.submitted_at, 'accepted_at', w.accepted_at, 'rejected_at', w.rejected_at,
      'required_forms_complete', (w.incomplete_required_forms = 0),
      'declaration_accepted_at', w.declaration_accepted_at)
  );
END $$;

-- Governed owner/team assignment (canonical: return_filings.assigned_reviewer_id).
CREATE OR REPLACE FUNCTION public.returns_assign_filing(
  _filing_id uuid, _owner_user_id uuid, _team text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_before jsonb; v_after jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(),'returns_management','review')) THEN
    RAISE EXCEPTION 'Not authorised to assign return filings' USING ERRCODE = '42501';
  END IF;
  SELECT jsonb_build_object('assigned_reviewer_id', assigned_reviewer_id, 'assigned_team', assigned_team)
    INTO v_before FROM public.return_filings WHERE id = _filing_id;
  IF v_before IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;

  UPDATE public.return_filings
     SET assigned_reviewer_id = _owner_user_id,
         assigned_team = _team,
         assigned_at = now(),
         assigned_by = auth.uid(),
         updated_at = now()
   WHERE id = _filing_id;

  v_after := jsonb_build_object('assigned_reviewer_id', _owner_user_id, 'assigned_team', _team);
  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action, 'return_filing',
    _filing_id::text, v_before, v_after, 'Return filing ownership assignment');
  RETURN v_after;
END $$;

-- Legacy deep-link translation: returns_filed.id -> canonical return_filings.id.
CREATE OR REPLACE FUNCTION public.returns_resolve_legacy_filing(_legacy_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id FROM public.return_filings f
   WHERE (f.id = _legacy_id OR f.legacy_return_filed_id = _legacy_id)
     AND public.returns_can_view_filing_scope(f.entity_id)
   ORDER BY (f.id = _legacy_id) DESC
   LIMIT 1;
$$;

-- Genuine linked regulatory records for the filing workspace Related Cases area.
CREATE OR REPLACE FUNCTION public.returns_filing_related_cases(_filing_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid; v_out jsonb;
BEGIN
  SELECT entity_id INTO v_entity FROM public.return_filings WHERE id = _filing_id;
  IF v_entity IS NULL THEN RAISE EXCEPTION 'Filing not found'; END IF;
  IF NOT public.returns_can_view_filing_scope(v_entity) THEN
    RAISE EXCEPTION 'Not authorised to view this filing' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'breaches', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'metric_key', b.metric_key, 'level', b.level, 'value', b.value,
        'threshold_value', b.threshold_value, 'risk_level', b.risk_level,
        'detected_at', b.detected_at, 'acknowledged_at', b.acknowledged_at,
        'return_filing_version_id', b.return_filing_version_id) ORDER BY b.detected_at DESC)
      FROM public.return_threshold_breaches b WHERE b.return_filing_id = _filing_id), '[]'::jsonb),
    'ewi_alerts', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', a.id, 'severity', a.severity, 'status', a.status, 'created_at', a.created_at)
        ORDER BY a.created_at DESC)
      FROM public.prudential_ewi_alerts a WHERE a.return_filing_id = _filing_id), '[]'::jsonb),
    'assessments', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', pa.id, 'status', pa.status, 'created_at', pa.created_at) ORDER BY pa.created_at DESC)
      FROM public.prudential_assessments pa WHERE pa.return_filing_id = _filing_id), '[]'::jsonb),
    'actions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id', ac.id, 'action_reference', ac.action_reference, 'action_type', ac.action_type,
        'title', ac.title, 'status', ac.status, 'severity', ac.severity, 'due_date', ac.due_date)
        ORDER BY ac.created_at DESC)
      FROM public.prudential_actions ac
      WHERE ac.source_id IN (SELECT b.id FROM public.return_threshold_breaches b
                              WHERE b.return_filing_id = _filing_id)), '[]'::jsonb),
    'enforcement', COALESCE((SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', b.escalated_enforcement_id, 'escalated_at', b.escalated_at))
      FROM public.return_threshold_breaches b
     WHERE b.return_filing_id = _filing_id AND b.escalated_enforcement_id IS NOT NULL), '[]'::jsonb)
  ) INTO v_out;
  RETURN v_out;
END $$;

REVOKE ALL ON FUNCTION public.returns_filing_queue_v2(text,text,uuid,uuid,boolean,integer) FROM anon;
REVOKE ALL ON FUNCTION public.returns_filing_queue_counts(text,text,uuid,uuid,boolean) FROM anon;
REVOKE ALL ON FUNCTION public.returns_filing_workflow_state(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.returns_assign_filing(uuid,uuid,text) FROM anon;
REVOKE ALL ON FUNCTION public.returns_resolve_legacy_filing(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.returns_filing_related_cases(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.returns_can_view_filing_scope(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.returns_filing_queue_v2(text,text,uuid,uuid,boolean,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_filing_queue_counts(text,text,uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_filing_workflow_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_assign_filing(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_resolve_legacy_filing(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_filing_related_cases(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.returns_can_view_filing_scope(uuid) TO authenticated;