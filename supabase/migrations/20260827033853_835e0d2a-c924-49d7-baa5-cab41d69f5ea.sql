-- ============================================================
-- CHECKPOINT F — People & Access aggregation + My Work read models.
-- READ-ONLY. No new tables, no new permission system, no duplicated case state.
-- Every function aggregates existing canonical truth and re-checks the caller's
-- existing permissions.
-- ============================================================

-- ---------- F1: Internal People (person-centric) ----------
-- Reuses the canonical staff_responsibility_profile and adds delegations,
-- work-allocation coverage and access history around it.
CREATE OR REPLACE FUNCTION public.people_access_internal_profile(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_base jsonb;
  v_res jsonb;
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

  -- Canonical responsibility/team/coverage/decision-body truth.
  v_base := public.staff_responsibility_profile(_user_id);
  IF v_base ? 'error' THEN RETURN v_base; END IF;

  v_res := v_base
    || jsonb_build_object(
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
                 'counterparty', CASE WHEN d.delegate_from_user_id = _user_id
                                      THEN d.delegate_to_user_id ELSE d.delegate_from_user_id END,
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
                                _user_id, wp.regulator_id, wp.regulatory_function_id)->>'can_take')::boolean)),
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

  RETURN v_res;
END;
$$;

-- ---------- F2: Entity Access ----------
CREATE OR REPLACE FUNCTION public.people_access_entity_overview(_entity_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  END IF;
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'user_management','view')
          OR public.has_permission(v_uid,'licensee_management','view')) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;

  RETURN jsonb_build_object(
    'entity', (SELECT jsonb_build_object('id', l.id, 'name', l.name, 'status', l.status,
                        'sector_id', l.sector_id, 'sub_sector_id', l.sub_sector_id)
                 FROM public.licensees l WHERE l.id = _entity_id),
    'memberships', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'user_id', m.user_id,
               'user_name', coalesce(p.full_name, p.email), 'email', p.email,
               'membership_role', mr.label, 'membership_role_key', mr.key,
               'is_primary_representative', mr.is_primary_representative,
               'status', m.status,
               'effective_from', m.effective_from, 'effective_to', m.effective_to,
               'expired', m.effective_to IS NOT NULL AND m.effective_to <= now(),
               'capabilities', (SELECT coalesce(jsonb_agg(rp.capability ORDER BY rp.capability),'[]'::jsonb)
                                  FROM public.entity_membership_role_permissions rp
                                 WHERE rp.membership_role_id = m.membership_role_id))
               ORDER BY m.created_at DESC),'[]'::jsonb)
        FROM public.entity_user_memberships m
        LEFT JOIN public.entity_membership_roles mr ON mr.id = m.membership_role_id
        LEFT JOIN public.profiles p ON p.id = m.user_id
       WHERE m.entity_id = _entity_id),
    'portal_access', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'user_id', a.user_id, 'user_name', coalesce(p.full_name, p.email),
               'access_type', a.access_type, 'is_active', a.is_active,
               'start_date', a.start_date, 'end_date', a.end_date) ORDER BY a.created_at DESC),'[]'::jsonb)
        FROM public.entity_user_access a
        LEFT JOIN public.profiles p ON p.id = a.user_id
       WHERE a.entity_id = _entity_id),
    'supervision_ownership', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'assignment_id', e.id, 'regulator_id', e.regulator_id,
               'regulatory_function_id', e.regulatory_function_id,
               'lead_supervisor_user_id', e.lead_supervisor_user_id,
               'alternate_supervisor_user_id', e.alternate_supervisor_user_id,
               'team_id', e.team_id, 'is_primary', e.is_primary, 'status', e.status)
               ORDER BY e.created_at DESC),'[]'::jsonb)
        FROM public.entity_supervision_assignments e
       WHERE e.entity_id = _entity_id AND e.status = 'active'),
    'access_history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object('action', a.action, 'entity_type', a.entity_type,
               'created_at', a.created_at, 'metadata', a.metadata) ORDER BY a.created_at DESC),'[]'::jsonb)
        FROM (SELECT * FROM public.audit_logs
               WHERE entity_id = _entity_id::text
                 AND entity_type IN ('entity_user_memberships','entity_user_access','licensees')
               ORDER BY created_at DESC LIMIT 50) a),
    'read_model', 'people_access_entity_overview',
    'is_authoritative_source', false);
END;
$$;

-- ---------- F3: Service Providers ----------
CREATE OR REPLACE FUNCTION public.people_access_provider_overview(_provider_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean;
  v_is_member boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  END IF;
  v_is_staff := public.is_internal_staff(v_uid);
  SELECT EXISTS (SELECT 1 FROM public.service_provider_members m
                  WHERE m.provider_id = _provider_id AND m.user_id = v_uid
                    AND m.status = 'active') INTO v_is_member;
  IF NOT ((v_is_staff AND (public.is_super_admin(v_uid)
                           OR public.has_permission(v_uid,'user_management','view')
                           OR public.has_permission(v_uid,'application_management','view')))
          OR v_is_member) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;

  RETURN jsonb_build_object(
    'provider', (SELECT jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name,
                          'provider_type', p.provider_type, 'status', p.status,
                          'nda_reference', p.nda_reference,
                          'security_clearance_confirmed', p.security_clearance_confirmed)
                   FROM public.service_providers p WHERE p.id = _provider_id),
    'engagements', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', e.id, 'reference', e.reference, 'regulator_id', e.regulator_id,
               'regulatory_function_id', e.regulatory_function_id,
               'capabilities', e.capabilities, 'nda_confirmed', e.nda_confirmed,
               'effective_from', e.effective_from, 'effective_to', e.effective_to,
               'status', e.status,
               'expired', e.effective_to IS NOT NULL AND e.effective_to <= now())
               ORDER BY e.created_at DESC),'[]'::jsonb)
        FROM public.provider_engagements e WHERE e.provider_id = _provider_id),
    'users', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', m.id, 'user_id', m.user_id,
               'user_name', coalesce(pr.full_name, pr.email),
               'member_role', m.member_role, 'capabilities', m.capabilities,
               'nda_accepted_at', m.nda_accepted_at, 'status', m.status,
               'effective_to', m.effective_to,
               'expired', m.effective_to IS NOT NULL AND m.effective_to <= now())
               ORDER BY m.created_at DESC),'[]'::jsonb)
        FROM public.service_provider_members m
        LEFT JOIN public.profiles pr ON pr.id = m.user_id
       WHERE m.provider_id = _provider_id
         -- Provider members see their own roster only; staff see everything.
         AND (v_is_staff OR m.provider_id = _provider_id)),
    'assigned_packages', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', w.id, 'reference', w.reference, 'state', w.state,
               'subject_module', w.subject_module, 'service_task_id', w.service_task_id,
               'assigned_member_id', w.assigned_member_id, 'due_at', w.due_at,
               'submitted_at', w.submitted_at, 'accepted_at', w.accepted_at,
               'permitted_data', w.permitted_data)
               ORDER BY w.created_at DESC),'[]'::jsonb)
        FROM public.provider_work_packages w
        JOIN public.provider_engagements e ON e.id = w.engagement_id
       WHERE e.provider_id = _provider_id
         AND (v_is_staff OR public.provider_can_access_work_package(v_uid, w.id))),
    'access_history', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'work_package_id', ev.work_package_id, 'from_state', ev.from_state,
               'to_state', ev.to_state, 'actor_context', ev.actor_context,
               'created_at', ev.created_at) ORDER BY ev.created_at DESC),'[]'::jsonb)
        FROM (SELECT ev.* FROM public.provider_work_package_events ev
                JOIN public.provider_work_packages w ON w.id = ev.work_package_id
                JOIN public.provider_engagements e ON e.id = w.engagement_id
               WHERE e.provider_id = _provider_id
                 AND (v_is_staff OR public.provider_can_access_work_package(v_uid, w.id))
               ORDER BY ev.created_at DESC LIMIT 100) ev),
    'read_model', 'people_access_provider_overview',
    'is_authoritative_source', false);
END;
$$;

-- ---------- F4: My Work (read-only aggregation over existing module truth) ----------
CREATE OR REPLACE FUNCTION public.my_work_queue(_limit integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim integer := LEAST(GREATEST(coalesce(_limit,25), 1), 100);
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED');
  END IF;

  -- Provider identities only ever see their own scoped work packages.
  IF NOT public.is_internal_staff(v_uid) THEN
    IF NOT public.is_provider_member(v_uid) THEN
      RETURN jsonb_build_object('items','[]'::jsonb,'counts','{}'::jsonb,
        'context','none','read_model','my_work_queue','is_authoritative_source',false);
    END IF;
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'due_at' NULLS LAST),'[]'::jsonb) INTO v_items
      FROM (SELECT jsonb_build_object('source','provider_work_package','id', w.id,
                     'reference', w.reference, 'title', coalesce(t.name, w.subject_module),
                     'status', w.state, 'due_at', w.due_at,
                     'route', '/provider/work-packages/' || w.id) x
              FROM public.provider_work_packages w
              LEFT JOIN public.regulatory_service_tasks t ON t.id = w.service_task_id
             WHERE public.provider_can_access_work_package(v_uid, w.id)
             ORDER BY w.due_at NULLS LAST LIMIT v_lim) s;
    RETURN jsonb_build_object('items', v_items,
      'counts', jsonb_build_object('provider_work_packages', jsonb_array_length(v_items)),
      'context','provider','read_model','my_work_queue','is_authoritative_source',false);
  END IF;

  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO v_items FROM (
    SELECT jsonb_build_object('source','application','id', a.id, 'reference', a.application_number,
             'title', a.license_type, 'status', a.status, 'due_at', NULL,
             'priority', a.priority, 'route', '/licensing/applications/' || a.id) x,
           a.updated_at AS ord
      FROM public.applications a
     WHERE a.assigned_to = v_uid AND a.status NOT IN ('draft','approved','rejected','cancelled')
     ORDER BY a.updated_at DESC LIMIT v_lim
  ) s;

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','complaint','id', c.id, 'reference', c.complaint_number,
               'title', c.subject, 'status', c.status, 'due_at', c.sla_due_at,
               'priority', c.priority, 'route', '/complaints/' || c.id) x
        FROM public.complaints c
       WHERE c.investigator_id = v_uid AND c.closed_at IS NULL
       ORDER BY c.sla_due_at NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','complaint_task','id', t.id, 'reference', NULL,
               'title', t.title, 'status', t.status, 'due_at', t.due_date,
               'priority', t.priority, 'route', '/complaints/' || t.complaint_id) x
        FROM public.complaint_investigation_tasks t
       WHERE t.owner_id = v_uid AND t.status <> 'completed'
       ORDER BY t.due_date NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','conduct_attention','id', ai.id, 'reference', ai.reference,
               'title', ai.title, 'status', ai.status, 'due_at', ai.target_review_date,
               'priority', coalesce(ai.confirmed_priority, ai.calculated_priority),
               'route', '/conduct/attention/' || ai.id) x
        FROM public.conduct_attention_items ai
       WHERE ai.owner_id = v_uid AND ai.closed_at IS NULL
       ORDER BY ai.target_review_date NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','conduct_intervention','id', iv.id, 'reference', iv.reference,
               'title', iv.title, 'status', iv.status, 'due_at', iv.planned_end,
               'priority', NULL, 'route', '/conduct/interventions/' || iv.id) x
        FROM public.conduct_interventions iv
       WHERE iv.owner_id = v_uid AND iv.completed_at IS NULL
       ORDER BY iv.planned_end NULLS LAST LIMIT v_lim) s);

  v_items := v_items || (
    SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
      SELECT jsonb_build_object('source','provider_work_package','id', w.id, 'reference', w.reference,
               'title', 'Provider submission awaiting internal acceptance', 'status', w.state,
               'due_at', w.due_at, 'priority', NULL,
               'route', '/admin/people-access?provider_package=' || w.id) x
        FROM public.provider_work_packages w
       WHERE w.state IN ('SUBMITTED','INTERNAL_REVIEW')
       ORDER BY w.submitted_at DESC NULLS LAST LIMIT v_lim) s);

  RETURN jsonb_build_object(
    'items', v_items,
    'counts', (SELECT coalesce(jsonb_object_agg(src, n),'{}'::jsonb)
                 FROM (SELECT it->>'source' AS src, count(*) AS n
                         FROM jsonb_array_elements(v_items) it GROUP BY 1) c),
    'context','internal',
    'read_model','my_work_queue',
    'is_authoritative_source', false);
END;
$$;

REVOKE ALL ON FUNCTION public.people_access_internal_profile(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.people_access_entity_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.people_access_provider_overview(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_work_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.people_access_internal_profile(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.people_access_entity_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.people_access_provider_overview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_work_queue(integer) TO authenticated, service_role;