-- ============================================================
-- Phase B / P08.12–P08.16 — Remediation (supervisory action) obligations
-- ============================================================

ALTER TABLE public.conduct_actions
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_submitted_by uuid,
  ADD COLUMN IF NOT EXISTS evidence_summary text,
  ADD COLUMN IF NOT EXISTS review_outcome text,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_reason text,
  ADD COLUMN IF NOT EXISTS escalation_id uuid;

-- Browser DML on remediation state is revoked: governed RPCs only.
REVOKE INSERT, UPDATE, DELETE ON public.conduct_actions FROM authenticated;
GRANT SELECT ON public.conduct_actions TO authenticated;
GRANT ALL ON public.conduct_actions TO service_role;

-- ------------------------------------------------------------
-- Canonical remediation state
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_conduct_action_state AS
SELECT
  a.id,
  coalesce(nullif(a.metadata->>'reference', ''), 'CA-' || upper(left(a.id::text, 8))) AS action_reference,
  a.title, a.description, a.action_type,
  a.source_module AS source_type, a.source_id, a.finding_id,
  a.entity_id, l.name AS entity_name,
  a.status,
  CASE a.status
    WHEN 'open' THEN 'Issued'
    WHEN 'in_progress' THEN 'In progress'
    WHEN 'under_review' THEN 'Evidence under review'
    WHEN 'returned' THEN 'Returned for more information'
    WHEN 'escalated' THEN 'Escalated'
    WHEN 'completed' THEN 'Completed'
    WHEN 'waived' THEN 'Waived'
    WHEN 'cancelled' THEN 'Cancelled'
    ELSE initcap(replace(a.status, '_', ' '))
  END AS stage_label,
  (a.status IN ('completed', 'waived', 'cancelled')) AS is_terminal,
  a.assigned_to, p.full_name AS assigned_to_name, a.assigned_team,
  a.due_date,
  (a.due_date::timestamptz + interval '1 day' - interval '1 second') AS sla_due_at,
  CASE
    WHEN a.status IN ('completed', 'waived', 'cancelled') THEN 'paused'
    WHEN a.due_date IS NULL THEN 'paused'
    WHEN a.due_date < current_date THEN 'breached'
    WHEN a.due_date <= current_date + 5 THEN 'due_soon'
    ELSE 'on_track'
  END AS sla_state,
  (a.due_date IS NOT NULL AND a.due_date < current_date
   AND a.status NOT IN ('completed', 'waived', 'cancelled')) AS is_overdue,
  CASE
    WHEN a.status = 'under_review' THEN 'submitted'
    WHEN a.evidence_submitted_at IS NOT NULL THEN 'received'
    WHEN (SELECT count(*) FROM public.conduct_evidence e WHERE e.action_id = a.id) > 0 THEN 'received'
    ELSE 'outstanding'
  END AS evidence_status,
  (SELECT count(*) FROM public.conduct_evidence e WHERE e.action_id = a.id) AS evidence_count,
  CASE
    WHEN a.status IN ('completed', 'waived', 'cancelled') THEN NULL
    WHEN a.assigned_to IS NULL THEN 'Case allocation'
    WHEN a.status = 'under_review' THEN 'Supervisory review'
    WHEN a.status = 'escalated' THEN 'Supervisory escalation'
    ELSE 'Assigned officer'
  END AS waiting_on,
  CASE
    WHEN a.status IN ('completed', 'waived', 'cancelled') THEN NULL
    WHEN a.assigned_to IS NULL THEN 'Assign an owner'
    WHEN a.status = 'open' THEN 'Start the remediation'
    WHEN a.status IN ('in_progress', 'returned') THEN 'Submit remediation evidence'
    WHEN a.status = 'under_review' THEN 'Review submitted evidence'
    WHEN a.status = 'escalated' THEN 'Decide escalation consequence'
    ELSE 'Progress the remediation'
  END AS next_action_label,
  a.review_outcome, a.evidence_summary, a.outcome, a.completion_notes,
  a.waiver_reason, a.cancellation_reason, a.return_reason, a.escalation_reason,
  a.closed_at, a.created_at,
  greatest(a.updated_at, a.created_at) AS last_activity_at,
  f.finding_reference, i.code AS investigation_code, c.complaint_number
FROM public.conduct_actions a
LEFT JOIN public.licensees l ON l.id = a.entity_id
LEFT JOIN public.profiles p ON p.id = a.assigned_to
LEFT JOIN public.conduct_findings f ON f.id = a.finding_id
LEFT JOIN public.conduct_investigations i
       ON a.source_module = 'conduct_investigation' AND i.id = a.source_id
LEFT JOIN public.complaints c
       ON a.source_module = 'complaint' AND c.id = a.source_id;

ALTER VIEW public.v_conduct_action_state SET (security_invoker = true);
GRANT SELECT ON public.v_conduct_action_state TO authenticated, service_role;

-- ------------------------------------------------------------
-- Register with server paging / filtering
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_action_register(
  _statuses text[] DEFAULT NULL,
  _source_types text[] DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _assigned_to uuid DEFAULT NULL,
  _unassigned boolean DEFAULT false,
  _overdue_only boolean DEFAULT false,
  _search text DEFAULT NULL,
  _include_closed boolean DEFAULT false,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, action_reference text, title text, description text, action_type text,
  source_type text, source_id uuid, source_reference text, source_href text,
  finding_id uuid, finding_reference text,
  entity_id uuid, entity_name text, status text, stage_label text, is_terminal boolean,
  assigned_to uuid, assigned_to_name text, assigned_team text,
  due_date date, sla_due_at timestamptz, sla_state text, is_overdue boolean,
  evidence_status text, evidence_count bigint, waiting_on text, next_action_label text,
  last_activity_at timestamptz, canonical_href text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  RETURN QUERY
  WITH scoped AS (
    SELECT s.* FROM public.v_conduct_action_state s
     WHERE (_include_closed OR NOT s.is_terminal)
       AND (_statuses IS NULL OR s.status = ANY(_statuses))
       AND (_source_types IS NULL OR s.source_type = ANY(_source_types))
       AND (_entity_id IS NULL OR s.entity_id = _entity_id)
       AND (_assigned_to IS NULL OR s.assigned_to = _assigned_to)
       AND (NOT coalesce(_unassigned, false) OR s.assigned_to IS NULL)
       AND (NOT coalesce(_overdue_only, false) OR s.is_overdue)
       AND (_search IS NULL OR btrim(_search) = '' OR
            s.action_reference ILIKE '%' || btrim(_search) || '%' OR
            coalesce(s.title, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(s.description, '') ILIKE '%' || btrim(_search) || '%' OR
            coalesce(s.entity_name, '') ILIKE '%' || btrim(_search) || '%')
  ), counted AS (SELECT count(*) AS n FROM scoped)
  SELECT s.id, s.action_reference, s.title, s.description, s.action_type,
         s.source_type, s.source_id,
         coalesce(s.finding_reference, s.investigation_code, s.complaint_number, NULL),
         CASE
           WHEN s.source_type = 'complaint' THEN '/complaints/' || s.source_id
           WHEN s.source_type = 'conduct_investigation' THEN '/conduct/investigations/' || s.source_id
           WHEN s.source_type = 'conduct_finding' THEN '/conduct/findings/' || s.source_id
           WHEN s.source_type = 'thematic_review' THEN '/supervision/thematic-reviews/' || s.source_id
           WHEN s.source_type = 'enforcement' THEN '/enforcement/' || s.source_id
           ELSE NULL END,
         s.finding_id, s.finding_reference,
         s.entity_id, s.entity_name, s.status, s.stage_label, s.is_terminal,
         s.assigned_to, s.assigned_to_name, s.assigned_team,
         s.due_date, s.sla_due_at, s.sla_state, s.is_overdue,
         s.evidence_status, s.evidence_count, s.waiting_on, s.next_action_label,
         s.last_activity_at, '/conduct/actions/' || s.id, counted.n
    FROM scoped s CROSS JOIN counted
   ORDER BY CASE s.sla_state WHEN 'breached' THEN 0 WHEN 'due_soon' THEN 1 WHEN 'on_track' THEN 2 ELSE 3 END,
            s.due_date NULLS LAST, s.created_at DESC
   LIMIT greatest(1, least(coalesce(_limit, 50), 200)) OFFSET greatest(0, coalesce(_offset, 0));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_action_register(text[], text[], uuid, uuid, boolean, boolean, text, boolean, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_action_register(text[], text[], uuid, uuid, boolean, boolean, text, boolean, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_action_register_counts(_entity_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'total_open', count(*) FILTER (WHERE NOT s.is_terminal),
    'overdue', count(*) FILTER (WHERE s.is_overdue),
    'under_review', count(*) FILTER (WHERE s.status = 'under_review'),
    'unassigned', count(*) FILTER (WHERE NOT s.is_terminal AND s.assigned_to IS NULL),
    'evidence_outstanding', count(*) FILTER (WHERE NOT s.is_terminal AND s.evidence_status = 'outstanding'),
    'escalated', count(*) FILTER (WHERE s.status = 'escalated'),
    'completed', count(*) FILTER (WHERE s.status = 'completed'),
    'waived', count(*) FILTER (WHERE s.status = 'waived'),
    'cancelled', count(*) FILTER (WHERE s.status = 'cancelled'),
    'by_status', coalesce(jsonb_object_agg(s.status, s.n) FILTER (WHERE false), '{}'::jsonb))
    INTO _res
  FROM (SELECT v.*, 1 AS n FROM public.v_conduct_action_state v
         WHERE (_entity_id IS NULL OR v.entity_id = _entity_id)) s;

  SELECT coalesce(_res, '{}'::jsonb) || jsonb_build_object(
    'by_status', coalesce((SELECT jsonb_object_agg(x.status, x.n) FROM (
      SELECT v.status, count(*) AS n FROM public.v_conduct_action_state v
       WHERE (_entity_id IS NULL OR v.entity_id = _entity_id)
       GROUP BY v.status) x), '{}'::jsonb)) INTO _res;
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_action_register_counts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_action_register_counts(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Available actions + governed step
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_action_available_actions(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _s record; _uid uuid := auth.uid(); _out jsonb := '[]'::jsonb; _reviewer boolean;
BEGIN
  IF _uid IS NULL THEN RETURN _out; END IF;
  SELECT * INTO _s FROM public.v_conduct_action_state WHERE id = _action_id;
  IF _s IS NULL OR _s.is_terminal THEN RETURN _out; END IF;
  IF NOT public.has_permission(_uid, 'market_conduct', 'edit') THEN RETURN _out; END IF;
  _reviewer := public.has_permission(_uid, 'market_conduct', 'approve')
            OR public.has_permission(_uid, 'market_conduct', 'edit');

  IF _s.assigned_to IS NULL THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','ASSIGN','label','Assign owner','variant','default','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','assigned_to','label','Responsible officer','type','user','required',true),
        jsonb_build_object('name','assigned_team','label','Team','type','text','required',false))));
  END IF;

  IF _s.status = 'open' AND _s.assigned_to IS NOT NULL THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','START','label','Start remediation','variant','default','enabled',true,'blocked_reason',NULL,
      'inputs','[]'::jsonb));
  END IF;

  IF _s.status IN ('open','in_progress','returned') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','SUBMIT_EVIDENCE','label','Submit remediation evidence','variant','default','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','evidence_summary','label','What has been done','type','textarea','required',true,'min_length',20))));
  END IF;

  IF _s.status = 'under_review' AND _reviewer THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','COMPLETE','label','Accept as satisfied / complete','variant','default','enabled',
      (_s.evidence_status <> 'outstanding'),
      'blocked_reason', CASE WHEN _s.evidence_status = 'outstanding' THEN 'Remediation evidence must be submitted first' ELSE NULL END,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','outcome','label','Outcome','type','text','required',true),
        jsonb_build_object('name','completion_notes','label','Review notes','type','textarea','required',true,'min_length',10))));

    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','RETURN','label','Return for more information','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','What is still required','type','textarea','required',true,'min_length',10))));

    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','ESCALATE','label','Unsatisfactory — escalate','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','Escalation rationale','type','textarea','required',true,'min_length',20))));
  END IF;

  IF _s.status IN ('open','in_progress','returned','escalated') AND _s.is_overdue THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','ESCALATE','label','Escalate overdue remediation','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','Escalation rationale','type','textarea','required',true,'min_length',20))));
  END IF;

  IF public.has_permission(_uid, 'market_conduct', 'approve') THEN
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','WAIVE','label','Waive requirement','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','Waiver rationale','type','textarea','required',true,'min_length',20))));
    _out := _out || jsonb_build_array(jsonb_build_object(
      'action_code','CANCEL','label','Cancel requirement','variant','outline','enabled',true,'blocked_reason',NULL,
      'inputs', jsonb_build_array(
        jsonb_build_object('name','reason','label','Cancellation rationale','type','textarea','required',true,'min_length',20))));
  END IF;

  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.conduct_action_available_actions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_action_available_actions(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_action_step(_action_id uuid, _action_code text, _payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _uid uuid; _actions jsonb; _action jsonb; _before jsonb; _after jsonb;
BEGIN
  _uid := public.conduct_require('market_conduct', 'edit');
  _actions := public.conduct_action_available_actions(_action_id);
  SELECT a INTO _action FROM jsonb_array_elements(_actions) a WHERE a->>'action_code' = _action_code;
  IF _action IS NULL THEN
    RAISE EXCEPTION 'Action % is not available for this remediation requirement', _action_code USING ERRCODE = '42501';
  END IF;
  IF NOT coalesce((_action->>'enabled')::boolean, false) THEN
    RAISE EXCEPTION '%', coalesce(_action->>'blocked_reason', 'Action is blocked') USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(a) INTO _before FROM public.conduct_actions a WHERE a.id = _action_id;

  IF _action_code = 'ASSIGN' THEN
    IF coalesce(nullif(_payload->>'assigned_to', ''), '') = '' THEN
      RAISE EXCEPTION 'A responsible officer is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_actions
       SET assigned_to = (_payload->>'assigned_to')::uuid,
           assigned_team = coalesce(nullif(btrim(_payload->>'assigned_team'), ''), assigned_team),
           assigned_at = now(), updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code = 'START' THEN
    UPDATE public.conduct_actions
       SET status = 'in_progress', started_at = coalesce(started_at, now()), updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code = 'SUBMIT_EVIDENCE' THEN
    IF coalesce(length(btrim(_payload->>'evidence_summary')), 0) < 20 THEN
      RAISE EXCEPTION 'Describe the remediation performed (min 20 characters)' USING ERRCODE = '22023';
    END IF;
    -- Evidence submission never completes a requirement: it moves it to review.
    UPDATE public.conduct_actions
       SET status = 'under_review',
           evidence_summary = btrim(_payload->>'evidence_summary'),
           evidence_submitted_at = now(), evidence_submitted_by = _uid,
           return_reason = NULL, updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code = 'COMPLETE' THEN
    IF coalesce(nullif(btrim(_payload->>'outcome'), ''), '') = ''
       OR coalesce(length(btrim(_payload->>'completion_notes')), 0) < 10 THEN
      RAISE EXCEPTION 'An outcome and review notes (min 10 characters) are required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_actions
       SET status = 'completed', review_outcome = 'satisfied',
           outcome = btrim(_payload->>'outcome'),
           completion_notes = btrim(_payload->>'completion_notes'),
           reviewed_by = _uid, reviewed_at = now(),
           closed_by = _uid, closed_at = now(), updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code = 'RETURN' THEN
    IF coalesce(length(btrim(_payload->>'reason')), 0) < 10 THEN
      RAISE EXCEPTION 'State what is still required (min 10 characters)' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_actions
       SET status = 'returned', review_outcome = 'more_information_required',
           return_reason = btrim(_payload->>'reason'),
           reviewed_by = _uid, reviewed_at = now(), updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code = 'ESCALATE' THEN
    IF coalesce(length(btrim(_payload->>'reason')), 0) < 20 THEN
      RAISE EXCEPTION 'An escalation rationale of at least 20 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_actions
       SET status = 'escalated', review_outcome = 'unsatisfactory',
           escalation_reason = btrim(_payload->>'reason'), escalated_at = now(),
           reviewed_by = _uid, reviewed_at = now(), updated_at = now()
     WHERE id = _action_id;

  ELSIF _action_code IN ('WAIVE', 'CANCEL') THEN
    IF coalesce(length(btrim(_payload->>'reason')), 0) < 20 THEN
      RAISE EXCEPTION 'A rationale of at least 20 characters is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.conduct_actions
       SET status = CASE WHEN _action_code = 'WAIVE' THEN 'waived' ELSE 'cancelled' END,
           waiver_reason = CASE WHEN _action_code = 'WAIVE' THEN btrim(_payload->>'reason') ELSE waiver_reason END,
           cancellation_reason = CASE WHEN _action_code = 'CANCEL' THEN btrim(_payload->>'reason') ELSE cancellation_reason END,
           closed_by = _uid, closed_at = now(), updated_at = now()
     WHERE id = _action_id;
  ELSE
    RAISE EXCEPTION 'Unsupported action %', _action_code USING ERRCODE = '22023';
  END IF;

  SELECT to_jsonb(a) INTO _after FROM public.conduct_actions a WHERE a.id = _action_id;
  PERFORM public.log_compliance_audit('WORKFLOW_TRANSITION', 'conduct_action', _action_id, _before, _after,
    _action_code || coalesce(' — ' || nullif(btrim(coalesce(_payload->>'reason', _payload->>'completion_notes', _payload->>'evidence_summary')), ''), ''));

  RETURN jsonb_build_object('id', _action_id);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_action_step(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_action_step(uuid, text, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.conduct_action_case(_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _s record;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT * INTO _s FROM public.v_conduct_action_state WHERE id = _action_id;
  IF _s IS NULL THEN RAISE EXCEPTION 'Remediation requirement not found' USING ERRCODE = 'P0002'; END IF;
  RETURN to_jsonb(_s) || jsonb_build_object(
    'entity_href', CASE WHEN _s.entity_id IS NOT NULL THEN '/entities/' || _s.entity_id ELSE NULL END,
    'source_href', CASE
      WHEN _s.source_type = 'complaint' THEN '/complaints/' || _s.source_id
      WHEN _s.source_type = 'conduct_investigation' THEN '/conduct/investigations/' || _s.source_id
      WHEN _s.source_type = 'conduct_finding' THEN '/conduct/findings/' || _s.source_id
      WHEN _s.source_type = 'thematic_review' THEN '/supervision/thematic-reviews/' || _s.source_id
      WHEN _s.source_type = 'enforcement' THEN '/enforcement/' || _s.source_id
      ELSE NULL END,
    'available_actions', public.conduct_action_available_actions(_action_id),
    'evidence', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'title', e.title, 'evidence_type', e.evidence_type,
        'restricted', e.restricted, 'uploaded_at', e.uploaded_at) ORDER BY e.uploaded_at DESC), '[]'::jsonb)
      FROM public.conduct_evidence e WHERE e.action_id = _action_id));
END; $$;

REVOKE ALL ON FUNCTION public.conduct_action_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_action_case(uuid) TO authenticated, service_role;