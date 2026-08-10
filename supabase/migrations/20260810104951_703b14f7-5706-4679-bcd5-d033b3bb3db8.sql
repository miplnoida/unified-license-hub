CREATE OR REPLACE FUNCTION public.archive_prudential_ratio(_ratio_id uuid)
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
  UPDATE public.prudential_ratios SET is_active=false, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id::text,to_jsonb(_row),NULL,'Ratio archived',NULL,NULL,jsonb_build_object('event','RATIO_ARCHIVED'));
END $function$;

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
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id::text,to_jsonb(_row),NULL,'Threshold archived',NULL,NULL,jsonb_build_object('event','THRESHOLD_ARCHIVED'));
END $function$;

CREATE OR REPLACE FUNCTION public.archive_validation_rule(_rule_id uuid)
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
  UPDATE public.return_validation_rules SET is_active = false, updated_at = now() WHERE id = _rule_id;
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id AND is_current;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _rule_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def || jsonb_build_object('archived', true), auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id::text, NULL, _def,
    'Rule archived', NULL, NULL, jsonb_build_object('event','RULE_ARCHIVED','version',_next));
END $function$;

CREATE OR REPLACE FUNCTION public.clone_validation_rule(_rule_id uuid, _new_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _src public.return_validation_rules; _new_id uuid; _def jsonb;
BEGIN
  IF NOT public.can_manage_returns_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage returns configuration';
  END IF;
  SELECT * INTO _src FROM public.return_validation_rules WHERE id = _rule_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'Rule not found'; END IF;
  INSERT INTO public.return_validation_rules(
    return_config_id, form_id, scope, name, rule_type, expression, error_message, severity,
    field_refs, is_active, current_version, created_by
  ) VALUES (
    _src.return_config_id, _src.form_id, _src.scope, COALESCE(NULLIF(_new_name,''), _src.name || ' (copy)'),
    _src.rule_type, _src.expression, _src.error_message, _src.severity,
    _src.field_refs, _src.is_active, 1, auth.uid()
  ) RETURNING id INTO _new_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _new_id;
  PERFORM public.log_compliance_audit('CREATE','return_validation_rules', _new_id::text, NULL, _def,
    'Rule cloned', NULL, NULL, jsonb_build_object('event','RULE_CLONED','from_rule',_rule_id));
  RETURN _new_id;
END $function$;

CREATE OR REPLACE FUNCTION public.log_validation_run(_return_id uuid, _results jsonb, _context text DEFAULT 'submit'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _batch uuid := gen_random_uuid(); _r jsonb;
BEGIN
  FOR _r IN SELECT jsonb_array_elements(_results) LOOP
    INSERT INTO public.return_validation_run_log(batch_id, return_id, rule_id, rule_version, rule_name, severity, passed, message, context, executed_by)
    VALUES (_batch, _return_id, NULLIF(_r->>'rule_id','')::uuid, NULLIF(_r->>'rule_version','')::int,
            _r->>'rule_name', COALESCE(_r->>'severity','error'), COALESCE((_r->>'passed')::boolean, false),
            _r->>'message', _context, auth.uid());
  END LOOP;
  UPDATE public.returns_filed SET latest_validation_batch_id = _batch WHERE id = _return_id;
  PERFORM public.log_compliance_audit('UPDATE','returns_filed', _return_id::text, NULL,
    jsonb_build_object('batch_id',_batch,'count',jsonb_array_length(_results)),
    'Validation executed', NULL, NULL, jsonb_build_object('event','RETURN_VALIDATED','context',_context));
  RETURN _batch;
END $function$;

CREATE OR REPLACE FUNCTION public.publish_prudential_ratio(_ratio_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id = _ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id = _ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
    VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  UPDATE public.prudential_ratios SET current_version = _next, updated_at = now() WHERE id = _ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios', _ratio_id::text, NULL, to_jsonb(_row), 'Ratio published', NULL, NULL, jsonb_build_object('version',_next,'event','RATIO_PUBLISHED'));
  RETURN _next;
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
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds', _threshold_id::text, NULL, to_jsonb(_row), 'Threshold published', NULL, NULL, jsonb_build_object('version',_next,'event','THRESHOLD_PUBLISHED'));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.publish_validation_rule(_rule_id uuid)
 RETURNS integer
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
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id AND is_current;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _rule_id;
  IF _def IS NULL THEN RAISE EXCEPTION 'Rule not found'; END IF;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def, auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next, updated_at = now() WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id::text, NULL, _def, 'Rule published', NULL, NULL, jsonb_build_object('version',_next,'event','RULE_PUBLISHED'));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_ratio(_ratio_id uuid, _to_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _snap public.prudential_ratio_versions; _next integer; _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  SELECT * INTO _snap FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id AND version=_to_version;
  IF _snap IS NULL THEN RAISE EXCEPTION 'Version % not found', _to_version; END IF;
  UPDATE public.prudential_ratios SET formula=_snap.formula, display_format=_snap.display_format, updated_at=now() WHERE id=_ratio_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF NOT EXISTS (SELECT 1 FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id AND version=_next) THEN
    INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
      VALUES (_ratio_id, _next, _row.formula, _row.display_format, auth.uid());
  END IF;
  SELECT COALESCE(MAX(version),1) INTO _next FROM public.prudential_ratio_versions WHERE ratio_id=_ratio_id;
  UPDATE public.prudential_ratios SET current_version=_next WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id::text,NULL,to_jsonb(_row),'Ratio rolled back',NULL,NULL,jsonb_build_object('event','RATIO_ROLLBACK','from_version',_to_version,'new_version',_next));
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
  PERFORM public.log_compliance_audit('UPDATE','prudential_thresholds',_threshold_id::text,NULL,to_jsonb(_row),'Threshold rolled back',NULL,NULL,jsonb_build_object('event','THRESHOLD_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $function$;

CREATE OR REPLACE FUNCTION public.rollback_validation_rule(_rule_id uuid, _to_version integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _def jsonb; _next integer;
BEGIN
  IF NOT public.can_manage_returns_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage returns configuration';
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  SELECT definition INTO _def FROM public.return_validation_rule_versions
    WHERE rule_id = _rule_id AND version = _to_version;
  IF _def IS NULL THEN RAISE EXCEPTION 'Version % not found for this rule', _to_version; END IF;

  UPDATE public.return_validation_rules SET
    name          = COALESCE(_def->>'name', name),
    scope         = COALESCE(_def->>'scope', scope),
    rule_type     = COALESCE(_def->>'rule_type', rule_type),
    expression    = COALESCE(_def->>'expression', expression),
    error_message = COALESCE(_def->>'error_message', error_message),
    severity      = COALESCE(_def->>'severity', severity),
    form_id       = NULLIF(_def->>'form_id','')::uuid,
    is_active     = COALESCE((_def->>'is_active')::boolean, is_active),
    updated_at    = now()
  WHERE id = _rule_id;

  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id AND is_current;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  IF NOT EXISTS (SELECT 1 FROM public.return_validation_rule_versions WHERE rule_id=_rule_id AND version=_next) THEN
    INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
      VALUES (_rule_id, _next, _def || jsonb_build_object('rolled_back_from', _to_version), auth.uid(), true);
  END IF;
  SELECT COALESCE(MAX(version),1) INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id::text, NULL, _def,
    'Rule rolled back', NULL, NULL,
    jsonb_build_object('event','RULE_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $function$;