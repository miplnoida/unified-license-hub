-- Checkpoint F correction: work_allocation_can_take takes the full canonical
-- signature (user, regulator, function, entity, sector, sub-sector, service).
-- The earlier read model passed only three arguments and would fail at runtime.
CREATE OR REPLACE FUNCTION public.people_access_internal_profile(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  END IF;
  IF NOT (public.is_super_admin(v_uid) OR v_uid = _user_id
          OR public.has_permission(v_uid,'user_management','view')
          OR public.has_permission(v_uid,'role_management','view')
          OR public.has_permission(v_uid,'security_management','view')) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;

  v_base := public.staff_responsibility_profile(_user_id);
  IF v_base ? 'error' THEN RETURN v_base; END IF;

  RETURN v_base || jsonb_build_object(
    'permissions', (
      SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('module', pm.module, 'action', pm.name)),'[]'::jsonb)
        FROM public.sec_user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions pm ON pm.id = rp.permission_id
       WHERE ur.user_id = _user_id AND ur.status = 'active'
         AND (ur.effective_until IS NULL OR ur.effective_until > now())),
    'delegations', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', d.id, 'name', d.name,
               'direction', CASE WHEN d.delegate_from_user_id = _user_id THEN 'delegated_out'
                                 ELSE 'delegated_in' END,
               'effective_from', d.effective_from, 'effective_until', d.effective_until,
               'is_active', d.is_active,
               'expired', d.effective_until IS NOT NULL AND d.effective_until <= now())
               ORDER BY d.created_at DESC),'[]'::jsonb)
        FROM public.delegation_rules d
       WHERE d.delegate_from_user_id = _user_id OR d.delegate_to_user_id = _user_id
          OR d.target_user_id = _user_id),
    'work_coverage', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'regulator_id', wp.regulator_id,
               'regulatory_function_id', wp.regulatory_function_id,
               'allocation_mode', wp.allocation_mode,
               'routing_mode', wp.routing_mode,
               'named_relationship_policy', wp.named_relationship_policy,
               'can_take', (public.work_allocation_can_take(
                              _user_id, wp.regulator_id, wp.regulatory_function_id,
                              NULL::uuid, NULL::uuid, NULL::uuid, NULL::uuid)->>'can_take')::boolean)),
             '[]'::jsonb)
        FROM public.work_allocation_policies wp
       WHERE wp.status = 'active'
         AND wp.effective_from <= now()
         AND (wp.effective_to IS NULL OR wp.effective_to > now())),
    'is_provider_identity', public.is_provider_member(_user_id),
    'access_history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'action', a.action, 'entity_type', a.entity_type,
               'created_at', a.created_at, 'metadata', a.metadata)
               ORDER BY a.created_at DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.audit_logs
               WHERE (entity_type IN ('user_roles','sec_user_roles','regulatory_team_members',
                                      'staff_portfolios','entity_supervision_assignments',
                                      'delegation_rules')
                      AND entity_id = _user_id::text)
                  OR user_id = _user_id
               ORDER BY created_at DESC LIMIT 50) a),
    'read_model', 'people_access_internal_profile',
    'is_authoritative_source', false);
END;
$$;

REVOKE ALL ON FUNCTION public.people_access_internal_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_access_internal_profile(uuid) TO authenticated, service_role;