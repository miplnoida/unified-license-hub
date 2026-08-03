-- 1) Transactional notification event queue (post-commit dispatch spine)
CREATE TABLE IF NOT EXISTS public.notification_event_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  entity_type text,
  entity_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text NOT NULL,
  correlation_id uuid,
  reminder_window text,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  claimed_by text,
  dispatched_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_event_queue_status_chk
    CHECK (status IN ('pending','processing','dispatched','failed','dead')),
  CONSTRAINT notification_event_queue_idem_key UNIQUE (idempotency_key)
);

GRANT SELECT ON public.notification_event_queue TO authenticated;
GRANT ALL ON public.notification_event_queue TO service_role;

ALTER TABLE public.notification_event_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "neq_admin_read" ON public.notification_event_queue;
CREATE POLICY "neq_admin_read" ON public.notification_event_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS notification_event_queue_due_idx
  ON public.notification_event_queue (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS notification_event_queue_entity_idx
  ON public.notification_event_queue (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.notification_event_queue_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_notification_event_queue_touch ON public.notification_event_queue;
CREATE TRIGGER trg_notification_event_queue_touch
  BEFORE UPDATE ON public.notification_event_queue
  FOR EACH ROW EXECUTE FUNCTION public.notification_event_queue_touch();

-- Enqueue helper: safe to call inside business transactions. Never raises.
CREATE OR REPLACE FUNCTION public.notification_enqueue_event(
  _event_key text,
  _entity_type text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _idempotency_suffix text DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _reminder_window text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key text;
  v_id uuid;
BEGIN
  v_key := concat_ws('#',
    _event_key,
    coalesce(_entity_type, '-'),
    coalesce(_entity_id::text, '-'),
    coalesce(_idempotency_suffix, '-'),
    coalesce(_reminder_window, '-')
  );

  INSERT INTO public.notification_event_queue (
    event_key, entity_type, entity_id, payload, idempotency_key, correlation_id, reminder_window
  ) VALUES (
    _event_key, _entity_type, _entity_id, coalesce(_payload, '{}'::jsonb), v_key,
    coalesce(_correlation_id, gen_random_uuid()), _reminder_window
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- A notification must never roll back a completed regulatory transaction.
  RAISE WARNING 'notification_enqueue_event failed for %: %', _event_key, SQLERRM;
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.notification_enqueue_event(text,text,uuid,jsonb,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_enqueue_event(text,text,uuid,jsonb,text,uuid,text) TO service_role;

-- Atomic claim for the queue worker
CREATE OR REPLACE FUNCTION public.claim_notification_event_queue(_limit integer DEFAULT 50, _worker text DEFAULT NULL)
RETURNS SETOF public.notification_event_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.notification_event_queue
    WHERE status = 'pending' AND next_attempt_at <= now()
    ORDER BY created_at
    LIMIT greatest(1, coalesce(_limit, 50))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_event_queue q
     SET status = 'processing', claimed_at = now(), claimed_by = _worker
   WHERE q.id IN (SELECT id FROM claimed)
  RETURNING q.*;
END; $$;

REVOKE ALL ON FUNCTION public.claim_notification_event_queue(integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_notification_event_queue(integer,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reap_stuck_notification_event_queue()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  UPDATE public.notification_event_queue
     SET status = 'pending', claimed_at = NULL, claimed_by = NULL
   WHERE status = 'processing' AND claimed_at < now() - interval '10 minutes';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END; $$;

REVOKE ALL ON FUNCTION public.reap_stuck_notification_event_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reap_stuck_notification_event_queue() TO service_role;

-- 2) Register remaining FRD notification events
CREATE OR REPLACE FUNCTION public.seed_frd_notification_event(
  _event_key text,
  _description text,
  _title text,
  _message text,
  _channels text[],
  _rules jsonb,
  _severity notification_severity,
  _category notification_category,
  _module text,
  _action_required boolean,
  _system_required boolean
) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  INSERT INTO public.notification_event_configs (
    event_key, description, title_template, message_template,
    email_subject_template, email_body_template,
    channels, recipient_rules, notification_type, dedupe_window_seconds,
    is_active, severity, category, module, action_required,
    allow_mute, system_required, delivery_frequency
  ) VALUES (
    _event_key, _description, _title, _message,
    _title, _message,
    _channels, _rules,
    CASE WHEN _severity = 'critical' THEN 'error' WHEN _severity = 'high' THEN 'warning' ELSE 'info' END,
    300, true, _severity, _category, _module, _action_required,
    NOT (_severity IN ('critical','high') OR _system_required),
    _system_required, 'immediate'
  )
  ON CONFLICT (event_key) DO UPDATE SET
    description = COALESCE(public.notification_event_configs.description, EXCLUDED.description),
    channels = EXCLUDED.channels,
    severity = EXCLUDED.severity,
    category = EXCLUDED.category,
    module = EXCLUDED.module,
    action_required = EXCLUDED.action_required,
    allow_mute = EXCLUDED.allow_mute,
    system_required = EXCLUDED.system_required,
    is_active = true,
    updated_at = now();
END; $$;

-- Administration ------------------------------------------------------------
SELECT public.seed_frd_notification_event('workflow.published','Approval workflow version published','Workflow published: {{workflow_name}}','The approval workflow "{{workflow_name}}" version {{version}} was published by {{actor_name}} and now governs new cases.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,'high','system','administration',false,true);
SELECT public.seed_frd_notification_event('rule.activated','Automation/business rule activated','Rule activated: {{rule_name}}','The {{rule_type}} rule "{{rule_name}}" was activated by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,'medium','system','administration',false,false);
SELECT public.seed_frd_notification_event('rule.first_fired','Rule fired for the first time after activation','Rule "{{rule_name}}" fired for the first time','The {{rule_type}} rule "{{rule_name}}" matched a record for the first time ({{source_reference}}). Review the outcome to confirm the configuration behaves as intended.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,'medium','system','administration',true,false);
SELECT public.seed_frd_notification_event('user.role_changed','Internal user role assignment changed','Role change: {{target_user_name}}','Roles for {{target_user_name}} were changed ({{change_summary}}) by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"target_user_id"},{"type":"role","role":"super_admin"}]'::jsonb,'high','system','administration',false,true);
SELECT public.seed_frd_notification_event('notification_template.published','Notification template version published','Template published: {{template_name}}','Notification template "{{template_name}}" version {{version}} was published by {{actor_name}}.',ARRAY['in_app'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,'medium','system','administration',false,false);
SELECT public.seed_frd_notification_event('escalation_rule.changed','Escalation rule created, updated or deactivated','Escalation rule {{change_type}}: {{rule_name}}','Escalation rule "{{rule_name}}" was {{change_type}} by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"}]'::jsonb,'high','system','administration',false,true);

-- Licensing -----------------------------------------------------------------
SELECT public.seed_frd_notification_event('application.officer_assigned','Licensing officer assigned to an application','Application {{application_number}} assigned to you','You have been assigned as licensing officer for application {{application_number}} ({{applicant_name}}).',ARRAY['in_app','email'],'[{"type":"payload_user","key":"assignee_id"}]'::jsonb,'medium','action_required','licensing',true,false);
SELECT public.seed_frd_notification_event('application.analyst_assigned','Analyst assigned to an application','Analyst assignment: {{application_number}}','You have been assigned as analyst for application {{application_number}} ({{applicant_name}}).',ARRAY['in_app','email'],'[{"type":"payload_user","key":"assignee_id"}]'::jsonb,'medium','action_required','licensing',true,false);
SELECT public.seed_frd_notification_event('application.routed_to_legal','Application routed to legal review','Legal review required: {{application_number}}','Application {{application_number}} has been routed to legal/compliance review by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"legal_compliance"}]'::jsonb,'medium','action_required','licensing',true,false);
SELECT public.seed_frd_notification_event('application.legal_review_completed','Legal review completed','Legal review completed: {{application_number}}','Legal review for application {{application_number}} is complete. Outcome: {{outcome}}.',ARRAY['in_app','email'],'[{"type":"previous_workflow_actors"},{"type":"role","role":"licensing_officer"}]'::jsonb,'medium','info','licensing',false,false);
SELECT public.seed_frd_notification_event('application.escalated_to_supervisor','Application escalated to supervisor','Escalation: {{application_number}}','Application {{application_number}} has been escalated to supervisory review. Reason: {{reason}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"}]'::jsonb,'high','alert','licensing',true,true);
SELECT public.seed_frd_notification_event('application.decision_ready','Decision package ready for issue','Decision ready: {{application_number}}','The decision package for application {{application_number}} is ready for dispatch.',ARRAY['in_app','email'],'[{"type":"role","role":"licensing_officer"},{"type":"role","role":"supervisor"}]'::jsonb,'medium','action_required','licensing',true,false);
SELECT public.seed_frd_notification_event('application.decision_dispatched','Decision dispatched to applicant','Decision issued: {{application_number}}','The decision for application {{application_number}} has been issued. Outcome: {{outcome}}.',ARRAY['in_app','email'],'[{"type":"applicant"}]'::jsonb,'high','info','licensing',false,true);
SELECT public.seed_frd_notification_event('license.certificate_issued','Licence certificate issued','Licence certificate issued: {{license_number}}','The licence certificate for {{license_number}} has been issued and is available in your portal.',ARRAY['in_app','email'],'[{"type":"licensee_primary_users"},{"type":"payload_user","key":"applicant_id"}]'::jsonb,'high','info','licensing',false,true);
SELECT public.seed_frd_notification_event('license.varied','Licence variation approved','Licence varied: {{license_number}}','Licence {{license_number}} has been varied. {{variation_summary}}',ARRAY['in_app','email'],'[{"type":"licensee_primary_users"}]'::jsonb,'high','info','licensing',false,true);
SELECT public.seed_frd_notification_event('supervisory_plan.created','Supervisory plan created for a licensee','Supervisory plan created: {{entity_name}}','A supervisory plan has been created for {{entity_name}} for cycle {{cycle}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"payload_user","key":"lead_supervisor_id"}]'::jsonb,'medium','info','prudential',false,false);

-- Fit & Proper --------------------------------------------------------------
SELECT public.seed_frd_notification_event('fp.pq_invitation','Personal questionnaire invitation issued','Personal questionnaire required: {{individual_name}}','A personal questionnaire has been issued for {{individual_name}} in relation to {{source_reference}}. Please complete it by {{due_date}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"individual_user_id"},{"type":"custom_email","key":"individual_email"},{"type":"entity_primary_users"}]'::jsonb,'high','action_required','fit_and_proper',true,true);
SELECT public.seed_frd_notification_event('fp.pq_submitted','Personal questionnaire submitted','Questionnaire submitted: {{individual_name}}','The personal questionnaire for {{individual_name}} has been submitted and is ready for assessment.',ARRAY['in_app','email'],'[{"type":"role","role":"analyst"},{"type":"role","role":"licensing_officer"}]'::jsonb,'medium','action_required','fit_and_proper',true,false);
SELECT public.seed_frd_notification_event('fp.screening_completed','Screening run completed with results','Screening completed: {{individual_name}}','Screening for {{individual_name}} completed with result {{screening_result}} ({{hit_count}} potential matches).',ARRAY['in_app','email'],'[{"type":"role","role":"analyst"},{"type":"payload_user","key":"assigned_to"}]'::jsonb,'medium','action_required','fit_and_proper',true,false);
SELECT public.seed_frd_notification_event('fp.assessment_assigned','Fit and proper assessment assigned','F&P assessment assigned: {{individual_name}}','You have been assigned the fit and proper assessment for {{individual_name}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"assignee_id"}]'::jsonb,'medium','action_required','fit_and_proper',true,false);
SELECT public.seed_frd_notification_event('fp.committee_ready','Case ready for committee consideration','Committee ready: {{individual_name}}','The fit and proper case for {{individual_name}} is ready for committee consideration on {{meeting_date}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"member_user_id"},{"type":"role","role":"supervisor"}]'::jsonb,'medium','action_required','fit_and_proper',true,false);
SELECT public.seed_frd_notification_event('fp.committee_decision','Committee decision recorded','Committee decision: {{individual_name}}','The committee recorded the decision "{{decision}}" for {{individual_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"payload_user","key":"assessor_id"}]'::jsonb,'high','info','fit_and_proper',false,true);
SELECT public.seed_frd_notification_event('fp.determination_dispatched','Determination dispatched to the individual/entity','Determination issued: {{individual_name}}','The fit and proper determination for {{individual_name}} has been issued. Outcome: {{outcome}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"individual_user_id"},{"type":"custom_email","key":"individual_email"},{"type":"entity_primary_users"}]'::jsonb,'high','info','fit_and_proper',false,true);

-- Prudential ----------------------------------------------------------------
SELECT public.seed_frd_notification_event('return.rfi_raised','Information request raised on a return','Information requested: {{return_name}}','Additional information has been requested on return {{return_name}} ({{period}}). Response due {{due_date}}.',ARRAY['in_app','email'],'[{"type":"entity_primary_users"},{"type":"entity_secondary_users"}]'::jsonb,'high','action_required','prudential',true,true);
SELECT public.seed_frd_notification_event('prudential.early_warning_triggered','Early warning indicator triggered','Early warning: {{entity_name}}','Early warning indicator {{indicator_name}} triggered for {{entity_name}} (value {{value}}, threshold {{threshold}}).',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"analyst"}]'::jsonb,'high','alert','prudential',true,true);
SELECT public.seed_frd_notification_event('prudential.examination_assigned','Examination team assignment','Examination assigned: {{entity_name}}','You have been assigned to the {{examination_type}} examination of {{entity_name}} starting {{start_date}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"assignee_id"}]'::jsonb,'medium','action_required','prudential',true,false);
SELECT public.seed_frd_notification_event('prudential.examination_notice_issued','Examination notice issued to entity','Examination notice: {{entity_name}}','An examination notice has been issued to {{entity_name}} for the period commencing {{start_date}}.',ARRAY['in_app','email'],'[{"type":"entity_primary_users"},{"type":"role","role":"supervisor"}]'::jsonb,'high','info','prudential',false,true);
SELECT public.seed_frd_notification_event('prudential.examination_finding_recorded','Examination finding recorded','Examination finding: {{entity_name}}','A {{severity_label}} examination finding was recorded for {{entity_name}}: {{finding_title}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"entity_primary_users"}]'::jsonb,'high','alert','prudential',true,true);
SELECT public.seed_frd_notification_event('prudential.remediation_due','Remediation action due soon','Remediation due {{due_date}}: {{entity_name}}','Remediation action "{{action_title}}" for {{entity_name}} is due on {{due_date}}.',ARRAY['in_app','email'],'[{"type":"entity_primary_users"},{"type":"payload_user","key":"owner_id"}]'::jsonb,'high','action_required','prudential',true,true);
SELECT public.seed_frd_notification_event('prudential.group_contagion_alert','Group-wide contagion risk alert','Group contagion alert: {{group_name}}','Contagion risk detected across the {{group_name}} group: {{summary}}. Affected entities: {{affected_entities}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'critical','alert','prudential',true,true);

-- Market conduct and complaints --------------------------------------------
SELECT public.seed_frd_notification_event('complaint.acknowledged','Complaint acknowledgement to complainant','Complaint {{complaint_number}} received','We have received your complaint {{complaint_number}}. It is being assessed and you will be updated as it progresses.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"complainant_id"},{"type":"custom_email","key":"complainant_email"}]'::jsonb,'medium','info','conduct',false,true);
SELECT public.seed_frd_notification_event('complaint.assigned','Complaint assigned to an investigator','Complaint {{complaint_number}} assigned to you','Complaint {{complaint_number}} has been assigned to you. SLA due {{sla_due_at}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"investigator_id"}]'::jsonb,'medium','action_required','conduct',true,false);
SELECT public.seed_frd_notification_event('complaint.priority_changed','Complaint priority or severity changed','Priority changed: {{complaint_number}}','Complaint {{complaint_number}} priority changed from {{old_priority}} to {{new_priority}} by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"investigator_id"},{"type":"role","role":"supervisor"}]'::jsonb,'high','alert','conduct',false,true);
SELECT public.seed_frd_notification_event('complaint.complainant_update','Progress update issued to the complainant','Update on complaint {{complaint_number}}','There is an update on your complaint {{complaint_number}}: {{update_summary}}',ARRAY['in_app','email'],'[{"type":"payload_user","key":"complainant_id"},{"type":"custom_email","key":"complainant_email"}]'::jsonb,'medium','info','conduct',false,false);
SELECT public.seed_frd_notification_event('complaint.rfi_raised','Information request issued to the entity','Information requested on complaint {{complaint_number}}','Information has been requested from {{entity_name}} on complaint {{complaint_number}}. Response due {{due_date}}.',ARRAY['in_app','email'],'[{"type":"entity_primary_users"},{"type":"entity_secondary_users"}]'::jsonb,'high','action_required','conduct',true,true);
SELECT public.seed_frd_notification_event('complaint.rfi_responded','Entity responded to a complaint information request','Response received: complaint {{complaint_number}}','{{entity_name}} responded to the information request on complaint {{complaint_number}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"investigator_id"}]'::jsonb,'medium','action_required','conduct',true,false);
SELECT public.seed_frd_notification_event('conduct.pattern_alert','Pattern detected across complaints','Complaint pattern alert: {{pattern_label}}','A pattern was detected across {{complaint_count}} complaints ({{pattern_label}}). Review for possible systemic issues.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"analyst"}]'::jsonb,'high','alert','conduct',true,true);
SELECT public.seed_frd_notification_event('conduct.systemic_flag_raised','Complaint flagged as systemic','Systemic issue flagged: {{entity_name}}','Complaint {{complaint_number}} for {{entity_name}} has been flagged as a systemic issue by {{actor_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'critical','alert','conduct',true,true);
SELECT public.seed_frd_notification_event('complaint.outcome_released','Complaint outcome released','Outcome for complaint {{complaint_number}}','The outcome for complaint {{complaint_number}} is now available: {{outcome}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"complainant_id"},{"type":"custom_email","key":"complainant_email"}]'::jsonb,'medium','info','conduct',false,true);
SELECT public.seed_frd_notification_event('complaint.investigation_overdue','Complaint investigation past its SLA','Overdue investigation: {{complaint_number}}','The investigation of complaint {{complaint_number}} is overdue (SLA {{sla_due_at}}).',ARRAY['in_app','email'],'[{"type":"payload_user","key":"investigator_id"},{"type":"role","role":"supervisor"}]'::jsonb,'high','alert','conduct',true,true);

-- Reports and AI ------------------------------------------------------------
SELECT public.seed_frd_notification_event('report.scheduled_delivered','Scheduled report delivered','Report delivered: {{report_name}}','Your scheduled report "{{report_name}}" for {{period}} has been delivered ({{record_count}} rows, {{export_format}}).',ARRAY['in_app','email'],'[{"type":"payload_user","key":"recipient_user_id"},{"type":"custom_email","key":"recipient_email"}]'::jsonb,'low','info','reporting',false,false);
SELECT public.seed_frd_notification_event('report.first_delivery_success','First successful delivery of a new schedule','Schedule confirmed: {{report_name}}','The schedule for "{{report_name}}" delivered successfully for the first time. Future runs will follow {{schedule_summary}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"created_by"}]'::jsonb,'low','info','reporting',false,false);
SELECT public.seed_frd_notification_event('report.delivery_failed','Scheduled report delivery failed','Report delivery failed: {{report_name}}','Delivery of the scheduled report "{{report_name}}" failed: {{error_message}}. The run will be retried.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"created_by"},{"type":"role","role":"super_admin"}]'::jsonb,'high','alert','reporting',true,true);
SELECT public.seed_frd_notification_event('ai.insight_generated','AI insight generated','New AI insight: {{insight_title}}','A new AI insight is available: {{insight_title}}. {{insight_summary}}',ARRAY['in_app'],'[{"type":"payload_user","key":"requested_by"},{"type":"role","role":"supervisor"}]'::jsonb,'low','info','reporting',false,false);
SELECT public.seed_frd_notification_event('ai.critical_insight','Critical AI insight requiring review','Critical AI insight: {{insight_title}}','A critical AI insight requires supervisory review: {{insight_title}}. {{insight_summary}}',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,'critical','alert','reporting',true,true);
SELECT public.seed_frd_notification_event('ai.processing_failed','AI processing failure','AI processing failed: {{job_label}}','AI processing for {{job_label}} failed: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'high','alert','reporting',true,true);

-- Escalations ---------------------------------------------------------------
SELECT public.seed_frd_notification_event('escalation.created','Escalation raised on the shared spine','Escalation raised: {{escalation_ref}}','A {{severity}} escalation ({{escalation_type}}) was raised for {{source_reference}}. Acknowledgement due {{acknowledgement_deadline}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"payload_user","key":"assigned_user_id"}]'::jsonb,'high','action_required','system',true,true);
SELECT public.seed_frd_notification_event('escalation.tier_advanced','Escalation advanced to the next tier','Escalation {{escalation_ref}} now at tier {{current_tier}}','Escalation {{escalation_ref}} advanced to tier {{current_tier}} without acknowledgement. Source: {{source_reference}}.',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"},{"type":"payload_user","key":"assigned_user_id"}]'::jsonb,'critical','alert','system',true,true);
SELECT public.seed_frd_notification_event('escalation.ownership_assigned','Escalation ownership taken or assigned','Escalation {{escalation_ref}} assigned to you','You now own escalation {{escalation_ref}} ({{escalation_type}}). Resolution due {{resolution_deadline}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"assigned_user_id"}]'::jsonb,'high','action_required','system',true,true);
SELECT public.seed_frd_notification_event('escalation.resolved','Escalation resolved with narrative','Escalation resolved: {{escalation_ref}}','Escalation {{escalation_ref}} was resolved by {{actor_name}}. {{resolution_narrative}}',ARRAY['in_app','email'],'[{"type":"role","role":"supervisor"},{"type":"payload_user","key":"assigned_user_id"}]'::jsonb,'medium','info','system',false,false);

-- System health -------------------------------------------------------------
SELECT public.seed_frd_notification_event('system_health.smtp_failure_threshold','Email delivery failure threshold breached','Email delivery failures: {{failure_count}} in {{window_label}}','{{failure_count}} email deliveries failed in the last {{window_label}}. Latest error: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.sms_provider_failure','SMS provider unavailable or failing','SMS provider failure','SMS delivery is failing ({{failure_count}} failures in {{window_label}}). Latest error: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.integration_failure','Integration failure threshold breached','Integration failing: {{integration_key}}','Integration {{integration_key}} recorded {{failure_count}} failures in {{window_label}}. Latest error: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.scheduler_failure','Scheduled job failures detected','Scheduler failures detected','{{failure_count}} scheduled jobs failed in the last {{window_label}}. Latest: {{job_label}} — {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.cron_failure','Database cron job failure','Cron job failed: {{job_label}}','The cron job {{job_label}} failed at {{occurred_at}}: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.notification_queue_backlog','Notification queue backlog above threshold','Notification backlog: {{backlog_count}} pending','{{backlog_count}} notifications are pending delivery (oldest {{oldest_age}}). Investigate the delivery workers.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);
SELECT public.seed_frd_notification_event('system_health.dispatch_failure_repeated','Repeated dispatch failure for the same event','Repeated dispatch failure: {{event_key}}','Event {{event_key}} has failed to dispatch {{failure_count}} times. Latest error: {{error_message}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"}]'::jsonb,'critical','system','system',true,true);

DROP FUNCTION IF EXISTS public.seed_frd_notification_event(text,text,text,text,text[],jsonb,notification_severity,notification_category,text,boolean,boolean);