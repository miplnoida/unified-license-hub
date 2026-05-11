-- Make seeding idempotent: enforce uniqueness on (event_type, channel, regulator scope)
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_event_channel_reg_uq
  ON public.notification_templates (
    event_type,
    channel,
    COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

INSERT INTO public.notification_templates
  (name, event_type, channel, subject, body, variables, is_active)
VALUES
  -- Registration
  ('Registration Received (Applicant)','registration.submitted','in_app','Registration Received','Your registration {{registration_reference}} has been received and is awaiting review.','["registration_reference","applicant_name"]'::jsonb,true),
  ('Registration Received (Applicant Email)','registration.submitted','email','Registration Received: {{registration_reference}}','Hello {{applicant_name}},\n\nWe have received your registration ({{registration_reference}}). Our team will review it shortly.','["registration_reference","applicant_name"]'::jsonb,true),
  ('New Registration (Regulators)','registration.received','in_app','New Registration Submitted','A new registration {{registration_reference}} from {{applicant_name}} has been submitted.','["registration_reference","applicant_name","sector_name"]'::jsonb,true),
  ('New Registration (Regulators Email)','registration.received','email','New Registration: {{registration_reference}}','A new registration ({{registration_reference}}) was submitted by {{applicant_name}} ({{applicant_email}}). Sector: {{sector_name}}.','["registration_reference","applicant_name","applicant_email","sector_name"]'::jsonb,true),
  ('Registration Approved','registration.approved','in_app','Registration Approved','Your registration {{registration_reference}} has been approved.','["registration_reference"]'::jsonb,true),
  ('Registration Approved (Email)','registration.approved','email','Registration Approved: {{registration_reference}}','Your registration ({{registration_reference}}) has been approved.','["registration_reference"]'::jsonb,true),
  ('Registration Rejected','registration.rejected','in_app','Registration Rejected','Your registration {{registration_reference}} has been rejected. {{comments}}','["registration_reference","comments"]'::jsonb,true),
  ('Registration Rejected (Email)','registration.rejected','email','Registration Rejected: {{registration_reference}}','Your registration ({{registration_reference}}) has been rejected. Remarks: {{comments}}','["registration_reference","comments"]'::jsonb,true),

  -- Application lifecycle
  ('Application Submitted','application.submitted','in_app','Application Submitted','Your application {{application_number}} has been submitted and is now under review.','["application_number"]'::jsonb,true),
  ('Application Submitted (Email)','application.submitted','email','Application Submitted: {{application_number}}','Your application ({{application_number}}) has been submitted and is now under review.','["application_number"]'::jsonb,true),
  ('Workflow Action Taken','application.workflow_action_taken','in_app','Update on application {{application_number}}','Action "{{action_type}}" was taken on application {{application_number}}. {{comments}}','["application_number","action_type","comments","actor_name"]'::jsonb,true),
  ('Workflow Step Approved','application.approved_step','in_app','Application {{application_number}}: step approved','Application {{application_number}} step "{{step_name}}" was approved. It is now at the next stage.','["application_number","step_name"]'::jsonb,true),
  ('Application Sent Back','application.send_back','in_app','Application {{application_number}}: sent back','Application {{application_number}} was sent back from "{{step_name}}". Remarks: {{comments}}','["application_number","step_name","comments"]'::jsonb,true),
  ('Application Sent Back (Email)','application.send_back','email','Application {{application_number}} was sent back','Application {{application_number}} was sent back from step "{{step_name}}". Remarks: {{comments}}','["application_number","step_name","comments"]'::jsonb,true),
  ('Resubmission Requested','application.resubmission_requested','in_app','Resubmission Requested: {{application_number}}','Your application {{application_number}} requires revisions. Remarks: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Resubmission Requested (Email)','application.resubmission_requested','email','Resubmission Requested: {{application_number}}','Your application ({{application_number}}) requires revisions. Remarks: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Application Rejected','application.rejected','in_app','Application Rejected: {{application_number}}','Your application {{application_number}} was rejected. Remarks: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Application Rejected (Email)','application.rejected','email','Application Rejected: {{application_number}}','Your application ({{application_number}}) has been rejected. Remarks: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Application Final Approved','application.final_approved','in_app','Application Approved: {{application_number}}','Your application {{application_number}} has been approved. License Number: {{license_number}}.','["application_number","license_number"]'::jsonb,true),
  ('Application Final Approved (Email)','application.final_approved','email','Application Approved: {{application_number}} — License {{license_number}}','Your application ({{application_number}}) has been approved. License Number: {{license_number}}.','["application_number","license_number"]'::jsonb,true),
  ('Application Cancelled','application.cancelled','in_app','Application Cancelled: {{application_number}}','Application {{application_number}} has been cancelled.','["application_number"]'::jsonb,true),

  -- License / licensee
  ('License Issued','license.created','in_app','License Issued: {{license_number}}','License {{license_number}} has been issued.','["license_number","application_number"]'::jsonb,true),
  ('License Issued (Email)','license.created','email','License Issued: {{license_number}}','License {{license_number}} has been issued for application {{application_number}}.','["license_number","application_number"]'::jsonb,true),
  ('Licensee Created','licensee.created','in_app','Licensee Created: {{licensee_name}}','Licensee {{licensee_name}} has been created.','["licensee_name"]'::jsonb,true),
  ('License Status Changed','license.status_changed','in_app','License {{license_number}}: status changed','License {{license_number}} status changed from {{old_status}} to {{new_status}}. {{comments}}','["license_number","old_status","new_status","comments"]'::jsonb,true),
  ('License Status Changed (Email)','license.status_changed','email','License {{license_number}} status updated','License {{license_number}} status changed from {{old_status}} to {{new_status}}. Remarks: {{comments}}','["license_number","old_status","new_status","comments"]'::jsonb,true),

  -- Entity users
  ('Primary User Created','entity.primary_user_created','in_app','New Primary User Added','A primary user ({{full_name}}) was added to {{entity_name}}.','["full_name","entity_name","email"]'::jsonb,true),
  ('Primary User Created (Email)','entity.primary_user_created','email','New Primary User: {{full_name}}','A primary user ({{full_name}} <{{email}}>) was added to {{entity_name}}.','["full_name","email","entity_name"]'::jsonb,true),
  ('Secondary User Created','entity.secondary_user_created','in_app','New Secondary User Added','A secondary user ({{full_name}}) was added to {{entity_name}}.','["full_name","entity_name","email"]'::jsonb,true),
  ('Secondary User Created (Email)','entity.secondary_user_created','email','New Secondary User: {{full_name}}','A secondary user ({{full_name}} <{{email}}>) was added to {{entity_name}}.','["full_name","email","entity_name"]'::jsonb,true),
  ('User Role Changed','entity.user_role_changed','in_app','Your role was updated','Your role on {{entity_name}} was changed to {{new_role}}.','["entity_name","new_role"]'::jsonb,true),
  ('Access Revoked','entity.user_access_revoked','in_app','Access revoked','Your access to {{entity_name}} has been revoked.','["entity_name"]'::jsonb,true),
  ('Access Revoked (Email)','entity.user_access_revoked','email','Access revoked: {{entity_name}}','Your access to {{entity_name}} has been revoked.','["entity_name"]'::jsonb,true),

  -- Regulator
  ('Regulator Action on Application','regulator.action_taken_on_application','in_app','Regulator action on {{application_number}}','A regulator took action ({{action_type}}) on application {{application_number}}.','["application_number","action_type"]'::jsonb,true),
  ('Regulator Comment / Query','regulator.comment_added_or_query_raised','in_app','New regulator comment on {{application_number}}','A regulator added a comment on application {{application_number}}: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Regulator Comment / Query (Email)','regulator.comment_added_or_query_raised','email','New comment on application {{application_number}}','A regulator added a comment on your application {{application_number}}: {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Regulator Assignment Changed','regulator.assignment_changed','in_app','Application {{application_number}} reassigned','Application {{application_number}} was reassigned.','["application_number"]'::jsonb,true),

  -- Compliance returns
  ('Return Due Reminder','compliance.return_due','in_app','Compliance return due','Your return {{return_name}} is due on {{due_date}}.','["return_name","due_date"]'::jsonb,true),
  ('Return Due Reminder (Email)','compliance.return_due','email','Return due: {{return_name}} ({{due_date}})','Your return ({{return_name}}) is due on {{due_date}}. Please file before the deadline.','["return_name","due_date"]'::jsonb,true),
  ('Return Submitted','compliance.return_submitted','in_app','Return submitted: {{return_name}}','Return {{return_name}} was submitted by {{actor_name}}.','["return_name","actor_name"]'::jsonb,true),
  ('Return Reviewed','compliance.return_reviewed','in_app','Return reviewed: {{return_name}}','Your return {{return_name}} has been reviewed.','["return_name","comments"]'::jsonb,true),
  ('Return Reviewed (Email)','compliance.return_reviewed','email','Return reviewed: {{return_name}}','Your return ({{return_name}}) has been reviewed. Remarks: {{comments}}','["return_name","comments"]'::jsonb,true),
  ('Return Changes Requested','compliance.return_rejected_or_changes_requested','in_app','Changes requested on {{return_name}}','Changes were requested on your return {{return_name}}. Remarks: {{comments}}','["return_name","comments"]'::jsonb,true),
  ('Return Changes Requested (Email)','compliance.return_rejected_or_changes_requested','email','Changes requested on {{return_name}}','Changes were requested on your return {{return_name}}. Remarks: {{comments}}','["return_name","comments"]'::jsonb,true),

  -- Payments
  ('Payment Required','payment.required','in_app','Payment required: {{application_number}}','A payment of {{amount}} {{currency}} is required for {{application_number}}.','["application_number","amount","currency"]'::jsonb,true),
  ('Payment Required (Email)','payment.required','email','Payment required: {{application_number}}','A payment of {{amount}} {{currency}} is required for {{application_number}} before submission can proceed.','["application_number","amount","currency"]'::jsonb,true),
  ('Payment Received','payment.received','in_app','Payment received: {{receipt_number}}','Your payment of {{amount}} {{currency}} for {{application_number}} has been received.','["receipt_number","amount","currency","application_number"]'::jsonb,true),
  ('Payment Received (Email)','payment.received','email','Payment receipt: {{receipt_number}}','Your payment of {{amount}} {{currency}} for {{application_number}} has been received. Receipt: {{receipt_number}}.','["receipt_number","amount","currency","application_number"]'::jsonb,true),
  ('Payment Failed','payment.failed','in_app','Payment failed: {{application_number}}','Your payment for {{application_number}} failed. Please try again. {{comments}}','["application_number","comments"]'::jsonb,true),
  ('Payment Failed (Email)','payment.failed','email','Payment failed: {{application_number}}','Your payment for {{application_number}} failed. {{comments}} Please try again.','["application_number","comments"]'::jsonb,true)
ON CONFLICT (event_type, channel, COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;