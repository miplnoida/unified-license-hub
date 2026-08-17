CREATE OR REPLACE FUNCTION public.archive_prudential_threshold(_threshold_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Threshold not found'; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_thresholds SET is_active=false, effective_to=current_date, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=current_date WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id,to_jsonb(_row),NULL,'Threshold archived',NULL,NULL,jsonb_build_object('event','THRESHOLD_ARCHIVED'));
END $function$;

CREATE OR REPLACE FUNCTION public.publish_prudential_threshold(_threshold_id uuid, _effective_from date DEFAULT CURRENT_DATE)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_threshold_versions SET effective_to = _effective_from - 1
    WHERE threshold_id = _threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id = _threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id = _threshold_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Threshold not found'; END IF;
  INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
    VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, _effective_from, auth.uid());
  UPDATE public.prudential_thresholds SET current_version = _next, effective_from = _effective_from, updated_at = now() WHERE id = _threshold_id;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds', _threshold_id, NULL, to_jsonb(_row), 'Threshold published', NULL, NULL, jsonb_build_object('version',_next,'event','THRESHOLD_PUBLISHED'));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_threshold(_threshold_id uuid, _to_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _snap public.prudential_threshold_versions; _next integer; _row public.prudential_thresholds;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN RAISE EXCEPTION 'Not authorised to manage prudential configuration'; END IF;
  SELECT * INTO _snap FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.prudential_thresholds
    SET warn_value=_snap.warn_value, breach_value=_snap.breach_value, upper_value=_snap.upper_value,
        comparator=_snap.comparator, unit=_snap.unit, updated_at=now()
    WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to = current_date - 1
    WHERE threshold_id=_threshold_id AND effective_to IS NULL;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id;
  SELECT * INTO _row FROM public.prudential_thresholds WHERE id=_threshold_id;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id AND version=_next) THEN
    INSERT INTO public.prudential_threshold_versions(threshold_id, version, warn_value, breach_value, upper_value, comparator, unit, effective_from, published_by)
      VALUES (_threshold_id, _next, _row.warn_value, _row.breach_value, _row.upper_value, _row.comparator, _row.unit, current_date, auth.uid());
  END IF;
  SELECT COALESCE(MAX(version),1) INTO _next FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id;
  UPDATE public.prudential_thresholds SET current_version=_next, effective_from=current_date WHERE id=_threshold_id;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id,NULL,to_jsonb(_row),'Threshold rolled back',NULL,NULL,jsonb_build_object('event','THRESHOLD_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $function$;