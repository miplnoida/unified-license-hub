-- ============================================================
-- Notifications: eliminate fallback rendering for active events
-- ============================================================

-- 1. SMS stays deferred: it can never be enabled on an event config.
CREATE OR REPLACE FUNCTION public.notification_event_config_block_sms()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.channels IS NOT NULL AND 'sms' = ANY (NEW.channels) THEN
    NEW.channels := array_remove(NEW.channels, 'sms');
  END IF;
  IF NEW.channels IS NULL OR array_length(NEW.channels, 1) IS NULL THEN
    NEW.channels := ARRAY['in_app'];
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_event_config_block_sms ON public.notification_event_configs;
CREATE TRIGGER trg_notification_event_config_block_sms
  BEFORE INSERT OR UPDATE ON public.notification_event_configs
  FOR EACH ROW EXECUTE FUNCTION public.notification_event_config_block_sms();

UPDATE public.notification_event_configs
   SET channels = array_remove(channels, 'sms')
 WHERE 'sms' = ANY (channels);

-- 2. Emergency system-health events may keep fallback rendering; everything else may not.
ALTER TABLE public.notification_event_configs
  ADD COLUMN IF NOT EXISTS fallback_allowed boolean NOT NULL DEFAULT false;

UPDATE public.notification_event_configs
   SET fallback_allowed = true
 WHERE event_key LIKE 'system_health%'
    OR event_key LIKE 'system.%'
    OR event_key LIKE '%scheduler_failure%'
    OR event_key LIKE '%cron_failure%';

-- Delivery rows must state plainly when fallback wording was used.
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS used_fallback_template boolean NOT NULL DEFAULT false;

-- 3. Publishing a template snapshots immutable content.
CREATE OR REPLACE FUNCTION public.notification_template_snapshot(_template_id uuid, _actor uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.notification_templates;
  v integer;
BEGIN
  SELECT * INTO t FROM public.notification_templates WHERE id = _template_id;
  IF t.id IS NULL THEN
    RAISE EXCEPTION 'template_not_found';
  END IF;

  v := COALESCE(t.published_version, t.version, 1);

  IF EXISTS (SELECT 1 FROM public.notification_template_versions
              WHERE template_id = t.id AND version = v) THEN
    RETURN v;
  END IF;

  INSERT INTO public.notification_template_versions
    (template_id, version, template_code, name, module, event_key, channel,
     severity, subject, body, variables, content_hash, published_by)
  VALUES
    (t.id, v, t.template_code, t.name, t.module, COALESCE(t.event_key, t.event_type), t.channel,
     t.severity, t.subject, t.body, t.variables,
     md5(COALESCE(t.subject, '') || '::' || COALESCE(t.body, '')), _actor);

  UPDATE public.notification_templates
     SET published_version = v, status = 'active'
   WHERE id = t.id;

  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.notification_template_snapshot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_template_snapshot(uuid, uuid) TO authenticated, service_role;

-- 4. Backfill: immutable v1 for every existing template.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.notification_templates WHERE status <> 'archived' LOOP
    PERFORM public.notification_template_snapshot(r.id, NULL);
  END LOOP;
END;
$$;

-- 5. Backfill: a published template + binding for every active event x enabled channel.
DO $$
DECLARE
  cfg record;
  ch text;
  tpl_id uuid;
  tpl_subject text;
  tpl_body text;
  tpl_code text;
  ver integer;
BEGIN
  FOR cfg IN SELECT * FROM public.notification_event_configs WHERE is_active LOOP
    FOREACH ch IN ARRAY cfg.channels LOOP
      IF ch NOT IN ('in_app', 'email') THEN CONTINUE; END IF;

      IF ch = 'email' THEN
        tpl_subject := COALESCE(NULLIF(cfg.email_subject_template, ''), cfg.title_template);
        tpl_body    := COALESCE(NULLIF(cfg.email_body_template, ''), cfg.message_template);
      ELSE
        tpl_subject := cfg.title_template;
        tpl_body    := cfg.message_template;
      END IF;

      -- Reuse an existing template for this event/channel when one exists.
      SELECT id INTO tpl_id
        FROM public.notification_templates
       WHERE channel = ch
         AND status <> 'archived'
         AND (event_key = cfg.event_key OR event_type = cfg.event_key)
       ORDER BY (event_key = cfg.event_key) DESC, updated_at DESC
       LIMIT 1;

      IF tpl_id IS NULL THEN
        tpl_code := upper(replace(replace(cfg.event_key, '.', '_'), '-', '_')) || '_' || upper(ch);
        INSERT INTO public.notification_templates
          (name, event_type, event_key, channel, subject, body, module, severity,
           status, version, published_version, template_code, variables)
        VALUES
          (COALESCE(NULLIF(cfg.description, ''), cfg.event_key) || ' (' || ch || ')',
           cfg.event_key, cfg.event_key, ch, tpl_subject, tpl_body,
           cfg.module, COALESCE(cfg.severity, 'medium'::notification_severity),
           'active', 1, 1, tpl_code, '[]'::jsonb)
        ON CONFLICT DO NOTHING
        RETURNING id INTO tpl_id;

        IF tpl_id IS NULL THEN
          SELECT id INTO tpl_id FROM public.notification_templates
           WHERE template_code = tpl_code
              OR (event_type = cfg.event_key AND channel = ch AND regulator_id IS NULL)
           LIMIT 1;
        END IF;
      END IF;

      IF tpl_id IS NULL THEN CONTINUE; END IF;

      ver := public.notification_template_snapshot(tpl_id, NULL);

      INSERT INTO public.notification_event_channel_templates
        (event_config_id, channel, template_id, template_version)
      VALUES (cfg.id, ch, tpl_id, ver)
      ON CONFLICT (event_config_id, channel)
      DO UPDATE SET template_id = EXCLUDED.template_id,
                    template_version = EXCLUDED.template_version;
    END LOOP;
  END LOOP;
END;
$$;

-- 6. Guardrail: an active event needs a bound published template per enabled channel.
CREATE OR REPLACE FUNCTION public.notification_event_config_requires_templates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ch text;
  missing text[] := '{}';
BEGIN
  IF NOT NEW.is_active OR NEW.fallback_allowed THEN
    RETURN NEW;
  END IF;

  -- Insert-time bindings cannot exist yet; enforcement applies from the first update.
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  FOREACH ch IN ARRAY NEW.channels LOOP
    IF ch NOT IN ('in_app', 'email') THEN CONTINUE; END IF;
    IF NOT EXISTS (
      SELECT 1
        FROM public.notification_event_channel_templates b
        JOIN public.notification_templates t ON t.id = b.template_id
       WHERE b.event_config_id = NEW.id
         AND b.channel = ch
         AND t.status = 'active'
         AND EXISTS (SELECT 1 FROM public.notification_template_versions v
                      WHERE v.template_id = t.id)
    ) THEN
      missing := missing || ch;
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'notification_event_missing_template: % has no published template for channel(s) %',
      NEW.event_key, array_to_string(missing, ', ');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_event_config_requires_templates ON public.notification_event_configs;
CREATE TRIGGER trg_notification_event_config_requires_templates
  BEFORE INSERT OR UPDATE ON public.notification_event_configs
  FOR EACH ROW EXECUTE FUNCTION public.notification_event_config_requires_templates();

-- 7. Validation report for every active event configuration.
CREATE OR REPLACE FUNCTION public.notification_event_config_validate()
RETURNS TABLE (
  event_key text,
  module text,
  severity text,
  category text,
  channels text[],
  recipient_rule_count integer,
  unsupported_rule_types text[],
  has_in_app_or_email boolean,
  templates_bound integer,
  templates_required integer,
  has_trigger_history boolean,
  dedupe_window_seconds integer,
  failure_escalation_configured boolean,
  fallback_allowed boolean,
  issues text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH supported AS (
    SELECT ARRAY[
      'role','user','payload_user','entity_primary_users','entity_secondary_users',
      'applicant','assigned_officer','current_approver','previous_actor','admin',
      'custom_email','next_step_role','supervisor','named_user','regulator_team',
      'thread_participants','thread_assigned_officer','record_assignee',
      'sla_process_team_leads'
    ]::text[] AS types
  ), base AS (
    SELECT c.*,
      (SELECT count(*) FROM jsonb_array_elements(
         CASE WHEN jsonb_typeof(c.recipient_rules) = 'array' THEN c.recipient_rules ELSE '[]'::jsonb END))::int AS rule_count,
      (SELECT coalesce(array_agg(DISTINCT r->>'type'), '{}')
         FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(c.recipient_rules) = 'array' THEN c.recipient_rules ELSE '[]'::jsonb END) r
        WHERE (r->>'type') IS NOT NULL
          AND NOT ((r->>'type') IN (SELECT unnest(types) FROM supported))) AS bad_types,
      (SELECT count(*) FROM public.notification_event_channel_templates b
         JOIN public.notification_templates t ON t.id = b.template_id
        WHERE b.event_config_id = c.id AND t.status = 'active')::int AS bound,
      (SELECT count(*) FROM unnest(c.channels) x WHERE x IN ('in_app','email'))::int AS required,
      EXISTS (SELECT 1 FROM public.notification_dispatch_log l WHERE l.event_key = c.event_key) AS dispatched
    FROM public.notification_event_configs c
    WHERE c.is_active
  )
  SELECT
    b.event_key, b.module, b.severity::text, b.category::text, b.channels,
    b.rule_count, b.bad_types,
    EXISTS (SELECT 1 FROM unnest(b.channels) x WHERE x IN ('in_app','email')),
    b.bound, b.required, b.dispatched, b.dedupe_window_seconds,
    (b.failure_escalation IS NOT NULL AND b.failure_escalation <> '{}'::jsonb),
    b.fallback_allowed,
    (
      CASE WHEN b.rule_count = 0 THEN ARRAY['no_recipient_rules'] ELSE '{}'::text[] END
      || CASE WHEN array_length(b.bad_types, 1) IS NOT NULL THEN ARRAY['unsupported_rule_type'] ELSE '{}'::text[] END
      || CASE WHEN NOT EXISTS (SELECT 1 FROM unnest(b.channels) x WHERE x IN ('in_app','email')) THEN ARRAY['no_supported_channel'] ELSE '{}'::text[] END
      || CASE WHEN b.bound < b.required AND NOT b.fallback_allowed THEN ARRAY['template_not_bound'] ELSE '{}'::text[] END
      || CASE WHEN b.severity IS NULL THEN ARRAY['severity_missing'] ELSE '{}'::text[] END
      || CASE WHEN b.category IS NULL THEN ARRAY['category_missing'] ELSE '{}'::text[] END
      || CASE WHEN b.system_required AND b.allow_mute THEN ARRAY['mandatory_but_mutable'] ELSE '{}'::text[] END
      || CASE WHEN b.severity IN ('critical','high') AND b.delivery_frequency <> 'immediate' THEN ARRAY['high_severity_digested'] ELSE '{}'::text[] END
      || CASE WHEN b.dedupe_window_seconds <= 0 THEN ARRAY['dedupe_window_invalid'] ELSE '{}'::text[] END
      || CASE WHEN NOT b.dispatched THEN ARRAY['no_trigger_history'] ELSE '{}'::text[] END
    )
  FROM base b
  ORDER BY b.event_key;
$$;

REVOKE ALL ON FUNCTION public.notification_event_config_validate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_event_config_validate() TO authenticated, service_role;