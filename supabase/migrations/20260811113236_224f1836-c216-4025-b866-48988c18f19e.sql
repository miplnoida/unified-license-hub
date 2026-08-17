CREATE OR REPLACE FUNCTION public.get_complaint_tracking(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_user uuid := auth.uid(); v_complaint public.complaints%ROWTYPE; v_is_internal boolean;
  v_instance public.workflow_instances%ROWTYPE; v_current_step public.approval_steps%ROWTYPE;
  v_steps jsonb; v_events jsonb; v_assignee_name text; v_staff boolean;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error','AUTH_REQUIRED'); END IF;
  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id;
  v_staff := public.has_complaint_perm(v_user,'view');
  IF NOT FOUND OR NOT (v_staff OR public.external_can_access_complaint(v_user, _complaint_id, 'view')) THEN
    RETURN jsonb_build_object('error','FORBIDDEN');
  END IF;

  v_is_internal := v_staff AND public.is_internal_staff(v_user);

  SELECT * INTO v_instance FROM public.workflow_instances
    WHERE entity_type='complaint' AND entity_id=_complaint_id ORDER BY started_at DESC LIMIT 1;

  IF v_instance.id IS NOT NULL THEN
    SELECT * INTO v_current_step FROM public.approval_steps WHERE id=v_instance.current_step_id;
    SELECT full_name INTO v_assignee_name FROM public.profiles WHERE id=v_instance.assigned_user_id;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('step_key',s.step_key,'label',COALESCE(s.public_label,s.name),
    'order',s.step_order,'is_current',s.id=v_instance.current_step_id,
    'is_terminal',s.is_terminal,'is_start',s.is_start) ORDER BY s.step_order) INTO v_steps
  FROM public.approval_steps s WHERE s.workflow_id=v_instance.workflow_id
    AND (v_is_internal OR s.complainant_visible OR s.licensee_visible);

  SELECT jsonb_agg(evt ORDER BY (evt->>'when') DESC) INTO v_events FROM (
    SELECT jsonb_build_object('source','workflow','when',aa.responded_at,
      'title',COALESCE(a.label,aa.action),
      'note',CASE WHEN v_is_internal THEN aa.comments ELSE NULL END,
      'actor',CASE WHEN v_is_internal THEN p.full_name ELSE NULL END) AS evt
    FROM public.approval_actions aa
    LEFT JOIN public.approval_step_actions a ON a.step_id=aa.step_id AND a.action_key=aa.action
    LEFT JOIN public.profiles p ON p.id=aa.actor_id
    WHERE aa.entity_type='complaint' AND aa.entity_id=_complaint_id
      AND (v_is_internal OR a.complainant_visible=true OR a.licensee_visible=true)
    UNION ALL
    SELECT jsonb_build_object('source','enforcement','when',e.created_at,
      'title',initcap(replace(e.event_type,'_',' ')),
      'note',CASE WHEN v_is_internal THEN e.note ELSE NULL END,
      'actor',CASE WHEN v_is_internal THEN p.full_name ELSE NULL END)
    FROM public.enforcement_case_events e LEFT JOIN public.profiles p ON p.id=e.actor_id
    WHERE e.case_id=v_complaint.enforcement_action_id
  ) x;

  RETURN jsonb_build_object(
    'complaint_number',v_complaint.complaint_number,'status',v_complaint.status,
    'current_step_key',v_current_step.step_key,
    'current_step_label',COALESCE(v_current_step.public_label,v_current_step.name),
    'assigned_user_name',CASE WHEN v_is_internal THEN v_assignee_name ELSE NULL END,
    'assigned_role',CASE WHEN v_is_internal THEN v_instance.assigned_role ELSE NULL END,
    'due_at',v_instance.due_at,'sla_status',v_instance.sla_status,
    'instance_updated_at',v_instance.updated_at,
    'steps',COALESCE(v_steps,'[]'::jsonb),
    'events',COALESCE(v_events,'[]'::jsonb),
    'is_internal',v_is_internal);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_complaint_available_actions(_complaint_id uuid)
RETURNS TABLE(action_key text, label text, action_type text, require_comments boolean, required_fields jsonb, target_step_key text, sort_order integer, mutation_kind text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_user uuid := auth.uid(); v_complaint public.complaints%ROWTYPE; v_user_role text; v_step_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id;
  IF NOT FOUND OR NOT public.has_complaint_perm(v_user,'view') THEN RETURN; END IF;

  SELECT current_step_id INTO v_step_id FROM public.workflow_instances
    WHERE entity_type='complaint' AND entity_id=_complaint_id AND status IN ('active','paused')
    ORDER BY started_at DESC LIMIT 1;
  IF v_step_id IS NULL THEN RETURN; END IF;

  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id=v_user LIMIT 1;

  RETURN QUERY
  SELECT a.action_key, a.label, a.action_type, a.require_comments, a.required_fields,
         ns.step_key, a.sort_order, a.mutation_spec->>'kind'
  FROM public.approval_step_actions a
  LEFT JOIN public.approval_steps ns ON ns.id=a.next_step_id
  WHERE a.step_id=v_step_id AND a.is_enabled=true AND a.action_key IS NOT NULL
    AND (array_length(a.allowed_role_slugs,1) IS NULL OR array_length(a.allowed_role_slugs,1)=0
         OR v_user_role = ANY(a.allowed_role_slugs) OR public.has_role(v_user,'super_admin'::app_role))
  ORDER BY a.sort_order;
END;
$fn$;