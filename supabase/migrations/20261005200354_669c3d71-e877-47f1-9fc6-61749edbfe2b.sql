-- SEC-CRED-01: externalise email/SMS provider secrets
REVOKE ALL ON public.email_provider_secrets FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.email_provider_secrets TO service_role;

-- 1. Move current SMTP secret to the server-only store (value never appears in source)
INSERT INTO public.email_provider_secrets(key, value, updated_at)
SELECT 'smtp_password', btrim(value->'smtp'->>'password'), now()
FROM public.site_settings
WHERE key = 'email_sms_settings' AND coalesce(btrim(value->'smtp'->>'password'),'') <> ''
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.email_provider_secrets(key, value, updated_at)
SELECT 'sms_api_key', btrim(value->'sms'->>'apiKey'), now()
FROM public.site_settings
WHERE key = 'email_sms_settings' AND coalesce(btrim(value->'sms'->>'apiKey'),'') <> ''
ON CONFLICT (key) DO NOTHING;

-- 2. Strip secret fields from ordinary configuration
UPDATE public.site_settings
SET value = jsonb_set(jsonb_set(value, '{smtp}', coalesce(value->'smtp','{}'::jsonb) - 'password'),
                      '{sms}', coalesce(value->'sms','{}'::jsonb) - 'apiKey')
            #- '{resend,apiKey}'
WHERE key = 'email_sms_settings';

-- 3. Strip secret copies from configuration change history (governed one-off remediation)
ALTER TABLE public.config_change_log DISABLE TRIGGER config_change_log_no_update;
UPDATE public.config_change_log
SET old_data = CASE WHEN old_data IS NULL THEN NULL ELSE
      jsonb_set(jsonb_set(old_data, '{value,smtp}', coalesce(old_data#>'{value,smtp}','{}'::jsonb) - 'password', false),
                '{value,sms}', coalesce(old_data#>'{value,sms}','{}'::jsonb) - 'apiKey', false) END,
    new_data = CASE WHEN new_data IS NULL THEN NULL ELSE
      jsonb_set(jsonb_set(new_data, '{value,smtp}', coalesce(new_data#>'{value,smtp}','{}'::jsonb) - 'password', false),
                '{value,sms}', coalesce(new_data#>'{value,sms}','{}'::jsonb) - 'apiKey', false) END
WHERE table_name = 'site_settings'
  AND (old_data::text ~ '"(password|apiKey)"\s*:' OR new_data::text ~ '"(password|apiKey)"\s*:');
ALTER TABLE public.config_change_log ENABLE TRIGGER config_change_log_no_update;

-- 4. Secure secret entry supports SMTP password and SMS key
CREATE OR REPLACE FUNCTION public.email_provider_secret_set(_key text, _value text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  PERFORM public.enforce_permission('settings','edit');
  IF _key IS NULL OR _key NOT IN ('resend_api_key','smtp_password','sms_api_key') THEN
    RAISE EXCEPTION 'unsupported_email_provider_secret: %', _key USING ERRCODE = '22023';
  END IF;
  IF _value IS NULL OR btrim(_value) = '' THEN
    RAISE EXCEPTION 'email_provider_secret_empty' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.email_provider_secrets(key, value, updated_at, updated_by)
  VALUES (_key, btrim(_value), now(), v_uid)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by;
  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES ('email_provider_secrets', NULL, 'UPDATE', NULL, jsonb_build_object('key', _key, 'value', '***'),
          'email provider secret updated', v_uid, public.request_role());
END $$;
REVOKE ALL ON FUNCTION public.email_provider_secret_set(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.email_provider_secret_set(text, text) TO authenticated, service_role;

-- 5. Recurrence guard: provider secrets may never be saved into site_settings
CREATE OR REPLACE FUNCTION public.site_settings_no_provider_secrets()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.key = 'email_sms_settings' AND jsonb_typeof(NEW.value) = 'object' AND (
       (NEW.value->'smtp') ? 'password'
    OR (NEW.value->'sms') ? 'apiKey'
    OR (NEW.value->'resend') ? 'apiKey'
  ) THEN
    RAISE EXCEPTION 'PROVIDER_SECRET_FORBIDDEN_IN_SETTINGS' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.site_settings_no_provider_secrets() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER site_settings_no_provider_secrets
BEFORE INSERT OR UPDATE ON public.site_settings
FOR EACH ROW EXECUTE FUNCTION public.site_settings_no_provider_secrets();