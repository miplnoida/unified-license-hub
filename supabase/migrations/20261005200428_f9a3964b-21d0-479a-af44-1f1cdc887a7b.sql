ALTER TABLE public.config_change_log DISABLE TRIGGER config_change_log_no_update;
UPDATE public.config_change_log
SET new_data = new_data #- '{value,password}', old_data = CASE WHEN old_data IS NULL THEN NULL ELSE old_data #- '{value,password}' END
WHERE table_name = 'site_settings'
  AND (new_data #> '{value,password}' IS NOT NULL OR old_data #> '{value,password}' IS NOT NULL);
ALTER TABLE public.config_change_log ENABLE TRIGGER config_change_log_no_update;