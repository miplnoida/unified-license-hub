CREATE TABLE IF NOT EXISTS public.notification_event_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  description text,
  title_template text NOT NULL,
  message_template text NOT NULL,
  email_subject_template text,
  email_body_template text,
  channels text[] NOT NULL DEFAULT ARRAY['in_app']::text[],
  recipient_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  notification_type text NOT NULL DEFAULT 'info',
  dedupe_window_seconds integer NOT NULL DEFAULT 60,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_event_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read notification event configs" ON public.notification_event_configs;
CREATE POLICY "Admins read notification event configs"
  ON public.notification_event_configs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage notification event configs" ON public.notification_event_configs;
CREATE POLICY "Admins manage notification event configs"
  ON public.notification_event_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.notif_event_configs_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_notif_event_configs_updated_at ON public.notification_event_configs;
CREATE TRIGGER trg_notif_event_configs_updated_at
  BEFORE UPDATE ON public.notification_event_configs
  FOR EACH ROW EXECUTE FUNCTION public.notif_event_configs_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.notification_dispatch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  entity_type text,
  entity_id text,
  recipient_user_id uuid,
  channel text NOT NULL DEFAULT 'in_app',
  dedupe_key text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS notif_dispatch_log_dedupe_key ON public.notification_dispatch_log(dedupe_key);
CREATE INDEX IF NOT EXISTS notif_dispatch_log_event_recipient ON public.notification_dispatch_log(event_key, recipient_user_id, created_at DESC);
ALTER TABLE public.notification_dispatch_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read dispatch log" ON public.notification_dispatch_log;
CREATE POLICY "Admins read dispatch log"
  ON public.notification_dispatch_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.notification_recipients_for_role(_role text)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ur.user_id FROM public.user_roles ur WHERE ur.role::text = _role
  UNION
  SELECT udr.user_id FROM public.user_dynamic_roles udr
    JOIN public.roles r ON r.id = udr.role_id WHERE r.system_role = _role;
$$;

INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type) VALUES
  ('registration.submitted','Pre-licensee registration submitted','Registration Received','Your registration {{registration_reference}} has been received and is awaiting review.','Registration Received: {{registration_reference}}','Hello {{applicant_name}},\n\nWe have received your registration ({{registration_reference}}). Our team will review it shortly.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"applicant_id"}]'::jsonb,'info'),
  ('registration.received','Notify regulators/admins about a new registration','New Registration Submitted','A new registration {{registration_reference}} from {{applicant_name}} has been submitted.','New Registration: {{registration_reference}}','A new registration ({{registration_reference}}) was submitted by {{applicant_name}} ({{applicant_email}}). Sector: {{sector_name}}.',ARRAY['in_app','email'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"sector_regulators"}]'::jsonb,'info'),
  ('registration.approved','Registration approved','Registration Approved','Your registration {{registration_reference}} has been approved.','Registration Approved: {{registration_reference}}','Your registration ({{registration_reference}}) has been approved.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"applicant_id"}]'::jsonb,'success'),
  ('registration.rejected','Registration rejected','Registration Rejected','Your registration {{registration_reference}} has been rejected. {{comments}}','Registration Rejected: {{registration_reference}}','Your registration ({{registration_reference}}) has been rejected. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"payload_user","key":"applicant_id"}]'::jsonb,'error'),
  ('application.submitted','Application submitted','Application Submitted','Your application {{application_number}} has been submitted and is now under review.','Application Submitted: {{application_number}}','Your application ({{application_number}}) has been submitted and is now under review.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"role","role":"super_admin"},{"type":"sector_regulators"}]'::jsonb,'info'),
  ('application.workflow_action_taken','Workflow action taken','Update on application {{application_number}}','Action "{{action_type}}" was taken on application {{application_number}}. {{comments}}','Application {{application_number}}: {{action_type}}','Action "{{action_type}}" was taken on application {{application_number}} by {{actor_name}}. Remarks: {{comments}}',ARRAY['in_app'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'info'),
  ('application.approved_step','Workflow step approved (not final)','Application {{application_number}}: step approved','Application {{application_number}} step "{{step_name}}" was approved. It is now at the next stage.',NULL,NULL,ARRAY['in_app'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"workflow_step_approvers"}]'::jsonb,'success'),
  ('application.send_back','Application sent back','Application {{application_number}}: sent back','Application {{application_number}} was sent back from "{{step_name}}". Remarks: {{comments}}','Application {{application_number}} was sent back','Application {{application_number}} was sent back from step "{{step_name}}". Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"previous_workflow_actors"},{"type":"workflow_step_approvers"}]'::jsonb,'warning'),
  ('application.resubmission_requested','Resubmission requested','Resubmission Requested: {{application_number}}','Your application {{application_number}} requires revisions. Remarks: {{comments}}','Resubmission Requested: {{application_number}}','Your application ({{application_number}}) requires revisions. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'warning'),
  ('application.rejected','Application rejected','Application Rejected: {{application_number}}','Your application {{application_number}} was rejected. Remarks: {{comments}}','Application Rejected: {{application_number}}','Your application ({{application_number}}) has been rejected. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'error'),
  ('application.final_approved','Application final-approved','Application Approved: {{application_number}}','Your application {{application_number}} has been approved. License Number: {{license_number}}.','Application Approved: {{application_number}} — License {{license_number}}','Your application ({{application_number}}) has been approved. License Number: {{license_number}}.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"},{"type":"sector_regulators"}]'::jsonb,'success'),
  ('application.cancelled','Application cancelled','Application Cancelled: {{application_number}}','Application {{application_number}} has been cancelled.',NULL,NULL,ARRAY['in_app'],'[{"type":"applicant"},{"type":"role","role":"super_admin"},{"type":"sector_regulators"}]'::jsonb,'info'),
  ('license.created','License issued','License Issued: {{license_number}}','License {{license_number}} has been issued.','License Issued: {{license_number}}','License {{license_number}} has been issued for application {{application_number}}.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"},{"type":"sector_regulators"}]'::jsonb,'success'),
  ('licensee.created','Licensee created','Licensee Created: {{licensee_name}}','Licensee {{licensee_name}} has been created.',NULL,NULL,ARRAY['in_app'],'[{"type":"role","role":"super_admin"},{"type":"role","role":"admin"},{"type":"sector_regulators"}]'::jsonb,'info'),
  ('license.status_changed','License status changed','License {{license_number}}: status changed','License {{license_number}} status changed from {{old_status}} to {{new_status}}. {{comments}}','License {{license_number}} status updated','License {{license_number}} status changed from {{old_status}} to {{new_status}}. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"},{"type":"sector_regulators"}]'::jsonb,'warning'),
  ('entity.primary_user_created','Primary entity user created','New Primary User Added','A primary user ({{full_name}}) was added to {{entity_name}}.','New Primary User: {{full_name}}','A primary user ({{full_name}} <{{email}}>) was added to {{entity_name}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"new_user_id"},{"type":"licensee_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'info'),
  ('entity.secondary_user_created','Secondary entity user created','New Secondary User Added','A secondary user ({{full_name}}) was added to {{entity_name}}.','New Secondary User: {{full_name}}','A secondary user ({{full_name}} <{{email}}>) was added to {{entity_name}}.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"new_user_id"},{"type":"licensee_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'info'),
  ('entity.user_role_changed','User role changed','Your role was updated','Your role on {{entity_name}} was changed to {{new_role}}.',NULL,NULL,ARRAY['in_app'],'[{"type":"payload_user","key":"affected_user_id"},{"type":"licensee_primary_users"}]'::jsonb,'info'),
  ('entity.user_access_revoked','User access revoked','Access revoked','Your access to {{entity_name}} has been revoked.','Access revoked: {{entity_name}}','Your access to {{entity_name}} has been revoked.',ARRAY['in_app','email'],'[{"type":"payload_user","key":"affected_user_id"},{"type":"licensee_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'warning'),
  ('regulator.action_taken_on_application','Regulator action on application','Regulator action on {{application_number}}','A regulator took action ({{action_type}}) on application {{application_number}}.',NULL,NULL,ARRAY['in_app'],'[{"type":"role","role":"super_admin"},{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'info'),
  ('regulator.comment_added_or_query_raised','Regulator comment/query','New regulator comment on {{application_number}}','A regulator added a comment on application {{application_number}}: {{comments}}','New comment on application {{application_number}}','A regulator added a comment on your application {{application_number}}: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'info'),
  ('regulator.assignment_changed','Regulator assignment changed','Application {{application_number}} reassigned','Application {{application_number}} was reassigned.',NULL,NULL,ARRAY['in_app'],'[{"type":"payload_user","key":"new_assignee_id"},{"type":"payload_user","key":"previous_assignee_id"},{"type":"role","role":"super_admin"}]'::jsonb,'info'),
  ('compliance.return_due','Compliance return due','Compliance return due','Your return {{return_name}} is due on {{due_date}}.','Return due: {{return_name}} ({{due_date}})','Your return ({{return_name}}) is due on {{due_date}}. Please file before the deadline.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'warning'),
  ('compliance.return_submitted','Return submitted','Return submitted: {{return_name}}','Return {{return_name}} was submitted by {{actor_name}}.',NULL,NULL,ARRAY['in_app'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"sector_regulators"}]'::jsonb,'info'),
  ('compliance.return_reviewed','Return reviewed','Return reviewed: {{return_name}}','Your return {{return_name}} has been reviewed.','Return reviewed: {{return_name}}','Your return ({{return_name}}) has been reviewed. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'success'),
  ('compliance.return_rejected_or_changes_requested','Return rejected/changes requested','Changes requested on {{return_name}}','Changes were requested on your return {{return_name}}. Remarks: {{comments}}','Changes requested on {{return_name}}','Changes were requested on your return {{return_name}}. Remarks: {{comments}}',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'warning'),
  ('payment.required','Payment required','Payment required: {{application_number}}','A payment of {{amount}} {{currency}} is required for {{application_number}}.','Payment required: {{application_number}}','A payment of {{amount}} {{currency}} is required for {{application_number}} before submission can proceed.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'warning'),
  ('payment.received','Payment received','Payment received: {{receipt_number}}','Your payment of {{amount}} {{currency}} for {{application_number}} has been received.','Payment receipt: {{receipt_number}}','Your payment of {{amount}} {{currency}} for {{application_number}} has been received. Receipt: {{receipt_number}}.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"},{"type":"role","role":"super_admin"}]'::jsonb,'success'),
  ('payment.failed','Payment failed','Payment failed: {{application_number}}','Your payment for {{application_number}} failed. Please try again. {{comments}}','Payment failed: {{application_number}}','Your payment for {{application_number}} failed. {{comments}} Please try again.',ARRAY['in_app','email'],'[{"type":"applicant"},{"type":"entity_primary_users"}]'::jsonb,'error')
ON CONFLICT (event_key) DO NOTHING;