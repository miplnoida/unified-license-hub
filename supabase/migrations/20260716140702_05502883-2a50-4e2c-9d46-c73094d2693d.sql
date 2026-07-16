
-- 1) Schema extensions
ALTER TABLE public.approval_steps
  ADD COLUMN IF NOT EXISTS step_key text,
  ADD COLUMN IF NOT EXISTS is_start boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_terminal boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS complainant_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS licensee_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS assignment_rule jsonb NOT NULL DEFAULT '{"kind":"role","role":"admin"}'::jsonb,
  ADD COLUMN IF NOT EXISTS public_label text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_steps_workflow_key
  ON public.approval_steps(workflow_id, step_key) WHERE step_key IS NOT NULL;

ALTER TABLE public.approval_step_actions DROP CONSTRAINT IF EXISTS approval_step_actions_step_id_action_type_key;

ALTER TABLE public.approval_step_actions
  ADD COLUMN IF NOT EXISTS action_key text,
  ADD COLUMN IF NOT EXISTS allowed_role_slugs text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS next_assignee_rule jsonb NOT NULL DEFAULT '{"kind":"inherit_step"}'::jsonb,
  ADD COLUMN IF NOT EXISTS complainant_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS licensee_visible boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mutation_spec jsonb NOT NULL DEFAULT '{"kind":"none"}'::jsonb,
  ADD COLUMN IF NOT EXISTS notification_event_key text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_approval_step_actions_step_key
  ON public.approval_step_actions(step_id, action_key) WHERE action_key IS NOT NULL;

ALTER TABLE public.workflow_instances
  ADD COLUMN IF NOT EXISTS assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_role text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_status text NOT NULL DEFAULT 'on_track';

CREATE SEQUENCE IF NOT EXISTS public.enforcement_actions_seq START 1;

-- 2) Notification outbox
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  recipient_user_id uuid,
  recipient_email text,
  channel text NOT NULL CHECK (channel IN ('in_app','email')),
  template_id uuid,
  subject text,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dead')),
  retry_count integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  action_history_id uuid,
  correlation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS ix_notification_outbox_pending
  ON public.notification_outbox(status, next_attempt_at) WHERE status='pending';
CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_outbox_dedupe
  ON public.notification_outbox(event_key, entity_id, coalesce(recipient_user_id::text, recipient_email), channel, coalesce(action_history_id::text, ''));

GRANT SELECT ON public.notification_outbox TO authenticated;
GRANT ALL ON public.notification_outbox TO service_role;
ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "outbox_admin_read" ON public.notification_outbox;
CREATE POLICY "outbox_admin_read" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'super_admin'::app_role));

-- 3) Seed steps + actions
DO $seed$
DECLARE
  v_wf uuid := '26f898d0-f0e9-4649-900f-d1c1eec9391c';
  v_role_id uuid := '670c341e-a6fe-44f0-831e-f464238473a4';
  v_filed uuid; v_triage uuid; v_invest uuid; v_enf uuid;
  v_notice uuid; v_resp uuid; v_dec uuid; v_pay uuid; v_appeal uuid;
  v_closed uuid; v_resolved uuid; v_withdrawn uuid;
BEGIN
  DELETE FROM public.approval_step_actions WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id=v_wf);
  DELETE FROM public.approval_action_notifications WHERE step_id IN (SELECT id FROM public.approval_steps WHERE workflow_id=v_wf);
  DELETE FROM public.approval_steps WHERE workflow_id=v_wf;

  INSERT INTO public.approval_steps (workflow_id, step_order, name, step_key, step_type, approver_type, approver_role_id, approver_config, sla_hours, is_start, is_terminal, complainant_visible, licensee_visible, assignment_rule, public_label, allowed_actions) VALUES
    (v_wf, 10, 'Filed',              'filed',            'sequential','role_based_user',v_role_id,'{"role":"admin"}'::jsonb,       8,true, false,true,true,'{"kind":"role","role":"admin"}'::jsonb,     'Complaint Filed',    '[]'::jsonb),
    (v_wf, 20, 'Triage',             'triage',           'sequential','role_based_user',v_role_id,'{"role":"admin"}'::jsonb,      24,false,false,true,true,'{"kind":"role","role":"admin"}'::jsonb,     'Under Triage',       '[]'::jsonb),
    (v_wf, 30, 'Investigation',      'investigation',    'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb, 120,false,false,true,true,'{"kind":"investigator"}'::jsonb,            'Under Investigation','[]'::jsonb),
    (v_wf, 40, 'Enforcement Opened', 'enforcement',      'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb,  48,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Enforcement Opened', '[]'::jsonb),
    (v_wf, 50, 'Notice Issued',      'notice_issued',    'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb, 240,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Notice Issued',      '[]'::jsonb),
    (v_wf, 60, 'Response Received',  'response_received','sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb,  72,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Response Received',  '[]'::jsonb),
    (v_wf, 70, 'Decision Recorded',  'decision',         'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb,  72,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Decision Recorded',  '[]'::jsonb),
    (v_wf, 80, 'Payment Recorded',   'payment',          'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb, 240,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Payment Recorded',   '[]'::jsonb),
    (v_wf, 85, 'Appeal Filed',       'appeal',           'sequential','role_based_user',v_role_id,'{"role":"regulator"}'::jsonb, 240,false,false,true,true,'{"kind":"role","role":"regulator"}'::jsonb, 'Under Appeal',       '[]'::jsonb),
    (v_wf, 90, 'Resolved',           'resolved',         'sequential','role_based_user',v_role_id,'{"role":"admin"}'::jsonb,       0,false,true, true,true,'{"kind":"none"}'::jsonb,                    'Resolved',           '[]'::jsonb),
    (v_wf, 95, 'Case Closed',        'closed',           'sequential','role_based_user',v_role_id,'{"role":"admin"}'::jsonb,       0,false,true, true,true,'{"kind":"none"}'::jsonb,                    'Closed',             '[]'::jsonb),
    (v_wf, 99, 'Withdrawn',          'withdrawn',        'sequential','role_based_user',v_role_id,'{"role":"admin"}'::jsonb,       0,false,true, true,true,'{"kind":"none"}'::jsonb,                    'Withdrawn',          '[]'::jsonb);

  SELECT id INTO v_filed      FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='filed';
  SELECT id INTO v_triage     FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='triage';
  SELECT id INTO v_invest     FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='investigation';
  SELECT id INTO v_enf        FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='enforcement';
  SELECT id INTO v_notice     FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='notice_issued';
  SELECT id INTO v_resp       FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='response_received';
  SELECT id INTO v_dec        FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='decision';
  SELECT id INTO v_pay        FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='payment';
  SELECT id INTO v_appeal     FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='appeal';
  SELECT id INTO v_closed     FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='closed';
  SELECT id INTO v_resolved   FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='resolved';
  SELECT id INTO v_withdrawn  FROM public.approval_steps WHERE workflow_id=v_wf AND step_key='withdrawn';

  INSERT INTO public.approval_step_actions (step_id, action_type, action_key, label, require_comments, next_step_mode, next_step_id, sort_order, is_enabled, allowed_role_slugs, required_fields, next_assignee_rule, mutation_spec, notification_event_key, complainant_visible, licensee_visible) VALUES
    (v_filed,  'approve','start_triage',           'Start Triage',              false,'specific_step',v_triage,   10,true,ARRAY['admin','super_admin','regulator'],'[]'::jsonb,'{"kind":"role","role":"admin"}'::jsonb,'{"kind":"complaint_status","status":"submitted"}'::jsonb,'complaint.triage_started',true,true),
    (v_triage, 'approve','assign_investigator',    'Assign Investigator',       false,'specific_step',v_invest,   10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"investigator_id","type":"user","required":true,"label":"Investigator"}]'::jsonb,'{"kind":"payload_user","field":"investigator_id"}'::jsonb,'{"kind":"assign_investigator"}'::jsonb,'complaint.assigned',true,true),
    (v_triage, 'approve','resolve_triage',         'Resolve at Triage',         true, 'specific_step',v_resolved, 20,true,ARRAY['admin','super_admin','regulator'],'[{"key":"resolution","type":"text","required":true,"label":"Resolution Note"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"resolve_complaint"}'::jsonb,'complaint.resolved',true,true),
    (v_invest, 'approve','resolve_investigation',  'Resolve Complaint',         true, 'specific_step',v_resolved, 10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"resolution","type":"text","required":true,"label":"Resolution / Findings"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"resolve_complaint"}'::jsonb,'complaint.resolved',true,true),
    (v_invest, 'approve','escalate_to_enforcement','Escalate to Enforcement',   true, 'specific_step',v_enf,      20,true,ARRAY['admin','super_admin','regulator'],'[{"key":"findings","type":"text","required":true,"label":"Findings","minLength":10},{"key":"licensee_id","type":"licensee","required":true,"label":"Linked Licensee"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"escalate_to_enforcement"}'::jsonb,'complaint.escalated_to_enforcement',true,true),
    (v_invest, 'approve','close_no_action',        'Close - No Action Required',true, 'specific_step',v_closed,   30,true,ARRAY['admin','super_admin','regulator'],'[{"key":"closure_reason","type":"text","required":true,"label":"Closure Reason"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"close_complaint","reason_field":"closure_reason"}'::jsonb,'complaint.closed',true,true),
    (v_enf,    'approve','issue_notice',           'Issue Notice',              true, 'specific_step',v_notice,   10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Notice Details"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"enforcement_notice"}'::jsonb,'enforcement.notice_issued',true,true),
    (v_enf,    'approve','withdraw_case',          'Withdraw Case',             true, 'specific_step',v_withdrawn,90,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Withdrawal Reason"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"enforcement_withdraw"}'::jsonb,'enforcement.case_withdrawn',true,true),
    (v_notice, 'approve','record_response',        'Record Licensee Response',  true, 'specific_step',v_resp,     10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"response_summary","type":"text","required":true,"label":"Response Summary"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"enforcement_response"}'::jsonb,'enforcement.response_received',true,true),
    (v_notice, 'approve','withdraw_case',          'Withdraw Case',             true, 'specific_step',v_withdrawn,90,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Withdrawal Reason"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"enforcement_withdraw"}'::jsonb,'enforcement.case_withdrawn',true,true),
    (v_resp,   'approve','record_decision',        'Record Decision',           true, 'specific_step',v_dec,      10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"decision_outcome","type":"text","required":true,"label":"Outcome"},{"key":"decision_rationale","type":"text","required":true,"label":"Rationale"},{"key":"penalty_amount","type":"number","required":false,"label":"Penalty Amount"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"enforcement_decision"}'::jsonb,'enforcement.decision_recorded',true,true),
    (v_dec,    'approve','record_payment',         'Record Penalty Payment',    true, 'specific_step',v_pay,      10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"penalty_paid_amount","type":"number","required":true,"label":"Amount Paid"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"enforcement_payment"}'::jsonb,'enforcement.payment_received',true,true),
    (v_dec,    'approve','file_appeal',            'Record Appeal Filed',       true, 'specific_step',v_appeal,   20,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Appeal Details"}]'::jsonb,'{"kind":"role","role":"regulator"}'::jsonb,'{"kind":"enforcement_appeal"}'::jsonb,'enforcement.appeal_filed',true,true),
    (v_dec,    'approve','close_case',             'Close Case',                true, 'specific_step',v_closed,   30,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Closure Note"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"enforcement_close"}'::jsonb,'enforcement.case_closed',true,true),
    (v_pay,    'approve','close_case',             'Close Case',                true, 'specific_step',v_closed,   10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Closure Note"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"enforcement_close"}'::jsonb,'enforcement.case_closed',true,true),
    (v_appeal, 'approve','close_case',             'Close Case',                true, 'specific_step',v_closed,   10,true,ARRAY['admin','super_admin','regulator'],'[{"key":"note","type":"text","required":true,"label":"Closure Note"}]'::jsonb,'{"kind":"none"}'::jsonb,'{"kind":"enforcement_close"}'::jsonb,'enforcement.case_closed',true,true);
END;
$seed$;

-- 4) Backfill workflow instances
INSERT INTO public.workflow_instances (workflow_id, entity_type, entity_id, current_step_id, current_step_key, status, started_at, assigned_role)
SELECT '26f898d0-f0e9-4649-900f-d1c1eec9391c'::uuid,'complaint',c.id,s.id,s.step_key,
  CASE WHEN c.status IN ('resolved','closed') THEN 'completed' ELSE 'active' END,
  c.created_at,'admin'
FROM public.complaints c
JOIN public.approval_steps s ON s.workflow_id='26f898d0-f0e9-4649-900f-d1c1eec9391c'::uuid
  AND s.step_key = CASE
    WHEN c.status='submitted' THEN 'filed'
    WHEN c.status='under_investigation' AND c.enforcement_action_id IS NOT NULL THEN 'enforcement'
    WHEN c.status='under_investigation' THEN 'investigation'
    WHEN c.status='resolved' THEN 'resolved'
    WHEN c.status='closed' THEN 'closed'
    ELSE 'filed' END
WHERE NOT EXISTS (SELECT 1 FROM public.workflow_instances wi WHERE wi.entity_type='complaint' AND wi.entity_id=c.id);

-- 5) RPCs
CREATE OR REPLACE FUNCTION public.execute_complaint_workflow_action(
  _complaint_id uuid, _action_key text, _payload jsonb DEFAULT '{}'::jsonb, _expected_updated_at timestamptz DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
  IF NOT public.has_complaint_perm(v_user, v_complaint) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

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

  INSERT INTO public.audit_logs (entity_type, entity_id, action, user_id, meta)
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
$$;

GRANT EXECUTE ON FUNCTION public.execute_complaint_workflow_action(uuid,text,jsonb,timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_complaint_available_actions(_complaint_id uuid)
RETURNS TABLE (action_key text, label text, action_type text, require_comments boolean,
               required_fields jsonb, target_step_key text, sort_order integer, mutation_kind text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_user uuid := auth.uid(); v_complaint public.complaints%ROWTYPE; v_user_role text; v_step_id uuid;
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id;
  IF NOT FOUND OR NOT public.has_complaint_perm(v_user, v_complaint) THEN RETURN; END IF;

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
$$;

GRANT EXECUTE ON FUNCTION public.get_complaint_available_actions(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_complaint_tracking(_complaint_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid(); v_complaint public.complaints%ROWTYPE; v_is_internal boolean;
  v_instance public.workflow_instances%ROWTYPE; v_current_step public.approval_steps%ROWTYPE;
  v_steps jsonb; v_events jsonb; v_assignee_name text;
BEGIN
  IF v_user IS NULL THEN RETURN jsonb_build_object('error','AUTH_REQUIRED'); END IF;
  SELECT * INTO v_complaint FROM public.complaints WHERE id=_complaint_id;
  IF NOT FOUND OR NOT public.has_complaint_perm(v_user, v_complaint) THEN
    RETURN jsonb_build_object('error','FORBIDDEN');
  END IF;

  v_is_internal := public.has_role(v_user,'admin'::app_role) OR public.has_role(v_user,'super_admin'::app_role) OR public.has_role(v_user,'regulator'::app_role);

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
$$;

GRANT EXECUTE ON FUNCTION public.get_complaint_tracking(uuid) TO authenticated;
