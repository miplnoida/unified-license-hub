DO $$
DECLARE
  v_cfg record;
  v_ch text;
  v_tpl_id uuid;
  v_code text;
BEGIN
  FOR v_cfg IN
    SELECT * FROM public.notification_event_configs
     WHERE event_key IN ('complaint.rfi_due_reminder', 'conduct_investigation.monitoring_review_due')
  LOOP
    FOREACH v_ch IN ARRAY v_cfg.channels LOOP
      IF v_ch NOT IN ('in_app', 'email') THEN CONTINUE; END IF;

      IF EXISTS (
        SELECT 1 FROM public.notification_event_channel_templates b
         WHERE b.event_config_id = v_cfg.id AND b.channel = v_ch
      ) THEN CONTINUE; END IF;

      v_code := upper(replace(replace(v_cfg.event_key, '.', '_'), '-', '_')) || '_' || upper(v_ch);

      INSERT INTO public.notification_templates
        (name, event_type, channel, subject, body, variables, is_active,
         template_code, module, event_key, severity, status, version, published_version)
      VALUES (
        v_cfg.event_key || ' (' || v_ch || ')',
        v_cfg.event_key,
        v_ch,
        CASE WHEN v_ch = 'email' THEN coalesce(v_cfg.email_subject_template, v_cfg.title_template) ELSE v_cfg.title_template END,
        coalesce(NULLIF(v_cfg.email_body_template, ''), v_cfg.message_template),
        '[]'::jsonb,
        true,
        v_code,
        coalesce(v_cfg.module, split_part(v_cfg.event_key, '.', 1)),
        v_cfg.event_key,
        coalesce(v_cfg.severity, 'medium'::public.notification_severity),
        'active',
        1,
        1
      )
      RETURNING id INTO v_tpl_id;

      INSERT INTO public.notification_template_versions
        (template_id, version, template_code, name, module, event_key, channel, severity,
         subject, body, variables, published_at)
      VALUES (
        v_tpl_id, 1, v_code, v_cfg.event_key || ' (' || v_ch || ')',
        coalesce(v_cfg.module, split_part(v_cfg.event_key, '.', 1)),
        v_cfg.event_key, v_ch,
        coalesce(v_cfg.severity, 'medium'::public.notification_severity),
        CASE WHEN v_ch = 'email' THEN coalesce(v_cfg.email_subject_template, v_cfg.title_template) ELSE v_cfg.title_template END,
        coalesce(NULLIF(v_cfg.email_body_template, ''), v_cfg.message_template),
        '[]'::jsonb, now()
      );

      INSERT INTO public.notification_event_channel_templates
        (event_config_id, channel, template_id, template_version)
      VALUES (v_cfg.id, v_ch, v_tpl_id, 1);
    END LOOP;
  END LOOP;
END $$;

UPDATE public.notification_event_configs
SET is_active = true,
    category = coalesce(category, 'action_required'::public.notification_category),
    severity = coalesce(severity, 'medium'::public.notification_severity),
    module = coalesce(module, split_part(event_key, '.', 1)),
    description = coalesce(description, '') || ' [P08: wired to a real scheduled emitter]'
WHERE event_key IN ('complaint.rfi_due_reminder', 'conduct_investigation.monitoring_review_due');

DO $$
DECLARE
  v_jobid bigint;
  v_job record;
BEGIN
  FOR v_job IN
    SELECT * FROM (VALUES
      ('complaint-rfi-reminder-sweep-daily', '15 3 * * *', 'complaint-rfi-reminder-sweep'),
      ('conduct-monitoring-review-reminder-sweep-daily', '25 3 * * *', 'conduct-monitoring-review-reminder-sweep')
    ) AS t(jobname, sched, fn)
  LOOP
    SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = v_job.jobname;
    IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
    PERFORM cron.schedule(v_job.jobname, v_job.sched, format('SELECT public.worker_kick(%L);', v_job.fn));
  END LOOP;
END $$;