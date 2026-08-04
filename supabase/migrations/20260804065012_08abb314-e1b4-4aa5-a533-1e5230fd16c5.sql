-- =====================================================================
-- ADM-INT-001 Integration Manager
-- =====================================================================

CREATE TABLE public.integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text,
  type text NOT NULL DEFAULT 'outbound'
    CHECK (type IN ('inbound','outbound','bidirectional')),
  protocol text NOT NULL DEFAULT 'REST'
    CHECK (protocol IN ('REST','SOAP','SFTP','FILE','SMTP','WEBHOOK','GRAPHQL','OTHER')),
  base_url text,
  auth_type text NOT NULL DEFAULT 'api_key'
    CHECK (auth_type IN ('none','api_key','oauth2','saml','file_based','sftp','basic')),
  requires_credentials boolean NOT NULL DEFAULT true,
  timeout_ms integer NOT NULL DEFAULT 15000 CHECK (timeout_ms BETWEEN 1000 AND 120000),
  retry_count integer NOT NULL DEFAULT 3 CHECK (retry_count BETWEEN 0 AND 10),
  retry_backoff_ms integer NOT NULL DEFAULT 2000 CHECK (retry_backoff_ms BETWEEN 0 AND 600000),
  data_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active','error','inactive')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_test_at timestamptz,
  last_test_latency_ms integer,
  disabled_reason text,
  disabled_at timestamptz,
  disabled_by uuid REFERENCES auth.users(id),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  secret_ref text NOT NULL,
  key_prefix text,
  masked_hint text,
  version integer NOT NULL DEFAULT 1,
  is_current boolean NOT NULL DEFAULT true,
  rotated_by uuid REFERENCES auth.users(id),
  rotated_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_credentials_current_idx
  ON public.integration_credentials(connection_id) WHERE is_current;

CREATE TABLE public.integration_alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE CASCADE,
  error_count_threshold integer NOT NULL DEFAULT 5 CHECK (error_count_threshold > 0),
  window_minutes integer NOT NULL DEFAULT 15 CHECK (window_minutes BETWEEN 1 AND 1440),
  recipient_user_ids uuid[] NOT NULL DEFAULT '{}',
  recipient_emails text[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX integration_alert_rules_conn_idx
  ON public.integration_alert_rules(COALESCE(connection_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ---------------------------------------------------------------- grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_connections TO authenticated;
GRANT ALL ON public.integration_connections TO service_role;
GRANT ALL ON public.integration_credentials TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_alert_rules TO authenticated;
GRANT ALL ON public.integration_alert_rules TO service_role;

-- ------------------------------------------------------------------ RLS
ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_connections_read ON public.integration_connections
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'view'));

CREATE POLICY integration_connections_write ON public.integration_connections
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'edit'))
  WITH CHECK (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'edit'));

-- credentials: no authenticated access at all (service_role only, RPC-mediated)
CREATE POLICY integration_credentials_service ON public.integration_credentials
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY integration_alert_rules_read ON public.integration_alert_rules
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'view'));

CREATE POLICY integration_alert_rules_write ON public.integration_alert_rules
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'edit'))
  WITH CHECK (public.is_super_admin(auth.uid())
         OR public.has_permission(auth.uid(), 'settings', 'edit'));

CREATE TRIGGER integration_connections_touch
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER integration_alert_rules_touch
  BEFORE UPDATE ON public.integration_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================================
-- Health summary
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_health_summary()
RETURNS TABLE (
  connection_id uuid,
  integration_key text,
  name text,
  type text,
  protocol text,
  enabled boolean,
  status text,
  base_url text,
  auth_type text,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_test_at timestamptz,
  last_test_latency_ms integer,
  error_count_24h bigint,
  event_count_24h bigint,
  credential_masked_hint text,
  credential_rotated_at timestamptz,
  disabled_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.integration_key, c.name, c.type, c.protocol, c.enabled,
    CASE
      WHEN NOT c.enabled THEN 'inactive'
      WHEN c.last_error_at IS NOT NULL
           AND (c.last_success_at IS NULL OR c.last_error_at > c.last_success_at) THEN 'error'
      WHEN c.last_success_at IS NOT NULL THEN 'active'
      ELSE 'inactive'
    END AS status,
    c.base_url, c.auth_type,
    c.last_success_at, c.last_error_at, c.last_error,
    c.last_test_at, c.last_test_latency_ms,
    COALESCE(l.error_count, 0), COALESCE(l.event_count, 0),
    cr.masked_hint, cr.rotated_at,
    c.disabled_reason
  FROM public.integration_connections c
  LEFT JOIN (
    SELECT integration_key,
           COUNT(*) FILTER (WHERE status = 'failure') AS error_count,
           COUNT(*) AS event_count
    FROM public.integration_logs
    WHERE created_at > now() - interval '24 hours'
    GROUP BY integration_key
  ) l ON l.integration_key = c.integration_key
  LEFT JOIN public.integration_credentials cr
    ON cr.connection_id = c.id AND cr.is_current
  WHERE public.is_super_admin(auth.uid())
     OR public.has_permission(auth.uid(), 'settings', 'view')
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.integration_health_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_health_summary() TO authenticated, service_role;

-- =====================================================================
-- Save connection
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_connection_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(_payload->>'id','')::uuid;
  v_before jsonb;
  v_url text := NULLIF(trim(_payload->>'base_url'), '');
  v_requires boolean := COALESCE((_payload->>'requires_credentials')::boolean, true);
  v_has_cred boolean := false;
  v_key text := lower(trim(COALESCE(_payload->>'integration_key','')));
BEGIN
  PERFORM public.enforce_permission('settings','edit');

  IF v_key = '' THEN
    RAISE EXCEPTION 'integration_key_required' USING ERRCODE = '22023';
  END IF;
  IF COALESCE(trim(_payload->>'name'),'') = '' THEN
    RAISE EXCEPTION 'name_required' USING ERRCODE = '22023';
  END IF;

  -- R-ADM-027/validation: base URL must be HTTPS for network protocols
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
    SELECT EXISTS(SELECT 1 FROM public.integration_credentials
                  WHERE connection_id = v_id AND is_current) INTO v_has_cred;
  END IF;

  IF v_requires AND v_id IS NOT NULL AND NOT v_has_cred
     AND COALESCE((_payload->>'enabled')::boolean, true) THEN
    -- allowed, but flagged: cannot be active without credentials
    NULL;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.integration_connections (
      integration_key, name, description, category, type, protocol, base_url,
      auth_type, requires_credentials, timeout_ms, retry_count, retry_backoff_ms,
      data_mapping, enabled, created_by, updated_by
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
$$;

REVOKE ALL ON FUNCTION public.integration_connection_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_connection_save(jsonb) TO authenticated, service_role;

-- =====================================================================
-- Dependencies (R-ADM-028)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_connection_dependencies(_connection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
  v_recent bigint;
  v_pending bigint;
BEGIN
  PERFORM public.enforce_permission('settings','view');
  SELECT integration_key INTO v_key FROM public.integration_connections WHERE id = _connection_id;
  IF v_key IS NULL THEN
    RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COUNT(DISTINCT COALESCE(entity_id::text, id::text))
    INTO v_recent
  FROM public.integration_logs
  WHERE integration_key = v_key AND created_at > now() - interval '30 days';

  SELECT COUNT(*) INTO v_pending
  FROM public.integration_logs
  WHERE integration_key = v_key AND status = 'pending';

  RETURN jsonb_build_object(
    'integration_key', v_key,
    'recent_dependent_records', v_recent,
    'in_flight_events', v_pending
  );
END;
$$;

REVOKE ALL ON FUNCTION public.integration_connection_dependencies(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_connection_dependencies(uuid) TO authenticated, service_role;

-- =====================================================================
-- Enable / disable with mandatory justification
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_connection_set_enabled(
  _connection_id uuid, _enabled boolean, _justification text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_before jsonb;
BEGIN
  PERFORM public.enforce_permission('settings','edit');

  SELECT to_jsonb(c) INTO v_before FROM public.integration_connections c WHERE c.id = _connection_id;
  IF v_before IS NULL THEN
    RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT _enabled AND COALESCE(length(trim(_justification)), 0) < 10 THEN
    RAISE EXCEPTION 'justification_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.integration_connections SET
    enabled = _enabled,
    status = CASE WHEN _enabled THEN status ELSE 'inactive' END,
    disabled_reason = CASE WHEN _enabled THEN NULL ELSE trim(_justification) END,
    disabled_at = CASE WHEN _enabled THEN NULL ELSE now() END,
    disabled_by = CASE WHEN _enabled THEN NULL ELSE auth.uid() END,
    updated_by = auth.uid()
  WHERE id = _connection_id;

  PERFORM public.log_compliance_audit(
    'UPDATE'::compliance_audit_action,
    'integration_connection', _connection_id::text, v_before,
    (SELECT to_jsonb(c) FROM public.integration_connections c WHERE c.id = _connection_id),
    CASE WHEN _enabled THEN NULL ELSE trim(_justification) END, NULL, NULL,
    jsonb_build_object('event', CASE WHEN _enabled THEN 'INTEGRATION_ENABLED' ELSE 'INTEGRATION_DISABLED' END)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.integration_connection_set_enabled(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_connection_set_enabled(uuid, boolean, text) TO authenticated, service_role;

-- =====================================================================
-- Credential rotation (metadata only — never the secret value)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_credentials_rotate(
  _connection_id uuid, _secret_ref text, _key_prefix text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_hint text;
BEGIN
  PERFORM public.enforce_permission('settings','edit');

  IF NOT EXISTS (SELECT 1 FROM public.integration_connections WHERE id = _connection_id) THEN
    RAISE EXCEPTION 'connection_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF COALESCE(trim(_secret_ref),'') = '' THEN
    RAISE EXCEPTION 'secret_ref_required' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(version), 0) + 1 INTO v_version
  FROM public.integration_credentials WHERE connection_id = _connection_id;

  UPDATE public.integration_credentials
     SET is_current = false, superseded_at = now()
   WHERE connection_id = _connection_id AND is_current;

  v_hint := '••••••••' || COALESCE(right(NULLIF(trim(_key_prefix),''), 4), '');

  INSERT INTO public.integration_credentials (
    connection_id, secret_ref, key_prefix, masked_hint, version, is_current, rotated_by
  ) VALUES (
    _connection_id, trim(_secret_ref), NULLIF(trim(_key_prefix),''), v_hint, v_version, true, auth.uid()
  );

  PERFORM public.log_compliance_audit(
    'UPDATE'::compliance_audit_action,
    'integration_credentials', _connection_id::text, NULL,
    jsonb_build_object('version', v_version, 'secret_ref', trim(_secret_ref)),
    NULL, NULL, NULL,
    jsonb_build_object('event','INTEGRATION_CREDENTIALS_ROTATED')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.integration_credentials_rotate(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_credentials_rotate(uuid, text, text) TO authenticated, service_role;

-- =====================================================================
-- Alert rule upsert
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_alert_rule_save(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid := NULLIF(_payload->>'id','')::uuid;
  v_conn uuid := NULLIF(_payload->>'connection_id','')::uuid;
BEGIN
  PERFORM public.enforce_permission('settings','edit');

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.integration_alert_rules
     WHERE COALESCE(connection_id,'00000000-0000-0000-0000-000000000000'::uuid)
         = COALESCE(v_conn,'00000000-0000-0000-0000-000000000000'::uuid);
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.integration_alert_rules (
      connection_id, error_count_threshold, window_minutes,
      recipient_user_ids, recipient_emails, enabled, created_by
    ) VALUES (
      v_conn,
      COALESCE((_payload->>'error_count_threshold')::integer, 5),
      COALESCE((_payload->>'window_minutes')::integer, 15),
      COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(_payload->'recipient_user_ids','[]'::jsonb)) t(x)), '{}'),
      COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(_payload->'recipient_emails','[]'::jsonb)) t(x)), '{}'),
      COALESCE((_payload->>'enabled')::boolean, true),
      auth.uid()
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.integration_alert_rules SET
      error_count_threshold = COALESCE((_payload->>'error_count_threshold')::integer, error_count_threshold),
      window_minutes = COALESCE((_payload->>'window_minutes')::integer, window_minutes),
      recipient_user_ids = COALESCE((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(COALESCE(_payload->'recipient_user_ids','[]'::jsonb)) t(x)), recipient_user_ids),
      recipient_emails = COALESCE((SELECT array_agg(x) FROM jsonb_array_elements_text(COALESCE(_payload->'recipient_emails','[]'::jsonb)) t(x)), recipient_emails),
      enabled = COALESCE((_payload->>'enabled')::boolean, enabled)
    WHERE id = v_id;
  END IF;

  PERFORM public.log_compliance_audit(
    'UPDATE'::compliance_audit_action,
    'integration_alert_rule', v_id::text, NULL, _payload, NULL, NULL, NULL,
    jsonb_build_object('event','ADMIN_INTEGRATION_ALERT_UPDATED')
  );

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.integration_alert_rule_save(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_alert_rule_save(jsonb) TO authenticated, service_role;

-- =====================================================================
-- Alert sweep (cron)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.integration_alert_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_errors bigint;
  v_fired int := 0;
BEGIN
  FOR r IN
    SELECT ar.*, c.integration_key, c.name AS connection_name
    FROM public.integration_alert_rules ar
    LEFT JOIN public.integration_connections c ON c.id = ar.connection_id
    WHERE ar.enabled
  LOOP
    SELECT COUNT(*) INTO v_errors
    FROM public.integration_logs l
    WHERE l.status = 'failure'
      AND l.created_at > now() - make_interval(mins => r.window_minutes)
      AND (r.connection_id IS NULL OR l.integration_key = r.integration_key);

    IF v_errors >= r.error_count_threshold
       AND (r.last_fired_at IS NULL
            OR r.last_fired_at < now() - make_interval(mins => r.window_minutes)) THEN

      INSERT INTO public.escalations (
        escalation_type, severity, status, title, description,
        source_module, source_reference, metadata
      ) VALUES (
        'integration_failure'::escalation_type,
        'high'::escalation_severity,
        'open'::escalation_status,
        COALESCE(r.connection_name, 'Integration') || ' error threshold breached',
        v_errors || ' integration failures in the last ' || r.window_minutes || ' minutes'
          || COALESCE(' for ' || r.integration_key, ' across all integrations') || '.',
        'integration_manager',
        COALESCE(r.integration_key, 'global'),
        jsonb_build_object(
          'alert_rule_id', r.id,
          'error_count', v_errors,
          'window_minutes', r.window_minutes,
          'recipient_user_ids', r.recipient_user_ids,
          'recipient_emails', r.recipient_emails
        )
      );

      UPDATE public.integration_alert_rules SET last_fired_at = now() WHERE id = r.id;
      v_fired := v_fired + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('rules_fired', v_fired, 'swept_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.integration_alert_sweep() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_alert_sweep() TO service_role;