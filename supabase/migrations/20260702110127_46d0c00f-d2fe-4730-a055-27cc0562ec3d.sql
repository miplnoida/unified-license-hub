
INSERT INTO public.notification_event_configs (
  event_key, description, notification_type,
  channels,
  title_template, message_template,
  email_subject_template, email_body_template,
  recipient_rules, dedupe_window_seconds, is_active
) VALUES (
  'workflow.sla_escalation',
  'Fired by the SLA escalation sweep when a workflow instance passes its SLA deadline and a new escalation tier becomes due.',
  'sla',
  ARRAY['in_app','email']::text[],
  'SLA Escalation — Tier {{tier}} ({{process_type}})',
  'Workflow {{workflow_instance_id}} is {{overdue_days}} day(s) past its SLA deadline. Escalation tier {{tier}} has been triggered.',
  '[SLA Escalation Tier {{tier}}] {{process_type}} overdue by {{overdue_days}} day(s)',
  '<p>An open workflow instance is past its SLA deadline.</p><ul><li><strong>Process:</strong> {{process_type}}</li><li><strong>Tier:</strong> {{tier}}</li><li><strong>Overdue by:</strong> {{overdue_days}} day(s)</li><li><strong>SLA deadline:</strong> {{sla_deadline}}</li></ul>',
  '{"rules":[{"type":"role","value":"super_admin"},{"type":"role","value":"admin"}]}'::jsonb,
  900,
  true
)
ON CONFLICT (event_key) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='sla-escalation-sweep-15min') THEN
      PERFORM cron.unschedule('sla-escalation-sweep-15min');
    END IF;
    PERFORM cron.schedule(
      'sla-escalation-sweep-15min',
      '*/15 * * * *',
      $cron$
        SELECT net.http_post(
          url := 'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/sla-escalation-sweep',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{}'::jsonb
        );
      $cron$
    );
  END IF;
END $$;
