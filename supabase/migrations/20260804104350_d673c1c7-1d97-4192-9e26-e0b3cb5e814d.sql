-- ============================================================
-- ADM-INT-001 Group C — durable retry queue + dead-letter queue
-- ============================================================

CREATE TABLE public.integration_retry_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_key text NOT NULL,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  operation text NOT NULL,
  source_module text NOT NULL,
  business_event text,
  source_entity_type text,
  source_entity_id text,
  actor_id uuid,
  correlation_id uuid,
  idempotency_key text,
  idempotency_fingerprint text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,          -- redacted request shape only
  redacted_fields text[] NOT NULL DEFAULT '{}',
  required_capability text,
  fallback_policy text NOT NULL DEFAULT 'auto',
  timeout_override_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  backoff_base_ms integer NOT NULL DEFAULT 1000,
  backoff_strategy text NOT NULL DEFAULT 'exponential_jitter',
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_error_category text,
  last_error text,
  last_provider_status integer,
  last_integration_log_id uuid,
  lease_owner text,
  leased_until timestamptz,
  enqueued_reason text,
  cancelled_reason text,
  cancelled_by uuid,
  completed_at timestamptz,
  cancelled_at timestamptz,
  dead_lettered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_retry_queue_status_chk CHECK (
    status IN ('queued','processing','retry_scheduled','succeeded','failed','cancelled','dead_letter')
  ),
  CONSTRAINT integration_retry_queue_fallback_policy_chk CHECK (fallback_policy IN ('auto','forbid')),
  CONSTRAINT integration_retry_queue_backoff_chk CHECK (backoff_strategy IN ('exponential_jitter','exponential','fixed'))
);

GRANT SELECT ON public.integration_retry_queue TO authenticated;
GRANT ALL ON public.integration_retry_queue TO service_role;
ALTER TABLE public.integration_retry_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with settings view can read retry queue"
ON public.integration_retry_queue FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'settings', 'view'));

CREATE INDEX idx_irq_claim ON public.integration_retry_queue (status, next_attempt_at)
  WHERE status IN ('queued','retry_scheduled');
CREATE INDEX idx_irq_integration ON public.integration_retry_queue (integration_key, status);
CREATE INDEX idx_irq_module ON public.integration_retry_queue (source_module, created_at DESC);
CREATE INDEX idx_irq_correlation ON public.integration_retry_queue (correlation_id);
CREATE INDEX idx_irq_fingerprint ON public.integration_retry_queue (idempotency_fingerprint);
CREATE INDEX idx_irq_source_entity ON public.integration_retry_queue (source_entity_type, source_entity_id);

CREATE TABLE public.integration_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retry_queue_id uuid REFERENCES public.integration_retry_queue(id) ON DELETE SET NULL,
  integration_key text NOT NULL,
  connection_id uuid REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  operation text NOT NULL,
  source_module text NOT NULL,
  business_event text,
  source_entity_type text,
  source_entity_id text,
  actor_id uuid,
  correlation_id uuid,
  idempotency_key text,
  idempotency_fingerprint text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,          -- redacted request shape only
  redacted_fields text[] NOT NULL DEFAULT '{}',
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb, -- redacted summary only
  attempts integer NOT NULL DEFAULT 0,
  attempt_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_category text,
  error_message text,
  provider_status integer,
  integration_log_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status text NOT NULL DEFAULT 'open',
  resolution_note text,
  resolved_by uuid,
  resolved_at timestamptz,
  last_retried_at timestamptz,
  last_retried_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_dead_letter_resolution_chk CHECK (
    resolution_status IN ('open','retrying','resolved','cancelled')
  )
);

GRANT SELECT ON public.integration_dead_letter TO authenticated;
GRANT ALL ON public.integration_dead_letter TO service_role;
ALTER TABLE public.integration_dead_letter ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff with settings view can read dead letter"
ON public.integration_dead_letter FOR SELECT TO authenticated
USING (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'settings', 'view'));

CREATE INDEX idx_idl_integration ON public.integration_dead_letter (integration_key, resolution_status);
CREATE INDEX idx_idl_module ON public.integration_dead_letter (source_module, created_at DESC);
CREATE INDEX idx_idl_correlation ON public.integration_dead_letter (correlation_id);
CREATE INDEX idx_idl_created ON public.integration_dead_letter (created_at DESC);

CREATE OR REPLACE FUNCTION public.integration_retry_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_irq_touch BEFORE UPDATE ON public.integration_retry_queue
FOR EACH ROW EXECUTE FUNCTION public.integration_retry_touch();
CREATE TRIGGER trg_idl_touch BEFORE UPDATE ON public.integration_dead_letter
FOR EACH ROW EXECUTE FUNCTION public.integration_retry_touch();

-- ------------------------------------------------------------
-- Categories that are permanent business rejections: never queued
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_is_retryable(_error_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT coalesce(_error_category, 'unknown') IN
    ('network','timeout','server','circuit_open','rate_limit','not_configured');
$$;

-- ------------------------------------------------------------
-- Enqueue
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_enqueue(
  _integration_key text,
  _operation text,
  _source_module text,
  _business_event text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb,
  _redacted_fields text[] DEFAULT '{}',
  _source_entity_type text DEFAULT NULL,
  _source_entity_id text DEFAULT NULL,
  _actor_id uuid DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _idempotency_key text DEFAULT NULL,
  _idempotency_fingerprint text DEFAULT NULL,
  _error_category text DEFAULT NULL,
  _error text DEFAULT NULL,
  _provider_status integer DEFAULT NULL,
  _integration_log_id uuid DEFAULT NULL,
  _required_capability text DEFAULT NULL,
  _fallback_policy text DEFAULT 'auto',
  _timeout_override_ms integer DEFAULT NULL,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_conn public.integration_connections;
  v_max integer;
  v_id uuid;
BEGIN
  -- Permanent rejections and adverse business results are never retried.
  IF NOT public.integration_retry_is_retryable(_error_category) THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_conn FROM public.integration_connections
   WHERE integration_key = _integration_key LIMIT 1;

  v_max := greatest(1, coalesce(v_conn.max_retries, 3) + 1);

  -- Idempotent: an open queue item with the same fingerprint is reused.
  IF _idempotency_fingerprint IS NOT NULL THEN
    SELECT id INTO v_id FROM public.integration_retry_queue
     WHERE idempotency_fingerprint = _idempotency_fingerprint
       AND status IN ('queued','processing','retry_scheduled')
     LIMIT 1;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
  END IF;

  INSERT INTO public.integration_retry_queue (
    integration_key, connection_id, operation, source_module, business_event,
    source_entity_type, source_entity_id, actor_id, correlation_id,
    idempotency_key, idempotency_fingerprint, payload, redacted_fields,
    required_capability, fallback_policy, timeout_override_ms, metadata,
    status, max_attempts, next_attempt_at,
    last_error_category, last_error, last_provider_status, last_integration_log_id,
    enqueued_reason
  ) VALUES (
    _integration_key, v_conn.id, _operation, _source_module, _business_event,
    _source_entity_type, _source_entity_id, _actor_id, _correlation_id,
    _idempotency_key, _idempotency_fingerprint, coalesce(_payload,'{}'::jsonb),
    coalesce(_redacted_fields,'{}'), _required_capability,
    coalesce(_fallback_policy,'auto'), _timeout_override_ms, coalesce(_metadata,'{}'::jsonb),
    'queued', v_max, now() + make_interval(secs => 1),
    _error_category, _error, _provider_status, _integration_log_id,
    coalesce(_error_category,'unknown')
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.integration_retry_enqueue(text,text,text,text,jsonb,text[],text,text,uuid,uuid,text,text,text,text,integer,uuid,text,text,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_retry_enqueue(text,text,text,text,jsonb,text[],text,text,uuid,uuid,text,text,text,text,integer,uuid,text,text,integer,jsonb) TO service_role;

-- ------------------------------------------------------------
-- Claim (FOR UPDATE SKIP LOCKED + stale lease recovery)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_claim(
  _worker text,
  _limit integer DEFAULT 10,
  _lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.integration_retry_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Recover items whose worker died mid-flight.
  UPDATE public.integration_retry_queue
     SET status = 'retry_scheduled',
         lease_owner = NULL,
         leased_until = NULL,
         next_attempt_at = now()
   WHERE status = 'processing'
     AND leased_until IS NOT NULL
     AND leased_until < now();

  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.integration_retry_queue
     WHERE status IN ('queued','retry_scheduled')
       AND next_attempt_at <= now()
     ORDER BY next_attempt_at
     LIMIT greatest(1, coalesce(_limit, 10))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.integration_retry_queue q
     SET status = 'processing',
         lease_owner = _worker,
         leased_until = now() + make_interval(secs => greatest(10, coalesce(_lease_seconds,120))),
         attempts = q.attempts + 1
    FROM claimed
   WHERE q.id = claimed.id
  RETURNING q.*;
END; $$;

REVOKE ALL ON FUNCTION public.integration_retry_claim(text,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_retry_claim(text,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.integration_retry_heartbeat(
  _id uuid, _worker text, _lease_seconds integer DEFAULT 120
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.integration_retry_queue
     SET leased_until = now() + make_interval(secs => greatest(10, coalesce(_lease_seconds,120)))
   WHERE id = _id AND lease_owner = _worker AND status = 'processing';
  RETURN FOUND;
END; $$;

REVOKE ALL ON FUNCTION public.integration_retry_heartbeat(uuid,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_retry_heartbeat(uuid,text,integer) TO service_role;

-- ------------------------------------------------------------
-- Record attempt outcome: success | reschedule | dead-letter
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_record_outcome(
  _id uuid,
  _ok boolean,
  _execution_mode text DEFAULT NULL,
  _error_category text DEFAULT NULL,
  _error text DEFAULT NULL,
  _provider_status integer DEFAULT NULL,
  _integration_log_id uuid DEFAULT NULL,
  _provider_response jsonb DEFAULT '{}'::jsonb
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v public.integration_retry_queue;
  v_delay_ms numeric;
  v_history jsonb;
  v_outcome text;
BEGIN
  SELECT * INTO v FROM public.integration_retry_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  v_history := v.attempt_history || jsonb_build_array(jsonb_build_object(
    'attempt', v.attempts,
    'at', now(),
    'ok', _ok,
    'execution_mode', _execution_mode,
    'error_category', _error_category,
    'error', left(coalesce(_error,''), 500),
    'provider_status', _provider_status,
    'integration_log_id', _integration_log_id,
    'worker', v.lease_owner
  ));

  IF _ok THEN
    UPDATE public.integration_retry_queue
       SET status = 'succeeded', completed_at = now(), lease_owner = NULL,
           leased_until = NULL, attempt_history = v_history,
           last_error_category = NULL, last_error = NULL,
           last_provider_status = _provider_status,
           last_integration_log_id = coalesce(_integration_log_id, last_integration_log_id)
     WHERE id = _id;
    RETURN 'succeeded';
  END IF;

  -- A permanent business rejection stops retrying immediately.
  IF NOT public.integration_retry_is_retryable(_error_category) THEN
    v_outcome := 'failed';
  ELSIF v.attempts >= v.max_attempts THEN
    v_outcome := 'dead_letter';
  ELSE
    v_outcome := 'retry_scheduled';
  END IF;

  IF v_outcome = 'retry_scheduled' THEN
    v_delay_ms := CASE v.backoff_strategy
      WHEN 'fixed' THEN v.backoff_base_ms
      ELSE v.backoff_base_ms * power(2, greatest(0, v.attempts - 1))
    END;
    IF v.backoff_strategy = 'exponential_jitter' THEN
      v_delay_ms := v_delay_ms * (0.5 + random());
    END IF;
    v_delay_ms := least(v_delay_ms, 3600000); -- cap at 1h
    UPDATE public.integration_retry_queue
       SET status = 'retry_scheduled', lease_owner = NULL, leased_until = NULL,
           next_attempt_at = now() + make_interval(secs => v_delay_ms / 1000.0),
           attempt_history = v_history,
           last_error_category = _error_category, last_error = _error,
           last_provider_status = _provider_status,
           last_integration_log_id = coalesce(_integration_log_id, last_integration_log_id)
     WHERE id = _id;
    RETURN 'retry_scheduled';
  END IF;

  UPDATE public.integration_retry_queue
     SET status = CASE WHEN v_outcome = 'dead_letter' THEN 'dead_letter' ELSE 'failed' END,
         lease_owner = NULL, leased_until = NULL,
         attempt_history = v_history,
         last_error_category = _error_category, last_error = _error,
         last_provider_status = _provider_status,
         last_integration_log_id = coalesce(_integration_log_id, last_integration_log_id),
         dead_lettered_at = CASE WHEN v_outcome = 'dead_letter' THEN now() ELSE NULL END,
         completed_at = now()
   WHERE id = _id;

  IF v_outcome = 'dead_letter' THEN
    INSERT INTO public.integration_dead_letter (
      retry_queue_id, integration_key, connection_id, operation, source_module,
      business_event, source_entity_type, source_entity_id, actor_id, correlation_id,
      idempotency_key, idempotency_fingerprint, payload, redacted_fields,
      provider_response, attempts, attempt_history, error_category, error_message,
      provider_status, integration_log_id, metadata
    ) VALUES (
      v.id, v.integration_key, v.connection_id, v.operation, v.source_module,
      v.business_event, v.source_entity_type, v.source_entity_id, v.actor_id, v.correlation_id,
      v.idempotency_key, v.idempotency_fingerprint, v.payload, v.redacted_fields,
      coalesce(_provider_response,'{}'::jsonb), v.attempts, v_history,
      _error_category, _error, _provider_status,
      coalesce(_integration_log_id, v.last_integration_log_id), v.metadata
    );
  END IF;

  RETURN v_outcome;
END; $$;

REVOKE ALL ON FUNCTION public.integration_retry_record_outcome(uuid,boolean,text,text,text,integer,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_retry_record_outcome(uuid,boolean,text,text,text,integer,uuid,jsonb) TO service_role;

-- ------------------------------------------------------------
-- Operator actions (permission + justification + audit)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_assert_operator()
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'settings', 'edit')) THEN
    RAISE EXCEPTION 'not_authorized_integration_retry' USING ERRCODE = '42501';
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_retry_assert_operator() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.integration_retry_now(_id uuid, _justification text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.integration_retry_queue;
BEGIN
  PERFORM public.integration_retry_assert_operator();
  IF coalesce(btrim(_justification),'') = '' THEN
    RAISE EXCEPTION 'justification_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.integration_retry_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retry_item_not_found'; END IF;

  -- Idempotency key/fingerprint deliberately unchanged.
  UPDATE public.integration_retry_queue
     SET status = 'retry_scheduled',
         next_attempt_at = now(),
         max_attempts = greatest(max_attempts, attempts + 1),
         lease_owner = NULL, leased_until = NULL,
         dead_lettered_at = NULL, completed_at = NULL,
         cancelled_at = NULL, cancelled_reason = NULL, cancelled_by = NULL
   WHERE id = _id;

  UPDATE public.integration_dead_letter
     SET resolution_status = 'retrying', last_retried_at = now(), last_retried_by = auth.uid()
   WHERE retry_queue_id = _id AND resolution_status IN ('open','retrying');

  PERFORM public.log_compliance_audit(
    'OVERRIDE'::compliance_audit_action, 'integration_retry_queue', _id::text,
    NULL, jsonb_build_object('status','retry_scheduled'), _justification, NULL, NULL,
    jsonb_build_object('integration_key', v.integration_key, 'operation', v.operation,
                       'source_module', v.source_module, 'correlation_id', v.correlation_id,
                       'event','integration.retry.manual'));
  RETURN _id;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_retry_now(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.integration_retry_cancel(_id uuid, _justification text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.integration_retry_queue;
BEGIN
  PERFORM public.integration_retry_assert_operator();
  IF coalesce(btrim(_justification),'') = '' THEN
    RAISE EXCEPTION 'justification_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.integration_retry_queue WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'retry_item_not_found'; END IF;

  UPDATE public.integration_retry_queue
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid(),
         cancelled_reason = _justification, lease_owner = NULL, leased_until = NULL
   WHERE id = _id;

  UPDATE public.integration_dead_letter
     SET resolution_status = 'cancelled', resolution_note = _justification,
         resolved_by = auth.uid(), resolved_at = now()
   WHERE retry_queue_id = _id AND resolution_status IN ('open','retrying');

  PERFORM public.log_compliance_audit(
    'OVERRIDE'::compliance_audit_action, 'integration_retry_queue', _id::text,
    jsonb_build_object('status', v.status), jsonb_build_object('status','cancelled'),
    _justification, NULL, NULL,
    jsonb_build_object('integration_key', v.integration_key, 'operation', v.operation,
                       'event','integration.retry.cancelled'));
  RETURN _id;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_retry_cancel(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.integration_dlq_resolve(_id uuid, _note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.integration_dead_letter;
BEGIN
  PERFORM public.integration_retry_assert_operator();
  IF coalesce(btrim(_note),'') = '' THEN
    RAISE EXCEPTION 'justification_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.integration_dead_letter WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dead_letter_not_found'; END IF;

  UPDATE public.integration_dead_letter
     SET resolution_status = 'resolved', resolution_note = _note,
         resolved_by = auth.uid(), resolved_at = now()
   WHERE id = _id;

  PERFORM public.log_compliance_audit(
    'OVERRIDE'::compliance_audit_action, 'integration_dead_letter', _id::text,
    jsonb_build_object('resolution_status', v.resolution_status),
    jsonb_build_object('resolution_status','resolved'), _note, NULL, NULL,
    jsonb_build_object('integration_key', v.integration_key, 'operation', v.operation,
                       'event','integration.dead_letter.resolved'));
  RETURN _id;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_dlq_resolve(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.integration_dlq_retry(_id uuid, _justification text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v public.integration_dead_letter; v_queue uuid;
BEGIN
  PERFORM public.integration_retry_assert_operator();
  IF coalesce(btrim(_justification),'') = '' THEN
    RAISE EXCEPTION 'justification_required' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v FROM public.integration_dead_letter WHERE id = _id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'dead_letter_not_found'; END IF;

  IF v.retry_queue_id IS NOT NULL THEN
    PERFORM public.integration_retry_now(v.retry_queue_id, _justification);
    RETURN v.retry_queue_id;
  END IF;

  INSERT INTO public.integration_retry_queue (
    integration_key, connection_id, operation, source_module, business_event,
    source_entity_type, source_entity_id, actor_id, correlation_id,
    idempotency_key, idempotency_fingerprint, payload, redacted_fields, metadata,
    status, next_attempt_at, max_attempts, enqueued_reason
  ) VALUES (
    v.integration_key, v.connection_id, v.operation, v.source_module, v.business_event,
    v.source_entity_type, v.source_entity_id, v.actor_id, v.correlation_id,
    v.idempotency_key, v.idempotency_fingerprint, v.payload, v.redacted_fields, v.metadata,
    'retry_scheduled', now(), 1, 'manual_dlq_retry'
  ) RETURNING id INTO v_queue;

  UPDATE public.integration_dead_letter
     SET resolution_status = 'retrying', retry_queue_id = v_queue,
         last_retried_at = now(), last_retried_by = auth.uid()
   WHERE id = _id;

  PERFORM public.log_compliance_audit(
    'OVERRIDE'::compliance_audit_action, 'integration_dead_letter', _id::text,
    NULL, jsonb_build_object('resolution_status','retrying','retry_queue_id',v_queue),
    _justification, NULL, NULL,
    jsonb_build_object('integration_key', v.integration_key, 'operation', v.operation,
                       'event','integration.dead_letter.retried'));
  RETURN v_queue;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_dlq_retry(uuid,text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- Metrics for the operational console
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.integration_retry_metrics()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'settings', 'view')) THEN
    RAISE EXCEPTION 'not_authorized_integration_retry' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'queued', count(*) FILTER (WHERE status = 'queued'),
    'processing', count(*) FILTER (WHERE status = 'processing'),
    'retry_scheduled', count(*) FILTER (WHERE status = 'retry_scheduled'),
    'succeeded', count(*) FILTER (WHERE status = 'succeeded'),
    'failed', count(*) FILTER (WHERE status = 'failed'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'dead_letter', count(*) FILTER (WHERE status = 'dead_letter'),
    'oldest_pending_at', min(created_at) FILTER (WHERE status IN ('queued','retry_scheduled','processing')),
    'due_now', count(*) FILTER (WHERE status IN ('queued','retry_scheduled') AND next_attempt_at <= now())
  ) INTO v FROM public.integration_retry_queue;

  SELECT v || jsonb_build_object(
    'dlq_open', count(*) FILTER (WHERE resolution_status = 'open'),
    'dlq_retrying', count(*) FILTER (WHERE resolution_status = 'retrying'),
    'dlq_resolved', count(*) FILTER (WHERE resolution_status = 'resolved'),
    'dlq_total', count(*)
  ) INTO v FROM public.integration_dead_letter;

  RETURN v;
END; $$;

GRANT EXECUTE ON FUNCTION public.integration_retry_metrics() TO authenticated, service_role;