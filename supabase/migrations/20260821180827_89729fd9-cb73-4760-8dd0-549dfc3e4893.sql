-- ============================================================
-- Phase B / P08.2–P08.8, P08.27, P08.31 — Complaint case + overview
-- ============================================================

CREATE OR REPLACE FUNCTION public.complaint_blockers(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c record; _out jsonb := '[]'::jsonb; _open_rfis int;
BEGIN
  SELECT * INTO _c FROM public.complaints WHERE id = _complaint_id;
  IF _c IS NULL THEN RETURN _out; END IF;
  IF _c.status IN ('closed', 'resolved') THEN RETURN _out; END IF;

  IF _c.investigator_id IS NULL THEN
    _out := _out || jsonb_build_array(jsonb_build_object('code','NO_OWNER','label','No investigating officer is assigned'));
  END IF;
  IF _c.acknowledged_at IS NULL THEN
    _out := _out || jsonb_build_array(jsonb_build_object('code','NOT_ACKNOWLEDGED','label','The complainant has not been acknowledged'));
  END IF;

  SELECT count(*) INTO _open_rfis FROM public.complaint_rfis r
   WHERE r.complaint_id = _complaint_id AND coalesce(r.status, '') NOT IN ('closed', 'completed', 'cancelled', 'responded');
  IF _open_rfis > 0 THEN
    _out := _out || jsonb_build_array(jsonb_build_object('code','OPEN_RFI',
      'label', _open_rfis || ' outstanding information request(s) awaiting response'));
  END IF;

  IF _c.status IN ('under_investigation', 'investigation') AND coalesce(btrim(_c.findings), '') = '' THEN
    _out := _out || jsonb_build_array(jsonb_build_object('code','NO_FINDINGS','label','No investigation findings have been recorded'));
  END IF;
  IF coalesce(btrim(_c.resolution), '') = '' AND coalesce(btrim(_c.resolution_notes), '') = ''
     AND _c.status IN ('pending_closure', 'awaiting_closure') THEN
    _out := _out || jsonb_build_array(jsonb_build_object('code','NO_RESOLUTION','label','No resolution has been recorded'));
  END IF;
  RETURN _out;
END; $$;

REVOKE ALL ON FUNCTION public.complaint_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_blockers(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complaint_case(_complaint_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _c record; _entity text; _owner text; _res jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _c FROM public.complaints WHERE id = _complaint_id;
  IF _c IS NULL THEN RAISE EXCEPTION 'Complaint not found' USING ERRCODE = 'P0002'; END IF;

  SELECT l.name INTO _entity FROM public.licensees l WHERE l.id = coalesce(_c.licensee_id, _c.license_holder_id);
  SELECT p.full_name INTO _owner FROM public.profiles p WHERE p.id = _c.investigator_id;

  _res := jsonb_build_object(
    'id', _c.id,
    'reference', _c.complaint_number,
    'subject', _c.subject,
    'case_type', 'Complaint',
    'entity_id', coalesce(_c.licensee_id, _c.license_holder_id),
    'entity_name', _entity,
    'entity_href', CASE WHEN coalesce(_c.licensee_id, _c.license_holder_id) IS NOT NULL
                        THEN '/entities/' || coalesce(_c.licensee_id, _c.license_holder_id) ELSE NULL END,
    'stage', upper(_c.status),
    'stage_label', initcap(replace(_c.status, '_', ' ')),
    'status', _c.status,
    'status_label', initcap(replace(_c.status, '_', ' ')),
    'owner_id', _c.investigator_id,
    'owner_name', _owner,
    'team', _c.assigned_team,
    'priority', coalesce(_c.priority, 'medium'),
    'severity', coalesce(_c.severity, 'medium'),
    'sla_due_at', _c.sla_due_at,
    'sla_state', CASE
      WHEN _c.status IN ('closed', 'resolved') THEN 'paused'
      WHEN _c.sla_due_at IS NULL THEN 'paused'
      WHEN _c.sla_due_at < now() THEN 'breached'
      WHEN _c.sla_due_at < now() + interval '3 days' THEN 'due_soon'
      ELSE 'on_track' END,
    'is_terminal', (_c.status IN ('closed', 'resolved')),
    'waiting_on', CASE
      WHEN _c.status IN ('closed', 'resolved') THEN NULL
      WHEN _c.investigator_id IS NULL THEN 'Case allocation'
      WHEN EXISTS (SELECT 1 FROM public.complaint_rfis r WHERE r.complaint_id = _c.id
                     AND coalesce(r.status,'') NOT IN ('closed','completed','cancelled','responded'))
        THEN 'Regulated entity / complainant'
      ELSE 'Assigned officer' END,
    'next_action_label', CASE
      WHEN _c.status IN ('closed', 'resolved') THEN NULL
      WHEN _c.investigator_id IS NULL THEN 'Allocate an investigating officer'
      WHEN _c.acknowledged_at IS NULL THEN 'Acknowledge the complainant'
      WHEN _c.status IN ('under_investigation', 'investigation') THEN 'Record investigation findings'
      ELSE 'Progress the complaint' END,
    'blockers', public.complaint_blockers(_complaint_id),
    'vulnerability_indicator', _c.vulnerability_indicator,
    'repeat_complaint_count', _c.repeat_complaint_count,
    'opened_at', _c.created_at,
    'acknowledged_at', _c.acknowledged_at,
    'resolved_at', _c.resolved_at,
    'closed_at', _c.closed_at,
    'last_activity_at', greatest(_c.updated_at, _c.created_at),
    'counts', jsonb_build_object(
      'evidence', (SELECT count(*) FROM public.complaint_evidence e WHERE e.complaint_id = _c.id),
      'rfis', (SELECT count(*) FROM public.complaint_rfis r WHERE r.complaint_id = _c.id),
      'open_rfis', (SELECT count(*) FROM public.complaint_rfis r WHERE r.complaint_id = _c.id
                      AND coalesce(r.status,'') NOT IN ('closed','completed','cancelled','responded')),
      'tasks', (SELECT count(*) FROM public.complaint_investigation_tasks t WHERE t.complaint_id = _c.id),
      'open_tasks', (SELECT count(*) FROM public.complaint_investigation_tasks t WHERE t.complaint_id = _c.id
                       AND coalesce(t.status,'') NOT IN ('completed','cancelled')),
      'findings', (SELECT count(*) FROM public.conduct_findings f
                     WHERE f.source_type = 'complaint' AND f.source_id = _c.id),
      'remediation_open', (SELECT count(*) FROM public.conduct_actions a
                             WHERE a.source_module = 'complaint' AND a.source_id = _c.id
                               AND a.status NOT IN ('completed','waived','cancelled')),
      'linked_alerts', (SELECT count(*) FROM public.conduct_alerts al WHERE al.complaint_id = _c.id)));

  RETURN _res;
END; $$;

REVOKE ALL ON FUNCTION public.complaint_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complaint_case(uuid) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Conduct overview
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conduct_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'work', jsonb_build_object(
      'open_total', count(*) FILTER (WHERE NOT i.is_terminal),
      'breached', count(*) FILTER (WHERE NOT i.is_terminal AND i.sla_state = 'breached'),
      'due_soon', count(*) FILTER (WHERE NOT i.is_terminal AND i.sla_state = 'due_soon'),
      'unassigned', count(*) FILTER (WHERE NOT i.is_terminal AND i.assigned_to IS NULL),
      'complaints_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'COMPLAINT'),
      'alerts_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'ALERT'),
      'investigations_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'INVESTIGATION'),
      'findings_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'FINDING'),
      'remediation_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'ACTION')))
    INTO _res
  FROM public.v_conduct_work_items i;

  _res := _res || jsonb_build_object(
    'remediation', (SELECT jsonb_build_object(
        'overdue', count(*) FILTER (WHERE r.is_overdue),
        'under_review', count(*) FILTER (WHERE r.status = 'under_review'),
        'escalated', count(*) FILTER (WHERE r.status = 'escalated'),
        'evidence_outstanding', count(*) FILTER (WHERE NOT r.is_terminal AND r.evidence_status = 'outstanding'))
      FROM public.v_conduct_action_state r),
    'findings', (SELECT jsonb_build_object(
        'confirmed', count(*) FILTER (WHERE f.status = 'confirmed'),
        'under_analysis', count(*) FILTER (WHERE f.status = 'under_analysis'),
        'dismissed', count(*) FILTER (WHERE f.status = 'dismissed'),
        'remediation_required', count(*) FILTER (WHERE f.status = 'remediation_required'))
      FROM public.conduct_findings f),
    'top_entities', (SELECT coalesce(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT i.entity_id, i.entity_name,
               count(*) AS open_items,
               count(*) FILTER (WHERE i.sla_state = 'breached') AS breached_items,
               '/entities/' || i.entity_id AS entity_href
          FROM public.v_conduct_work_items i
         WHERE NOT i.is_terminal AND i.entity_id IS NOT NULL
         GROUP BY i.entity_id, i.entity_name
         ORDER BY count(*) FILTER (WHERE i.sla_state = 'breached') DESC, count(*) DESC
         LIMIT 10) t));
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.conduct_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.conduct_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.entity_conduct_summary(_entity_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _res jsonb;
BEGIN
  PERFORM public.conduct_require('market_conduct', 'view');
  SELECT jsonb_build_object(
    'open_items', count(*) FILTER (WHERE NOT i.is_terminal),
    'breached_items', count(*) FILTER (WHERE NOT i.is_terminal AND i.sla_state = 'breached'),
    'complaints_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'COMPLAINT'),
    'complaints_total', count(*) FILTER (WHERE i.kind = 'COMPLAINT'),
    'alerts_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'ALERT'),
    'investigations_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'INVESTIGATION'),
    'findings_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'FINDING'),
    'remediation_open', count(*) FILTER (WHERE NOT i.is_terminal AND i.kind = 'ACTION'),
    'items', coalesce(jsonb_agg(jsonb_build_object(
        'kind', i.kind, 'kind_label', i.kind_label, 'reference', i.reference,
        'subject', i.subject, 'stage_label', i.stage_label, 'sla_state', i.sla_state,
        'assigned_to_name', i.assigned_to_name, 'last_activity_at', i.last_activity_at,
        'canonical_href', i.canonical_href)
      ORDER BY i.last_activity_at DESC) FILTER (WHERE NOT i.is_terminal), '[]'::jsonb))
    INTO _res
  FROM public.v_conduct_work_items i
  WHERE i.entity_id = _entity_id;
  RETURN coalesce(_res, '{}'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.entity_conduct_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entity_conduct_summary(uuid) TO authenticated, service_role;