-- 1. SMS availability helper (derived from admin Email & SMS settings)
CREATE OR REPLACE FUNCTION public.notification_sms_available()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT (value -> 'sms' ->> 'enabled')::boolean
           AND COALESCE(NULLIF(value -> 'sms' ->> 'senderId', ''), NULL) IS NOT NULL
    FROM public.site_settings
    WHERE key = 'email_sms_settings'
    LIMIT 1
  ), false)
$$;

REVOKE ALL ON FUNCTION public.notification_sms_available() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_sms_available() TO authenticated, service_role;

-- 2. Harden the preference validation trigger
CREATE OR REPLACE FUNCTION public.validate_user_event_preference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  cfg record;
  sev public.notification_severity;
BEGIN
  SELECT severity, allow_mute, system_required, channels, is_active INTO cfg
  FROM public.notification_event_configs WHERE event_key = NEW.event_key LIMIT 1;

  sev := COALESCE(cfg.severity, public.notification_severity_for(NEW.event_key, NULL));

  IF COALESCE(cfg.system_required, false) THEN
    IF NEW.in_app_enabled = false OR NEW.email_enabled = false OR NEW.muted THEN
      RAISE EXCEPTION 'system_required_notification_cannot_be_disabled: %', NEW.event_key;
    END IF;
  END IF;

  IF sev = 'critical' AND NEW.in_app_enabled = false THEN
    RAISE EXCEPTION 'in_app_required_for_critical: %', NEW.event_key;
  END IF;

  IF sev IN ('critical','high') AND NEW.digest_frequency <> 'immediate' THEN
    RAISE EXCEPTION 'digest_not_permitted_for_high_severity: %', NEW.event_key;
  END IF;

  IF NEW.muted AND (sev <> 'low' OR COALESCE(cfg.allow_mute, true) = false) THEN
    RAISE EXCEPTION 'mute_not_permitted_for_event: %', NEW.event_key;
  END IF;

  -- SMS may not be enabled while no provider is configured
  IF NEW.sms_enabled AND NOT public.notification_sms_available() THEN
    RAISE EXCEPTION 'sms_channel_unavailable: %', NEW.event_key;
  END IF;

  -- Channels the event does not support cannot be enabled
  IF cfg.channels IS NOT NULL THEN
    IF NEW.sms_enabled AND NOT ('sms' = ANY (cfg.channels)) THEN
      RAISE EXCEPTION 'channel_not_supported_for_event: sms/%', NEW.event_key;
    END IF;
    IF NEW.email_enabled AND NOT ('email' = ANY (cfg.channels)) THEN
      RAISE EXCEPTION 'channel_not_supported_for_event: email/%', NEW.event_key;
    END IF;
  END IF;

  -- Preferences only ever affect future dispatches
  NEW.effective_from := GREATEST(COALESCE(NEW.effective_from, now()), now());
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END $function$;

-- 3. Preference matrix for the signed-in user
CREATE OR REPLACE FUNCTION public.notification_preference_matrix()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  sms_ok boolean := public.notification_sms_available();
  rows jsonb;
  last_updated timestamptz;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT max(updated_at) INTO last_updated
  FROM public.notification_user_event_preferences WHERE user_id = uid;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'module', item->>'name'), '[]'::jsonb) INTO rows
  FROM (
    SELECT jsonb_build_object(
      'event_key', c.event_key,
      'name', COALESCE(NULLIF(c.title_template, ''), replace(initcap(replace(c.event_key, '_', ' ')), '.', ' — ')),
      'module', public.notification_module_for(c.event_key, c.entity_type),
      'severity', c.severity::text,
      'description', c.description,
      'system_required', COALESCE(c.system_required, false),
      'allow_mute', COALESCE(c.allow_mute, true),
      'channels', to_jsonb(COALESCE(c.channels, ARRAY['in_app']::text[])),
      'in_app_enabled', COALESCE(p.in_app_enabled, true),
      'email_enabled', COALESCE(p.email_enabled, 'email' = ANY (COALESCE(c.channels, ARRAY[]::text[]))),
      'sms_enabled', COALESCE(p.sms_enabled, false) AND sms_ok,
      'digest_frequency', COALESCE(p.digest_frequency::text, 'immediate'),
      'muted', COALESCE(p.muted, false),
      'updated_at', p.updated_at,
      'locks', jsonb_strip_nulls(jsonb_build_object(
        'in_app', CASE
          WHEN c.severity = 'critical' THEN 'Critical alerts are always delivered in-app.'
          WHEN COALESCE(c.system_required, false) THEN 'This is a mandatory regulatory notification and cannot be disabled.'
          ELSE NULL END,
        'email', CASE
          WHEN COALESCE(c.system_required, false) THEN 'Mandatory notifications are always emailed.'
          WHEN NOT ('email' = ANY (COALESCE(c.channels, ARRAY[]::text[]))) THEN 'Email is not configured for this notification type.'
          ELSE NULL END,
        'sms', CASE
          WHEN NOT sms_ok THEN 'SMS delivery is not yet configured. Ask an administrator to enable an SMS provider in Settings → Email & SMS.'
          WHEN NOT ('sms' = ANY (COALESCE(c.channels, ARRAY[]::text[]))) THEN 'SMS is not configured for this notification type.'
          ELSE NULL END,
        'digest', CASE
          WHEN c.severity IN ('critical','high') THEN 'Critical and high urgency notifications are always sent immediately.'
          WHEN COALESCE(c.system_required, false) THEN 'Mandatory notifications are always sent immediately.'
          ELSE NULL END,
        'muted', CASE
          WHEN c.severity <> 'low' THEN 'Only low urgency notifications can be muted.'
          WHEN COALESCE(c.allow_mute, true) = false THEN 'This notification is configured as required and cannot be muted.'
          ELSE NULL END
      ))
    ) AS item
    FROM public.notification_event_configs c
    LEFT JOIN public.notification_user_event_preferences p
      ON p.event_key = c.event_key AND p.user_id = uid
    WHERE c.is_active
  ) s;

  RETURN jsonb_build_object(
    'sms_available', sms_ok,
    'last_updated_at', last_updated,
    'events', rows
  );
END $function$;

REVOKE ALL ON FUNCTION public.notification_preference_matrix() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_preference_matrix() TO authenticated, service_role;

-- 4. Save with before/after audit
CREATE OR REPLACE FUNCTION public.notification_preferences_save(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  uid uuid := auth.uid();
  it jsonb;
  before_row public.notification_user_event_preferences;
  changes jsonb := '[]'::jsonb;
  changed int := 0;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' THEN
    RAISE EXCEPTION 'invalid_payload: items array required';
  END IF;

  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.notification_event_configs
      WHERE event_key = it->>'event_key' AND is_active
    ) THEN
      RAISE EXCEPTION 'unknown_event_key: %', it->>'event_key';
    END IF;

    SELECT * INTO before_row FROM public.notification_user_event_preferences
    WHERE user_id = uid AND event_key = it->>'event_key';

    INSERT INTO public.notification_user_event_preferences AS t
      (user_id, event_key, in_app_enabled, email_enabled, sms_enabled, digest_frequency, muted, updated_by)
    VALUES (
      uid,
      it->>'event_key',
      COALESCE((it->>'in_app_enabled')::boolean, true),
      COALESCE((it->>'email_enabled')::boolean, false),
      COALESCE((it->>'sms_enabled')::boolean, false),
      COALESCE(NULLIF(it->>'digest_frequency',''), 'immediate')::public.notification_digest_frequency,
      COALESCE((it->>'muted')::boolean, false),
      uid
    )
    ON CONFLICT (user_id, event_key) DO UPDATE SET
      in_app_enabled = EXCLUDED.in_app_enabled,
      email_enabled = EXCLUDED.email_enabled,
      sms_enabled = EXCLUDED.sms_enabled,
      digest_frequency = EXCLUDED.digest_frequency,
      muted = EXCLUDED.muted,
      updated_by = uid;

    changed := changed + 1;
    changes := changes || jsonb_build_array(jsonb_build_object(
      'event_key', it->>'event_key',
      'before', CASE WHEN before_row.id IS NULL THEN NULL ELSE jsonb_build_object(
        'in_app_enabled', before_row.in_app_enabled,
        'email_enabled', before_row.email_enabled,
        'sms_enabled', before_row.sms_enabled,
        'digest_frequency', before_row.digest_frequency::text,
        'muted', before_row.muted) END,
      'after', jsonb_build_object(
        'in_app_enabled', COALESCE((it->>'in_app_enabled')::boolean, true),
        'email_enabled', COALESCE((it->>'email_enabled')::boolean, false),
        'sms_enabled', COALESCE((it->>'sms_enabled')::boolean, false),
        'digest_frequency', COALESCE(NULLIF(it->>'digest_frequency',''), 'immediate'),
        'muted', COALESCE((it->>'muted')::boolean, false))
    ));
  END LOOP;

  IF changed > 0 THEN
    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, old_value, new_value)
    VALUES (uid, 'NOTIFICATION_PREFERENCES_UPDATED', 'notification_preference', uid::text,
            jsonb_build_object('count', changed),
            jsonb_build_object('changes', changes),
            jsonb_build_object('changes', changes));
  END IF;

  RETURN jsonb_build_object(
    'updated', changed,
    'last_updated_at', (SELECT max(updated_at) FROM public.notification_user_event_preferences WHERE user_id = uid)
  );
END $function$;

REVOKE ALL ON FUNCTION public.notification_preferences_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_preferences_save(jsonb) TO authenticated, service_role;

-- 5. Digest run tracking
CREATE TABLE IF NOT EXISTS public.notification_digest_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  period text NOT NULL CHECK (period IN ('hourly','daily')),
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped')),
  item_count integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  dispatch_log_id uuid,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_digest_runs TO authenticated;
GRANT ALL ON public.notification_digest_runs TO service_role;
ALTER TABLE public.notification_digest_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own digest runs" ON public.notification_digest_runs;
CREATE POLICY "Users read own digest runs" ON public.notification_digest_runs
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE UNIQUE INDEX IF NOT EXISTS notification_digest_runs_unique
  ON public.notification_digest_runs (user_id, channel, period, period_start);

CREATE TABLE IF NOT EXISTS public.notification_digest_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.notification_digest_runs(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL,
  period text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_digest_items TO authenticated;
GRANT ALL ON public.notification_digest_items TO service_role;
ALTER TABLE public.notification_digest_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own digest items" ON public.notification_digest_items;
CREATE POLICY "Users read own digest items" ON public.notification_digest_items
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.notification_digest_runs r
    WHERE r.id = run_id AND r.user_id = auth.uid()
  ));

CREATE UNIQUE INDEX IF NOT EXISTS notification_digest_items_run_unique
  ON public.notification_digest_items (run_id, notification_id);
CREATE UNIQUE INDEX IF NOT EXISTS notification_digest_items_period_unique
  ON public.notification_digest_items (notification_id, period);

CREATE OR REPLACE FUNCTION public.touch_notification_digest_runs()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_notification_digest_runs ON public.notification_digest_runs;
CREATE TRIGGER trg_touch_notification_digest_runs
  BEFORE UPDATE ON public.notification_digest_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_digest_runs();

-- 6. Digest builder: creates runs + items for eligible notifications
CREATE OR REPLACE FUNCTION public.notification_digest_build(
  _period text,
  _period_start timestamptz DEFAULT NULL,
  _channel text DEFAULT 'email'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  p_start timestamptz;
  p_end timestamptz := now();
  rec record;
  run_id uuid;
  inserted int;
  out_runs jsonb := '[]'::jsonb;
BEGIN
  IF _period NOT IN ('hourly','daily') THEN
    RAISE EXCEPTION 'invalid_period: %', _period;
  END IF;

  p_start := COALESCE(
    _period_start,
    CASE WHEN _period = 'hourly' THEN date_trunc('hour', now()) - interval '1 hour'
         ELSE date_trunc('day', now()) - interval '1 day' END
  );
  p_end := p_start + CASE WHEN _period = 'hourly' THEN interval '1 hour' ELSE interval '1 day' END;

  FOR rec IN
    SELECT n.user_id, count(*) AS cnt
    FROM public.notifications n
    JOIN public.notification_event_configs c ON c.event_key = n.event_key
    LEFT JOIN public.notification_user_event_preferences p
      ON p.user_id = n.user_id AND p.event_key = n.event_key AND p.effective_from <= n.created_at
    WHERE n.user_id IS NOT NULL
      AND n.channel = 'in_app'
      AND n.created_at >= p_start AND n.created_at < p_end
      AND n.dismissed_at IS NULL AND n.archived_at IS NULL
      AND COALESCE(n.severity, c.severity) NOT IN ('critical','high')
      AND COALESCE(c.system_required, false) = false
      AND COALESCE(p.muted, false) = false
      AND COALESCE(p.digest_frequency::text, 'immediate') = _period
      AND CASE WHEN _channel = 'email' THEN COALESCE(p.email_enabled, false)
               WHEN _channel = 'sms' THEN COALESCE(p.sms_enabled, false) AND public.notification_sms_available()
               ELSE false END
      AND NOT EXISTS (
        SELECT 1 FROM public.notification_digest_items di
        WHERE di.notification_id = n.id AND di.period = _period
      )
    GROUP BY n.user_id
  LOOP
    INSERT INTO public.notification_digest_runs (user_id, channel, period, period_start, period_end)
    VALUES (rec.user_id, _channel, _period, p_start, p_end)
    ON CONFLICT (user_id, channel, period, period_start) DO NOTHING
    RETURNING id INTO run_id;

    -- A run already exists for this window: duplicate digest prevented
    IF run_id IS NULL THEN
      CONTINUE;
    END IF;

    WITH eligible AS (
      SELECT n.id
      FROM public.notifications n
      JOIN public.notification_event_configs c ON c.event_key = n.event_key
      LEFT JOIN public.notification_user_event_preferences p
        ON p.user_id = n.user_id AND p.event_key = n.event_key AND p.effective_from <= n.created_at
      WHERE n.user_id = rec.user_id
        AND n.channel = 'in_app'
        AND n.created_at >= p_start AND n.created_at < p_end
        AND n.dismissed_at IS NULL AND n.archived_at IS NULL
        AND COALESCE(n.severity, c.severity) NOT IN ('critical','high')
        AND COALESCE(c.system_required, false) = false
        AND COALESCE(p.muted, false) = false
        AND COALESCE(p.digest_frequency::text, 'immediate') = _period
        AND CASE WHEN _channel = 'email' THEN COALESCE(p.email_enabled, false)
                 WHEN _channel = 'sms' THEN COALESCE(p.sms_enabled, false) AND public.notification_sms_available()
                 ELSE false END
    ), ins AS (
      INSERT INTO public.notification_digest_items (run_id, notification_id, period)
      SELECT run_id, id, _period FROM eligible
      ON CONFLICT (notification_id, period) DO NOTHING
      RETURNING 1
    )
    SELECT count(*) INTO inserted FROM ins;

    UPDATE public.notification_digest_runs SET item_count = inserted WHERE id = run_id;

    IF inserted = 0 THEN
      UPDATE public.notification_digest_runs
      SET status = 'skipped', error = 'no eligible notifications'
      WHERE id = run_id;
      CONTINUE;
    END IF;

    out_runs := out_runs || jsonb_build_array(jsonb_build_object(
      'run_id', run_id,
      'user_id', rec.user_id,
      'channel', _channel,
      'period', _period,
      'period_start', p_start,
      'period_end', p_end,
      'item_count', inserted,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'id', n.id, 'title', n.title, 'preview', COALESCE(n.preview, n.message),
          'module', n.module, 'severity', n.severity, 'route', n.source_route,
          'created_at', n.created_at) ORDER BY n.created_at DESC), '[]'::jsonb)
        FROM public.notification_digest_items di
        JOIN public.notifications n ON n.id = di.notification_id
        WHERE di.run_id = run_id
      ),
      'recipient_email', (SELECT email FROM public.profiles WHERE id = rec.user_id),
      'recipient_name', (SELECT full_name FROM public.profiles WHERE id = rec.user_id)
    ));
  END LOOP;

  RETURN jsonb_build_object('period', _period, 'period_start', p_start, 'period_end', p_end, 'runs', out_runs);
END $function$;

REVOKE ALL ON FUNCTION public.notification_digest_build(text, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_digest_build(text, timestamptz, text) TO service_role;

-- 7. Mark digest outcome (retry-safe)
CREATE OR REPLACE FUNCTION public.notification_digest_mark(
  _run_id uuid,
  _status text,
  _error text DEFAULT NULL,
  _dispatch_log_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF _status NOT IN ('pending','sent','failed','skipped') THEN
    RAISE EXCEPTION 'invalid_status: %', _status;
  END IF;

  UPDATE public.notification_digest_runs
  SET status = _status,
      error = _error,
      attempts = attempts + 1,
      dispatch_log_id = COALESCE(_dispatch_log_id, dispatch_log_id),
      sent_at = CASE WHEN _status = 'sent' THEN now() ELSE sent_at END
  WHERE id = _run_id;

  -- Failed digests release their items so a later run can retry them safely
  IF _status = 'failed' THEN
    DELETE FROM public.notification_digest_items WHERE run_id = _run_id;
    DELETE FROM public.notification_digest_runs WHERE id = _run_id AND attempts >= 5;
  END IF;
END $function$;

REVOKE ALL ON FUNCTION public.notification_digest_mark(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_digest_mark(uuid, text, text, uuid) TO service_role;