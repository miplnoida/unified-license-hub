-- =====================================================================
-- ADM-INT-001 Group A: production registry fields + adapter registry
-- =====================================================================

-- 1. Operational columns on integration_connections -------------------
ALTER TABLE public.integration_connections
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS owner_team text,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS adapter_key text,
  ADD COLUMN IF NOT EXISTS provider_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS circuit_state text NOT NULL DEFAULT 'closed',
  ADD COLUMN IF NOT EXISTS circuit_failure_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS circuit_cooloff_seconds integer NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS circuit_failure_threshold integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS avg_latency_ms integer,
  ADD COLUMN IF NOT EXISTS success_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS error_rate numeric(5,2),
  ADD COLUMN IF NOT EXISTS credential_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_recovery_at timestamptz,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer;

DO $$ BEGIN
  ALTER TABLE public.integration_connections
    ADD CONSTRAINT integration_connections_environment_chk
    CHECK (environment IN ('sandbox','production'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.integration_connections
    ADD CONSTRAINT integration_connections_circuit_chk
    CHECK (circuit_state IN ('closed','open','half_open'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Observability columns on integration_logs -----------------------
ALTER TABLE public.integration_logs
  ADD COLUMN IF NOT EXISTS correlation_id uuid,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS request_bytes integer,
  ADD COLUMN IF NOT EXISTS response_bytes integer,
  ADD COLUMN IF NOT EXISTS retry_attempt integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_category text,
  ADD COLUMN IF NOT EXISTS source_module text,
  ADD COLUMN IF NOT EXISTS business_event text;

CREATE INDEX IF NOT EXISTS integration_logs_correlation_idx
  ON public.integration_logs (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS integration_logs_key_created_idx
  ON public.integration_logs (integration_key, created_at DESC);

-- 3. Register the full FRD integration set ---------------------------
-- Existing rows are preserved; only missing metadata is filled in.
INSERT INTO public.integration_connections
  (integration_key, name, description, category, type, protocol, auth_type,
   requires_credentials, base_url, timeout_ms, retry_count, retry_backoff_ms,
   enabled, environment, adapter_key, owner_team)
VALUES
  ('government_registry','Government Company Registry',
   'Company/entity verification against the national companies registry.',
   'registry','outbound','REST','api_key',true,NULL,20000,3,2000,false,'sandbox','government_registry','Licensing'),
  ('sanctions_screening','Sanctions & PEP Screening',
   'Sanctions, PEP and watchlist screening for fit-and-proper assessment.',
   'screening','outbound','REST','api_key',true,NULL,20000,3,2000,false,'sandbox','sanctions_screening','Fit & Proper'),
  ('identity_verification','Identity Verification (KYC)',
   'Identity document and biometric verification for applicant onboarding.',
   'screening','outbound','REST','api_key',true,NULL,20000,3,2000,false,'sandbox','identity_verification','Registration'),
  ('document_signing','Document Signing',
   'Electronic signature of licences, notices and determinations.',
   'documents','outbound','REST','oauth2',true,NULL,30000,3,3000,false,'sandbox','document_signing','Licensing'),
  ('notification_provider','Notification Provider',
   'Outbound push/notification provider for the notification pipeline.',
   'notifications','outbound','REST','api_key',true,NULL,15000,3,2000,false,'sandbox','notification_provider','Platform'),
  ('external_reporting','External Reporting API',
   'Submission of regulatory returns and statistics to external consumers.',
   'reporting','outbound','REST','api_key',true,NULL,30000,3,3000,false,'sandbox','external_reporting','Reporting'),
  ('audit_export','Audit Export API',
   'Export of immutable audit records to the external archive.',
   'audit','outbound','REST','api_key',true,NULL,30000,2,5000,false,'sandbox','audit_export','Compliance')
ON CONFLICT (integration_key) DO NOTHING;

-- Attach adapter keys + owners to the pre-existing rows.
UPDATE public.integration_connections SET
  adapter_key = COALESCE(adapter_key, integration_key),
  owner_team = COALESCE(owner_team, CASE integration_key
    WHEN 'email_smtp' THEN 'Platform'
    WHEN 'sms_provider' THEN 'Platform'
    WHEN 'ai_gateway' THEN 'Platform'
    WHEN 'payment_gateway' THEN 'Finance'
    WHEN 'platform_api' THEN 'Platform'
    WHEN 'external_registry' THEN 'Licensing'
    WHEN 'credit_bureau' THEN 'Licensing'
    WHEN 'aml_screening' THEN 'Fit & Proper'
    ELSE 'Platform' END)
WHERE adapter_key IS NULL OR owner_team IS NULL;

-- Internally-hosted integrations are real, not sandbox mocks.
UPDATE public.integration_connections
SET environment = 'production', provider_verified = true
WHERE integration_key IN ('email_smtp','ai_gateway','platform_api');

-- Keep credential_version in step with the credential register.
UPDATE public.integration_connections c
SET credential_version = COALESCE(
  (SELECT cr.version FROM public.integration_credentials cr
   WHERE cr.connection_id = c.id AND cr.is_current), 0)
WHERE c.credential_version = 0;

-- 4. Health summary: add the production metrics ----------------------
DROP FUNCTION IF EXISTS public.integration_health_summary();
CREATE FUNCTION public.integration_health_summary()
RETURNS TABLE(
  connection_id uuid, integration_key text, name text, type text, protocol text,
  enabled boolean, status text, base_url text, auth_type text,
  environment text, owner_team text, adapter_key text, provider_verified boolean,
  circuit_state text, circuit_failure_count integer, circuit_opened_at timestamptz,
  last_success_at timestamptz, last_error_at timestamptz, last_error text,
  last_test_at timestamptz, last_test_latency_ms integer, last_recovery_at timestamptz,
  error_count_24h bigint, event_count_24h bigint,
  avg_latency_ms integer, success_rate numeric, error_rate numeric,
  credential_masked_hint text, credential_rotated_at timestamptz,
  credential_version integer, disabled_reason text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.integration_key, c.name, c.type, c.protocol, c.enabled,
    CASE
      WHEN NOT c.enabled THEN 'inactive'
      WHEN c.circuit_state = 'open' THEN 'error'
      WHEN c.last_error_at IS NOT NULL
           AND (c.last_success_at IS NULL OR c.last_error_at > c.last_success_at) THEN 'error'
      WHEN c.last_success_at IS NOT NULL THEN 'active'
      ELSE 'inactive'
    END AS status,
    c.base_url, c.auth_type,
    c.environment, c.owner_team, c.adapter_key, c.provider_verified,
    c.circuit_state, c.circuit_failure_count, c.circuit_opened_at,
    c.last_success_at, c.last_error_at, c.last_error,
    c.last_test_at, c.last_test_latency_ms, c.last_recovery_at,
    COALESCE(l.error_count, 0), COALESCE(l.event_count, 0),
    COALESCE(l.avg_latency, c.avg_latency_ms)::integer,
    CASE WHEN COALESCE(l.event_count,0) > 0
         THEN ROUND(100.0 * (l.event_count - l.error_count) / l.event_count, 2)
         ELSE c.success_rate END,
    CASE WHEN COALESCE(l.event_count,0) > 0
         THEN ROUND(100.0 * l.error_count / l.event_count, 2)
         ELSE c.error_rate END,
    cr.masked_hint, cr.rotated_at, c.credential_version,
    c.disabled_reason
  FROM public.integration_connections c
  LEFT JOIN (
    SELECT integration_key,
           COUNT(*) FILTER (WHERE status = 'failure') AS error_count,
           COUNT(*) AS event_count,
           AVG(duration_ms) AS avg_latency
    FROM public.integration_logs
    WHERE created_at > now() - interval '24 hours'
    GROUP BY integration_key
  ) l ON l.integration_key = c.integration_key
  LEFT JOIN public.integration_credentials cr
    ON cr.connection_id = c.id AND cr.is_current
  WHERE public.is_super_admin(auth.uid())
     OR public.has_permission(auth.uid(), 'settings', 'view')
  ORDER BY c.name;
$function$;

-- 5. Circuit breaker + health recording ------------------------------
CREATE OR REPLACE FUNCTION public.integration_record_outcome(
  _integration_key text,
  _ok boolean,
  _latency_ms integer DEFAULT NULL,
  _error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  c public.integration_connections;
  v_new_state text;
BEGIN
  SELECT * INTO c FROM public.integration_connections
   WHERE integration_key = _integration_key;
  IF c.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;

  IF _ok THEN
    v_new_state := 'closed';
    UPDATE public.integration_connections SET
      status = 'active',
      last_success_at = now(),
      last_error = NULL,
      circuit_state = 'closed',
      circuit_failure_count = 0,
      circuit_opened_at = NULL,
      last_recovery_at = CASE WHEN c.circuit_state <> 'closed' THEN now()
                              ELSE last_recovery_at END,
      avg_latency_ms = CASE WHEN _latency_ms IS NULL THEN avg_latency_ms
        ELSE COALESCE((avg_latency_ms * 4 + _latency_ms) / 5, _latency_ms) END
    WHERE id = c.id;
  ELSE
    v_new_state := CASE
      WHEN c.circuit_failure_count + 1 >= c.circuit_failure_threshold THEN 'open'
      ELSE c.circuit_state END;
    UPDATE public.integration_connections SET
      status = 'error',
      last_error_at = now(),
      last_error = LEFT(COALESCE(_error, 'unknown error'), 500),
      circuit_failure_count = c.circuit_failure_count + 1,
      circuit_state = v_new_state,
      circuit_opened_at = CASE WHEN v_new_state = 'open' AND c.circuit_state <> 'open'
                               THEN now() ELSE circuit_opened_at END
    WHERE id = c.id;
  END IF;

  RETURN jsonb_build_object('found', true, 'circuit_state', v_new_state);
END;
$function$;

REVOKE ALL ON FUNCTION public.integration_record_outcome(text,boolean,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_record_outcome(text,boolean,integer,text) TO service_role;

-- Adapter resolution used by the connector framework (service role only).
CREATE OR REPLACE FUNCTION public.integration_resolve_connection(_integration_key text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
    'credential_version', c.credential_version
  )
  FROM public.integration_connections c
  LEFT JOIN public.integration_credentials cr
    ON cr.connection_id = c.id AND cr.is_current
  WHERE c.integration_key = _integration_key;
$function$;

REVOKE ALL ON FUNCTION public.integration_resolve_connection(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_resolve_connection(text) TO service_role;

-- 6. Extend connection save with the new operational fields ----------
CREATE OR REPLACE FUNCTION public.integration_connection_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid := NULLIF(_payload->>'id','')::uuid;
  v_before jsonb;
  v_url text := NULLIF(trim(_payload->>'base_url'), '');
  v_requires boolean := COALESCE((_payload->>'requires_credentials')::boolean, true);
  v_key text := lower(trim(COALESCE(_payload->>'integration_key','')));
  v_env text := COALESCE(NULLIF(_payload->>'environment',''), 'sandbox');
BEGIN
  PERFORM public.enforce_permission('settings','edit');

  IF v_key = '' THEN
    RAISE EXCEPTION 'integration_key_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(trim(_payload->>'name'),'') = '' THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = '22023';
  END IF;
  IF v_env NOT IN ('sandbox','production') THEN
    RAISE EXCEPTION 'invalid_environment' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(_payload->>'protocol','REST') IN ('REST','SOAP','WEBHOOK','GRAPHQL') THEN
    IF v_url IS NULL OR v_url !~* '^https://[^\s]+$' THEN
      RAISE EXCEPTION 'base_url_must_be_https' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT to_jsonb(c) INTO v_before FROM public.integration_connections c WHERE c.id = v_id;
    IF v_before IS NULL THEN
      RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.integration_connections (
      integration_key, name, description, category, type, protocol, base_url,
      auth_type, requires_credentials, timeout_ms, retry_count, retry_backoff_ms,
      data_mapping, enabled, environment, owner_team, owner_user_id, adapter_key,
      circuit_failure_threshold, circuit_cooloff_seconds, rate_limit_per_minute,
      created_by, updated_by
    ) VALUES (
      v_key,
      trim(_payload->>'name'),
      NULLIF(_payload->>'description',''),
      NULLIF(_payload->>'category',''),
      COALESCE(_payload->>'type','outbound'),
      COALESCE(_payload->>'protocol','REST'),
      v_url,
      COALESCE(_payload->>'auth_type','api_key'),
      v_requires,
      COALESCE((_payload->>'timeout_ms')::integer, 15000),
      COALESCE((_payload->>'retry_count')::integer, 3),
      COALESCE((_payload->>'retry_backoff_ms')::integer, 2000),
      COALESCE(_payload->'data_mapping', '{}'::jsonb),
      COALESCE((_payload->>'enabled')::boolean, true),
      v_env,
      NULLIF(_payload->>'owner_team',''),
      NULLIF(_payload->>'owner_user_id','')::uuid,
      COALESCE(NULLIF(_payload->>'adapter_key',''), v_key),
      COALESCE((_payload->>'circuit_failure_threshold')::integer, 5),
      COALESCE((_payload->>'circuit_cooloff_seconds')::integer, 300),
      NULLIF(_payload->>'rate_limit_per_minute','')::integer,
      auth.uid(), auth.uid()
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.integration_connections SET
      name = trim(_payload->>'name'),
      description = NULLIF(_payload->>'description',''),
      category = NULLIF(_payload->>'category',''),
      type = COALESCE(_payload->>'type', type),
      protocol = COALESCE(_payload->>'protocol', protocol),
      base_url = v_url,
      auth_type = COALESCE(_payload->>'auth_type', auth_type),
      requires_credentials = v_requires,
      timeout_ms = COALESCE((_payload->>'timeout_ms')::integer, timeout_ms),
      retry_count = COALESCE((_payload->>'retry_count')::integer, retry_count),
      retry_backoff_ms = COALESCE((_payload->>'retry_backoff_ms')::integer, retry_backoff_ms),
      data_mapping = COALESCE(_payload->'data_mapping', data_mapping),
      environment = v_env,
      owner_team = COALESCE(NULLIF(_payload->>'owner_team',''), owner_team),
      owner_user_id = COALESCE(NULLIF(_payload->>'owner_user_id','')::uuid, owner_user_id),
      adapter_key = COALESCE(NULLIF(_payload->>'adapter_key',''), adapter_key, v_key),
      circuit_failure_threshold = COALESCE((_payload->>'circuit_failure_threshold')::integer, circuit_failure_threshold),
      circuit_cooloff_seconds = COALESCE((_payload->>'circuit_cooloff_seconds')::integer, circuit_cooloff_seconds),
      rate_limit_per_minute = COALESCE(NULLIF(_payload->>'rate_limit_per_minute','')::integer, rate_limit_per_minute),
      updated_by = auth.uid()
    WHERE id = v_id;
  END IF;

  PERFORM public.log_compliance_audit(
    CASE WHEN v_before IS NULL THEN 'CREATE' ELSE 'UPDATE' END::compliance_audit_action,
    'integration_connection', v_id::text, v_before,
    (SELECT to_jsonb(c) FROM public.integration_connections c WHERE c.id = v_id),
    NULL, NULL, NULL,
    jsonb_build_object('event','ADMIN_INTEGRATION_UPDATED','integration_key', v_key)
  );

  RETURN v_id;
END;
$function$;
