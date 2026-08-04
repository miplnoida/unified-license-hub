-- 1. Fallback governance on the registry -------------------------------------
ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS fallback_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS fallback_strategy text NOT NULL DEFAULT 'internal_logic',
  ADD COLUMN IF NOT EXISTS fallback_implementation_key text,
  ADD COLUMN IF NOT EXISTS fallback_allowed_categories text[] NOT NULL
    DEFAULT ARRAY['not_configured','network','timeout','server','circuit_open']::text[],
  ADD COLUMN IF NOT EXISTS fallback_max_duration_hours integer NOT NULL DEFAULT 168,
  ADD COLUMN IF NOT EXISTS fallback_alert_threshold numeric NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS fallback_recovery_policy text NOT NULL DEFAULT 'automatic',
  ADD COLUMN IF NOT EXISTS fallback_approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS business_critical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fallback_since timestamptz,
  ADD COLUMN IF NOT EXISTS fallback_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.integration_connections
  DROP CONSTRAINT IF EXISTS integration_connections_fallback_strategy_chk;
ALTER TABLE public.integration_connections
  ADD CONSTRAINT integration_connections_fallback_strategy_chk
  CHECK (fallback_strategy IN ('internal_logic','queue','pending_state','none'));

ALTER TABLE public.integration_connections
  DROP CONSTRAINT IF EXISTS integration_connections_fallback_recovery_chk;
ALTER TABLE public.integration_connections
  ADD CONSTRAINT integration_connections_fallback_recovery_chk
  CHECK (fallback_recovery_policy IN ('automatic','manual'));

ALTER TABLE public.integration_connections
  DROP CONSTRAINT IF EXISTS integration_connections_fallback_approval_chk;
ALTER TABLE public.integration_connections
  ADD CONSTRAINT integration_connections_fallback_approval_chk
  CHECK (fallback_approval_status IN ('approved','pending','rejected'));

-- Payment, AML and sanctions are business critical: fallback must be an
-- explicit, alerted decision rather than a silent default.
UPDATE public.integration_connections
   SET business_critical = true,
       fallback_alert_threshold = 0.01,
       fallback_max_duration_hours = 24
 WHERE integration_key IN ('payment_gateway','aml_screening','sanctions_screening','government_registry');

UPDATE public.integration_connections
   SET fallback_enabled = false,
       fallback_strategy = 'none',
       fallback_allowed_categories = ARRAY[]::text[]
 WHERE integration_key = 'payment_gateway';

UPDATE public.integration_connections
   SET fallback_strategy = 'pending_state',
       fallback_implementation_key = 'internal_pending_publication'
 WHERE integration_key IN ('government_registry','external_registry');

UPDATE public.integration_connections
   SET fallback_implementation_key = 'internal_screening'
 WHERE integration_key IN ('aml_screening','sanctions_screening','credit_bureau');

UPDATE public.integration_connections
   SET fallback_implementation_key = 'internal_identity_validation'
 WHERE integration_key = 'identity_verification';

UPDATE public.integration_connections
   SET fallback_implementation_key = 'internal_document_generation'
 WHERE integration_key = 'document_signing';

-- 2. Log columns -------------------------------------------------------------
ALTER TABLE public.integration_logs
  ADD COLUMN IF NOT EXISTS execution_mode text,
  ADD COLUMN IF NOT EXISTS fallback_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text,
  ADD COLUMN IF NOT EXISTS operation text;

CREATE INDEX IF NOT EXISTS integration_logs_correlation_idx
  ON public.integration_logs (correlation_id);
CREATE INDEX IF NOT EXISTS integration_logs_module_created_idx
  ON public.integration_logs (source_module, created_at DESC);

-- 3. Fallback event ledger ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integration_fallback_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  adapter_key text,
  operation text NOT NULL,
  source_module text NOT NULL,
  business_event text NOT NULL,
  source_entity_type text,
  source_entity_id text,
  actor_id uuid,
  correlation_id uuid,
  idempotency_fingerprint text,
  execution_mode text NOT NULL DEFAULT 'fallback',
  fallback_reason text NOT NULL,
  fallback_implementation text,
  original_error_category text,
  original_error text,
  integration_log_id uuid,
  recovery_state text NOT NULL DEFAULT 'unresolved',
  recovered_at timestamptz,
  environment text,
  business_critical boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_fallback_events TO authenticated;
GRANT ALL ON public.integration_fallback_events TO service_role;

ALTER TABLE public.integration_fallback_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with integration view can read fallback events"
  ON public.integration_fallback_events
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'settings'::text, 'view'::text)
  );

CREATE INDEX IF NOT EXISTS integration_fallback_events_key_idx
  ON public.integration_fallback_events (integration_key, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_fallback_events_recovery_idx
  ON public.integration_fallback_events (recovery_state)
  WHERE recovery_state = 'unresolved';

CREATE OR REPLACE FUNCTION public.touch_integration_fallback_events()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_integration_fallback_events
  ON public.integration_fallback_events;
CREATE TRIGGER trg_touch_integration_fallback_events
  BEFORE UPDATE ON public.integration_fallback_events
  FOR EACH ROW EXECUTE FUNCTION public.touch_integration_fallback_events();

-- 4. Recorder: fallback event + immutable audit row --------------------------
CREATE OR REPLACE FUNCTION public.integration_record_fallback(
  _integration_key text,
  _operation text,
  _source_module text,
  _business_event text,
  _fallback_reason text,
  _execution_mode text DEFAULT 'fallback',
  _fallback_implementation text DEFAULT NULL,
  _original_error_category text DEFAULT NULL,
  _original_error text DEFAULT NULL,
  _source_entity_type text DEFAULT NULL,
  _source_entity_id text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _idempotency_fingerprint text DEFAULT NULL,
  _integration_log_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conn public.integration_connections;
  v_id uuid;
BEGIN
  SELECT * INTO v_conn FROM public.integration_connections
   WHERE integration_key = _integration_key;

  INSERT INTO public.integration_fallback_events (
    integration_key, connection_id, adapter_key, operation, source_module,
    business_event, source_entity_type, source_entity_id, actor_id,
    correlation_id, idempotency_fingerprint, execution_mode, fallback_reason,
    fallback_implementation, original_error_category, original_error,
    integration_log_id, environment, business_critical
  ) VALUES (
    _integration_key, v_conn.id, COALESCE(v_conn.adapter_key, _integration_key),
    _operation, _source_module, _business_event, _source_entity_type,
    _source_entity_id, _actor_id, _correlation_id, _idempotency_fingerprint,
    _execution_mode, _fallback_reason, _fallback_implementation,
    _original_error_category, _original_error, _integration_log_id,
    v_conn.environment, COALESCE(v_conn.business_critical, false)
  ) RETURNING id INTO v_id;

  IF _execution_mode = 'fallback' THEN
    UPDATE public.integration_connections
       SET fallback_count = fallback_count + 1,
           fallback_since = COALESCE(fallback_since, now())
     WHERE id = v_conn.id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, action, entity_type, entity_id, new_value, metadata
  ) VALUES (
    _actor_id,
    'integration.' || _execution_mode || '_execution',
    'integration_connection',
    COALESCE(v_conn.id::text, _integration_key),
    jsonb_build_object(
      'integration_key', _integration_key,
      'operation', _operation,
      'execution_mode', _execution_mode,
      'fallback_reason', _fallback_reason,
      'fallback_implementation', _fallback_implementation,
      'original_error_category', _original_error_category
    ),
    jsonb_build_object(
      'source_module', _source_module,
      'business_event', _business_event,
      'source_entity_type', _source_entity_type,
      'source_entity_id', _source_entity_id,
      'correlation_id', _correlation_id,
      'environment', v_conn.environment,
      'fallback_event_id', v_id
    )
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.integration_record_fallback(
  text,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_record_fallback(
  text,text,text,text,text,text,text,text,text,text,text,uuid,uuid,text,uuid) TO service_role;

-- 5. Resolver now carries fallback policy ------------------------------------
CREATE OR REPLACE FUNCTION public.integration_resolve_connection(_integration_key text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'integration_key', c.integration_key,
    'name', c.name,
    'adapter_key', COALESCE(c.adapter_key, c.integration_key),
    'enabled', c.enabled,
    'environment', c.environment,
    'protocol', c.protocol,
    'auth_type', c.auth_type,
    'base_url', c.base_url,
    'timeout_ms', c.timeout_ms,
    'retry_count', c.retry_count,
    'retry_backoff_ms', c.retry_backoff_ms,
    'rate_limit_per_minute', c.rate_limit_per_minute,
    'requires_credentials', c.requires_credentials,
    'data_mapping', c.data_mapping,
    'circuit_state', c.circuit_state,
    'circuit_opened_at', c.circuit_opened_at,
    'circuit_cooloff_seconds', c.circuit_cooloff_seconds,
    'secret_ref', cr.secret_ref,
    'credential_version', c.credential_version,
    'provider_verified', c.provider_verified,
    'business_critical', c.business_critical,
    'fallback_enabled', c.fallback_enabled,
    'fallback_strategy', c.fallback_strategy,
    'fallback_implementation_key', c.fallback_implementation_key,
    'fallback_allowed_categories', c.fallback_allowed_categories,
    'fallback_max_duration_hours', c.fallback_max_duration_hours,
    'fallback_alert_threshold', c.fallback_alert_threshold,
    'fallback_recovery_policy', c.fallback_recovery_policy,
    'fallback_approval_status', c.fallback_approval_status
  )
  FROM public.integration_connections c
  LEFT JOIN public.integration_credentials cr
    ON cr.connection_id = c.id AND cr.is_current
  WHERE c.integration_key = _integration_key;
$$;

-- 6. Fallback metrics --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_fallback_metrics(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH win AS (
    SELECT * FROM public.integration_logs
     WHERE created_at > now() - make_interval(days => GREATEST(_days, 1))
  ), modes AS (
    SELECT COALESCE(execution_mode,'real') AS mode, count(*) AS n FROM win GROUP BY 1
  )
  SELECT jsonb_build_object(
    'window_days', GREATEST(_days, 1),
    'executions', (SELECT COALESCE(sum(n),0) FROM modes),
    'real', (SELECT COALESCE(sum(n),0) FROM modes WHERE mode = 'real'),
    'mock', (SELECT COALESCE(sum(n),0) FROM modes WHERE mode = 'mock'),
    'fallback', (SELECT COALESCE(sum(n),0) FROM modes WHERE mode = 'fallback'),
    'blocked', (SELECT COALESCE(sum(n),0) FROM modes WHERE mode = 'blocked'),
    'fallback_rate', CASE WHEN (SELECT COALESCE(sum(n),0) FROM modes) = 0 THEN 0
      ELSE round((SELECT COALESCE(sum(n),0) FROM modes WHERE mode='fallback')::numeric
                 / (SELECT sum(n) FROM modes), 4) END,
    'reasons', COALESCE((SELECT jsonb_object_agg(fallback_reason, c) FROM (
        SELECT fallback_reason, count(*) c FROM public.integration_fallback_events
         WHERE created_at > now() - make_interval(days => GREATEST(_days,1))
         GROUP BY 1) r), '{}'::jsonb),
    'modules', COALESCE((SELECT jsonb_object_agg(source_module, c) FROM (
        SELECT source_module, count(*) c FROM public.integration_fallback_events
         WHERE created_at > now() - make_interval(days => GREATEST(_days,1))
         GROUP BY 1) m), '{}'::jsonb),
    'integrations_in_fallback', COALESCE((SELECT jsonb_agg(jsonb_build_object(
         'integration_key', integration_key,
         'since', fallback_since,
         'count', fallback_count,
         'business_critical', business_critical,
         'max_duration_hours', fallback_max_duration_hours,
         'over_max_duration', fallback_since IS NOT NULL
            AND fallback_since < now() - make_interval(hours => fallback_max_duration_hours)))
       FROM public.integration_connections
      WHERE fallback_since IS NOT NULL), '[]'::jsonb),
    'oldest_unresolved_fallback', (SELECT min(created_at)
       FROM public.integration_fallback_events WHERE recovery_state = 'unresolved')
  );
$$;

REVOKE ALL ON FUNCTION public.integration_fallback_metrics(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_fallback_metrics(integer) TO authenticated, service_role;