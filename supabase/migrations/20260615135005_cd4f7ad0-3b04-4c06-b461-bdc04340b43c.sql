
-- Seed default notification_templates for all workflow action events.
-- Idempotent: ON CONFLICT (event_type, channel, regulator_id) DO NOTHING.

WITH seed(event_type, channel, name, subject, body) AS (
  VALUES
  -- ── Application workflow ──────────────────────────────────────────────
  ('application.escalated','email','Application Escalated (Email)',
    'Application {{application_number}} escalated to senior reviewer',
    E'Dear {{applicant_name}},\n\nYour application {{application_number}} has been escalated to a senior reviewer at step "{{step_name}}" by {{actor_name}}.\n\nRemarks: {{comments}}\n\nYou will be notified of the next update.\n\nPortal: {{portal_url}}'),
  ('application.escalated','in_app','Application Escalated',
    'Application {{application_number}} escalated',
    'Application {{application_number}} was escalated at step {{step_name}}.'),

  ('application.returned_for_correction','email','Application Returned for Correction (Email)',
    'Action required: Application {{application_number}} returned for correction',
    E'Dear {{applicant_name}},\n\nYour application {{application_number}} has been returned for correction by {{actor_name}} at step "{{step_name}}".\n\nReviewer remarks:\n{{comments}}\n\nPlease log in, update the requested details, and resubmit.\n\nPortal: {{portal_url}}'),
  ('application.returned_for_correction','in_app','Application Returned for Correction',
    'Application {{application_number}} returned for correction',
    'Reviewer requested corrections on application {{application_number}}. Please update and resubmit.'),

  ('application.more_info_requested','email','Application More Info Requested (Email)',
    'More information needed for application {{application_number}}',
    E'Dear {{applicant_name}},\n\nThe reviewer of your application {{application_number}} has requested additional information at step "{{step_name}}".\n\nDetails requested:\n{{comments}}\n\nPlease respond at your earliest convenience.\n\nPortal: {{portal_url}}'),
  ('application.more_info_requested','in_app','Application More Info Requested',
    'More info requested on {{application_number}}',
    'Additional information requested by reviewer on application {{application_number}}.'),

  ('application.workflow_action_taken','email','Workflow Action Taken on Application (Email)',
    'Update on application {{application_number}}: {{action_label}}',
    E'Dear {{applicant_name}},\n\nAction "{{action_label}}" was performed on your application {{application_number}} by {{actor_name}} at step "{{step_name}}".\n\nRemarks: {{comments}}\n\nPortal: {{portal_url}}'),

  -- ── Registration workflow ─────────────────────────────────────────────
  ('registration.approved_step','email','Registration Forwarded to Next Level (Email)',
    'Registration {{registration_number}} approved at step {{step_name}}',
    E'Dear {{applicant_name}},\n\nYour registration {{registration_number}} has been approved at step "{{step_name}}" by {{actor_name}} and forwarded to the next level.\n\nRemarks: {{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.approved_step','in_app','Registration Step Approved',
    'Registration {{registration_number}} approved at {{step_name}}',
    'Registration {{registration_number}} approved at step {{step_name}}.'),

  ('registration.send_back','email','Registration Sent Back (Email)',
    'Registration {{registration_number}} sent back',
    E'Dear {{applicant_name}},\n\nYour registration {{registration_number}} has been sent back by {{actor_name}} at step "{{step_name}}".\n\nRemarks:\n{{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.send_back','in_app','Registration Sent Back',
    'Registration {{registration_number}} sent back',
    'Registration {{registration_number}} was sent back at step {{step_name}}.'),

  ('registration.escalated','email','Registration Escalated (Email)',
    'Registration {{registration_number}} escalated',
    E'Dear {{applicant_name}},\n\nYour registration {{registration_number}} has been escalated to a senior reviewer at step "{{step_name}}" by {{actor_name}}.\n\nRemarks: {{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.escalated','in_app','Registration Escalated',
    'Registration {{registration_number}} escalated',
    'Registration {{registration_number}} was escalated at step {{step_name}}.'),

  ('registration.resubmission_requested','email','Registration Resubmission Requested (Email)',
    'Action required: Please resubmit registration {{registration_number}}',
    E'Dear {{applicant_name}},\n\nYour registration {{registration_number}} requires resubmission. Reviewer {{actor_name}} at step "{{step_name}}" left the following remarks:\n\n{{comments}}\n\nPlease log in to update and resubmit.\n\nPortal: {{portal_url}}'),
  ('registration.resubmission_requested','in_app','Registration Resubmission Requested',
    'Resubmit registration {{registration_number}}',
    'Reviewer requested resubmission of registration {{registration_number}}.'),

  ('registration.returned_for_correction','email','Registration Returned for Correction (Email)',
    'Action required: Registration {{registration_number}} returned for correction',
    E'Dear {{applicant_name}},\n\nYour registration {{registration_number}} has been returned for correction by {{actor_name}} at step "{{step_name}}".\n\nReviewer remarks:\n{{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.returned_for_correction','in_app','Registration Returned for Correction',
    'Registration {{registration_number}} returned',
    'Corrections requested on registration {{registration_number}}.'),

  ('registration.more_info_requested','email','Registration More Info Requested (Email)',
    'More information needed for registration {{registration_number}}',
    E'Dear {{applicant_name}},\n\nThe reviewer of your registration {{registration_number}} has requested additional information at step "{{step_name}}".\n\nDetails requested:\n{{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.more_info_requested','in_app','Registration More Info Requested',
    'More info requested on {{registration_number}}',
    'Additional information requested on registration {{registration_number}}.'),

  ('registration.workflow_action_taken','email','Workflow Action Taken on Registration (Email)',
    'Update on registration {{registration_number}}: {{action_label}}',
    E'Dear {{applicant_name}},\n\nAction "{{action_label}}" was performed on your registration {{registration_number}} by {{actor_name}} at step "{{step_name}}".\n\nRemarks: {{comments}}\n\nPortal: {{portal_url}}'),
  ('registration.workflow_action_taken','in_app','Workflow Action Taken on Registration',
    'Action on registration {{registration_number}}',
    '{{action_label}} performed on registration {{registration_number}}.'),

  -- ── Return workflow ───────────────────────────────────────────────────
  ('return.approved_step','email','Return Approved at Step (Email)',
    'Return {{return_name}} approved at step {{step_name}}',
    E'Dear {{entity_name}},\n\nYour return "{{return_name}}" ({{period}} {{year}}) was approved at step "{{step_name}}" by {{actor_name}} and forwarded to the next level.\n\nRemarks: {{comments}}\n\nPortal: {{portal_link}}'),
  ('return.approved_step','in_app','Return Approved at Step',
    'Return {{return_name}} approved at {{step_name}}',
    'Return {{return_name}} approved at step {{step_name}}.'),

  ('return.approved','email','Return Fully Approved (Email)',
    'Return {{return_name}} approved',
    E'Dear {{entity_name}},\n\nYour return "{{return_name}}" ({{period}} {{year}}) has been fully approved.\n\nRemarks: {{comments}}\n\nPortal: {{portal_link}}'),
  ('return.approved','in_app','Return Fully Approved',
    'Return {{return_name}} approved',
    'Return {{return_name}} has been approved.'),

  ('return.rejected','email','Return Rejected (Email)',
    'Return {{return_name}} rejected',
    E'Dear {{entity_name}},\n\nYour return "{{return_name}}" ({{period}} {{year}}) was rejected by {{reviewer_name}}.\n\nRemarks:\n{{comments}}\n\nPortal: {{portal_link}}'),
  ('return.rejected','in_app','Return Rejected',
    'Return {{return_name}} rejected',
    'Return {{return_name}} was rejected.'),

  ('return.send_back','email','Return Sent Back (Email)',
    'Return {{return_name}} sent back',
    E'Dear {{entity_name}},\n\nYour return "{{return_name}}" ({{period}} {{year}}) has been sent back by {{reviewer_name}} at step "{{step_name}}".\n\nRemarks:\n{{comments}}\n\nPortal: {{portal_link}}'),
  ('return.send_back','in_app','Return Sent Back',
    'Return {{return_name}} sent back',
    'Return {{return_name}} was sent back at step {{step_name}}.'),

  ('return.edit_requested','email','Return Edit Requested (Email)',
    'Edits requested on return {{return_name}}',
    E'Dear {{entity_name}},\n\nReviewer {{reviewer_name}} has requested edits on your return "{{return_name}}" ({{period}} {{year}}).\n\nRemarks:\n{{comments}}\n\nPortal: {{portal_link}}'),
  ('return.edit_requested','in_app','Return Edit Requested',
    'Edits requested on {{return_name}}',
    'Edits requested on return {{return_name}}.'),

  ('return.workflow_action_taken','email','Workflow Action Taken on Return (Email)',
    'Update on return {{return_name}}: {{action_label}}',
    E'Dear {{entity_name}},\n\nAction "{{action_label}}" was performed on your return "{{return_name}}" ({{period}} {{year}}) by {{reviewer_name}} at step "{{step_name}}".\n\nRemarks: {{comments}}\n\nPortal: {{portal_link}}'),
  ('return.workflow_action_taken','in_app','Workflow Action Taken on Return',
    'Action on return {{return_name}}',
    '{{action_label}} performed on return {{return_name}}.')
)
INSERT INTO public.notification_templates (event_type, channel, name, subject, body, is_active, variables)
SELECT event_type, channel, name, subject, body, true, '[]'::jsonb FROM seed
ON CONFLICT (event_type, channel, COALESCE(regulator_id, '00000000-0000-0000-0000-000000000000'::uuid))
DO NOTHING;

-- Backfill approval_action_notifications.template_id ONLY where it is currently NULL,
-- linking to the matching email template for the binding's event_key. Does NOT overwrite
-- existing admin selections.
UPDATE public.approval_action_notifications aan
SET template_id = nt.id
FROM public.notification_templates nt
WHERE aan.template_id IS NULL
  AND nt.event_type = aan.event_key
  AND nt.channel = 'email'
  AND nt.regulator_id IS NULL
  AND nt.is_active = true;
