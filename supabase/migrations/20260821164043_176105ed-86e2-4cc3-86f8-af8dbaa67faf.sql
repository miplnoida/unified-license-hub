-- ============================================================
-- Phase B / P08.1 — Canonical Conduct case state + unified work queue
-- ============================================================

CREATE OR REPLACE VIEW public.v_conduct_investigation_state AS
SELECT
  i.id,
  i.code,
  i.allegation,
  i.status,
  CASE i.status
    WHEN 'opened' THEN 'INTAKE'
    WHEN 'evidence_gathering' THEN 'EVIDENCE'
    WHEN 'analysis' THEN 'ANALYSIS'
    WHEN 'proposed_outcome' THEN 'PROPOSED_OUTCOME'
    WHEN 'closed' THEN 'CLOSED'
    WHEN 'discontinued' THEN 'DISCONTINUED'
    ELSE upper(i.status)
  END AS stage,
  CASE i.status
    WHEN 'opened' THEN 'Intake and scoping'
    WHEN 'evidence_gathering' THEN 'Evidence gathering'
    WHEN 'analysis' THEN 'Analysis'
    WHEN 'proposed_outcome' THEN 'Proposed outcome'
    WHEN 'closed' THEN 'Closed'
    WHEN 'discontinued' THEN 'Discontinued'
    ELSE initcap(replace(i.status, '_', ' '))
  END AS stage_label,
  CASE i.status
    WHEN 'opened' THEN 1 WHEN 'evidence_gathering' THEN 2 WHEN 'analysis' THEN 3
    WHEN 'proposed_outcome' THEN 4 WHEN 'closed' THEN 5 WHEN 'discontinued' THEN 5 ELSE 9
  END AS stage_seq,
  (i.status IN ('closed', 'discontinued')) AS is_terminal,
  i.priority,
  i.severity,
  i.source_type,
  i.source_id,
  i.licensee_id AS entity_id,
  l.name AS entity_name,
  i.assigned_investigator AS assigned_to,
  p.full_name AS assigned_to_name,
  i.due_date,
  (i.due_date::timestamptz + interval '1 day' - interval '1 second') AS sla_due_at,
  CASE
    WHEN i.status IN ('closed', 'discontinued') THEN 'paused'
    WHEN i.due_date IS NULL THEN 'paused'
    WHEN i.due_date < current_date THEN 'breached'
    WHEN i.due_date <= current_date + 5 THEN 'due_soon'
    ELSE 'on_track'
  END AS sla_state,
  i.scope,
  i.legal_basis,
  i.investigation_plan,
  i.outcome,
  i.active_closure_id,
  cl.status AS closure_status,
  (SELECT count(*) FROM public.conduct_evidence e WHERE e.investigation_id = i.id) AS evidence_count,
  (SELECT count(*) FROM public.conduct_interviews v WHERE v.investigation_id = i.id) AS interview_count,
  (SELECT count(*) FROM public.conduct_actions a
    WHERE a.source_module = 'conduct_investigation' AND a.source_id = i.id
      AND a.status NOT IN ('completed', 'cancelled', 'waived')) AS open_action_count,
  greatest(i.updated_at, i.created_at) AS last_activity_at,
  i.created_at
FROM public.conduct_investigations i
LEFT JOIN public.licensees l ON l.id = i.licensee_id
LEFT JOIN public.profiles p ON p.id = i.assigned_investigator
LEFT JOIN public.conduct_investigation_closures cl ON cl.id = i.active_closure_id;

GRANT SELECT ON public.v_conduct_investigation_state TO authenticated, service_role;

-- ------------------------------------------------------------
-- Blockers: what genuinely prevents this investigation progressing
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_investigation_blockers(_investigation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(b ORDER BY b->>'code'), '[]'::jsonb)
  FROM public.v_conduct_investigation_state s
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object('code', code, 'label', label) AS b
    FROM (VALUES
      ('NO_OWNER', 'Assign an investigating officer',
        s.assigned_to IS NULL AND NOT s.is_terminal),
      ('NO_SCOPE', 'Record the investigation scope and legal basis',
        (coalesce(btrim(s.scope), '') = '' OR coalesce(btrim(s.legal_basis), '') = '') AND NOT s.is_terminal),
      ('NO_DUE_DATE', 'Set a target completion date',
        s.due_date IS NULL AND NOT s.is_terminal),
      ('NO_EVIDENCE', 'Record at least one item of evidence before analysis',
        s.evidence_count = 0 AND s.stage IN ('EVIDENCE', 'ANALYSIS')),
      ('NO_OUTCOME', 'Record the proposed outcome',
        coalesce(btrim(s.outcome), '') = '' AND s.stage = 'PROPOSED_OUTCOME')
    ) AS v(code, label, active)
    WHERE v.active
  ) x
  WHERE s.id = _investigation_id;
$$;

REVOKE ALL ON FUNCTION public.conduct_investigation_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_investigation_blockers(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Available actions: single server authority for what the case can do next
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_investigation_available_actions(_investigation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid := auth.uid();
  _s record;
  _can boolean;
  _blockers jsonb;
  _out jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RETURN _out; END IF;
  SELECT * INTO _s FROM public.v_conduct_investigation_state WHERE id = _investigation_id;
  IF _s IS NULL THEN RETURN _out; END IF;
  _can := public.has_permission(_uid, 'market_conduct', 'initiate_investigation');
  IF NOT _can OR _s.is_terminal THEN RETURN _out; END IF;
  _blockers := public.conduct_investigation_blockers(_investigation_id);

  IF _s.assigned_to IS NULL THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'ASSIGN_OWNER', 'label', 'Assign investigating officer',
      'variant', 'default', 'enabled', true, 'blocked_reason', NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name', 'assigned_investigator', 'label', 'Investigating officer', 'type', 'user', 'required', true))));
  END IF;

  IF _s.stage = 'INTAKE' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'RECORD_PLAN', 'label', 'Record scope, legal basis and plan',
      'variant', 'outline', 'enabled', true, 'blocked_reason', NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name', 'scope', 'label', 'Investigation scope', 'type', 'textarea', 'required', true, 'min_length', 20),
        jsonb_build_object('name', 'legal_basis', 'label', 'Legal basis', 'type', 'textarea', 'required', true, 'min_length', 10),
        jsonb_build_object('name', 'investigation_plan', 'label', 'Investigation plan', 'type', 'textarea', 'required', false),
        jsonb_build_object('name', 'due_date', 'label', 'Target completion date', 'type', 'date', 'required', true))));

    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'BEGIN_EVIDENCE', 'label', 'Begin evidence gathering',
      'variant', 'default',
      'enabled', (_blockers = '[]'::jsonb),
      'blocked_reason', CASE WHEN _blockers = '[]'::jsonb THEN NULL
        ELSE 'Owner, scope, legal basis and target date must be recorded first' END,
      'inputs', '[]'::jsonb));
  END IF;

  IF _s.stage = 'EVIDENCE' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'BEGIN_ANALYSIS', 'label', 'Move to analysis',
      'variant', 'default',
      'enabled', (_s.evidence_count > 0),
      'blocked_reason', CASE WHEN _s.evidence_count > 0 THEN NULL
        ELSE 'Record at least one item of evidence before analysis' END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name', 'note', 'label', 'Analysis entry note', 'type', 'textarea', 'required', false))));
  END IF;

  IF _s.stage = 'ANALYSIS' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'PROPOSE_OUTCOME', 'label', 'Record proposed outcome',
      'variant', 'default', 'enabled', true, 'blocked_reason', NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name', 'outcome', 'label', 'Proposed outcome', 'type', 'textarea', 'required', true, 'min_length', 20))));
  END IF;

  IF _s.stage = 'PROPOSED_OUTCOME' THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code', 'RETURN_TO_ANALYSIS', 'label', 'Return to analysis',
      'variant', 'outline', 'enabled', true, 'blocked_reason', NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name', 'note', 'label', 'Reason for further analysis', 'type', 'textarea', 'required', true, 'min_length', 10))));
  END IF;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_investigation_available_actions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_investigation_available_actions(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Investigation case read model
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_investigation_case(_investigation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _s record; _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  IF NOT public.can_view_conduct_investigation(_investigation_id) THEN
    RAISE EXCEPTION 'Permission denied for this investigation' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _s FROM public.v_conduct_investigation_state WHERE id = _investigation_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Investigation not found' USING ERRCODE = 'P0002'; END IF;

  _res := jsonb_build_object(
    'id', _s.id,
    'reference', coalesce(_s.code, left(_s.id::text, 8)),
    'subject', left(_s.allegation, 160),
    'entity_id', _s.entity_id,
    'entity_name', _s.entity_name,
    'entity_href', CASE WHEN _s.entity_id IS NOT NULL THEN '/entities/' || _s.entity_id ELSE NULL END,
    'stage', _s.stage,
    'stage_label', _s.stage_label,
    'stage_seq', _s.stage_seq,
    'status', _s.status,
    'is_terminal', _s.is_terminal,
    'priority', _s.priority,
    'severity', _s.severity,
    'source_type', _s.source_type,
    'source_id', _s.source_id,
    'assigned_to', _s.assigned_to,
    'assigned_to_name', _s.assigned_to_name,
    'due_date', _s.due_date,
    'sla_due_at', _s.sla_due_at,
    'sla_state', _s.sla_state,
    'waiting_on', CASE
      WHEN _s.is_terminal THEN NULL
      WHEN _s.stage = 'PROPOSED_OUTCOME' THEN 'Supervisory approval'
      WHEN _s.assigned_to IS NULL THEN 'Case allocation'
      ELSE 'Investigating officer' END,
    'scope', _s.scope,
    'legal_basis', _s.legal_basis,
    'investigation_plan', _s.investigation_plan,
    'outcome', _s.outcome,
    'closure_status', _s.closure_status,
    'evidence_count', _s.evidence_count,
    'interview_count', _s.interview_count,
    'open_action_count', _s.open_action_count,
    'last_activity_at', _s.last_activity_at,
    'blockers', public.conduct_investigation_blockers(_investigation_id),
    'available_actions', public.conduct_investigation_available_actions(_investigation_id),
    'timeline', (
      SELECT coalesce(jsonb_agg(t ORDER BY t->>'at'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('at', _s.created_at, 'code', 'OPENED', 'label', 'Investigation opened') AS t
        UNION ALL
        SELECT jsonb_build_object('at', e.uploaded_at, 'code', 'EVIDENCE', 'label', 'Evidence: ' || e.title)
          FROM public.conduct_evidence e WHERE e.investigation_id = _s.id
        UNION ALL
        SELECT jsonb_build_object('at', v.created_at, 'code', 'INTERVIEW', 'label', 'Interview recorded')
          FROM public.conduct_interviews v WHERE v.investigation_id = _s.id
        UNION ALL
        SELECT jsonb_build_object('at', c.created_at, 'code', 'CLOSURE_' || upper(c.status),
                                  'label', 'Closure determination ' || c.status)
          FROM public.conduct_investigation_closures c WHERE c.investigation_id = _s.id
      ) z
    )
  );
  RETURN _res;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_investigation_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_investigation_case(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Governed stage step — the only lifecycle mutation entry point
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_investigation_step(
  _investigation_id uuid, _action_code text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid uuid;
  _actions jsonb;
  _action jsonb;
  _before jsonb;
  _after jsonb;
  _new_status text;
BEGIN
  _uid := public.conduct_require('market_conduct', 'initiate_investigation');
  _actions := public.conduct_investigation_available_actions(_investigation_id);
  SELECT a INTO _action FROM jsonb_array_elements(_actions) a
   WHERE a->>'action_code' = _action_code;
  IF _action IS NULL THEN
    RAISE EXCEPTION 'Action % is not available for this investigation', _action_code USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((_action->>'enabled')::boolean, false) THEN
    RAISE EXCEPTION '%', coalesce(_action->>'blocked_reason', 'Action is blocked') USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(i) INTO _before FROM public.conduct_investigations i WHERE i.id = _investigation_id;

  IF _action_code = 'ASSIGN_OWNER' THEN
    IF coalesce(nullif(_payload->>'assigned_investigator', ''), '') = '' THEN
      RAISE EXCEPTION 'An investigating officer is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_investigations
       SET assigned_investigator = (_payload->>'assigned_investigator')::uuid, updated_at = now()
     WHERE id = _investigation_id;

  ELSIF _action_code = 'RECORD_PLAN' THEN
    IF coalesce(length(btrim(_payload->>'scope')), 0) < 20
       OR coalesce(length(btrim(_payload->>'legal_basis')), 0) < 10
       OR coalesce(nullif(_payload->>'due_date', ''), '') = '' THEN
      RAISE EXCEPTION 'Scope (min 20 chars), legal basis (min 10 chars) and target date are required'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_investigations
       SET scope = btrim(_payload->>'scope'),
           legal_basis = btrim(_payload->>'legal_basis'),
           investigation_plan = coalesce(nullif(btrim(_payload->>'investigation_plan'), ''), investigation_plan),
           due_date = (_payload->>'due_date')::date,
           updated_at = now()
     WHERE id = _investigation_id;

  ELSIF _action_code IN ('BEGIN_EVIDENCE', 'BEGIN_ANALYSIS', 'RETURN_TO_ANALYSIS') THEN
    _new_status := CASE _action_code
      WHEN 'BEGIN_EVIDENCE' THEN 'evidence_gathering'
      ELSE 'analysis' END;
    IF _action_code = 'RETURN_TO_ANALYSIS' AND coalesce(length(btrim(_payload->>'note')), 0) < 10 THEN
      RAISE EXCEPTION 'A reason of at least 10 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_investigations
       SET status = _new_status, updated_at = now()
     WHERE id = _investigation_id;

  ELSIF _action_code = 'PROPOSE_OUTCOME' THEN
    IF coalesce(length(btrim(_payload->>'outcome')), 0) < 20 THEN
      RAISE EXCEPTION 'A proposed outcome of at least 20 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_investigations
       SET outcome = btrim(_payload->>'outcome'), status = 'proposed_outcome', updated_at = now()
     WHERE id = _investigation_id;

  ELSE
    RAISE EXCEPTION 'Unsupported action %', _action_code USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(i) INTO _after FROM public.conduct_investigations i WHERE i.id = _investigation_id;
  PERFORM public.log_compliance_audit(
    'WORKFLOW_TRANSITION', 'conduct_investigation', _investigation_id, _before, _after,
    _action_code || coalesce(' — ' || nullif(btrim(_payload->>'note'), ''), ''));

  RETURN public.conduct_investigation_case(_investigation_id);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_investigation_step(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_investigation_step(uuid, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Unified conduct work queue (complaints, alerts, investigations, actions)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_work_queue(
  _kinds text[] DEFAULT NULL,
  _sla_states text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _sort text DEFAULT 'sla',
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  item_id uuid, kind text, kind_label text, reference text, subject text,
  entity_id uuid, entity_name text, stage text, stage_label text, status text,
  priority text, severity text, assigned_to uuid, assigned_to_name text,
  sla_due_at timestamptz, sla_state text, waiting_on text,
  next_action_label text, blockers jsonb, last_activity_at timestamptz,
  canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  RETURN QUERY
  WITH items AS (
    -- Complaints
    SELECT c.id AS item_id, 'COMPLAINT'::text AS kind, 'Complaint'::text AS kind_label,
           c.complaint_number AS reference, c.subject,
           coalesce(c.licensee_id, c.license_holder_id) AS entity_id, l.name AS entity_name,
           upper(c.status) AS stage, initcap(replace(c.status, '_', ' ')) AS stage_label, c.status,
           coalesce(c.priority, 'medium') AS priority, coalesce(c.severity, 'medium') AS severity,
           c.investigator_id AS assigned_to, p.full_name AS assigned_to_name,
           c.sla_due_at,
           CASE WHEN c.resolved_at IS NOT NULL OR c.status IN ('closed', 'resolved') THEN 'paused'
                WHEN c.sla_due_at IS NULL THEN 'paused'
                WHEN c.sla_due_at < now() THEN 'breached'
                WHEN c.sla_due_at < now() + interval '3 days' THEN 'due_soon'
                ELSE 'on_track' END AS sla_state,
           CASE WHEN c.investigator_id IS NULL THEN 'Case allocation' ELSE 'Assigned officer' END AS waiting_on,
           CASE WHEN c.investigator_id IS NULL THEN 'Allocate and triage'
                WHEN c.status = 'under_investigation' THEN 'Progress investigation'
                ELSE 'Review complaint' END AS next_action_label,
           '[]'::jsonb AS blockers,
           greatest(c.updated_at, c.created_at) AS last_activity_at,
           '/complaints/' || c.id AS canonical_href,
           (c.status IN ('closed', 'resolved')) AS is_terminal,
           c.created_at
      FROM public.complaints c
      LEFT JOIN public.licensees l ON l.id = coalesce(c.licensee_id, c.license_holder_id)
      LEFT JOIN public.profiles p ON p.id = c.investigator_id

    UNION ALL
    -- Conduct alerts
    SELECT a.id, 'ALERT', 'Conduct alert',
           left(a.id::text, 8), a.title,
           a.licensee_id, l.name,
           upper(a.status), initcap(replace(a.status, '_', ' ')), a.status,
           CASE a.severity WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END,
           coalesce(a.severity, 'medium'),
           a.assigned_to, p.full_name,
           NULL::timestamptz,
           CASE WHEN a.status IN ('closed', 'dismissed') THEN 'paused'
                WHEN a.created_at < now() - interval '14 days' THEN 'breached'
                WHEN a.created_at < now() - interval '7 days' THEN 'due_soon'
                ELSE 'on_track' END,
           CASE WHEN a.acknowledged_at IS NULL THEN 'Acknowledgement' ELSE 'Disposition' END,
           CASE WHEN a.acknowledged_at IS NULL THEN 'Acknowledge alert' ELSE 'Record disposition' END,
           '[]'::jsonb,
           greatest(a.updated_at, a.created_at),
           '/conduct/alerts?alert=' || a.id,
           (a.status IN ('closed', 'dismissed')),
           a.created_at
      FROM public.conduct_alerts a
      LEFT JOIN public.licensees l ON l.id = a.licensee_id
      LEFT JOIN public.profiles p ON p.id = a.assigned_to

    UNION ALL
    -- Investigations
    SELECT s.id, 'INVESTIGATION', 'Investigation',
           coalesce(s.code, left(s.id::text, 8)), left(s.allegation, 160),
           s.entity_id, s.entity_name,
           s.stage, s.stage_label, s.status,
           coalesce(s.priority, 'medium'), coalesce(s.severity, 'medium'),
           s.assigned_to, s.assigned_to_name,
           s.sla_due_at, s.sla_state,
           CASE WHEN s.is_terminal THEN NULL
                WHEN s.stage = 'PROPOSED_OUTCOME' THEN 'Supervisory approval'
                WHEN s.assigned_to IS NULL THEN 'Case allocation'
                ELSE 'Investigating officer' END,
           CASE s.stage
             WHEN 'INTAKE' THEN 'Scope and allocate'
             WHEN 'EVIDENCE' THEN 'Gather evidence'
             WHEN 'ANALYSIS' THEN 'Complete analysis'
             WHEN 'PROPOSED_OUTCOME' THEN 'Submit closure determination'
             ELSE NULL END,
           public.conduct_investigation_blockers(s.id),
           s.last_activity_at,
           '/conduct/investigations/' || s.id,
           s.is_terminal,
           s.created_at
      FROM public.v_conduct_investigation_state s

    UNION ALL
    -- Supervisory actions
    SELECT ca.id, 'ACTION', 'Supervisory action',
           left(ca.id::text, 8), ca.title,
           ca.entity_id, l.name,
           upper(ca.status), initcap(replace(ca.status, '_', ' ')), ca.status,
           CASE WHEN ca.due_date IS NOT NULL AND ca.due_date < current_date THEN 'high' ELSE 'medium' END,
           'medium',
           ca.assigned_to, p.full_name,
           (ca.due_date::timestamptz + interval '1 day' - interval '1 second'),
           CASE WHEN ca.status IN ('completed', 'cancelled', 'waived') THEN 'paused'
                WHEN ca.due_date IS NULL THEN 'paused'
                WHEN ca.due_date < current_date THEN 'breached'
                WHEN ca.due_date <= current_date + 5 THEN 'due_soon'
                ELSE 'on_track' END,
           'Assigned officer',
           'Complete supervisory action',
           '[]'::jsonb,
           greatest(ca.updated_at, ca.created_at),
           '/conduct/actions?action=' || ca.id,
           (ca.status IN ('completed', 'cancelled', 'waived')),
           ca.created_at
      FROM public.conduct_actions ca
      LEFT JOIN public.licensees l ON l.id = ca.entity_id
      LEFT JOIN public.profiles p ON p.id = ca.assigned_to
  ), scoped AS (
    SELECT * FROM items i
     WHERE (_include_closed OR NOT i.is_terminal)
       AND (_kinds IS NULL OR i.kind = ANY(_kinds))
       AND (_sla_states IS NULL OR i.sla_state = ANY(_sla_states))
       AND (_entity_id IS NULL OR i.entity_id = _entity_id)
       AND (_assigned_to IS NULL OR i.assigned_to = _assigned_to)
       AND (NOT coalesce(_unassigned, false) OR i.assigned_to IS NULL)
       AND (_search IS NULL OR btrim(_search) = '' OR
            coalesce(i.reference, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(i.subject, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(i.entity_name, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.item_id, s.kind, s.kind_label, s.reference, s.subject, s.entity_id, s.entity_name,
         s.stage, s.stage_label, s.status, s.priority, s.severity, s.assigned_to, s.assigned_to_name,
         s.sla_due_at, s.sla_state, s.waiting_on, s.next_action_label, s.blockers,
         s.last_activity_at, s.canonical_href, counted.n
    FROM scoped s CROSS JOIN counted
   ORDER BY
     CASE WHEN _sort = 'sla' THEN
       CASE s.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     CASE WHEN _sort = 'priority' THEN
       CASE s.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END
       ELSE NULL END NULLS LAST,
     s.sla_due_at NULLS LAST, s.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_work_queue(text[], text[], uuid, uuid, boolean, text, boolean, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_work_queue(text[], text[], uuid, uuid, boolean, text, boolean, text, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_work_queue_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'total_open', count(*),
    'breached', count(*) FILTER (WHERE q.sla_state = 'breached'),
    'due_soon', count(*) FILTER (WHERE q.sla_state = 'due_soon'),
    'unassigned', count(*) FILTER (WHERE q.assigned_to IS NULL),
    'by_kind', coalesce(jsonb_object_agg(k.kind, k.n) FILTER (WHERE k.kind IS NOT NULL), '{}'::jsonb)
  ) INTO _res
  FROM public.conduct_work_queue(NULL, NULL, NULL, NULL, false, NULL, false, 'sla', 200, 0) q
  LEFT JOIN LATERAL (SELECT NULL::text AS kind, NULL::bigint AS n) k ON false;

  SELECT _res || jsonb_build_object('by_kind', coalesce(jsonb_object_agg(kind, n), '{}'::jsonb))
    INTO _res
  FROM (
    SELECT q.kind, count(*) AS n
      FROM public.conduct_work_queue(NULL, NULL, NULL, NULL, false, NULL, false, 'sla', 200, 0) q
     GROUP BY q.kind
  ) z;
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_work_queue_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_work_queue_counts() TO authenticated, service_role;