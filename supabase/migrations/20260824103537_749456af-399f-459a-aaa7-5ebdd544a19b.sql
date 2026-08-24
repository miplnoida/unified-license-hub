CREATE OR REPLACE FUNCTION public.comms_content_refresh_apply(_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  item jsonb;
  cfg record;
  bind record;
  v_subject text;
  v_body text;
  v_next int;
  updated_configs int := 0;
  updated_templates int := 0;
BEGIN
  FOR item IN SELECT jsonb_array_elements(_payload) LOOP
    SELECT * INTO cfg FROM public.notification_event_configs
      WHERE event_key = item->>'event_key';
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.notification_event_configs c
       SET title_template = COALESCE(NULLIF(item->>'in_app_title',''), c.title_template),
           message_template = COALESCE(NULLIF(item->>'in_app_message',''), c.message_template),
           email_subject_template = COALESCE(NULLIF(item->>'email_subject',''), c.email_subject_template),
           email_body_template = COALESCE(NULLIF(item->>'email_body',''), c.email_body_template),
           updated_at = now()
     WHERE c.id = cfg.id;
    updated_configs := updated_configs + 1;

    FOR bind IN
      SELECT b.id AS binding_id, b.channel, t.id AS template_id
        FROM public.notification_event_channel_templates b
        JOIN public.notification_templates t ON t.id = b.template_id
       WHERE b.event_config_id = cfg.id
    LOOP
      IF bind.channel = 'email' THEN
        v_subject := NULLIF(item->>'email_subject','');
        v_body := NULLIF(item->>'email_body','');
      ELSIF bind.channel = 'in_app' THEN
        v_subject := NULLIF(item->>'in_app_title','');
        v_body := NULLIF(item->>'in_app_message','');
      ELSE
        v_subject := NULLIF(item->>'sms_message','');
        v_body := NULLIF(item->>'sms_message','');
      END IF;

      IF v_subject IS NULL OR v_body IS NULL THEN
        CONTINUE;
      END IF;

      SELECT COALESCE(max(version),0) + 1 INTO v_next
        FROM public.notification_template_versions WHERE template_id = bind.template_id;

      INSERT INTO public.notification_template_versions
        (template_id, version, template_code, name, module, event_key, channel, severity, subject, body, variables, content_hash, published_at)
      SELECT t.id, v_next, t.template_code, t.name, t.module, t.event_key, t.channel, t.severity,
             v_subject, v_body, t.variables, md5(v_subject || v_body), now()
        FROM public.notification_templates t WHERE t.id = bind.template_id;

      UPDATE public.notification_templates
         SET subject = v_subject, body = v_body,
             version = v_next, published_version = v_next, updated_at = now()
       WHERE id = bind.template_id;

      UPDATE public.notification_event_channel_templates
         SET template_version = v_next, updated_at = now()
       WHERE id = bind.binding_id;

      updated_templates := updated_templates + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('configs', updated_configs, 'templates', updated_templates);
END;
$fn$;

REVOKE ALL ON FUNCTION public.comms_content_refresh_apply(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comms_content_refresh_apply(jsonb) TO sandbox_exec;