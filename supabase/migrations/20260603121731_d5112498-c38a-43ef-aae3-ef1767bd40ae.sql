INSERT INTO public.notification_event_configs
  (event_key, description, title_template, message_template, email_subject_template, email_body_template, channels, recipient_rules, notification_type, dedupe_window_seconds, is_active)
VALUES
(
  'application.resubmitted.applicant',
  'Sent to the applicant after a resubmission is accepted by the server.',
  'Application Resubmitted - {{application_number}}',
  'Your application {{application_number}} has been resubmitted successfully and is back under review.',
  'Application Resubmitted Successfully - {{application_number}}',
  'Hi {{applicant_name}},

Your application has been resubmitted successfully and is back under review by the regulator.

Application Number: {{application_number}}
License Type: {{license_type}}
Sector: {{sector_name}}
Sub-Sector: {{sub_sector_name}}
Category: {{category_name}}
Resubmitted At: {{resubmitted_at}}
Current Step: {{current_workflow_step}}

We will notify you once the review progresses. You can track the latest status from your dashboard.

Thank you,
{{company_name}}',
  ARRAY['in_app','email'],
  '[{"type":"applicant"}]'::jsonb,
  'info',
  60,
  true
),
(
  'application.resubmitted.reviewer',
  'Sent to assigned workflow reviewers / sector regulators when an applicant resubmits.',
  'Application Resubmitted for Review - {{application_number}}',
  '{{applicant_name}} has resubmitted application {{application_number}}. It is awaiting your review at step "{{current_workflow_step}}".',
  'Application Resubmitted for Review - {{application_number}}',
  'Hello {{reviewer_name}},

The applicant has resubmitted an application that requires your review.

Applicant: {{applicant_name}} ({{applicant_email}})
Application Number: {{application_number}}
License Type: {{license_type}}
Sector: {{sector_name}}
Sub-Sector: {{sub_sector_name}}
Category: {{category_name}}
Resubmitted At: {{resubmitted_at}}
Current Step: {{current_workflow_step}}
Previous Status: {{previous_status}}

Applicant Comments: {{resubmission_comments}}

Please open the application to continue the review.

Regards,
{{company_name}}',
  ARRAY['in_app','email'],
  '[{"type":"workflow_step_approvers"},{"type":"sector_regulators"}]'::jsonb,
  'info',
  60,
  true
)
ON CONFLICT (event_key) DO UPDATE
SET description = EXCLUDED.description,
    title_template = EXCLUDED.title_template,
    message_template = EXCLUDED.message_template,
    email_subject_template = EXCLUDED.email_subject_template,
    email_body_template = EXCLUDED.email_body_template,
    channels = EXCLUDED.channels,
    recipient_rules = EXCLUDED.recipient_rules,
    notification_type = EXCLUDED.notification_type,
    is_active = true,
    updated_at = now();