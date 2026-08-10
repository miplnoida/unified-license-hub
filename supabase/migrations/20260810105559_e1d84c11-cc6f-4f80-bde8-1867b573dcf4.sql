CREATE OR REPLACE FUNCTION public.restore_prudential_threshold(_threshold_id uuid)
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
  UPDATE public.prudential_thresholds SET is_active=true, effective_to=NULL, updated_at=now() WHERE id=_threshold_id;
  UPDATE public.prudential_threshold_versions SET effective_to=NULL
    WHERE threshold_id=_threshold_id
      AND version = (SELECT MAX(version) FROM public.prudential_threshold_versions WHERE threshold_id=_threshold_id);
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id::text,to_jsonb(_row),NULL,'Threshold restored',NULL,NULL,jsonb_build_object('event','THRESHOLD_RESTORED'));
END $function$;

CREATE OR REPLACE FUNCTION public.restore_prudential_ratio(_ratio_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  UPDATE public.prudential_ratios SET is_active=true, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id::text,to_jsonb(_row),NULL,'Ratio restored',NULL,NULL,jsonb_build_object('event','RATIO_RESTORED'));
END $function$;

CREATE OR REPLACE FUNCTION public.restore_validation_rule(_rule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _next integer; _def jsonb;
BEGIN
  IF NOT public.can_manage_returns_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage returns configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.return_validation_rules SET is_active = true, updated_at = now() WHERE id = _rule_id;
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id AND is_current;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _rule_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def || jsonb_build_object('archived', false), auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = _rule_id;
  PERFORM set_config('app.version_maintenance','off',true);
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id::text, NULL, _def,
    'Rule restored', NULL, NULL, jsonb_build_object('event','RULE_RESTORED','version',_next));
END $function$;

GRANT EXECUTE ON FUNCTION public.restore_prudential_threshold(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_prudential_ratio(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_validation_rule(uuid) TO authenticated;