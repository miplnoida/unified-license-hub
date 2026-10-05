CREATE OR REPLACE FUNCTION public.email_provider_secret_status(_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record;
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  IF _key IS NULL OR _key NOT IN ('resend_api_key','smtp_password','sms_api_key') THEN
    RAISE EXCEPTION 'unsupported_email_provider_secret: %', _key USING ERRCODE = '22023';
  END IF;
  SELECT s.updated_at, s.updated_by INTO r FROM public.email_provider_secrets s WHERE s.key = _key;
  RETURN jsonb_build_object('key', _key, 'configured', FOUND,
    'updated_at', CASE WHEN FOUND THEN r.updated_at END,
    'updated_by', CASE WHEN FOUND THEN r.updated_by END);
END $$;
REVOKE ALL ON FUNCTION public.email_provider_secret_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_status(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.email_provider_secret_set(text, text);
CREATE FUNCTION public.email_provider_secret_set(_key text, _value text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_at timestamptz; v_by uuid;
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  IF _key IS NULL OR _key NOT IN ('resend_api_key','smtp_password','sms_api_key') THEN
    RAISE EXCEPTION 'unsupported_email_provider_secret: %', _key USING ERRCODE = '22023';
  END IF;
  IF _value IS NULL OR btrim(_value) = '' THEN
    RAISE EXCEPTION 'email_provider_secret_empty' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.email_provider_secrets(key, value, updated_at, updated_by)
  VALUES (_key, btrim(_value), clock_timestamp(), v_uid)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by
  RETURNING updated_at, updated_by INTO v_at, v_by;
  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES ('email_provider_secrets', NULL, 'UPDATE', NULL, jsonb_build_object('key', _key, 'value', '***'),
          'email provider secret updated', v_uid, public.request_role());
  RETURN jsonb_build_object('key', _key, 'configured', true, 'updated_at', v_at, 'updated_by', v_by);
END $$;
REVOKE ALL ON FUNCTION public.email_provider_secret_set(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_set(text, text) TO authenticated, service_role;

CREATE TABLE public.email_provider_test_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoked_by uuid,
  recipient text,
  provider text NOT NULL DEFAULT 'SMTP',
  status text NOT NULL,
  failure_category text,
  provider_message_id text,
  secret_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.email_provider_test_log TO authenticated;
GRANT ALL ON public.email_provider_test_log TO service_role;
ALTER TABLE public.email_provider_test_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Settings administrators read email test log" ON public.email_provider_test_log
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (public.is_internal_staff(auth.uid()) AND public.has_permission(auth.uid(), 'settings', 'edit')));