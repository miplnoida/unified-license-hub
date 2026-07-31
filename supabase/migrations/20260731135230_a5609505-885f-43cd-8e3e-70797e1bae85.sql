-- ===== ENUMS =====
DO $$ BEGIN
  CREATE TYPE public.notification_status AS ENUM ('unread','read','actioned','dismissed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_digest_frequency AS ENUM ('immediate','hourly','daily');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 1. NOTIFICATION RECORD MODEL =====
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS recipient_role text,
  ADD COLUMN IF NOT EXISTS recipient_group text,
  ADD COLUMN IF NOT EXISTS preview text,
  ADD COLUMN IF NOT EXISTS status public.notification_status NOT NULL DEFAULT 'unread',
  ADD COLUMN IF NOT EXISTS read_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS system_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_reference text,
  ADD COLUMN IF NOT EXISTS source_route text,
  ADD COLUMN IF NOT EXISTS route_params jsonb,
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS rendered_content_ref text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Backfill derived fields for existing rows
UPDATE public.notifications
SET status = CASE
      WHEN dismissed_at IS NOT NULL THEN 'dismissed'::public.notification_status
      WHEN actioned_at IS NOT NULL THEN 'actioned'::public.notification_status
      WHEN read THEN 'read'::public.notification_status
      ELSE 'unread'::public.notification_status
    END,
    read_at = COALESCE(read_at, CASE WHEN read THEN COALESCE(actioned_at, dismissed_at, created_at) END),
    preview = COALESCE(preview, left(regexp_replace(COALESCE(message,''), '\s+', ' ', 'g'), 160))
WHERE preview IS NULL OR status = 'unread';

CREATE INDEX IF NOT EXISTS idx_notifications_user_status_created
  ON public.notifications (user_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_dedupe_key
  ON public.notifications (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at
  ON public.notifications (expires_at) WHERE expires_at IS NOT NULL;

-- Keep status / read flag / timestamps coherent for legacy and new writers
CREATE OR REPLACE FUNCTION public.notifications_sync_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.preview IS NULL THEN
    NEW.preview := left(regexp_replace(COALESCE(NEW.message,''), '\s+', ' ', 'g'), 160);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Legacy writers flip `read`; new writers set `status`.
    IF NEW.status = OLD.status THEN
      IF NEW.dismissed_at IS NOT NULL AND OLD.dismissed_at IS NULL THEN
        NEW.status := 'dismissed';
      ELSIF NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL THEN
        NEW.status := 'archived';
      ELSIF NEW.actioned_at IS NOT NULL AND OLD.actioned_at IS NULL THEN
        NEW.status := 'actioned';
      ELSIF NEW.read AND NOT OLD.read THEN
        NEW.status := 'read';
      END IF;
    END IF;
  END IF;

  IF NEW.status IN ('read','actioned','dismissed','archived') THEN
    NEW.read := true;
    NEW.read_at := COALESCE(NEW.read_at, now());
  END IF;
  IF NEW.status = 'actioned' THEN NEW.actioned_at := COALESCE(NEW.actioned_at, now()); END IF;
  IF NEW.status = 'dismissed' THEN NEW.dismissed_at := COALESCE(NEW.dismissed_at, now()); END IF;
  IF NEW.status = 'archived' THEN NEW.archived_at := COALESCE(NEW.archived_at, now()); END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_sync_state ON public.notifications;
CREATE TRIGGER trg_notifications_sync_state
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_sync_state();

-- ===== 5. Column-level protection for recipient updates =====
CREATE OR REPLACE FUNCTION public.notifications_guard_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- System / service paths (no end-user session) may write freely.
  IF auth.uid() IS NULL OR current_user IN ('service_role','postgres','supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.title IS DISTINCT FROM OLD.title
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.preview IS DISTINCT FROM OLD.preview
     OR NEW.severity IS DISTINCT FROM OLD.severity
     OR NEW.category IS DISTINCT FROM OLD.category
     OR NEW.module IS DISTINCT FROM OLD.module
     OR NEW.type IS DISTINCT FROM OLD.type
     OR NEW.event_key IS DISTINCT FROM OLD.event_key
     OR NEW.template_id IS DISTINCT FROM OLD.template_id
     OR NEW.template_version IS DISTINCT FROM OLD.template_version
     OR NEW.rendered_content_ref IS DISTINCT FROM OLD.rendered_content_ref
     OR NEW.entity_type IS DISTINCT FROM OLD.entity_type
     OR NEW.entity_id IS DISTINCT FROM OLD.entity_id
     OR NEW.source_reference IS DISTINCT FROM OLD.source_reference
     OR NEW.source_route IS DISTINCT FROM OLD.source_route
     OR NEW.system_required IS DISTINCT FROM OLD.system_required
     OR NEW.action_required IS DISTINCT FROM OLD.action_required
     OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
     OR NEW.dedupe_key IS DISTINCT FROM OLD.dedupe_key
     OR NEW.channel IS DISTINCT FROM OLD.channel
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'notification_field_immutable';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_guard_update ON public.notifications;
CREATE TRIGGER trg_notifications_guard_update
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.notifications_guard_update();

-- Hard delete stays blocked for every non-service caller
CREATE OR REPLACE FUNCTION public.notifications_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL OR current_user NOT IN ('service_role','postgres','supabase_admin') THEN
    RAISE EXCEPTION 'notifications_cannot_be_deleted';
  END IF;
  RETURN OLD;
END $$;

-- ===== 2. PER-EVENT PREFERENCES =====
ALTER TABLE public.notification_event_configs
  ADD COLUMN IF NOT EXISTS severity public.notification_severity,
  ADD COLUMN IF NOT EXISTS allow_mute boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS system_required boolean NOT NULL DEFAULT false;

UPDATE public.notification_event_configs
SET severity = public.notification_severity_for(event_key, notification_type)
WHERE severity IS NULL;

UPDATE public.notification_event_configs
SET allow_mute = false, system_required = true
WHERE severity IN ('critical','high') AND system_required = false;

CREATE TABLE IF NOT EXISTS public.notification_user_event_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_key text NOT NULL,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  digest_frequency public.notification_digest_frequency NOT NULL DEFAULT 'immediate',
  muted boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, event_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_user_event_preferences TO authenticated;
GRANT ALL ON public.notification_user_event_preferences TO service_role;
ALTER TABLE public.notification_user_event_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own event preferences" ON public.notification_user_event_preferences;
CREATE POLICY "Users manage own event preferences"
  ON public.notification_user_event_preferences FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read event preferences" ON public.notification_user_event_preferences;
CREATE POLICY "Admins read event preferences"
  ON public.notification_user_event_preferences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'::app_role) OR public.has_role(auth.uid(),'admin'::app_role));

CREATE OR REPLACE FUNCTION public.validate_user_event_preference()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cfg record;
  sev public.notification_severity;
BEGIN
  SELECT severity, allow_mute, system_required INTO cfg
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

  NEW.updated_at := now();
  NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_user_event_preference ON public.notification_user_event_preferences;
CREATE TRIGGER trg_validate_user_event_preference
  BEFORE INSERT OR UPDATE ON public.notification_user_event_preferences
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_event_preference();

-- Resolver: new per-event table first, legacy JSONB preferences as fallback
CREATE OR REPLACE FUNCTION public.notification_effective_preference(_user_id uuid, _event_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cfg record;
  sev public.notification_severity;
  pref record;
  legacy jsonb;
  result jsonb;
BEGIN
  SELECT severity, allow_mute, system_required INTO cfg
  FROM public.notification_event_configs WHERE event_key = _event_key LIMIT 1;
  sev := COALESCE(cfg.severity, public.notification_severity_for(_event_key, NULL));

  SELECT * INTO pref FROM public.notification_user_event_preferences
  WHERE user_id = _user_id AND event_key = _event_key AND effective_from <= now();

  IF pref.id IS NOT NULL THEN
    result := jsonb_build_object(
      'in_app', pref.in_app_enabled, 'email', pref.email_enabled, 'sms', pref.sms_enabled,
      'digest', pref.digest_frequency::text, 'muted', pref.muted, 'source', 'event_preference');
  ELSE
    SELECT COALESCE(type_settings, '{}'::jsonb) -> _event_key INTO legacy
    FROM public.notification_preferences WHERE user_id = _user_id;
    result := jsonb_build_object(
      'in_app', COALESCE((legacy->>'in_app')::boolean, true),
      'email', COALESCE((legacy->>'email')::boolean, true),
      'sms', COALESCE((legacy->>'sms')::boolean, false),
      'digest', COALESCE(legacy->>'digest', 'immediate'),
      'muted', COALESCE((legacy->>'muted')::boolean, false),
      'source', CASE WHEN legacy IS NULL THEN 'default' ELSE 'legacy_preference' END);
  END IF;

  -- Mandatory regulatory guarantees always win
  IF sev = 'critical' OR COALESCE(cfg.system_required,false) THEN
    result := result || jsonb_build_object('in_app', true, 'muted', false);
  END IF;
  IF sev IN ('critical','high') THEN
    result := result || jsonb_build_object('digest', 'immediate');
  END IF;
  IF COALESCE(cfg.system_required,false) THEN
    result := result || jsonb_build_object('email', true);
  END IF;

  RETURN result || jsonb_build_object('severity', sev::text, 'system_required', COALESCE(cfg.system_required,false));
END $$;

CREATE OR REPLACE FUNCTION public.save_notification_event_preference(
  _event_key text,
  _in_app boolean DEFAULT true,
  _email boolean DEFAULT true,
  _sms boolean DEFAULT false,
  _digest public.notification_digest_frequency DEFAULT 'immediate',
  _muted boolean DEFAULT false,
  _effective_from timestamptz DEFAULT now()
)
RETURNS public.notification_user_event_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE row_out public.notification_user_event_preferences;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  INSERT INTO public.notification_user_event_preferences
    (user_id, event_key, in_app_enabled, email_enabled, sms_enabled, digest_frequency, muted, effective_from, updated_by)
  VALUES (auth.uid(), _event_key, _in_app, _email, _sms, _digest, _muted, COALESCE(_effective_from, now()), auth.uid())
  ON CONFLICT (user_id, event_key) DO UPDATE
    SET in_app_enabled = EXCLUDED.in_app_enabled,
        email_enabled = EXCLUDED.email_enabled,
        sms_enabled = EXCLUDED.sms_enabled,
        digest_frequency = EXCLUDED.digest_frequency,
        muted = EXCLUDED.muted,
        effective_from = EXCLUDED.effective_from,
        updated_by = auth.uid()
  RETURNING * INTO row_out;

  PERFORM public.log_notification_audit('NOTIFICATION_PREFERENCES_UPDATED', ARRAY[]::uuid[],
    jsonb_build_object('event_key', _event_key, 'preference_id', row_out.id));

  RETURN row_out;
END $$;

GRANT EXECUTE ON FUNCTION public.save_notification_event_preference(text,boolean,boolean,boolean,public.notification_digest_frequency,boolean,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_effective_preference(uuid,text) TO authenticated, service_role;

-- ===== 3. DELIVERY RECORDS =====
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS notification_id uuid,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS template_version integer,
  ADD COLUMN IF NOT EXISTS rendered_content text,
  ADD COLUMN IF NOT EXISTS rendered_content_ref text,
  ADD COLUMN IF NOT EXISTS error_details jsonb;

UPDATE public.notification_dispatch_log
SET queued_at = COALESCE(queued_at, created_at)
WHERE queued_at IS NULL;

ALTER TABLE public.notification_dispatch_log DROP CONSTRAINT IF EXISTS notification_dispatch_log_status_chk;
ALTER TABLE public.notification_dispatch_log
  ADD CONSTRAINT notification_dispatch_log_status_chk
  CHECK (status IN ('queued','processing','sent','delivered','failed','bounced','skipped','pending','retrying','dead'));

CREATE INDEX IF NOT EXISTS idx_dispatch_log_notification ON public.notification_dispatch_log (notification_id);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_status_created ON public.notification_dispatch_log (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.notification_record_delivery(
  _event_key text,
  _channel text,
  _status text,
  _notification_id uuid DEFAULT NULL,
  _recipient_user_id uuid DEFAULT NULL,
  _recipient_email text DEFAULT NULL,
  _recipient_phone text DEFAULT NULL,
  _provider text DEFAULT NULL,
  _subject text DEFAULT NULL,
  _rendered_content text DEFAULT NULL,
  _template_id uuid DEFAULT NULL,
  _template_version integer DEFAULT NULL,
  _provider_message_id text DEFAULT NULL,
  _error_details jsonb DEFAULT NULL,
  _dedupe_key text DEFAULT NULL,
  _entity_type text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _payload jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE row_id uuid;
BEGIN
  INSERT INTO public.notification_dispatch_log (
    event_key, channel, status, notification_id, recipient_user_id, recipient_email, recipient_phone,
    provider, subject, rendered_content, template_id, template_version, provider_message_id,
    error_details, error, dedupe_key, entity_type, entity_id, payload,
    queued_at, sent_at, delivered_at, failed_at, last_attempt_at
  ) VALUES (
    _event_key, _channel, _status, _notification_id, _recipient_user_id, _recipient_email, _recipient_phone,
    _provider, _subject, _rendered_content, _template_id, _template_version, _provider_message_id,
    _error_details, _error_details->>'message',
    COALESCE(_dedupe_key, _event_key || ':' || COALESCE(_recipient_user_id::text, _recipient_email, 'none') || ':' || _channel || ':' || gen_random_uuid()::text),
    _entity_type, _entity_id, _payload,
    now(),
    CASE WHEN _status IN ('sent','delivered') THEN now() END,
    CASE WHEN _status = 'delivered' THEN now() END,
    CASE WHEN _status IN ('failed','bounced') THEN now() END,
    now()
  )
  RETURNING id INTO row_id;

  IF _status IN ('sent','delivered') THEN
    PERFORM public.log_notification_audit('NOTIFICATION_SENT', ARRAY[_notification_id]::uuid[],
      jsonb_build_object('event_key', _event_key, 'channel', _channel, 'delivery_id', row_id));
  ELSIF _status IN ('failed','bounced') THEN
    PERFORM public.log_notification_audit('NOTIFICATION_DELIVERY_FAILED', ARRAY[_notification_id]::uuid[],
      jsonb_build_object('event_key', _event_key, 'channel', _channel, 'delivery_id', row_id, 'error', _error_details));
  END IF;

  RETURN row_id;
END $$;

GRANT EXECUTE ON FUNCTION public.notification_record_delivery(text,text,text,uuid,uuid,text,text,text,text,text,uuid,integer,text,jsonb,text,text,text,jsonb) TO service_role;

-- Delivery-history visibility via RBAC permission (admins retained)
DROP POLICY IF EXISTS "Admins read dispatch log" ON public.notification_dispatch_log;
CREATE POLICY "Delivery history readable with permission"
  ON public.notification_dispatch_log FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin'::app_role)
    OR public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_permission(auth.uid(),'notification_management','view_delivery_history')
  );

-- ===== 4. AUDIT EVENT HELPERS =====
CREATE OR REPLACE FUNCTION public.log_notification_audit(_action text, _notification_ids uuid[], _metadata jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE ids uuid[] := COALESCE(array_remove(_notification_ids, NULL), ARRAY[]::uuid[]);
BEGIN
  IF _action NOT IN (
    'NOTIFICATION_CREATED','NOTIFICATION_SENT','NOTIFICATION_DELIVERY_FAILED','NOTIFICATION_READ',
    'NOTIFICATIONS_BULK_MARKED_READ','NOTIFICATION_DISMISSED','NOTIFICATION_ACTIONED','NOTIFICATION_ARCHIVED',
    'NOTIFICATION_FORWARDED','NOTIFICATION_PREFERENCES_UPDATED','NOTIFICATION_RETRIED','NOTIFICATION_RESENT_BY_ADMIN'
  ) THEN
    RAISE EXCEPTION 'unsupported_notification_audit_action: %', _action;
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, new_value)
  VALUES (
    auth.uid(),
    _action,
    'notification',
    CASE WHEN array_length(ids,1) = 1 THEN ids[1]::text ELSE NULL END,
    COALESCE(_metadata,'{}'::jsonb) || jsonb_build_object('count', COALESCE(array_length(ids,1),0)),
    jsonb_build_object('notification_ids', to_jsonb(ids))
  );
END $$;

-- Archive action (dismissed notifications remain stored)
CREATE OR REPLACE FUNCTION public.notification_archive(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
    SET status = 'archived', archived_at = now()
  WHERE id = ANY(_ids) AND user_id = auth.uid() AND status <> 'archived';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM public.log_notification_audit('NOTIFICATION_ARCHIVED', _ids, '{}'::jsonb);
  END IF;
  RETURN n;
END $$;

GRANT EXECUTE ON FUNCTION public.notification_archive(uuid[]) TO authenticated;

-- Status-aware counts (archived excluded, dismissed retained but hidden)
CREATE OR REPLACE FUNCTION public.notification_counts()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'unread', count(*) FILTER (WHERE status = 'unread'),
    'unread_urgent', count(*) FILTER (WHERE status = 'unread' AND severity IN ('critical','high')),
    'action_required', count(*) FILTER (WHERE status = 'unread' AND category = 'action_required'),
    'alerts', count(*) FILTER (WHERE status = 'unread' AND category = 'alert'),
    'archived', count(*) FILTER (WHERE status = 'archived')
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND channel = 'in_app'
    AND status NOT IN ('dismissed','archived')
    AND (expires_at IS NULL OR expires_at > now())
$$;
