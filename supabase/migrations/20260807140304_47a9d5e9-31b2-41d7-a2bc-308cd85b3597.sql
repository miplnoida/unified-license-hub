-- PHASE 9.1/9.2/9.5/9.7 — canonical communication registry on notification_dispatch_log

DO $$ BEGIN
  CREATE TYPE public.communication_state AS ENUM (
    'QUEUED','SENT_TO_PROVIDER','DELIVERED','FAILED','RETRYING','DEAD_LETTER',
    'PROVIDER_NOT_CONFIGURED','SUPPRESSED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_to_provider_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_category text,
  ADD COLUMN IF NOT EXISTS communication_state public.communication_state;

-- Truthful mapping from the legacy status vocabulary to the canonical state.
CREATE OR REPLACE FUNCTION public.derive_communication_state(
  _status text, _delivered_at timestamptz, _failed_at timestamptz,
  _error text, _poisoned boolean, _retry_count integer, _next_attempt_at timestamptz
) RETURNS public.communication_state
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _delivered_at IS NOT NULL THEN 'DELIVERED'::public.communication_state
    WHEN lower(COALESCE(_status,'')) IN ('delivered','opened') AND _delivered_at IS NOT NULL THEN 'DELIVERED'
    WHEN lower(COALESCE(_status,'')) = 'skipped' THEN 'SUPPRESSED'
    WHEN COALESCE(_error,'') ILIKE '%not_configured%'
      OR COALESCE(_error,'') ILIKE '%not configured%' THEN 'PROVIDER_NOT_CONFIGURED'
    WHEN COALESCE(_poisoned,false) OR COALESCE(_retry_count,0) >= 6
      THEN CASE WHEN lower(COALESCE(_status,'')) IN ('failed','bounced','dead') THEN 'DEAD_LETTER'::public.communication_state ELSE 'FAILED'::public.communication_state END
    WHEN lower(COALESCE(_status,'')) IN ('failed','bounced')
      THEN CASE WHEN _next_attempt_at IS NOT NULL THEN 'RETRYING'::public.communication_state ELSE 'FAILED'::public.communication_state END
    WHEN lower(COALESCE(_status,'')) IN ('sent','sent_to_provider','opened','delivered') THEN 'SENT_TO_PROVIDER'
    ELSE 'QUEUED'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_dispatch_log_communication_state()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.requested_at := COALESCE(NEW.requested_at, NEW.queued_at, NEW.created_at, now());
  IF NEW.module IS NULL THEN
    NEW.module := public.notification_module_for(NEW.event_key, NEW.entity_type);
  END IF;
  IF lower(COALESCE(NEW.status,'')) IN ('sent','sent_to_provider','delivered','opened')
     AND NEW.sent_to_provider_at IS NULL THEN
    NEW.sent_to_provider_at := COALESCE(NEW.sent_at, now());
  END IF;

  NEW.communication_state := public.derive_communication_state(
    NEW.status, NEW.delivered_at, NEW.failed_at, NEW.error,
    NEW.poisoned, NEW.retry_count, NEW.next_attempt_at);

  NEW.failure_category := CASE
    WHEN NEW.communication_state = 'PROVIDER_NOT_CONFIGURED' THEN 'not_configured'
    WHEN NEW.communication_state IN ('FAILED','RETRYING','DEAD_LETTER') THEN CASE
      WHEN COALESCE(NEW.error,'') ILIKE '%auth%' THEN 'authentication'
      WHEN COALESCE(NEW.error,'') ILIKE '%timeout%' OR COALESCE(NEW.error,'') ILIKE '%reach%'
        OR COALESCE(NEW.error,'') ILIKE '%connect%' THEN 'network'
      WHEN lower(COALESCE(NEW.status,'')) = 'bounced' THEN 'bounce'
      WHEN COALESCE(NEW.error,'') <> '' THEN 'provider'
      ELSE 'unknown' END
    ELSE NULL END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispatch_log_communication_state ON public.notification_dispatch_log;
CREATE TRIGGER trg_dispatch_log_communication_state
BEFORE INSERT OR UPDATE ON public.notification_dispatch_log
FOR EACH ROW EXECUTE FUNCTION public.tg_dispatch_log_communication_state();

-- Backfill existing history truthfully (SMTP acceptance is never "delivered").
UPDATE public.notification_dispatch_log SET
  requested_at = COALESCE(requested_at, queued_at, created_at),
  sent_to_provider_at = COALESCE(sent_to_provider_at,
    CASE WHEN lower(COALESCE(status,'')) IN ('sent','delivered','opened') THEN sent_at END),
  module = COALESCE(module, public.notification_module_for(event_key, entity_type)),
  communication_state = public.derive_communication_state(
    status, delivered_at, failed_at, error, poisoned, retry_count, next_attempt_at)
WHERE communication_state IS NULL OR requested_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_log_state ON public.notification_dispatch_log (communication_state, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_log_object ON public.notification_dispatch_log (entity_type, entity_id, created_at DESC);

-- 9.5 operator dead-letter queue
CREATE OR REPLACE FUNCTION public.notification_dead_letters(_limit integer DEFAULT 50, _offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid, event_key text, module text, channel text, recipient_user_id uuid,
  recipient_destination text, provider text, provider_message_id text,
  communication_state public.communication_state, failure_category text, error text,
  retry_count integer, attempts integer, requested_at timestamptz, failed_at timestamptz,
  last_attempt_at timestamptz, entity_type text, entity_id text, correlation_id text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.enforce_permission('notification_management','dispatch');
  RETURN QUERY
  SELECT d.id, d.event_key, d.module, d.channel, d.recipient_user_id,
         COALESCE(d.recipient_email, d.recipient_phone), d.provider, d.provider_message_id,
         d.communication_state, d.failure_category, d.error,
         COALESCE(d.retry_count,0), COALESCE(d.attempts,0), d.requested_at, d.failed_at,
         d.last_attempt_at, d.entity_type, d.entity_id, d.correlation_id
  FROM public.notification_dispatch_log d
  WHERE d.communication_state IN ('DEAD_LETTER','PROVIDER_NOT_CONFIGURED')
  ORDER BY COALESCE(d.failed_at, d.created_at) DESC
  LIMIT LEAST(GREATEST(COALESCE(_limit,50),1),200) OFFSET GREATEST(COALESCE(_offset,0),0);
END $$;

-- 9.7 communication timeline — authorization delegates to the parent object's RLS.
CREATE OR REPLACE FUNCTION public.can_view_communications(_object_type text, _object_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public AS $$
DECLARE ok boolean := false;
BEGIN
  IF _object_id IS NULL THEN RETURN false; END IF;
  CASE lower(_object_type)
    WHEN 'application' THEN SELECT EXISTS(SELECT 1 FROM public.applications WHERE id=_object_id) INTO ok;
    WHEN 'complaint' THEN SELECT EXISTS(SELECT 1 FROM public.complaints WHERE id=_object_id) INTO ok;
    WHEN 'fp_assessment' THEN SELECT EXISTS(SELECT 1 FROM public.fp_assessments WHERE id=_object_id) INTO ok;
    WHEN 'prudential_action' THEN SELECT EXISTS(SELECT 1 FROM public.prudential_actions WHERE id=_object_id) INTO ok;
    WHEN 'conduct_investigation' THEN SELECT EXISTS(SELECT 1 FROM public.conduct_investigations WHERE id=_object_id) INTO ok;
    WHEN 'enforcement_action' THEN SELECT EXISTS(SELECT 1 FROM public.enforcement_actions WHERE id=_object_id) INTO ok;
    ELSE ok := false;
  END CASE;
  RETURN COALESCE(ok,false);
END $$;

CREATE OR REPLACE FUNCTION public.communication_timeline(_object_type text, _object_id uuid)
RETURNS TABLE(
  id uuid, occurred_at timestamptz, direction text, channel text, event_key text,
  subject text, recipient text, recipient_user_id uuid,
  communication_state public.communication_state, provider text, provider_message_id text,
  failure_category text, error text, retry_count integer,
  template_id uuid, template_version integer, rendered_content_ref text,
  delivered_at timestamptz, failed_at timestamptz, sent_to_provider_at timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.can_view_communications(_object_type, _object_id) THEN
    RAISE EXCEPTION 'not authorized for communications of % %', _object_type, _object_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id, COALESCE(d.requested_at, d.created_at), 'outbound'::text, d.channel, d.event_key,
         d.subject, COALESCE(d.recipient_email, d.recipient_phone), d.recipient_user_id,
         d.communication_state, d.provider, d.provider_message_id,
         d.failure_category, d.error, COALESCE(d.retry_count,0),
         d.template_id, d.template_version, d.rendered_content_ref,
         d.delivered_at, d.failed_at, d.sent_to_provider_at
  FROM public.notification_dispatch_log d
  WHERE d.entity_id = _object_id::text
  ORDER BY COALESCE(d.requested_at, d.created_at) DESC
  LIMIT 500;
END $$;

GRANT EXECUTE ON FUNCTION public.notification_dead_letters(integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.communication_timeline(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_communications(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.derive_communication_state(text,timestamptz,timestamptz,text,boolean,integer,timestamptz) TO authenticated;