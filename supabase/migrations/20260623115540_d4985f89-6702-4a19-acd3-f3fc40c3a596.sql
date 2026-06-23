
DO $$
DECLARE
  v_workflow_id uuid := gen_random_uuid();
  v_version_id  uuid := gen_random_uuid();
  v_step1_id    uuid := gen_random_uuid();
  v_step2_id    uuid := gen_random_uuid();
  v_step3_id    uuid := gen_random_uuid();
  v_local1 text := 'de660e7e-1dcb-4c6b-8f6f-8b17081e6511';
  v_local2 text := '4f22774e-6602-407d-afc8-58d5a412ebe3';
  v_local3 text := '93af3f29-e635-4657-959e-5a5d2bf73630';
  v_role_officer  uuid := '745d7e65-6d87-4014-9b7f-0cc9d07d0054';
  v_role_analyst  uuid := '4251af42-18da-4535-b9c6-9005d948cd30';
  v_role_approver uuid := 'b5c0d563-3923-4164-88d3-4b93bdb45509';
  v_snapshot jsonb;
  v_app_id uuid := 'b7496054-080b-4652-b404-edb903280a5d';
BEGIN
  v_snapshot := jsonb_build_object(
    'version', gen_random_uuid()::text,
    'steps', jsonb_build_array(
      jsonb_build_object('local_id', v_local1,'name','Step 1','step_order',1,'approver_type','role_based_user','approver_role','licensing_officer','approver_role_id', v_role_officer,'approver_config','{}'::jsonb,'sla_hours',1,'sla_warning_threshold_percent',80,'escalation_after_hours',NULL,'sla_pause_on_rfi',false,'auto_approve_on_timeout',false,'allowed_actions',jsonb_build_array('approve','reject','send_back'),'description',NULL,'entry_notifications','[]'::jsonb,'action_notifications','[]'::jsonb,
        'actions', jsonb_build_array(
          jsonb_build_object('action_type','approve','label','Approve','is_enabled',true,'require_comments',true,'next_step_mode','next','next_step_local_id',NULL,'end_state',NULL,'result_status_override',NULL,'sort_order',1),
          jsonb_build_object('action_type','reject','label','Reject','is_enabled',true,'require_comments',true,'next_step_mode','end_workflow','next_step_local_id',NULL,'end_state','rejected','result_status_override',NULL,'sort_order',2),
          jsonb_build_object('action_type','send_back','label','Send Back','is_enabled',true,'require_comments',false,'next_step_mode','previous','next_step_local_id',NULL,'end_state',NULL,'result_status_override',NULL,'sort_order',3))),
      jsonb_build_object('local_id', v_local2,'name','Step 2','step_order',2,'approver_type','role_based_user','approver_role','analyst','approver_role_id', v_role_analyst,'approver_config','{}'::jsonb,'sla_hours',1,'sla_warning_threshold_percent',80,'escalation_after_hours',NULL,'sla_pause_on_rfi',false,'auto_approve_on_timeout',false,'allowed_actions',jsonb_build_array('approve','reject','send_back'),'description',NULL,'entry_notifications','[]'::jsonb,'action_notifications','[]'::jsonb,
        'actions', jsonb_build_array(
          jsonb_build_object('action_type','approve','label','Approve','is_enabled',true,'require_comments',true,'next_step_mode','next','next_step_local_id',NULL,'end_state',NULL,'result_status_override',NULL,'sort_order',1),
          jsonb_build_object('action_type','reject','label','Reject','is_enabled',true,'require_comments',true,'next_step_mode','end_workflow','next_step_local_id',NULL,'end_state','rejected','result_status_override',NULL,'sort_order',2),
          jsonb_build_object('action_type','send_back','label','Send Back','is_enabled',true,'require_comments',false,'next_step_mode','previous','next_step_local_id',NULL,'end_state',NULL,'result_status_override',NULL,'sort_order',3))),
      jsonb_build_object('local_id', v_local3,'name','Step 3','step_order',3,'approver_type','role_based_user','approver_role','admin','approver_role_id', v_role_approver,'approver_config','{}'::jsonb,'sla_hours',1,'sla_warning_threshold_percent',80,'escalation_after_hours',NULL,'sla_pause_on_rfi',false,'auto_approve_on_timeout',false,'allowed_actions',jsonb_build_array('approve','reject','send_back'),'description',NULL,'entry_notifications','[]'::jsonb,'action_notifications','[]'::jsonb,
        'actions', jsonb_build_array(
          jsonb_build_object('action_type','approve','label','Approve','is_enabled',true,'require_comments',true,'next_step_mode','end_workflow','next_step_local_id',NULL,'end_state','approved','result_status_override',NULL,'sort_order',1),
          jsonb_build_object('action_type','reject','label','Reject','is_enabled',true,'require_comments',true,'next_step_mode','end_workflow','next_step_local_id',NULL,'end_state','rejected','result_status_override',NULL,'sort_order',2),
          jsonb_build_object('action_type','send_back','label','Send Back','is_enabled',true,'require_comments',false,'next_step_mode','previous','next_step_local_id',NULL,'end_state',NULL,'result_status_override',NULL,'sort_order',3))))
  );

  INSERT INTO public.approval_workflows
    (id, name, description, license_type, entity_type, is_active, regulator_id)
  VALUES
    (v_workflow_id, 'Application Review (Default)', 'Default 3-step application review workflow (1h SLA).', 'Application', 'post_application', true,
     '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3');

  INSERT INTO public.approval_workflow_versions
    (id, workflow_id, version_number, status, snapshot, published_at)
  VALUES
    (v_version_id, v_workflow_id, 1, 'published', v_snapshot, now());

  UPDATE public.approval_workflows
    SET current_published_version_id = v_version_id
    WHERE id = v_workflow_id;

  INSERT INTO public.approval_steps
    (id, workflow_id, step_order, name, approver_role, approver_type, approver_role_id, approver_config,
     sla_hours, sla_warning_threshold_percent, allowed_actions, is_required, step_type)
  VALUES
    (v_step1_id, v_workflow_id, 1, 'Step 1', 'licensing_officer', 'role_based_user', v_role_officer,  '{}'::jsonb, 1, 80, '["approve","reject","send_back"]'::jsonb, true, 'sequential'),
    (v_step2_id, v_workflow_id, 2, 'Step 2', 'analyst',           'role_based_user', v_role_analyst,  '{}'::jsonb, 1, 80, '["approve","reject","send_back"]'::jsonb, true, 'sequential'),
    (v_step3_id, v_workflow_id, 3, 'Step 3', 'admin',             'role_based_user', v_role_approver, '{}'::jsonb, 1, 80, '["approve","reject","send_back"]'::jsonb, true, 'sequential');

  INSERT INTO public.approval_step_actions
    (step_id, action_type, label, require_comments, next_step_mode, end_state, sort_order, is_enabled)
  VALUES
    (v_step1_id, 'approve',   'Approve',   true,  'next',          NULL,       1, true),
    (v_step1_id, 'reject',    'Reject',    true,  'end_workflow',  'rejected', 2, true),
    (v_step1_id, 'send_back', 'Send Back', false, 'previous',      NULL,       3, true),
    (v_step2_id, 'approve',   'Approve',   true,  'next',          NULL,       1, true),
    (v_step2_id, 'reject',    'Reject',    true,  'end_workflow',  'rejected', 2, true),
    (v_step2_id, 'send_back', 'Send Back', false, 'previous',      NULL,       3, true),
    (v_step3_id, 'approve',   'Approve',   true,  'end_workflow',  'approved', 1, true),
    (v_step3_id, 'reject',    'Reject',    true,  'end_workflow',  'rejected', 2, true),
    (v_step3_id, 'send_back', 'Send Back', false, 'previous',      NULL,       3, true);

  INSERT INTO public.workflow_instances
    (entity_type, entity_id, status, current_step_id, current_step_key, started_at, updated_at, version_snapshot, workflow_id)
  VALUES
    ('application', v_app_id, 'active', v_step1_id, v_local1,
     '2026-06-23 09:56:48.124891+00'::timestamptz, now(), v_snapshot, v_workflow_id);
END $$;
