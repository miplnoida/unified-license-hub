-- Single-use worker invocation tokens (DB-issued; never exposed to users)
CREATE TABLE IF NOT EXISTS public.worker_invocation_tokens (
  token text PRIMARY KEY,
  purpose text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.worker_invocation_tokens TO service_role;
ALTER TABLE public.worker_invocation_tokens ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER functions and service_role may touch these rows.

CREATE OR REPLACE FUNCTION public.issue_worker_token(_purpose text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  DELETE FROM public.worker_invocation_tokens WHERE expires_at < now() - interval '1 hour';
  INSERT INTO public.worker_invocation_tokens (token, purpose, expires_at)
  VALUES (v_token, _purpose, now() + interval '5 minutes');
  RETURN v_token;
END; $$;

REVOKE ALL ON FUNCTION public.issue_worker_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_worker_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_worker_token(_token text, _purpose text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ok boolean;
BEGIN
  UPDATE public.worker_invocation_tokens
     SET consumed_at = now()
   WHERE token = _token
     AND purpose = _purpose
     AND consumed_at IS NULL
     AND expires_at > now()
  RETURNING true INTO v_ok;
  RETURN COALESCE(v_ok, false);
END; $$;

REVOKE ALL ON FUNCTION public.consume_worker_token(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_worker_token(text,text) TO service_role;

-- Recent cron failures for the health monitor
CREATE OR REPLACE FUNCTION public.notification_recent_cron_failures(_since_minutes integer DEFAULT 60)
RETURNS TABLE (jobname text, end_time timestamptz, return_message text)
LANGUAGE sql SECURITY DEFINER SET search_path = public, cron AS $$
  SELECT j.jobname::text, d.end_time, d.return_message
    FROM cron.job_run_details d
    JOIN cron.job j ON j.jobid = d.jobid
   WHERE d.status = 'failed'
     AND d.end_time > now() - make_interval(mins => GREATEST(1, COALESCE(_since_minutes, 60)))
   ORDER BY d.end_time DESC
   LIMIT 50;
$$;

REVOKE ALL ON FUNCTION public.notification_recent_cron_failures(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_recent_cron_failures(integer) TO service_role;

-- Kick helpers used by pg_cron (no credentials stored in the schedule)
CREATE OR REPLACE FUNCTION public.notification_worker_kick(_function_name text)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_token text;
  v_base text;
  v_req bigint;
BEGIN
  v_token := public.issue_worker_token(_function_name);
  v_base := current_setting('app.settings.functions_base_url', true);
  IF v_base IS NULL OR v_base = '' THEN
    v_base := 'https://' || current_setting('app.settings.project_ref', true) || '.supabase.co/functions/v1';
  END IF;

  SELECT net.http_post(
    url := v_base || '/' || _function_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-worker-token', v_token),
    body := jsonb_build_object('triggered_by', 'cron', 'at', now())
  ) INTO v_req;

  RETURN v_req;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notification_worker_kick(%) failed: %', _function_name, SQLERRM;
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.notification_worker_kick(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_worker_kick(text) TO service_role;