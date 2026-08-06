-- 1. Durable per-check provider outcome record on each screening run.
ALTER TABLE public.fp_screening_runs
  ADD COLUMN IF NOT EXISTS provider_outcomes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.fp_screening_runs.provider_outcomes IS
  'Per-check external screening provider outcome: [{check_type, integration_key, execution_mode, environment, outcome, provider_reference, hits, error_category, error_message, correlation_id}]. Distinguishes screened-clean from not-configured from failed.';

-- 2. Register the sandbox screening provider connections (idempotent upsert).
--    base_url points at the in-project screening simulator edge function so the
--    full Integration Manager path (credential -> adapter -> circuit breaker ->
--    logs) executes end to end. Fallback is disabled: a sanctions/AML result may
--    never be substituted by internal logic.
INSERT INTO public.integration_connections (
  integration_key, name, description, category, type, protocol, base_url,
  auth_type, adapter_key, requires_credentials, environment, enabled, status,
  timeout_ms, retry_count, retry_backoff_ms,
  fallback_enabled, fallback_strategy, fallback_allowed_categories,
  business_critical, provider_verified, owner_team
) VALUES
  (
    'sanctions_screening',
    'Sanctions / PEP Screening (Sandbox)',
    'Sanctions, PEP and watchlist screening used by Fit & Proper assessments. Currently pointed at the built-in sandbox simulator; replace base_url and credential to go live.',
    'Screening', 'outbound', 'REST',
    'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/screening-sandbox/',
    'api_key', 'sanctions_screening', true, 'sandbox', true, 'active',
    20000, 2, 1500,
    false, 'none', ARRAY[]::text[],
    true, false, 'Fit & Proper'
  ),
  (
    'aml_screening',
    'AML / Adverse Media Screening (Sandbox)',
    'AML and adverse-media screening used by Fit & Proper assessments. Currently pointed at the built-in sandbox simulator; replace base_url and credential to go live.',
    'Screening', 'outbound', 'REST',
    'https://sndfttzqmbkmkcnrvpfn.supabase.co/functions/v1/screening-sandbox/',
    'api_key', 'aml_screening', true, 'sandbox', true, 'active',
    20000, 2, 1500,
    false, 'none', ARRAY[]::text[],
    true, false, 'Fit & Proper'
  )
ON CONFLICT (integration_key) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  base_url = EXCLUDED.base_url,
  adapter_key = EXCLUDED.adapter_key,
  auth_type = EXCLUDED.auth_type,
  requires_credentials = true,
  environment = EXCLUDED.environment,
  enabled = true,
  status = 'active',
  timeout_ms = EXCLUDED.timeout_ms,
  retry_count = EXCLUDED.retry_count,
  retry_backoff_ms = EXCLUDED.retry_backoff_ms,
  fallback_enabled = false,
  fallback_strategy = 'none',
  fallback_allowed_categories = ARRAY[]::text[],
  business_critical = true,
  owner_team = 'Fit & Proper',
  updated_at = now();

-- 3. Credential reference. Only the secret NAME lives in the database; the
--    value is read from the edge runtime environment at call time.
INSERT INTO public.integration_credentials (connection_id, secret_ref, key_prefix, masked_hint, version, is_current)
SELECT c.id, 'SCREENING_SANDBOX_KEY', 'sbx', 'sandbox key (••••)', 1, true
FROM public.integration_connections c
WHERE c.integration_key IN ('sanctions_screening', 'aml_screening')
  AND NOT EXISTS (
    SELECT 1 FROM public.integration_credentials cr
    WHERE cr.connection_id = c.id AND cr.secret_ref = 'SCREENING_SANDBOX_KEY'
  );

UPDATE public.integration_credentials cr
SET is_current = (cr.secret_ref = 'SCREENING_SANDBOX_KEY')
WHERE cr.connection_id IN (
  SELECT id FROM public.integration_connections
  WHERE integration_key IN ('sanctions_screening', 'aml_screening')
);

-- 4. Fit & Proper reviewers need to see WHICH provider produced a finding and
--    whether it is healthy, without being granted settings access.
CREATE OR REPLACE FUNCTION public.fp_screening_provider_status()
RETURNS TABLE (
  integration_key text,
  name text,
  environment text,
  enabled boolean,
  status text,
  provider_verified boolean,
  circuit_state text,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  has_credential boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.integration_key, c.name, c.environment, c.enabled, c.status,
         c.provider_verified, c.circuit_state, c.last_success_at,
         c.last_error_at, c.last_error,
         EXISTS (
           SELECT 1 FROM public.integration_credentials cr
           WHERE cr.connection_id = c.id AND cr.is_current
         ) AS has_credential
  FROM public.integration_connections c
  WHERE c.integration_key IN ('sanctions_screening', 'aml_screening')
    AND (
      public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(), 'fit_and_proper', 'view')
      OR public.has_permission(auth.uid(), 'settings', 'view')
    );
$$;

REVOKE ALL ON FUNCTION public.fp_screening_provider_status() FROM public;
GRANT EXECUTE ON FUNCTION public.fp_screening_provider_status() TO authenticated;