INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template,
   email_subject_template, email_body_template, channels, recipient_rules,
   notification_type, dedupe_window_seconds)
VALUES
  (
    'application.submitted.applicant',
    'Confirmation email to the applicant after successful application submission.',
    'Application Submitted Successfully',
    'Your application {{application_number}} has been submitted successfully and is now under review.',
    'Application Submitted Successfully - {{application_number}}',
    E'Hi {{applicant_name}},\n\nYour application has been submitted successfully and is now under review by the regulator.\n\nApplication Number: {{application_number}}\nLicense Type: {{license_type}}\nSector: {{sector_name}}\nSub-Sector: {{sub_sector_name}}\nCategory: {{category_name}}\nSubmitted On: {{submitted_at}}\n\nYou will be notified by email as your application moves through the review workflow. You can track its status any time from your portal dashboard.\n\nThank you for using {{company_name}}.',
    ARRAY['in_app','email'],
    '[{"type":"applicant"}]'::jsonb,
    'success',
    86400
  ),
  (
    'application.submitted.reviewer',
    'Notification to workflow reviewers when a new application is assigned for review.',
    'New Application Assigned for Review',
    'New application {{application_number}} from {{applicant_name}} is awaiting review at step "{{current_workflow_step}}".',
    'New Application Assigned for Review - {{application_number}}',
    E'A new application has been submitted and assigned to your queue for review.\n\nApplication Number: {{application_number}}\nApplicant: {{applicant_name}} ({{applicant_email}})\nLicense Type: {{license_type}}\nSector: {{sector_name}}\nSub-Sector: {{sub_sector_name}}\nCategory: {{category_name}}\nSubmitted On: {{submitted_at}}\nCurrent Step: {{current_workflow_step}}\n\nPlease open the portal to review the submitted forms, supporting documents and take action.',
    ARRAY['in_app','email'],
    '[{"type":"workflow_step_approvers"},{"type":"sector_regulators"}]'::jsonb,
    'info',
    86400
  )
ON CONFLICT (event_key) DO UPDATE SET
  description              = EXCLUDED.description,
  title_template           = EXCLUDED.title_template,
  message_template         = EXCLUDED.message_template,
  email_subject_template   = EXCLUDED.email_subject_template,
  email_body_template      = EXCLUDED.email_body_template,
  channels                 = EXCLUDED.channels,
  recipient_rules          = EXCLUDED.recipient_rules,
  notification_type        = EXCLUDED.notification_type,
  is_active                = true,
  dedupe_window_seconds    = EXCLUDED.dedupe_window_seconds,
  updated_at               = now();