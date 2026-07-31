-- ============================================================
-- Phase 1: Notification Centre foundations (NOT-CEN-001)
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.notification_severity AS ENUM ('critical','high','medium','low');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.notification_category AS ENUM ('action_required','alert','system','info');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS severity public.notification_severity NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS category public.notification_category NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS action_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dismiss_note text,
  ADD COLUMN IF NOT EXISTS actioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS event_key text,
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Classification helpers -------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_severity_for(_event_key text, _type text)
RETURNS public.notification_severity
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _event_key ~* '(breach|revoked|suspended|failed|failure|critical|enforcement|system_health)' THEN 'critical'
    WHEN _event_key ~* '(escalat|overdue|rejected|adverse|warning|expiring|near_due|sla)' THEN 'high'
    WHEN _event_key ~* '(rfi|approval|assigned|submitted|resubmit|payment|due|reminder|comment|appeal)' THEN 'medium'
    WHEN _type = 'error' THEN 'critical'
    WHEN _type = 'warning' THEN 'high'
    WHEN _type = 'success' THEN 'low'
    ELSE 'medium'
  END::public.notification_severity
$$;

CREATE OR REPLACE FUNCTION public.notification_category_for(_event_key text, _type text)
RETURNS public.notification_category
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _event_key ~* '(rfi|approval|assigned|action_required|due|payment_required|resubmission|vote|acknowledg)' THEN 'action_required'
    WHEN _event_key ~* '(breach|escalat|overdue|alert|warning|expiring|near_due|sla|threshold|pattern)' THEN 'alert'
    WHEN _event_key ~* '(system|integration|scheduler|form_version|maintenance)' THEN 'system'
    WHEN _type = 'error' THEN 'alert'
    ELSE 'info'
  END::public.notification_category
$$;

CREATE OR REPLACE FUNCTION public.notification_module_for(_event_key text, _entity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(licen|registration|appeal)' THEN 'licensing'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(application|form|payment)' THEN 'applications'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(fp_|fit_and_proper|fitandproper)' THEN 'fit_and_proper'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(prudential|return|ratio|threshold)' THEN 'prudential'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(complaint|conduct)' THEN 'conduct'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(enforcement|inspection)' THEN 'enforcement'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(report)' THEN 'reporting'
    WHEN coalesce(_event_key,'') || coalesce(_entity_type,'') ~* '(correspondence|thread|message)' THEN 'communications'
    ELSE 'system'
  END
$$;

-- Backfill existing rows -------------------------------------------------

UPDATE public.notifications n
SET event_key = COALESCE(n.event_key, NULLIF(n.metadata->>'event_key','')),
    severity  = public.notification_severity_for(COALESCE(n.event_key, n.metadata->>'event_key', ''), n.type),
    category  = public.notification_category_for(COALESCE(n.event_key, n.metadata->>'event_key', ''), n.type),
    module    = COALESCE(n.module, public.notification_module_for(COALESCE(n.event_key, n.metadata->>'event_key',''), n.entity_type))
WHERE n.module IS NULL;

UPDATE public.notifications
SET action_required = true
WHERE category = 'action_required' AND action_required = false;

-- Search + query indexes -------------------------------------------------

CREATE INDEX IF NOT EXISTS notifications_search_idx
  ON public.notifications
  USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(message,'') || ' ' || coalesce(entity_id,'')));

CREATE INDEX IF NOT EXISTS notifications_user_feed_idx
  ON public.notifications (user_id, channel, created_at DESC);

-- R-NOT-002: notifications can never be deleted by users -----------------

CREATE OR REPLACE FUNCTION public.notifications_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'notifications_cannot_be_deleted';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_notifications_block_delete ON public.notifications;
CREATE TRIGGER trg_notifications_block_delete
BEFORE DELETE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.notifications_block_delete();

-- Preferences: per-type matrix + digest validation -----------------------

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS type_settings jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.validate_notification_preferences()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  k text;
  v jsonb;
BEGIN
  FOR k, v IN SELECT key, value FROM jsonb_each(COALESCE(NEW.type_settings, '{}'::jsonb)) LOOP
    IF (v->>'severity') IN ('critical','high')
       AND COALESCE(v->>'digest','immediate') <> 'immediate' THEN
      RAISE EXCEPTION 'digest_not_permitted_for_high_severity: %', k;
    END IF;
    IF (v->>'severity') IN ('critical','high') AND COALESCE((v->>'in_app')::boolean, true) = false THEN
      RAISE EXCEPTION 'in_app_required_for_high_severity: %', k;
    END IF;
  END LOOP;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_notification_preferences ON public.notification_preferences;
CREATE TRIGGER trg_validate_notification_preferences
BEFORE INSERT OR UPDATE ON public.notification_preferences
FOR EACH ROW EXECUTE FUNCTION public.validate_notification_preferences();

-- Audited user actions ---------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_notification_audit(
  _action text,
  _notification_ids uuid[],
  _metadata jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata, new_value)
  VALUES (
    auth.uid(),
    _action,
    'notification',
    CASE WHEN array_length(_notification_ids,1) = 1 THEN _notification_ids[1]::text ELSE NULL END,
    _metadata || jsonb_build_object('count', COALESCE(array_length(_notification_ids,1),0)),
    jsonb_build_object('notification_ids', to_jsonb(_notification_ids))
  );
END $$;

CREATE OR REPLACE FUNCTION public.notification_mark_read(_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
    SET read = true
  WHERE id = ANY(_ids) AND user_id = auth.uid() AND read = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM public.log_notification_audit(
      CASE WHEN array_length(_ids,1) > 1 THEN 'NOTIFICATIONS_BULK_MARKED_READ' ELSE 'NOTIFICATION_READ' END,
      _ids, '{}'::jsonb);
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notification_mark_all_read(_category public.notification_category DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
    SET read = true
  WHERE user_id = auth.uid() AND read = false AND dismissed_at IS NULL
    AND (_category IS NULL OR category = _category);
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM public.log_notification_audit('NOTIFICATIONS_BULK_MARKED_READ', ARRAY[]::uuid[],
      jsonb_build_object('category', _category, 'count', n));
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notification_dismiss(_ids uuid[], _note text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
    SET dismissed_at = now(), dismiss_note = _note, read = true
  WHERE id = ANY(_ids) AND user_id = auth.uid() AND dismissed_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN
    PERFORM public.log_notification_audit('NOTIFICATION_DISMISSED', _ids,
      jsonb_build_object('note', _note));
  END IF;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.notification_mark_actioned(_id uuid, _target text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  UPDATE public.notifications
    SET actioned_at = now(), read = true
  WHERE id = _id AND user_id = auth.uid();
  IF FOUND THEN
    PERFORM public.log_notification_audit('NOTIFICATION_ACTIONED', ARRAY[_id],
      jsonb_build_object('target', _target));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.save_notification_preferences(
  _channels jsonb DEFAULT NULL,
  _categories jsonb DEFAULT NULL,
  _type_settings jsonb DEFAULT NULL,
  _digest_enabled boolean DEFAULT NULL,
  _digest_time time DEFAULT NULL,
  _digest_timezone text DEFAULT NULL,
  _quiet_hours jsonb DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  INSERT INTO public.notification_preferences AS p (
    user_id, channels, categories, type_settings, digest_enabled, digest_time, digest_timezone, quiet_hours
  ) VALUES (
    auth.uid(),
    COALESCE(_channels, '{}'::jsonb),
    COALESCE(_categories, '{}'::jsonb),
    COALESCE(_type_settings, '{}'::jsonb),
    COALESCE(_digest_enabled, false),
    _digest_time,
    COALESCE(_digest_timezone, 'UTC'),
    _quiet_hours
  )
  ON CONFLICT (user_id) DO UPDATE SET
    channels        = COALESCE(_channels, p.channels),
    categories      = COALESCE(_categories, p.categories),
    type_settings   = COALESCE(_type_settings, p.type_settings),
    digest_enabled  = COALESCE(_digest_enabled, p.digest_enabled),
    digest_time     = COALESCE(_digest_time, p.digest_time),
    digest_timezone = COALESCE(_digest_timezone, p.digest_timezone),
    quiet_hours     = COALESCE(_quiet_hours, p.quiet_hours);

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  VALUES (auth.uid(), 'NOTIFICATION_PREFERENCES_UPDATED', 'notification_preferences', auth.uid()::text,
          jsonb_build_object('digest_enabled', _digest_enabled));
END $$;

CREATE OR REPLACE FUNCTION public.search_notifications(
  _search text DEFAULT NULL,
  _category public.notification_category DEFAULT NULL,
  _severity public.notification_severity DEFAULT NULL,
  _module text DEFAULT NULL,
  _unread_only boolean DEFAULT false,
  _include_dismissed boolean DEFAULT false,
  _from timestamptz DEFAULT NULL,
  _to timestamptz DEFAULT NULL,
  _limit integer DEFAULT 50,
  _offset integer DEFAULT 0
) RETURNS SETOF public.notifications
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT n.*
  FROM public.notifications n
  WHERE n.user_id = auth.uid()
    AND n.channel = 'in_app'
    AND (_include_dismissed OR n.dismissed_at IS NULL)
    AND (NOT _unread_only OR n.read = false)
    AND (_category IS NULL OR n.category = _category)
    AND (_severity IS NULL OR n.severity = _severity)
    AND (_module IS NULL OR n.module = _module)
    AND (_from IS NULL OR n.created_at >= _from)
    AND (_to IS NULL OR n.created_at <= _to)
    AND (
      _search IS NULL OR length(_search) < 3 OR
      to_tsvector('simple', coalesce(n.title,'') || ' ' || coalesce(n.message,'') || ' ' || coalesce(n.entity_id,''))
        @@ plainto_tsquery('simple', _search)
      OR n.title ILIKE '%' || _search || '%'
      OR n.message ILIKE '%' || _search || '%'
    )
  ORDER BY n.created_at DESC
  LIMIT GREATEST(COALESCE(_limit, 50), 1)
  OFFSET GREATEST(COALESCE(_offset, 0), 0)
$$;

CREATE OR REPLACE FUNCTION public.notification_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total', count(*),
    'unread', count(*) FILTER (WHERE read = false),
    'unread_urgent', count(*) FILTER (WHERE read = false AND severity IN ('critical','high')),
    'action_required', count(*) FILTER (WHERE read = false AND category = 'action_required'),
    'alerts', count(*) FILTER (WHERE read = false AND category = 'alert')
  )
  FROM public.notifications
  WHERE user_id = auth.uid() AND channel = 'in_app' AND dismissed_at IS NULL
$$;

GRANT EXECUTE ON FUNCTION public.notification_mark_read(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_mark_all_read(public.notification_category) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_dismiss(uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_mark_actioned(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_notification_preferences(jsonb, jsonb, jsonb, boolean, time, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_notifications(text, public.notification_category, public.notification_severity, text, boolean, boolean, timestamptz, timestamptz, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notification_counts() TO authenticated;
REVOKE ALL ON FUNCTION public.log_notification_audit(text, uuid[], jsonb) FROM PUBLIC;