CREATE OR REPLACE FUNCTION public.execute_complaint_workflow_action(_complaint_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_complaint public.complaints%ROWTYPE;
  v_instance public.workflow_instances%ROWTYPE;
  v_step public.approval_steps%ROWTYPE;
  v_action public.approval_step_actions%ROWTYPE;
  v_next_step public.approval_steps%ROWTYPE;
  v_user_role text; v_kind text;
  v_history_id uuid := gen_random_uuid();
  v_correlation uuid := gen_random_uuid();
  v_enf_id uuid; v_next_assignee uuid; v_next_role text;
  v_before jsonb; v_after jsonb; v_req jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMPLAINT_NOT_FOUND'; END IF;
  IF NOT (public.is_super_admin(v_user) OR public.has_complaint_perm(v_user, 'edit')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  SELECT * INTO v_instance FROM public.workflow_instances
    WHERE entity_type='complaint' AND entity_id=_complaint_id AND status IN ('active','paused')
    ORDER BY started_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NO_ACTIVE_WORKFLOW'; END IF;

  IF _expected_updated_at IS NOT NULL AND v_instance.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'STALE_STATE';
  END IF;

  SELECT * INTO v_step FROM public.approval_steps WHERE id=v_instance.current_step_id;
  SELECT * INTO v_action FROM public.approval_step_actions
    WHERE step_id=v_step.id AND action_key=_action_key AND is_enabled=true;
  IF NOT FOUND THEN RAISE EXCEPTION 'ACTION_NOT_ALLOWED_AT_STEP'; END IF;

  SELECT role::text INTO v_user_role FROM public.user_roles WHERE user_id=v_user LIMIT 1;
  IF array_length(v_action.allowed_role_slugs,1)>0
     AND NOT (v_user_role = ANY(v_action.allowed_role_slugs))
     AND NOT public.has_role(v_user,'super_admin'::app_role) THEN
    RAISE EXCEPTION 'ROLE_NOT_PERMITTED';
  END IF;

  FOR v_req IN SELECT * FROM jsonb_array_elements(v_action.required_fields) LOOP
    IF (v_req->>'required')::boolean IS TRUE AND (_payload -> (v_req->>'key')) IS NULL THEN
      RAISE EXCEPTION 'MISSING_REQUIRED_FIELD:%', v_req->>'key';
    END IF;
  END LOOP;

  v_kind := v_action.mutation_spec->>'kind';
  v_before := to_jsonb(v_complaint);

  IF v_kind='complaint_status' THEN
    UPDATE public.complaints SET status=v_action.mutation_spec->>'status', updated_at=now() WHERE id=_complaint_id;
  ELSIF v_kind='assign_investigator' THEN
    UPDATE public.complaints SET investigator_id=(_payload->>'investigator_id')::uuid, status='under_investigation', updated_at=now() WHERE id=_complaint_id;
  ELSIF v_kind='resolve_complaint' THEN
    UPDATE public.complaints SET status='resolved', resolution=COALESCE(_payload->>'resolution',resolution), resolution_notes=COALESCE(_payload->>'resolution',resolution_notes), resolved_at=now(), updated_at=now() WHERE id=_complaint_id;
  ELSIF v_kind='close_complaint' THEN
    UPDATE public.complaints SET status='closed', closure_reason=_payload->>'closure_reason', closed_at=now(), closed_by=v_user, updated_at=now() WHERE id=_complaint_id;
  ELSIF v_kind='escalate_to_enforcement' THEN
    IF (_payload->>'licensee_id') IS NOT NULL THEN
      UPDATE public.complaints SET licensee_id=(_payload->>'licensee_id')::uuid WHERE id=_complaint_id;
    END IF;
    INSERT INTO public.enforcement_actions (entity_id, case_number, enforcement_type, date_opened, status, description, findings, source_type, source_reference_id, opened_by)
    VALUES (
      (SELECT licensee_id FROM public.complaints WHERE id=_complaint_id),
      'ENF-'||to_char(now(),'YYYY')||'-'||lpad(nextval('public.enforcement_actions_seq')::text,5,'0'),
      'complaint_escalation', current_date,'open',
      'Escalated from complaint '||v_complaint.complaint_number,
      _payload->>'findings','complaint',_complaint_id,v_user
    ) RETURNING id INTO v_enf_id;
    UPDATE public.complaints SET enforcement_action_id=v_enf_id, updated_at=now() WHERE id=_complaint_id;
    INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'case_opened',v_user,_payload->>'findings');
  ELSIF v_kind IN ('enforcement_notice','enforcement_response','enforcement_decision','enforcement_payment','enforcement_appeal','enforcement_close','enforcement_withdraw') THEN
    v_enf_id := v_complaint.enforcement_action_id;
    IF v_enf_id IS NULL THEN RAISE EXCEPTION 'NO_ENFORCEMENT_CASE'; END IF;
    IF v_kind='enforcement_notice' THEN
      UPDATE public.enforcement_actions SET status='notice_issued', notice_issued_at=now(), updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'notice_issued',v_user,_payload->>'note');
    ELSIF v_kind='enforcement_response' THEN
      UPDATE public.enforcement_actions SET status='response_received', response_received_at=now(), response_summary=_payload->>'response_summary', updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'response_received',v_user,_payload->>'response_summary');
    ELSIF v_kind='enforcement_decision' THEN
      UPDATE public.enforcement_actions SET status='decided', decision_at=now(), decision_outcome=_payload->>'decision_outcome', decision_rationale=_payload->>'decision_rationale', penalty_amount=NULLIF(_payload->>'penalty_amount','')::numeric, updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'decision_recorded',v_user,_payload->>'decision_rationale');
    ELSIF v_kind='enforcement_payment' THEN
      UPDATE public.enforcement_actions SET penalty_paid_amount=COALESCE(penalty_paid_amount,0)+COALESCE(NULLIF(_payload->>'penalty_paid_amount','')::numeric,0), updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'payment_received',v_user,_payload->>'penalty_paid_amount');
    ELSIF v_kind='enforcement_appeal' THEN
      UPDATE public.enforcement_actions SET status='appealed', updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'appeal_filed',v_user,_payload->>'note');
    ELSIF v_kind='enforcement_close' THEN
      UPDATE public.enforcement_actions SET status='closed', closed_at=now(), closed_by=v_user, resolution_date=current_date, updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'case_closed',v_user,_payload->>'note');
      UPDATE public.complaints SET status='closed', closed_at=now(), closed_by=v_user, closure_reason=_payload->>'note', updated_at=now() WHERE id=_complaint_id;
    ELSIF v_kind='enforcement_withdraw' THEN
      UPDATE public.enforcement_actions SET status='withdrawn', closed_at=now(), closed_by=v_user, updated_at=now() WHERE id=v_enf_id;
      INSERT INTO public.enforcement_case_events(case_id,event_type,actor_id,note) VALUES(v_enf_id,'case_withdrawn',v_user,_payload->>'note');
      UPDATE public.complaints SET status='closed', closed_at=now(), closed_by=v_user, closure_reason=_payload->>'note', updated_at=now() WHERE id=_complaint_id;
    END IF;
  END IF;

  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id;
  v_after := to_jsonb(v_complaint);

  IF v_action.next_step_id IS NOT NULL THEN
    SELECT * INTO v_next_step FROM public.approval_steps WHERE id=v_action.next_step_id;

    IF v_action.next_assignee_rule->>'kind'='payload_user' THEN
      v_next_assignee := (_payload->>(v_action.next_assignee_rule->>'field'))::uuid;
    ELSIF v_action.next_assignee_rule->>'kind'='role' THEN
      v_next_role := v_action.next_assignee_rule->>'role';
    ELSIF v_action.next_assignee_rule->>'kind'='inherit_step' THEN
      IF v_next_step.assignment_rule->>'kind'='investigator' THEN
        v_next_assignee := v_complaint.investigator_id;
      ELSIF v_next_step.assignment_rule->>'kind'='role' THEN
        v_next_role := v_next_step.assignment_rule->>'role';
      END IF;
    END IF;

    UPDATE public.workflow_instances
      SET current_step_id=v_next_step.id, current_step_key=v_next_step.step_key,
          assigned_user_id=v_next_assignee, assigned_role=COALESCE(v_next_role,assigned_role),
          due_at=CASE WHEN v_next_step.sla_hours>0 THEN now()+(v_next_step.sla_hours||' hours')::interval ELSE NULL END,
          status=CASE WHEN v_next_step.is_terminal THEN 'completed' ELSE 'active' END,
          completed_at=CASE WHEN v_next_step.is_terminal THEN now() ELSE NULL END,
          updated_at=now()
      WHERE id=v_instance.id;
  END IF;

  INSERT INTO public.approval_actions (id, workflow_instance_id, step_id, action, action_type, actor_id, comments, entity_type, entity_id, responded_at)
  VALUES (v_history_id, v_instance.id, v_step.id, v_action.action_key, v_action.action_type, v_user, _payload->>'comments','complaint',_complaint_id, now());

  INSERT INTO public.audit_logs (entity_type, entity_id, action, user_id, metadata)
  VALUES ('complaint',_complaint_id,'complaint.'||_action_key,v_user,
    jsonb_build_object('before',v_before,'after',v_after,'action_key',_action_key,'workflow_instance',v_instance.id,'correlation_id',v_correlation,'payload',_payload));

  IF v_action.notification_event_key IS NOT NULL THEN
    IF v_action.complainant_visible AND v_complaint.complainant_id IS NOT NULL THEN
      INSERT INTO public.notification_outbox(event_key,entity_type,entity_id,recipient_user_id,channel,subject,body,payload,action_history_id,correlation_id)
      VALUES(v_action.notification_event_key,'complaint',_complaint_id,v_complaint.complainant_id,'in_app',
             'Complaint update: '||v_action.label,
             'Your complaint '||v_complaint.complaint_number||' — '||v_action.label,
             _payload,v_history_id,v_correlation)
      ON CONFLICT DO NOTHING;
      IF v_complaint.email IS NOT NULL THEN
        INSERT INTO public.notification_outbox(event_key,entity_type,entity_id,recipient_email,channel,subject,body,payload,action_history_id,correlation_id)
        VALUES(v_action.notification_event_key,'complaint',_complaint_id,v_complaint.email,'email',
               'Update on your complaint '||v_complaint.complaint_number,
               'Status: '||v_action.label,
               _payload,v_history_id,v_correlation)
        ON CONFLICT DO NOTHING;
      END IF;
    END IF;

    IF v_next_assignee IS NOT NULL THEN
      INSERT INTO public.notification_outbox(event_key,entity_type,entity_id,recipient_user_id,channel,subject,body,payload,action_history_id,correlation_id)
      VALUES(v_action.notification_event_key,'complaint',_complaint_id,v_next_assignee,'in_app',
             'Complaint assigned to you: '||v_complaint.complaint_number,v_action.label,
             _payload,v_history_id,v_correlation)
      ON CONFLICT DO NOTHING;
    END IF;

    IF v_action.licensee_visible AND v_complaint.licensee_id IS NOT NULL THEN
      INSERT INTO public.notification_outbox(event_key,entity_type,entity_id,recipient_user_id,channel,subject,body,payload,action_history_id,correlation_id)
      SELECT v_action.notification_event_key,'complaint',_complaint_id,p.id,'in_app',
             'Complaint update: '||v_complaint.complaint_number,v_action.label,
             _payload,v_history_id,v_correlation
      FROM public.profiles p WHERE p.licensee_id=v_complaint.licensee_id
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok',true,'complaint_id',_complaint_id,'action_key',_action_key,
    'new_status',v_complaint.status,'enforcement_action_id',v_complaint.enforcement_action_id,
    'workflow_instance_id',v_instance.id,'action_history_id',v_history_id);
END;
$function$;