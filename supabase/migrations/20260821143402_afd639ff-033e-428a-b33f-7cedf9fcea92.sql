-- =====================================================================
-- P04 A.1/A.2/A.3 — single server authority for licence lifecycle
-- action availability; owner/team resolution; extended queue contract.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.license_lifecycle_available_actions(_license_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  l record; pol jsonb; m record; r record;
  v_open_conditions int; v_overdue_conditions int;
  v_days numeric; v_expired boolean;
  out_actions jsonb := '[]'::jsonb;

  FUNCTION_PLACEHOLDER text;

  can_workflow boolean; can_approve boolean; can_adverse boolean; can_conditions boolean;

  PROCEDURE_PLACEHOLDER text;
BEGIN
  SELECT * INTO l FROM public.licenses WHERE id = _license_id;
  IF l IS NULL THEN RAISE EXCEPTION 'LICENSE_NOT_FOUND' USING ERRCODE='22023'; END IF;

  -- Only regulator staff may hold lifecycle authority; holders get none.
  IF uid IS NULL THEN RETURN '[]'::jsonb; END IF;
  can_workflow   := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','workflow_action');
  can_approve    := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','approve');
  can_adverse    := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','manage_license_actions');
  can_conditions := public.is_super_admin(uid) OR public.has_permission(uid,'license_management','manage_conditions');
  IF NOT (can_workflow OR can_approve OR can_adverse OR can_conditions) THEN RETURN '[]'::jsonb; END IF;

  pol := public.license_lifecycle_policy(l.sector_id, l.sub_sector_id, l.category_id);

  SELECT count(*) FILTER (WHERE status IN ('open','in_progress')),
         count(*) FILTER (WHERE status IN ('open','in_progress') AND due_date < current_date)
    INTO v_open_conditions, v_overdue_conditions
    FROM public.license_conditions WHERE license_id = l.id;

  SELECT * INTO m FROM public.license_lifecycle_matters
   WHERE license_id = l.id AND status = 'open'
   ORDER BY CASE matter_kind WHEN 'revocation' THEN 1 WHEN 'suspension' THEN 2 WHEN 'renewal' THEN 3 ELSE 4 END, opened_at
   LIMIT 1;

  SELECT * INTO r FROM public.license_renewals
   WHERE license_id = l.id AND status NOT IN ('approved','refused','withdrawn')
   ORDER BY created_at DESC LIMIT 1;

  v_days := CASE WHEN l.valid_until IS NULL THEN NULL ELSE EXTRACT(EPOCH FROM (l.valid_until - now()))/86400 END;
  v_expired := v_days IS NOT NULL AND v_days < 0;

  -- Closed licences expose nothing (reinstatement of a revoked/surrendered
  -- licence requires a fresh authorisation, not a lifecycle action).
  IF l.status IN ('revoked','surrendered') THEN RETURN '[]'::jsonb; END IF;

  -- ---------------- renewal -----------------------------------------
  IF r.id IS NOT NULL THEN
    IF can_workflow AND r.status <> 'information_requested' THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','REQUEST_RENEWAL_INFORMATION','label','Request renewal information',
        'permission','license_management.workflow_action','adverse',false,'requires_reason',true,
        'blockers','[]'::jsonb,'section','renewal'));
    END IF;
    IF can_approve THEN
      out_actions := out_actions || jsonb_build_array(
        jsonb_build_object('key','APPROVE_RENEWAL','label','Approve renewal',
          'permission','license_management.approve','adverse',false,'requires_reason',false,
          'blockers', CASE WHEN v_overdue_conditions > 0
                           THEN jsonb_build_array(jsonb_build_object('key','overdue_conditions',
                                'label', v_overdue_conditions || ' overdue condition(s) outstanding',
                                'href','/licenses/' || l.id || '?tab=conditions'))
                           ELSE '[]'::jsonb END,
          'section','renewal'),
        jsonb_build_object('key','REFUSE_RENEWAL','label','Refuse renewal',
          'permission','license_management.approve','adverse',true,'requires_reason',true,
          'blockers','[]'::jsonb,'section','renewal'));
    END IF;
  ELSIF can_workflow AND l.status IN ('active','restricted','expired') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','START_RENEWAL','label','Start renewal',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',false,
      'blockers','[]'::jsonb,'section','renewal'));
  END IF;

  -- ---------------- variation ---------------------------------------
  IF m.matter_kind = 'variation' THEN
    IF can_approve THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','APPROVE_VARIATION','label','Approve variation',
        'permission','license_management.approve','adverse',false,'requires_reason',false,
        'blockers','[]'::jsonb,'section','variation'));
    END IF;
  ELSIF can_workflow AND l.status = 'active' THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','APPLY_VARIATION','label','Open variation matter',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',false,
      'blockers','[]'::jsonb,'section','variation'));
  END IF;

  -- ---------------- suspension / reinstatement ----------------------
  IF l.status = 'suspended' THEN
    IF can_adverse THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','REINSTATE','label','Reinstate licence',
        'permission','license_management.manage_license_actions','adverse',false,'requires_reason',true,
        'blockers', CASE WHEN v_overdue_conditions > 0
                         THEN jsonb_build_array(jsonb_build_object('key','overdue_conditions',
                              'label','Remediation outstanding: ' || v_overdue_conditions || ' overdue condition(s)',
                              'href','/licenses/' || l.id || '?tab=conditions'))
                         ELSE '[]'::jsonb END,
        'section','adverse'));
    END IF;
  ELSIF l.status IN ('active','restricted') AND can_adverse THEN
    IF m.matter_kind = 'suspension' THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','SUSPEND','label','Suspend licence',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers','[]'::jsonb,'section','adverse'));
    ELSE
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','BEGIN_SUSPENSION','label','Begin suspension review',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers','[]'::jsonb,'section','adverse'));
    END IF;
  END IF;

  -- ---------------- revocation --------------------------------------
  IF can_adverse THEN
    IF m.matter_kind = 'revocation' THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','REVOKE','label','Revoke licence',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers','[]'::jsonb,'section','adverse'));
    ELSE
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','BEGIN_REVOCATION','label','Begin revocation review',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers','[]'::jsonb,'section','adverse'));
    END IF;
  END IF;

  -- ---------------- surrender ---------------------------------------
  IF m.matter_kind = 'surrender' THEN
    IF can_adverse THEN
      out_actions := out_actions || jsonb_build_array(jsonb_build_object(
        'key','ACCEPT_SURRENDER','label','Accept surrender',
        'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
        'blockers', CASE WHEN v_open_conditions > 0
                         THEN jsonb_build_array(jsonb_build_object('key','open_conditions',
                              'label', v_open_conditions || ' open condition(s) must be resolved or waived',
                              'href','/licenses/' || l.id || '?tab=conditions'))
                         ELSE '[]'::jsonb END,
        'section','adverse'));
    END IF;
  ELSIF can_workflow THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','BEGIN_SURRENDER','label','Open surrender matter',
      'permission','license_management.workflow_action','adverse',false,'requires_reason',true,
      'blockers','[]'::jsonb,'section','adverse'));
  END IF;

  -- ---------------- expiry / lapse ----------------------------------
  IF can_adverse AND v_expired AND l.status IN ('active','restricted') THEN
    out_actions := out_actions || jsonb_build_array(jsonb_build_object(
      'key','MARK_EXPIRED','label','Mark expired (lapse)',
      'permission','license_management.manage_license_actions','adverse',true,'requires_reason',true,
      'blockers','[]'::jsonb,'section','renewal'));
  END IF;

  RETURN out_actions;
END
$function$;

REVOKE ALL ON FUNCTION public.license_lifecycle_available_actions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.license_lifecycle_available_actions(uuid) TO authenticated, service_role;
