-- ---------------------------------------------------------------
-- A.2 owner/team + A.1 available_actions on license_case
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.license_case(_license_id uuid, _audience text DEFAULT 'internal'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l record; ent record; pol jsonb;
  v_internal boolean;
  v_open_conditions int; v_overdue_conditions int;
  v_matter record; v_renewal record;
  v_days numeric; v_sla_state text; v_stage text; v_waiting text;
  v_priority text; v_priority_reason text;
  v_blockers jsonb := '[]'::jsonb; v_next jsonb;
  v_last timestamptz;
  v_owner_id uuid; v_owner_name text; v_team text;
  v_sa_supervisor uuid;
  v_actions jsonb := '[]'::jsonb;
BEGIN
  v_internal := public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(),'license_management','view');

  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE = '22023'; END IF;

  IF NOT v_internal AND l.holder_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO ent FROM public.licensees WHERE license_id = l.id LIMIT 1;
  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  SELECT count(*) FILTER (WHERE status IN ('open','in_progress')),
         count(*) FILTER (WHERE status IN ('open','in_progress') AND due_date < current_date)
    INTO v_open_conditions, v_overdue_conditions
    FROM public.license_conditions WHERE license_id = l.id;

  SELECT * INTO v_matter FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open'
   ORDER BY CASE matter_kind WHEN 'revocation' THEN 1 WHEN 'suspension' THEN 2 WHEN 'renewal' THEN 3 ELSE 4 END, opened_at
   LIMIT 1;

  SELECT * INTO v_renewal FROM public.license_renewals
   WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn')
   ORDER BY created_at DESC LIMIT 1;

  v_days := CASE WHEN l.valid_until IS NULL THEN NULL
                 ELSE EXTRACT(EPOCH FROM (l.valid_until - now())) / 86400 END;

  v_sla_state := CASE
    WHEN l.status IN ('revoked','surrendered') THEN 'closed'
    WHEN v_days IS NULL THEN 'on_track'
    WHEN v_days < 0 THEN 'breached'
    WHEN v_days <= COALESCE((pol->>'renewal_window_days')::int, 90) THEN 'due_soon'
    ELSE 'on_track' END;

  v_stage := CASE
    WHEN l.status = 'revoked' THEN 'REVOKED'
    WHEN l.status = 'surrendered' THEN 'SURRENDERED'
    WHEN l.status = 'expired' THEN 'EXPIRY_REVIEW'
    WHEN l.status = 'suspended' THEN 'SUSPENDED'
    WHEN v_matter.matter_kind = 'revocation' THEN 'REVOCATION_REVIEW'
    WHEN v_matter.matter_kind = 'suspension' THEN 'SUSPENSION_REVIEW'
    WHEN v_matter.matter_kind = 'surrender' THEN 'SURRENDER_REVIEW'
    WHEN v_matter.matter_kind = 'variation' THEN 'VARIATION'
    WHEN v_renewal.id IS NOT NULL THEN 'RENEWAL'
    WHEN v_sla_state = 'breached' THEN 'EXPIRY_REVIEW'
    WHEN v_sla_state = 'due_soon' THEN 'RENEWAL_DUE'
    WHEN v_open_conditions > 0 THEN 'ACTIVE_WITH_CONDITIONS'
    WHEN l.status = 'active' THEN 'ACTIVE'
    ELSE upper(COALESCE(l.status,'UNKNOWN')) END;

  v_waiting := COALESCE(
    CASE WHEN v_renewal.status = 'information_requested' THEN 'entity' END,
    v_matter.waiting_on,
    CASE WHEN v_open_conditions > 0 THEN 'entity' ELSE 'regulator' END);

  IF l.status IN ('revoked','surrendered') THEN
    v_priority := 'low'; v_priority_reason := 'Licence closed';
  ELSIF l.status = 'suspended' OR v_matter.matter_kind IN ('revocation','suspension') THEN
    v_priority := 'critical'; v_priority_reason := 'Adverse lifecycle action in progress';
  ELSIF v_sla_state = 'breached' OR v_overdue_conditions > 0 THEN
    v_priority := 'high'; v_priority_reason := CASE WHEN v_sla_state = 'breached' THEN 'Licence past expiry' ELSE 'Overdue licence conditions' END;
  ELSIF v_sla_state = 'due_soon' THEN
    v_priority := 'medium'; v_priority_reason := 'Renewal window open';
  ELSE
    v_priority := 'low'; v_priority_reason := 'No open lifecycle matter';
  END IF;

  IF v_overdue_conditions > 0 THEN
    v_blockers := v_blockers || jsonb_build_object('key','overdue_conditions','label', v_overdue_conditions || ' overdue condition(s)','href','/licenses/' || l.id || '?tab=conditions');
  END IF;
  IF v_sla_state = 'breached' AND l.status = 'active' THEN
    v_blockers := v_blockers || jsonb_build_object('key','past_expiry','label','Licence term has elapsed','href','/licenses/' || l.id || '?tab=renewal');
  END IF;

  v_next := CASE
    WHEN l.status IN ('revoked','surrendered') THEN NULL
    WHEN v_renewal.id IS NOT NULL AND v_renewal.status = 'information_requested'
      THEN jsonb_build_object('key','AWAIT_RENEWAL_INFORMATION','label','Awaiting renewal information','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.view')
    WHEN v_renewal.id IS NOT NULL
      THEN jsonb_build_object('key','APPROVE_RENEWAL','label','Decide renewal','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.approve')
    WHEN v_matter.matter_kind = 'suspension'
      THEN jsonb_build_object('key','SUSPEND','label','Conclude suspension review','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_matter.matter_kind = 'revocation'
      THEN jsonb_build_object('key','REVOKE','label','Conclude revocation review','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_matter.matter_kind = 'surrender'
      THEN jsonb_build_object('key','ACCEPT_SURRENDER','label','Decide surrender','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN l.status = 'suspended'
      THEN jsonb_build_object('key','REINSTATE','label','Consider reinstatement','href','/licenses/' || l.id || '?tab=adverse','permission','license_management.manage_license_actions')
    WHEN v_sla_state = 'breached' AND l.status = 'active'
      THEN jsonb_build_object('key','MARK_EXPIRED','label','Complete expiry review','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.manage_license_actions')
    WHEN v_sla_state = 'due_soon'
      THEN jsonb_build_object('key','START_RENEWAL','label','Start renewal','href','/licenses/' || l.id || '?tab=renewal','permission','license_management.workflow_action')
    WHEN v_overdue_conditions > 0
      THEN jsonb_build_object('key','REVIEW_CONDITIONS','label','Review overdue conditions','href','/licenses/' || l.id || '?tab=conditions','permission','license_management.manage_conditions')
    ELSE NULL END;

  SELECT max(created_at) INTO v_last FROM public.license_actions WHERE license_id = l.id;

  -- owner / team resolution (honest nulls when team-owned only)
  v_owner_id := COALESCE(ent.regulator_officer_id, ent.assigned_supervisor_id);
  SELECT sa.supervisor_id, sa.supervisor_name, sa.team
    INTO v_sa_supervisor, v_owner_name, v_team
    FROM public.entity_supervision_assignments sa
   WHERE ent.id IS NOT NULL AND sa.entity_id = ent.id
     AND COALESCE(sa.status,'active') = 'active'
   ORDER BY sa.effective_from DESC NULLS LAST LIMIT 1;
  IF v_owner_id IS NULL THEN v_owner_id := v_sa_supervisor; END IF;
  IF v_owner_id IS NOT NULL AND (v_owner_name IS NULL OR v_sa_supervisor IS DISTINCT FROM v_owner_id) THEN
    SELECT p.full_name INTO v_owner_name FROM public.profiles p WHERE p.id = v_owner_id;
  END IF;

  IF v_internal THEN
    v_actions := public.license_lifecycle_available_actions(l.id);
  END IF;

  RETURN jsonb_build_object(
    'header', jsonb_build_object(
      'license_id', l.id,
      'reference', l.license_number,
      'subject', COALESCE(ent.name, l.license_type),
      'entity_id', ent.id,
      'case_type', l.license_type,
      'stage', v_stage,
      'status', l.status,
      'owner_id', v_owner_id,
      'owner_name', v_owner_name,
      'team', v_team,
      'priority', v_priority,
      'priority_reason', v_priority_reason,
      'sla_due_at', l.valid_until,
      'sla_state', v_sla_state,
      'waiting_on', v_waiting,
      'blockers', v_blockers,
      'next_action', v_next,
      'available_actions', v_actions,
      'last_activity_at', COALESCE(v_last, l.updated_at, l.created_at),
      'issued_at', l.issued_at,
      'valid_from', l.valid_from,
      'valid_until', l.valid_until,
      'application_id', l.application_id,
      'sector_id', l.sector_id,
      'sub_sector_id', l.sub_sector_id,
      'category_id', l.category_id
    ),
    'policy', pol,
    'available_actions', v_actions,
    'counts', jsonb_build_object('open_conditions', v_open_conditions, 'overdue_conditions', v_overdue_conditions),
    'open_matter', CASE WHEN v_matter.id IS NULL THEN NULL ELSE to_jsonb(v_matter) END,
    'matters', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.opened_at DESC) FROM public.license_lifecycle_matters m WHERE m.license_id = l.id), '[]'::jsonb),
    'renewals', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM public.license_renewals r WHERE r.license_id = l.id), '[]'::jsonb),
    'conditions', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.due_date NULLS LAST) FROM public.license_conditions c WHERE c.license_id = l.id), '[]'::jsonb),
    'history', CASE WHEN v_internal THEN COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM public.license_actions a WHERE a.license_id = l.id), '[]'::jsonb) ELSE '[]'::jsonb END,
    'appeals', COALESCE((SELECT jsonb_agg(jsonb_build_object('id',ap.id,'reference',ap.appeal_reference,'status',ap.status,'filed_at',ap.filed_at,'decision',ap.decision) ORDER BY ap.filed_at DESC) FROM public.license_appeals ap WHERE ap.license_id = l.id), '[]'::jsonb),
    'enforcement', CASE WHEN ent.id IS NULL THEN '[]'::jsonb ELSE COALESCE((SELECT jsonb_agg(jsonb_build_object('id',e.id,'case_number',e.case_number,'status',e.status,'stage',e.stage,'source_kind',e.source_kind) ORDER BY e.created_at DESC) FROM public.enforcement_actions e WHERE e.entity_id = ent.id), '[]'::jsonb) END,
    'audience', CASE WHEN v_internal THEN 'internal' ELSE 'external' END
  );
END $function$;
