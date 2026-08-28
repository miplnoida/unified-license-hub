-- F1-B / GAP-F1-03 — governed writer for key/value site settings
CREATE OR REPLACE FUNCTION public.site_settings_save(
  _key text,
  _value jsonb,
  _reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_mask text[] := ARRAY['password','apiKey','api_key','secret','secret_key','token','private_key'];
  k text;
BEGIN
  IF NOT public.is_trusted_service_request() THEN
    IF v_uid IS NULL
       OR NOT (public.is_super_admin(v_uid)
               OR (public.is_internal_staff(v_uid) AND public.has_permission(v_uid, 'settings', 'edit'))) THEN
      RAISE EXCEPTION 'not_authorised: site settings require settings.edit' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF _key IS NULL OR btrim(_key) = '' THEN
    RAISE EXCEPTION 'config_payload_empty' USING ERRCODE = '22023';
  END IF;

  SELECT s.value INTO v_old FROM public.site_settings s WHERE s.key = _key;

  INSERT INTO public.site_settings(key, value, updated_at)
  VALUES (_key, coalesce(_value, 'null'::jsonb), now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  RETURNING to_jsonb(public.site_settings.*) INTO v_new;

  -- mask secret-bearing leaves before writing audit evidence
  FOREACH k IN ARRAY v_mask LOOP
    IF v_new #> ARRAY['value'] ? k THEN
      v_new := jsonb_set(v_new, ARRAY['value', k], '"***"'::jsonb);
    END IF;
    IF v_old IS NOT NULL AND v_old ? k THEN
      v_old := jsonb_set(v_old, ARRAY[k], '"***"'::jsonb);
    END IF;
    IF v_new #> ARRAY['value'] ? 'smtp' AND (v_new #> ARRAY['value','smtp']) ? k THEN
      v_new := jsonb_set(v_new, ARRAY['value','smtp', k], '"***"'::jsonb);
    END IF;
    IF v_new #> ARRAY['value'] ? 'sms' AND (v_new #> ARRAY['value','sms']) ? k THEN
      v_new := jsonb_set(v_new, ARRAY['value','sms', k], '"***"'::jsonb);
    END IF;
  END LOOP;

  INSERT INTO public.config_change_log(table_name, record_id, action, old_data, new_data, reason, changed_by, changed_by_role)
  VALUES ('site_settings', NULL,
          CASE WHEN v_old IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
          CASE WHEN v_old IS NULL THEN NULL ELSE jsonb_build_object('key', _key, 'value', v_old) END,
          v_new, _reason, v_uid, public.request_role());

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.site_settings_save(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.site_settings_save(text, jsonb, text) TO authenticated, service_role;
