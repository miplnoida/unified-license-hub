
-- Seed / upsert conduct action notification event configs with recipient rules and templates

INSERT INTO public.notification_event_configs
  (event_key, is_active, channels, recipient_rules, title_template, message_template, email_subject_template, email_body_template)
VALUES
  (
    'conduct_action_created',
    true,
    ARRAY['in_app','email']::text[],
    '[{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"},{"type":"role","role":"legal_compliance"}]'::jsonb,
    'Supervisory action issued: {{title}}',
    'A {{action_type}} has been issued: {{title}}. Rationale: {{rationale}}. Due: {{due_date}}.',
    '[Market Conduct] Supervisory action issued — {{title}}',
    E'Hello,\n\nA new supervisory action has been issued.\n\nAction: {{title}}\nType: {{action_type}}\nDue date: {{due_date}}\n\nRationale:\n{{rationale}}\n\nDescription:\n{{description}}\n\nOpen the ledger: {{app_url}}/conduct/actions\n\nRegards,\nMarket Conduct Supervision'
  ),
  (
    'conduct_action_assigned',
    true,
    ARRAY['in_app','email']::text[],
    '[{"type":"payload_user","key":"assigned_to"}]'::jsonb,
    'Action assigned: {{title}}',
    'You have been assigned a supervisory action: {{title}} (due {{due_date}}).',
    '[Market Conduct] Action assigned — {{title}}',
    E'Hello,\n\nYou have been assigned a supervisory action.\n\nAction: {{title}}\nType: {{action_type}}\nDue date: {{due_date}}\n\nOpen: {{app_url}}/conduct/actions\n\nRegards,\nMarket Conduct Supervision'
  ),
  (
    'conduct_action_completed',
    true,
    ARRAY['in_app','email']::text[],
    '[{"type":"payload_user","key":"created_by"},{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"}]'::jsonb,
    'Action completed: {{title}}',
    'Action {{title}} completed. Outcome: {{outcome}}.',
    '[Market Conduct] Action completed — {{title}}',
    E'Hello,\n\nA supervisory action has been marked completed.\n\nAction: {{title}}\nOutcome: {{outcome}}\n\nCompletion notes:\n{{completion_notes}}\n\nOpen: {{app_url}}/conduct/actions\n\nRegards,\nMarket Conduct Supervision'
  ),
  (
    'conduct_action_waived',
    true,
    ARRAY['in_app','email']::text[],
    '[{"type":"payload_user","key":"created_by"},{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"},{"type":"role","role":"super_admin"}]'::jsonb,
    'Action waived: {{title}}',
    'Action {{title}} has been waived. Reason: {{waiver_reason}}.',
    '[Market Conduct] Action waived — {{title}}',
    E'Hello,\n\nA supervisory action has been waived.\n\nAction: {{title}}\n\nWaiver reason:\n{{waiver_reason}}\n\nOpen: {{app_url}}/conduct/actions\n\nRegards,\nMarket Conduct Supervision'
  ),
  (
    'conduct_action_cancelled',
    true,
    ARRAY['in_app','email']::text[],
    '[{"type":"payload_user","key":"created_by"},{"type":"payload_user","key":"assigned_to"},{"type":"role","role":"supervisor"}]'::jsonb,
    'Action cancelled: {{title}}',
    'Action {{title}} has been cancelled. Reason: {{cancellation_reason}}.',
    '[Market Conduct] Action cancelled — {{title}}',
    E'Hello,\n\nA supervisory action has been cancelled.\n\nAction: {{title}}\n\nCancellation reason:\n{{cancellation_reason}}\n\nOpen: {{app_url}}/conduct/actions\n\nRegards,\nMarket Conduct Supervision'
  )
ON CONFLICT (event_key) DO UPDATE SET
  is_active = EXCLUDED.is_active,
  channels = EXCLUDED.channels,
  recipient_rules = EXCLUDED.recipient_rules,
  title_template = EXCLUDED.title_template,
  message_template = EXCLUDED.message_template,
  email_subject_template = EXCLUDED.email_subject_template,
  email_body_template = EXCLUDED.email_body_template,
  updated_at = now();
