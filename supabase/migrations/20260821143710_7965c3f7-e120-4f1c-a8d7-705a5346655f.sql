CREATE OR REPLACE FUNCTION public.license_lifecycle_action(_license_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; m record; r record;
  new_status text; old_status text;
  adverse boolean;
  v_matter_id uuid; v_renewal_id uuid;
  v_new_until timestamptz;
  v_avail jsonb; v_offer jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;

  SELECT * INTO l FROM public.licenses WHERE id = _license_id FOR UPDATE;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;
  old_status := l.status;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  adverse := _action_key IN ('REFUSE_RENEWAL','BEGIN_SUSPENSION','SUSPEND','BEGIN_REVOCATION','REVOKE','ACCEPT_SURRENDER','MARK_EXPIRED');

  -- permission
  IF _action_key IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    PERFORM public.enforce_permission('license_management','manage_conditions');
  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    PERFORM public.enforce_permission('license_management','approve');
  ELSIF adverse THEN
    PERFORM public.enforce_permission('license_management','manage_license_actions');
  ELSE
    PERFORM public.enforce_permission('license_management','workflow_action');
  END IF;

  -- single authority: the action must be currently offered by the server
  IF _action_key NOT IN ('IMPOSE_CONDITION','VARY_CONDITION','SATISFY_CONDITION') THEN
    v_avail := public.license_lifecycle_available_actions(l.id);
    SELECT a INTO v_offer FROM jsonb_array_elements(v_avail) a WHERE a->>'key' = _action_key;
    IF v_offer IS NULL THEN
      RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023',
        DETAIL = 'Action ' || _action_key || ' is not available for this licence in its current state.';
    END IF;
    IF COALESCE((v_offer->>'requires_reason')::boolean,false) AND COALESCE(length(btrim(_reason)),0) < 10 THEN
      RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(COALESCE(v_offer->'blockers','[]'::jsonb)) > 0
       AND NOT COALESCE((_payload->>'override_blockers')::boolean,false) THEN
      RAISE EXCEPTION 'BLOCKED' USING ERRCODE='22023',
        DETAIL = v_offer->>'blockers';
    END IF;
  END IF;

  IF adverse AND COALESCE(length(btrim(_reason)),0) < 10 THEN
    RAISE EXCEPTION 'REASON_REQUIRED' USING ERRCODE='22023';
  END IF;

  IF l.status IN ('revoked','surrendered') AND _action_key <> 'REINSTATE' THEN
    RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023';
  END IF;

  SELECT * INTO m FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open' ORDER BY opened_at LIMIT 1;

  IF _action_key = 'START_RENEWAL' THEN
    IF l.status NOT IN ('active','restricted','expired') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    IF EXISTS (SELECT 1 FROM public.license_renewals x WHERE x.license_id = l.id AND x.status NOT IN ('approved','refused','withdrawn')) THEN
      RAISE EXCEPTION 'RENEWAL_ALREADY_OPEN' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.license_renewals(license_id, initiated_by, status, previous_valid_until, notes)
    VALUES (l.id, uid, 'in_progress', l.valid_until, _reason) RETURNING id INTO v_renewal_id;
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, renewal_id, opened_by, due_at, waiting_on)
    VALUES (l.id, 'renewal', 'Licence renewal', _reason, v_renewal_id, uid, l.valid_until, 'regulator') RETURNING id INTO v_matter_id;

  ELSIF _action_key = 'REQUEST_RENEWAL_INFORMATION' THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    UPDATE public.license_renewals SET status='information_requested', notes=COALESCE(_reason, notes), updated_at=now() WHERE id=r.id;
    UPDATE public.license_lifecycle_matters SET waiting_on='entity', reason=COALESCE(_reason, reason) WHERE license_id=l.id AND status='open' AND matter_kind='renewal';
    v_renewal_id := r.id;

  ELSIF _action_key IN ('APPROVE_RENEWAL','REFUSE_RENEWAL') THEN
    SELECT * INTO r FROM public.license_renewals WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn') ORDER BY created_at DESC LIMIT 1;
    IF r IS NULL THEN RAISE EXCEPTION 'NO_OPEN_RENEWAL' USING ERRCODE='22023'; END IF;
    v_renewal_id := r.id;
    IF _action_key = 'APPROVE_RENEWAL' THEN
      v_new_until := COALESCE((_payload->>'new_valid_until')::timestamptz,
                              GREATEST(COALESCE(l.valid_until, now()), now()) + make_interval(days => COALESCE((pol->>'period_days')::int, 365)));
      UPDATE public.license_renewals SET status='approved', reviewed_by=uid, reviewed_at=now(),
             new_valid_until=v_new_until, decision_reason=_reason, updated_at=now() WHERE id=r.id;
      UPDATE public.licenses SET valid_until=v_new_until,
             status = CASE WHEN status='expired' THEN 'active' ELSE status END, updated_at=now() WHERE id=l.id;
      new_status := (SELECT status FROM public.licenses WHERE id=l.id);
    ELSE
      UPDATE public.license_renewals SET status='refused', reviewed_by=uid, reviewed_at=now(), decision_reason=_reason, updated_at=now() WHERE id=r.id;
    END IF;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid,
           decision = _action_key WHERE license_id=l.id AND status='open' AND matter_kind='renewal';

  ELSIF _action_key IN ('BEGIN_SUSPENSION','BEGIN_REVOCATION','BEGIN_SURRENDER','APPLY_VARIATION') THEN
    INSERT INTO public.license_lifecycle_matters(license_id, matter_kind, title, reason, opened_by, due_at, waiting_on)
    VALUES (l.id,
            CASE _action_key WHEN 'BEGIN_SUSPENSION' THEN 'suspension'
                             WHEN 'BEGIN_REVOCATION' THEN 'revocation'
                             WHEN 'BEGIN_SURRENDER' THEN 'surrender'
                             ELSE 'variation' END,
            initcap(replace(lower(_action_key),'_',' ')), _reason, uid,
            (_payload->>'due_at')::timestamptz,
            CASE WHEN _action_key = 'APPLY_VARIATION' THEN 'entity' ELSE 'regulator' END)
    RETURNING id INTO v_matter_id;

  ELSIF _action_key = 'SUSPEND' THEN
    IF l.status <> 'active' AND l.status <> 'restricted' THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'suspended';
  ELSIF _action_key = 'REINSTATE' THEN
    IF l.status NOT IN ('suspended','restricted') THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'active';
  ELSIF _action_key = 'REVOKE' THEN
    new_status := 'revoked';
  ELSIF _action_key = 'ACCEPT_SURRENDER' THEN
    new_status := 'surrendered';
  ELSIF _action_key = 'MARK_EXPIRED' THEN
    IF l.valid_until IS NULL OR l.valid_until > now() THEN RAISE EXCEPTION 'INVALID_FROM_STATE' USING ERRCODE='22023'; END IF;
    new_status := 'expired';
  ELSIF _action_key = 'APPROVE_VARIATION' THEN
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid, decision='APPROVED'
     WHERE license_id=l.id AND status='open' AND matter_kind='variation';
  ELSE
    RAISE EXCEPTION 'UNKNOWN_ACTION' USING ERRCODE='22023';
  END IF;

  IF new_status IS NOT NULL AND new_status <> old_status THEN
    UPDATE public.licenses SET status = new_status, updated_at = now() WHERE id = l.id;
    UPDATE public.license_lifecycle_matters SET status='closed', closed_at=now(), closed_by=uid, decision=_action_key
     WHERE license_id = l.id AND status='open'
       AND matter_kind IN ('suspension','revocation','surrender','expiry');
  END IF;

  INSERT INTO public.license_actions(license_id, action_type, actor_id, reason, old_status, new_status, metadata)
  VALUES (l.id, lower(_action_key), uid, _reason, old_status, COALESCE(new_status, old_status),
          jsonb_build_object('payload', COALESCE(_payload,'{}'::jsonb), 'matter_id', v_matter_id, 'renewal_id', v_renewal_id));

  INSERT INTO public.audit_logs(user_id, action, entity_type, entity_id, metadata)
  VALUES (uid, 'license.lifecycle.' || lower(_action_key), 'license', l.id,
          jsonb_build_object('from', old_status, 'to', COALESCE(new_status, old_status), 'reason', _reason, 'payload', COALESCE(_payload,'{}'::jsonb)));

  RETURN public.license_case(l.id, 'internal');
END $function$;

-- ---------------------------------------------------------------
-- A.3 extended lifecycle work queue contract
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.license_lifecycle_work_queue(text[], text, integer, integer);

CREATE OR REPLACE FUNCTION public.license_lifecycle_work_queue(_kinds text[] DEFAULT NULL::text[], _search text DEFAULT NULL::text, _page integer DEFAULT 0, _page_size integer DEFAULT 25)
 RETURNS TABLE(work_kind text, object_type text, object_id uuid, license_id uuid, reference text, entity_id uuid, entity_name text, stage text, status text, priority text, priority_reason text, sla_due_at timestamp with time zone, sla_state text, waiting_on text, owner_user_id uuid, owner_name text, team text, blocker_count integer, blockers jsonb, next_action text, next_action_code text, next_action_label text, next_action_permission text, canonical_href text, last_activity_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_internal boolean; v_off int;
BEGIN
  v_internal := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view');
  _page_size := LEAST(GREATEST(COALESCE(_page_size,25),1),200);
  v_off := GREATEST(COALESCE(_page,0),0) * _page_size;

  RETURN QUERY
  WITH lic AS (
    SELECT l.*, le.id AS ent_id, COALESCE(le.name, l.license_type) AS ent_name,
      COALESCE(le.regulator_officer_id, le.assigned_supervisor_id) AS ent_owner,
      CASE WHEN l.valid_until IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (l.valid_until - now()))/86400 END AS d2e,
      COALESCE((public.license_lifecycle_policy(l.sector_id,l.sub_sector_id,l.category_id)->>'renewal_window_days')::int, 90) AS win
    FROM public.licenses l
    LEFT JOIN public.licensees le ON le.license_id = l.id
    WHERE (v_internal OR l.holder_id = auth.uid())
  ),
  rows_all AS (
    SELECT m.matter_kind AS work_kind, 'license_matter'::text AS object_type, m.id AS object_id, l.id AS license_id,
           l.license_number AS reference, l.ent_id AS entity_id, l.ent_name AS entity_name,
           upper(m.matter_kind) AS stage, m.status AS status,
           CASE WHEN m.matter_kind IN ('revocation','suspension') THEN 'critical' ELSE 'medium' END AS priority,
           CASE WHEN m.matter_kind IN ('revocation','suspension') THEN 'Adverse lifecycle action in progress'
                ELSE 'Open ' || replace(m.matter_kind,'_',' ') || ' matter' END AS priority_reason,
           COALESCE(m.due_at, l.valid_until) AS sla_due_at,
           CASE WHEN COALESCE(m.due_at, l.valid_until) IS NULL THEN 'on_track'
                WHEN COALESCE(m.due_at, l.valid_until) < now() THEN 'breached' ELSE 'on_track' END AS sla_state,
           m.waiting_on AS waiting_on,
           l.ent_owner AS owner_user_id,
           ('Progress ' || replace(m.matter_kind,'_',' '))::text AS next_action,
           ('/licenses/' || l.id)::text AS canonical_href,
           m.updated_at AS last_activity_at
    FROM public.license_lifecycle_matters m JOIN lic l ON l.id = m.license_id
    WHERE m.status = 'open'
    UNION ALL
    SELECT CASE WHEN l.d2e < 0 THEN 'expiry_review' ELSE 'renewal_due' END, 'license', l.id, l.id,
           l.license_number, l.ent_id, l.ent_name,
           CASE WHEN l.d2e < 0 THEN 'EXPIRY_REVIEW' ELSE 'RENEWAL_DUE' END, l.status,
           CASE WHEN l.d2e < 0 THEN 'high' ELSE 'medium' END,
           CASE WHEN l.d2e < 0 THEN 'Licence past expiry' ELSE 'Renewal window open' END,
           l.valid_until,
           CASE WHEN l.d2e < 0 THEN 'breached' ELSE 'due_soon' END,
           'regulator', l.ent_owner,
           CASE WHEN l.d2e < 0 THEN 'Complete expiry review' ELSE 'Start renewal' END,
           ('/licenses/' || l.id)::text, l.updated_at
    FROM lic l
    WHERE l.status IN ('active','restricted') AND l.valid_until IS NOT NULL AND l.d2e <= l.win
      AND NOT EXISTS (SELECT 1 FROM public.license_lifecycle_matters m WHERE m.license_id = l.id AND m.status = 'open')
    UNION ALL
    SELECT 'condition_evidence', 'license_condition', c.id, l.id,
           l.license_number, l.ent_id, l.ent_name, 'CONDITION_EVIDENCE', c.status,
           CASE WHEN c.due_date < current_date THEN 'high' ELSE 'low' END,
           CASE WHEN c.due_date < current_date THEN 'Overdue licence condition' ELSE 'Condition evidence due' END,
           (c.due_date::timestamptz),
           CASE WHEN c.due_date IS NULL THEN 'on_track' WHEN c.due_date < current_date THEN 'breached' ELSE 'due_soon' END,
           'entity', l.ent_owner, 'Review condition evidence', ('/licenses/' || l.id || '?tab=conditions')::text, c.updated_at
    FROM public.license_conditions c JOIN lic l ON l.id = c.license_id
    WHERE c.status IN ('open','in_progress')
      AND c.due_date IS NOT NULL AND c.due_date <= (current_date + 30)
    UNION ALL
    SELECT 'suspension_review', 'license', l.id, l.id, l.license_number, l.ent_id, l.ent_name,
           'SUSPENDED', l.status, 'critical', 'Licence suspended pending review', l.valid_until, 'breached', 'regulator',
           l.ent_owner, 'Review suspension', ('/licenses/' || l.id)::text, l.updated_at
    FROM lic l WHERE l.status = 'suspended'
    UNION ALL
    SELECT 'appeal', 'license_appeal', a.id, l.id, COALESCE(a.appeal_reference, l.license_number), l.ent_id, l.ent_name,
           'APPEAL', a.status, 'high', 'Open licence appeal', a.appeal_deadline,
           CASE WHEN a.appeal_deadline IS NOT NULL AND a.appeal_deadline < now() THEN 'breached' ELSE 'on_track' END,
           'regulator', l.ent_owner, 'Progress appeal', ('/licensing/appeals/' || a.id)::text, a.updated_at
    FROM public.license_appeals a JOIN lic l ON l.id = a.license_id
    WHERE a.status NOT IN ('decided','withdrawn','closed')
  ),
  filtered AS (
    SELECT * FROM rows_all r
    WHERE (_kinds IS NULL OR array_length(_kinds,1) IS NULL OR r.work_kind = ANY(_kinds))
      AND (_search IS NULL OR _search = '' OR r.reference ILIKE '%'||_search||'%' OR COALESCE(r.entity_name,'') ILIKE '%'||_search||'%')
  ),
  paged AS (
    SELECT f.*, count(*) OVER () AS total_count
    FROM filtered f
    ORDER BY CASE f.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
             f.sla_due_at ASC NULLS LAST
    LIMIT _page_size OFFSET v_off
  )
  SELECT p.work_kind, p.object_type, p.object_id, p.license_id, p.reference, p.entity_id, p.entity_name,
         p.stage, p.status, p.priority, p.priority_reason, p.sla_due_at, p.sla_state, p.waiting_on,
         COALESCE(p.owner_user_id, sa.supervisor_id) AS owner_user_id,
         COALESCE(pr.full_name, sa.supervisor_name) AS owner_name,
         sa.team AS team,
         COALESCE(jsonb_array_length(hdr.h->'blockers'),0)::int AS blocker_count,
         COALESCE(hdr.h->'blockers','[]'::jsonb) AS blockers,
         p.next_action,
         NULLIF(hdr.h->'next_action'->>'key','') AS next_action_code,
         NULLIF(hdr.h->'next_action'->>'label','') AS next_action_label,
         NULLIF(hdr.h->'next_action'->>'permission','') AS next_action_permission,
         p.canonical_href, p.last_activity_at, p.total_count
  FROM paged p
  LEFT JOIN LATERAL (
    SELECT public.license_case(p.license_id,'internal')->'header' AS h
  ) hdr ON true
  LEFT JOIN public.profiles pr ON pr.id = p.owner_user_id
  LEFT JOIN LATERAL (
    SELECT s.supervisor_id, s.supervisor_name, s.team
    FROM public.entity_supervision_assignments s
    WHERE p.entity_id IS NOT NULL AND s.entity_id = p.entity_id AND COALESCE(s.status,'active')='active'
    ORDER BY s.effective_from DESC NULLS LAST LIMIT 1
  ) sa ON true
  ORDER BY CASE p.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           p.sla_due_at ASC NULLS LAST;
END $function$;

REVOKE ALL ON FUNCTION public.license_lifecycle_work_queue(text[], text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_work_queue(text[], text, integer, integer) TO authenticated, service_role;
