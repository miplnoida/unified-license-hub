-- Server-only secret store for outbound email providers (Resend primary).
-- The value is never readable from the browser: RLS is enabled with no policies,
-- so only service_role (edge functions) can read it. Administrators write it
-- through the governed SECURITY DEFINER RPC below.
CREATE TABLE IF NOT EXISTS public.email_provider_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT ALL ON public.email_provider_secrets TO service_role;

ALTER TABLE public.email_provider_secrets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.email_provider_secret_set(_key text, _value text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  IF _key IS NULL OR _key NOT IN ('resend_api_key') THEN
    RAISE EXCEPTION 'unsupported_email_provider_secret: %', _key USING ERRCODE = '22023';
  END IF;
  IF _value IS NULL OR btrim(_value) = '' THEN
    RAISE EXCEPTION 'email_provider_secret_empty' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.email_provider_secrets(key, value, updated_at, updated_by)
  VALUES (_key, btrim(_value), now(), v_uid)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES ('email_provider_secrets', NULL, 'UPDATE', NULL,
          jsonb_build_object('key', _key, 'value', '***'),
          'email provider secret updated', v_uid, public.request_role());
END;
$$;

CREATE OR REPLACE FUNCTION public.email_provider_secret_clear(_key text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  DELETE FROM public.email_provider_secrets WHERE key = _key;
  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES ('email_provider_secrets', NULL, 'DELETE', jsonb_build_object('key', _key, 'value', '***'), NULL,
          'email provider secret cleared', v_uid, public.request_role());
END;
$$;

-- status only: returns whether a key is stored, never the value
CREATE OR REPLACE FUNCTION public.email_provider_secret_present(_key text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  RETURN EXISTS (SELECT 1 FROM public.email_provider_secrets s WHERE s.key = _key);
END;
$$;

REVOKE ALL ON FUNCTION public.email_provider_secret_set(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_provider_secret_clear(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.email_provider_secret_present(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_set(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_clear(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_present(text) TO authenticated, service_role;