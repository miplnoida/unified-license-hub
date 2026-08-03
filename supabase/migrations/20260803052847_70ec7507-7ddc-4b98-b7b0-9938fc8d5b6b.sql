-- =========================================================
-- Notification administration: templates, events, preview
-- =========================================================

-- Canonical recipient rule vocabulary the dispatcher can execute
CREATE OR REPLACE FUNCTION public.notification_recipient_rule_types()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('type','applicant','label','Applicant','requires', jsonb_build_array()),
    jsonb_build_object('type','entity_primary_users','label','Entity primary users','requires', jsonb_build_array()),
    jsonb_build_object('type','entity_secondary_users','label','Entity secondary users','requires', jsonb_build_array()),
    jsonb_build_object('type','assigned_officer','label','Assigned officer','requires', jsonb_build_array()),
    jsonb_build_object('type','workflow_step_approvers','label','Workflow step approvers','requires', jsonb_build_array()),
    jsonb_build_object('type','next_step_role','label','Next-step role','requires', jsonb_build_array('role')),
    jsonb_build_object('type','previous_workflow_actors','label','Previous workflow actors','requires', jsonb_build_array()),
    jsonb_build_object('type','supervisor','label','Supervisor','requires', jsonb_build_array()),
    jsonb_build_object('type','role','label','Configured role','requires', jsonb_build_array('role')),
    jsonb_build_object('type','named_user','label','Named user','requires', jsonb_build_array('user_id')),
    jsonb_build_object('type','regulator_team','label','Regulator team','requires', jsonb_build_array('regulator_id')),
    jsonb_build_object('type','direct_email','label','Approved custom email','requires', jsonb_build_array('email')),
    jsonb_build_object('type','sector_regulators','label','Sector regulators','requires', jsonb_build_array()),
    jsonb_build_object('type','payload_user','label','User from event payload','requires', jsonb_build_array('key')),
    jsonb_build_object('type','actor_excluded','label','Exclude acting user','requires', jsonb_build_array()),
    jsonb_build_object('type','sla_process_team_leads','label','SLA process team leads','requires', jsonb_build_array()),
    jsonb_build_object('type','return_sector_regulators','label','Return sector reviewers','requires', jsonb_build_array()),
    jsonb_build_object('type','return_licensee_users','label','Return entity users','requires', jsonb_build_array()),
    jsonb_build_object('type','return_submitter','label','Return submitter','requires', jsonb_build_array()),
    jsonb_build_object('type','return_entity_users','label','Return mapped entity users','requires', jsonb_build_array()),
    jsonb_build_object('type','return_workflow_current_step_approvers','label','Return current step approvers','requires', jsonb_build_array()),
    jsonb_build_object('type','return_workflow_next_step_approvers','label','Return next step approvers','requires', jsonb_build_array()),
    jsonb_build_object('type','return_admins','label','Return administrators','requires', jsonb_build_array())
  );
$$;

GRANT EXECUTE ON FUNCTION public.notification_recipient_rule_types() TO authenticated;

-- Permission gate
CREATE OR REPLACE FUNCTION public.notification_admin_guard(_action text)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF NOT public.has_permission(auth.uid(), 'notification_management', _action) THEN
    RAISE EXCEPTION 'forbidden: notification_management.% required', _action;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_admin_guard(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_admin_guard(text) TO authenticated;

-- Audit helper
CREATE OR REPLACE FUNCTION public.notification_admin_audit(
  _action text, _entity_type text, _entity_id text,
  _old jsonb DEFAULT NULL, _new jsonb DEFAULT NULL, _meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id, _old, _new, COALESCE(_meta, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.notification_admin_audit(text, text, text, jsonb, jsonb, jsonb) FROM PUBLIC;

-- ---------------------------------------------------------
-- Rendering + preview
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_render(_text text, _vars jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  out_text text := COALESCE(_text, '');
  k text;
BEGIN
  FOR k IN SELECT jsonb_object_keys(COALESCE(_vars, '{}'::jsonb)) LOOP
    out_text := replace(out_text, '{{' || k || '}}', COALESCE(_vars->>k, ''));
    out_text := replace(out_text, '{{ ' || k || ' }}', COALESCE(_vars->>k, ''));
  END LOOP;
  RETURN out_text;
END;
$$;

CREATE OR REPLACE FUNCTION public.notification_unresolved_tokens(_text text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT trim(m[1])), ARRAY[]::text[])
  FROM regexp_matches(COALESCE(_text, ''), '\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}', 'g') AS m;
$$;

CREATE OR REPLACE FUNCTION public.notification_template_render_preview(
  _template_id uuid,
  _sample jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  vars jsonb;
  v text;
  subj text;
  body text;
BEGIN
  PERFORM public.notification_admin_guard('view');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;

  -- safe sample values: declared variables get placeholder text unless supplied
  vars := COALESCE(_sample, '{}'::jsonb);
  IF jsonb_typeof(t.variables) = 'array' THEN
    FOR v IN SELECT jsonb_array_elements_text(t.variables) LOOP
      IF NOT vars ? v THEN
        vars := vars || jsonb_build_object(v, '[' || v || ']');
      END IF;
    END LOOP;
  END IF;
  vars := vars
    || jsonb_build_object('app_name', COALESCE(vars->>'app_name', 'Regulator Portal'))
    || jsonb_build_object('app_url', COALESCE(vars->>'app_url', 'https://portal.example'));

  subj := public.notification_render(t.subject, vars);
  body := public.notification_render(t.body, vars);

  RETURN jsonb_build_object(
    'template_id', t.id,
    'template_code', t.template_code,
    'channel', t.channel,
    'severity', t.severity,
    'subject', subj,
    'body', body,
    'sample_values', vars,
    'unresolved_tokens', to_jsonb(
      public.notification_unresolved_tokens(COALESCE(subj, '') || ' ' || COALESCE(body, ''))
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_render_preview(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_render_preview(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------
-- Recipient rule validation
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_recipient_rules_validate(_rules jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  vocab jsonb := public.notification_recipient_rule_types();
  errs jsonb := '[]'::jsonb;
  rule jsonb;
  spec jsonb;
  req text;
  idx int := 0;
BEGIN
  PERFORM public.notification_admin_guard('view');
  IF _rules IS NULL OR jsonb_typeof(_rules) <> 'array' OR jsonb_array_length(_rules) = 0 THEN
    RETURN jsonb_build_object('valid', false, 'errors',
      jsonb_build_array(jsonb_build_object('index', -1, 'error', 'at least one recipient rule is required')));
  END IF;

  FOR rule IN SELECT jsonb_array_elements(_rules) LOOP
    SELECT s INTO spec FROM jsonb_array_elements(vocab) AS s
      WHERE s->>'type' = rule->>'type' LIMIT 1;
    IF spec IS NULL THEN
      errs := errs || jsonb_build_array(jsonb_build_object(
        'index', idx, 'error', format('unsupported recipient rule type "%s" — the delivery engine cannot execute it', COALESCE(rule->>'type','(none)'))));
    ELSE
      FOR req IN SELECT jsonb_array_elements_text(spec->'requires') LOOP
        IF COALESCE(rule->>req, '') = '' THEN
          errs := errs || jsonb_build_array(jsonb_build_object(
            'index', idx, 'error', format('rule "%s" requires "%s"', rule->>'type', req)));
        END IF;
      END LOOP;
      IF rule->>'type' = 'role' OR rule->>'type' = 'next_step_role' THEN
        IF COALESCE(rule->>'role','') <> '' AND NOT EXISTS (
          SELECT 1 FROM public.roles r WHERE r.name = rule->>'role' OR r.id::text = rule->>'role'
        ) THEN
          errs := errs || jsonb_build_array(jsonb_build_object(
            'index', idx, 'error', format('role "%s" does not exist', rule->>'role')));
        END IF;
      END IF;
      IF rule->>'type' = 'named_user' AND COALESCE(rule->>'user_id','') <> '' THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id::text = rule->>'user_id') THEN
          errs := errs || jsonb_build_array(jsonb_build_object(
            'index', idx, 'error', 'named user does not exist'));
        END IF;
      END IF;
      IF rule->>'type' = 'regulator_team' AND COALESCE(rule->>'regulator_id','') <> '' THEN
        IF NOT EXISTS (SELECT 1 FROM public.regulators g WHERE g.id::text = rule->>'regulator_id') THEN
          errs := errs || jsonb_build_array(jsonb_build_object(
            'index', idx, 'error', 'regulator does not exist'));
        END IF;
      END IF;
      IF rule->>'type' = 'direct_email' AND COALESCE(rule->>'email','') !~* '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' THEN
        errs := errs || jsonb_build_array(jsonb_build_object(
          'index', idx, 'error', 'custom email is not a valid address'));
      END IF;
    END IF;
    idx := idx + 1;
  END LOOP;

  RETURN jsonb_build_object('valid', jsonb_array_length(errs) = 0, 'errors', errs);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_recipient_rules_validate(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_recipient_rules_validate(jsonb) TO authenticated;

-- ---------------------------------------------------------
-- Template lifecycle
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_template_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid uuid := NULLIF(_payload->>'id', '')::uuid;
  before_row jsonb;
  code text := NULLIF(_payload->>'template_code', '');
  chan text := COALESCE(NULLIF(_payload->>'channel',''), 'email');
BEGIN
  PERFORM public.notification_admin_guard('manage_templates');

  IF chan NOT IN ('in_app','email','sms') THEN
    RAISE EXCEPTION 'invalid_channel: %', chan;
  END IF;
  IF COALESCE(_payload->>'name','') = '' THEN RAISE EXCEPTION 'name_required'; END IF;
  IF COALESCE(_payload->>'event_key','') = '' THEN RAISE EXCEPTION 'event_key_required'; END IF;

  IF tid IS NULL THEN
    code := COALESCE(code, upper(regexp_replace(_payload->>'event_key', '[^a-zA-Z0-9]+', '_', 'g'))
              || '_' || upper(chan) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    INSERT INTO public.notification_templates (
      name, template_code, module, event_key, event_type, channel, severity,
      subject, body, variables, status, version, is_active, created_by, updated_by
    ) VALUES (
      _payload->>'name', code,
      COALESCE(NULLIF(_payload->>'module',''), split_part(_payload->>'event_key', '.', 1)),
      _payload->>'event_key', _payload->>'event_key', chan,
      COALESCE(NULLIF(_payload->>'severity','')::notification_severity, 'medium'),
      _payload->>'subject', _payload->>'body',
      COALESCE(_payload->'variables', '[]'::jsonb),
      'draft', 1, false, auth.uid(), auth.uid()
    ) RETURNING id INTO tid;

    PERFORM public.notification_admin_audit('notification_template_created', 'notification_template', tid::text,
      NULL, jsonb_build_object('name', _payload->>'name', 'template_code', code, 'channel', chan));
    RETURN tid;
  END IF;

  SELECT to_jsonb(t) INTO before_row FROM public.notification_templates t WHERE t.id = tid;
  IF before_row IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;
  IF before_row->>'status' = 'archived' THEN RAISE EXCEPTION 'template_archived: unarchive before editing'; END IF;

  UPDATE public.notification_templates SET
    name = _payload->>'name',
    module = COALESCE(NULLIF(_payload->>'module',''), split_part(_payload->>'event_key', '.', 1)),
    event_key = _payload->>'event_key',
    event_type = _payload->>'event_key',
    channel = chan,
    severity = COALESCE(NULLIF(_payload->>'severity','')::notification_severity, severity),
    subject = _payload->>'subject',
    body = _payload->>'body',
    variables = COALESCE(_payload->'variables', variables),
    template_code = COALESCE(code, template_code),
    updated_by = auth.uid(),
    updated_at = now()
  WHERE id = tid;

  PERFORM public.notification_admin_audit('notification_template_updated', 'notification_template', tid::text,
    before_row, (SELECT to_jsonb(t) FROM public.notification_templates t WHERE t.id = tid));
  RETURN tid;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_template_publish(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  next_version integer;
BEGIN
  PERFORM public.notification_admin_guard('manage_templates');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;
  IF COALESCE(t.subject, '') = '' AND t.channel <> 'in_app' THEN RAISE EXCEPTION 'subject_required'; END IF;
  IF COALESCE(t.body, '') = '' THEN RAISE EXCEPTION 'body_required'; END IF;

  next_version := COALESCE(t.published_version, 0) + 1;

  INSERT INTO public.notification_template_versions (
    template_id, version, template_code, name, module, event_key, channel, severity,
    subject, body, variables, content_hash, published_by
  ) VALUES (
    t.id, next_version, t.template_code, t.name, t.module, t.event_key, t.channel, t.severity,
    t.subject, t.body, COALESCE(t.variables, '[]'::jsonb),
    md5(COALESCE(t.subject,'') || '|' || COALESCE(t.body,'')), auth.uid()
  );

  UPDATE public.notification_templates
     SET status = 'active', is_active = true, version = next_version,
         published_version = next_version, archived_at = NULL,
         updated_by = auth.uid(), updated_at = now()
   WHERE id = t.id;

  PERFORM public.notification_admin_audit('notification_template_published', 'notification_template', t.id::text,
    NULL, jsonb_build_object('version', next_version, 'template_code', t.template_code));

  RETURN jsonb_build_object('template_id', t.id, 'version', next_version, 'status', 'active');
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_publish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_publish(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_template_archive(_template_id uuid, _archive boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  bound int;
BEGIN
  PERFORM public.notification_admin_guard('manage_templates');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;

  IF _archive THEN
    SELECT count(*) INTO bound
      FROM public.notification_event_channel_templates b
      JOIN public.notification_event_configs c ON c.id = b.event_config_id
     WHERE b.template_id = t.id AND c.is_active;
    IF bound > 0 THEN
      RAISE EXCEPTION 'template_in_use: unbind from % active event configuration(s) first', bound;
    END IF;
    UPDATE public.notification_templates
       SET status = 'archived', is_active = false, archived_at = now(),
           updated_by = auth.uid(), updated_at = now()
     WHERE id = t.id;
    PERFORM public.notification_admin_audit('notification_template_archived', 'notification_template', t.id::text,
      NULL, jsonb_build_object('template_code', t.template_code));
    RETURN jsonb_build_object('status', 'archived');
  END IF;

  UPDATE public.notification_templates
     SET status = CASE WHEN published_version IS NOT NULL THEN 'active' ELSE 'draft' END,
         is_active = published_version IS NOT NULL,
         archived_at = NULL, updated_by = auth.uid(), updated_at = now()
   WHERE id = t.id;
  PERFORM public.notification_admin_audit('notification_template_updated', 'notification_template', t.id::text,
    NULL, jsonb_build_object('unarchived', true));
  RETURN jsonb_build_object('status', 'restored');
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_archive(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_archive(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_template_clone(_template_id uuid, _new_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  new_id uuid;
  new_code text;
BEGIN
  PERFORM public.notification_admin_guard('manage_templates');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;

  new_code := COALESCE(t.template_code, 'TPL') || '_COPY_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 4);

  INSERT INTO public.notification_templates (
    name, template_code, module, event_key, event_type, channel, severity,
    subject, body, variables, status, version, published_version, is_active,
    regulator_id, created_by, updated_by
  ) VALUES (
    COALESCE(NULLIF(_new_name, ''), t.name || ' (copy)'), new_code, t.module, t.event_key, t.event_type,
    t.channel, t.severity, t.subject, t.body, COALESCE(t.variables, '[]'::jsonb),
    'draft', 1, NULL, false, t.regulator_id, auth.uid(), auth.uid()
  ) RETURNING id INTO new_id;

  PERFORM public.notification_admin_audit('notification_template_created', 'notification_template', new_id::text,
    NULL, jsonb_build_object('cloned_from', t.id, 'template_code', new_code));
  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_clone(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_clone(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_template_versions_for(_template_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE res jsonb;
BEGIN
  PERFORM public.notification_admin_guard('view');
  SELECT COALESCE(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.version DESC), '[]'::jsonb) INTO res
  FROM (
    SELECT v.id, v.version, v.name, v.channel, v.severity, v.subject, v.body, v.variables,
           v.content_hash, v.published_at, v.published_by,
           COALESCE(p.full_name, p.email, 'System') AS published_by_name
      FROM public.notification_template_versions v
      LEFT JOIN public.profiles p ON p.id = v.published_by
     WHERE v.template_id = _template_id
  ) x;
  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_versions_for(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_versions_for(uuid) TO authenticated;

-- ---------------------------------------------------------
-- Test send (self only)
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_test_send(
  _template_id uuid,
  _sample jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  preview jsonb;
  t public.notification_templates;
  nid uuid;
BEGIN
  PERFORM public.notification_admin_guard('test_send');
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id;
  IF t.id IS NULL THEN RAISE EXCEPTION 'template_not_found'; END IF;

  preview := public.notification_template_render_preview(_template_id, _sample);

  -- Test notifications are always delivered to the requesting administrator only.
  INSERT INTO public.notifications (
    user_id, title, message, type, channel, severity, category,
    event_key, template_id, template_version, delivery_status, metadata
  ) VALUES (
    auth.uid(),
    '[TEST] ' || COALESCE(NULLIF(preview->>'subject', ''), t.name),
    COALESCE(preview->>'body', ''),
    'info', 'in_app', t.severity, 'system',
    t.event_key, t.id, t.published_version, 'delivered',
    jsonb_build_object('test_send', true, 'requested_by', auth.uid(),
                       'unresolved_tokens', preview->'unresolved_tokens')
  ) RETURNING id INTO nid;

  PERFORM public.notification_admin_audit('notification_test_sent', 'notification_template', t.id::text,
    NULL, jsonb_build_object('notification_id', nid, 'channel', t.channel,
                             'recipient', auth.uid(), 'unresolved_tokens', preview->'unresolved_tokens'));

  RETURN jsonb_build_object(
    'ok', true, 'notification_id', nid, 'recipient_user_id', auth.uid(),
    'channel_delivered', 'in_app',
    'unresolved_tokens', preview->'unresolved_tokens',
    'subject', preview->>'subject', 'body', preview->>'body'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.notification_test_send(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_test_send(uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------
-- Event configuration
-- ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notification_event_config_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid uuid := NULLIF(_payload->>'id','')::uuid;
  before_row jsonb;
  chans text[] := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(_payload->'channels')),
    ARRAY['in_app']::text[]
  );
  rules jsonb := COALESCE(_payload->'recipient_rules', '[]'::jsonb);
  validation jsonb;
  binding jsonb;
  want_active boolean := COALESCE((_payload->>'is_active')::boolean, false);
  ch text;
BEGIN
  PERFORM public.notification_admin_guard('manage_events');
  IF COALESCE(_payload->>'event_key','') = '' THEN RAISE EXCEPTION 'event_key_required'; END IF;

  FOREACH ch IN ARRAY chans LOOP
    IF ch NOT IN ('in_app','email','sms') THEN RAISE EXCEPTION 'invalid_channel: %', ch; END IF;
  END LOOP;

  IF want_active THEN
    validation := public.notification_recipient_rules_validate(rules);
    IF NOT (validation->>'valid')::boolean THEN
      RAISE EXCEPTION 'invalid_recipient_rules: %', validation->>'errors';
    END IF;
  END IF;

  IF cid IS NULL THEN
    INSERT INTO public.notification_event_configs (
      event_key, description, module, notification_type, category, severity,
      action_required, system_required, allow_mute, channels, recipient_rules,
      dedupe_window_seconds, delivery_frequency, failure_escalation, is_active,
      title_template, message_template, email_subject_template, email_body_template
    ) VALUES (
      _payload->>'event_key', _payload->>'description',
      COALESCE(NULLIF(_payload->>'module',''), split_part(_payload->>'event_key','.',1)),
      COALESCE(NULLIF(_payload->>'notification_type',''), 'info'),
      COALESCE(NULLIF(_payload->>'category','')::notification_category, 'info'),
      COALESCE(NULLIF(_payload->>'severity','')::notification_severity, 'medium'),
      COALESCE((_payload->>'action_required')::boolean, false),
      COALESCE((_payload->>'system_required')::boolean, false),
      COALESCE((_payload->>'allow_mute')::boolean, true),
      chans, rules,
      COALESCE((_payload->>'dedupe_window_seconds')::int, 0),
      COALESCE(NULLIF(_payload->>'delivery_frequency',''), 'immediate'),
      COALESCE(_payload->'failure_escalation', '{}'::jsonb),
      false,
      _payload->>'title_template', _payload->>'message_template',
      _payload->>'email_subject_template', _payload->>'email_body_template'
    ) RETURNING id INTO cid;
    PERFORM public.notification_admin_audit('notification_event_config_created', 'notification_event_config', cid::text,
      NULL, jsonb_build_object('event_key', _payload->>'event_key'));
  ELSE
    SELECT to_jsonb(c) INTO before_row FROM public.notification_event_configs c WHERE c.id = cid;
    IF before_row IS NULL THEN RAISE EXCEPTION 'event_config_not_found'; END IF;
    UPDATE public.notification_event_configs SET
      event_key = _payload->>'event_key',
      description = _payload->>'description',
      module = COALESCE(NULLIF(_payload->>'module',''), split_part(_payload->>'event_key','.',1)),
      notification_type = COALESCE(NULLIF(_payload->>'notification_type',''), notification_type),
      category = COALESCE(NULLIF(_payload->>'category','')::notification_category, category),
      severity = COALESCE(NULLIF(_payload->>'severity','')::notification_severity, severity),
      action_required = COALESCE((_payload->>'action_required')::boolean, action_required),
      system_required = COALESCE((_payload->>'system_required')::boolean, system_required),
      allow_mute = COALESCE((_payload->>'allow_mute')::boolean, allow_mute),
      channels = chans,
      recipient_rules = rules,
      dedupe_window_seconds = COALESCE((_payload->>'dedupe_window_seconds')::int, dedupe_window_seconds),
      delivery_frequency = COALESCE(NULLIF(_payload->>'delivery_frequency',''), delivery_frequency),
      failure_escalation = COALESCE(_payload->'failure_escalation', failure_escalation),
      title_template = COALESCE(_payload->>'title_template', title_template),
      message_template = COALESCE(_payload->>'message_template', message_template),
      email_subject_template = COALESCE(_payload->>'email_subject_template', email_subject_template),
      email_body_template = COALESCE(_payload->>'email_body_template', email_body_template),
      updated_at = now()
    WHERE id = cid;
    PERFORM public.notification_admin_audit('notification_event_config_updated', 'notification_event_config', cid::text,
      before_row, (SELECT to_jsonb(c) FROM public.notification_event_configs c WHERE c.id = cid));
  END IF;

  -- channel -> template bindings
  IF _payload ? 'channel_templates' THEN
    DELETE FROM public.notification_event_channel_templates WHERE event_config_id = cid;
    FOR binding IN SELECT jsonb_array_elements(_payload->'channel_templates') LOOP
      IF COALESCE(binding->>'template_id','') <> '' THEN
        INSERT INTO public.notification_event_channel_templates
          (event_config_id, channel, template_id, template_version, created_by)
        SELECT cid, binding->>'channel', (binding->>'template_id')::uuid, t.published_version, auth.uid()
          FROM public.notification_templates t WHERE t.id = (binding->>'template_id')::uuid
        ON CONFLICT (event_config_id, channel) DO UPDATE
          SET template_id = EXCLUDED.template_id, template_version = EXCLUDED.template_version;
      END IF;
    END LOOP;
  END IF;

  IF want_active THEN
    PERFORM public.notification_event_config_set_active(cid, true);
  END IF;

  RETURN cid;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_event_config_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_config_save(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.notification_event_config_set_active(_config_id uuid, _active boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.notification_event_configs;
  validation jsonb;
  ch text;
  missing text[] := ARRAY[]::text[];
  has_inline boolean;
BEGIN
  PERFORM public.notification_admin_guard('manage_events');
  SELECT * INTO c FROM public.notification_event_configs WHERE id = _config_id FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'event_config_not_found'; END IF;

  IF _active THEN
    validation := public.notification_recipient_rules_validate(c.recipient_rules);
    IF NOT (validation->>'valid')::boolean THEN
      RAISE EXCEPTION 'invalid_recipient_rules: %', validation->>'errors';
    END IF;

    FOREACH ch IN ARRAY COALESCE(c.channels, ARRAY[]::text[]) LOOP
      has_inline := CASE ch
        WHEN 'email' THEN COALESCE(c.email_body_template, '') <> ''
        WHEN 'in_app' THEN COALESCE(c.message_template, '') <> ''
        ELSE COALESCE(c.message_template, '') <> ''
      END;
      IF NOT has_inline AND NOT EXISTS (
        SELECT 1 FROM public.notification_event_channel_templates b
          JOIN public.notification_templates t ON t.id = b.template_id
         WHERE b.event_config_id = c.id AND b.channel = ch AND t.status = 'active'
      ) THEN
        missing := missing || ch;
      END IF;
    END LOOP;

    IF array_length(missing, 1) > 0 THEN
      RAISE EXCEPTION 'missing_channel_template: no published template for channel(s) %', array_to_string(missing, ', ');
    END IF;
  END IF;

  UPDATE public.notification_event_configs
     SET is_active = _active, updated_at = now() WHERE id = c.id;

  PERFORM public.notification_admin_audit(
    CASE WHEN _active THEN 'notification_event_activated' ELSE 'notification_event_deactivated' END,
    'notification_event_config', c.id::text, NULL,
    jsonb_build_object('event_key', c.event_key, 'is_active', _active));

  RETURN jsonb_build_object('ok', true, 'is_active', _active);
END;
$$;

REVOKE ALL ON FUNCTION public.notification_event_config_set_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_config_set_active(uuid, boolean) TO authenticated;