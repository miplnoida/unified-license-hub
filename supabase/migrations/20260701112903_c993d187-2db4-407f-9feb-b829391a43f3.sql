
-- Rule lifecycle RPCs + null_reason column for calculated ratios.

ALTER TABLE public.return_calculated_ratios
  ADD COLUMN IF NOT EXISTS null_reason text;

-- Rollback: copy a historical version's definition back onto the rule row
-- and then publish a NEW version snapshot (never overwrite history).
CREATE OR REPLACE FUNCTION public.rollback_validation_rule(_rule_id uuid, _to_version integer)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _def jsonb; _next integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT definition INTO _def FROM public.return_validation_rule_versions
    WHERE rule_id = _rule_id AND version = _to_version;
  IF _def IS NULL THEN RAISE EXCEPTION 'Version % not found for rule %', _to_version, _rule_id; END IF;

  UPDATE public.return_validation_rules SET
    name             = COALESCE(_def->>'name', name),
    rule_type        = COALESCE(_def->>'rule_type', rule_type),
    expression       = COALESCE(_def->>'expression', expression),
    error_message    = COALESCE(_def->>'error_message', error_message),
    severity         = COALESCE(_def->>'severity', severity),
    form_id          = NULLIF(_def->>'form_id','')::uuid,
    is_active        = COALESCE((_def->>'is_active')::boolean, is_active),
    updated_at       = now()
  WHERE id = _rule_id;

  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def || jsonb_build_object('rolled_back_from', _to_version), auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def,
    'Rule rolled back', NULL, NULL,
    jsonb_build_object('event','RULE_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $$;
GRANT EXECUTE ON FUNCTION public.rollback_validation_rule(uuid, integer) TO authenticated;

-- Clone: create a new rule from an existing one's current definition; seed v1.
CREATE OR REPLACE FUNCTION public.clone_validation_rule(_rule_id uuid, _new_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _src public.return_validation_rules; _new_id uuid; _def jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  SELECT * INTO _src FROM public.return_validation_rules WHERE id = _rule_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'Rule not found'; END IF;
  INSERT INTO public.return_validation_rules(
    return_config_id, form_id, name, rule_type, expression, error_message, severity,
    is_active, current_version, created_by
  ) VALUES (
    _src.return_config_id, _src.form_id, COALESCE(NULLIF(_new_name,''), _src.name || ' (copy)'),
    _src.rule_type, _src.expression, _src.error_message, _src.severity,
    _src.is_active, 1, auth.uid()
  ) RETURNING id INTO _new_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _new_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_new_id, 1, _def, auth.uid(), true);
  PERFORM public.log_compliance_audit('INSERT','return_validation_rules', _new_id, NULL, _def,
    'Rule cloned', NULL, NULL, jsonb_build_object('event','RULE_CLONED','from_rule',_rule_id));
  RETURN _new_id;
END $$;
GRANT EXECUTE ON FUNCTION public.clone_validation_rule(uuid, text) TO authenticated;

-- Archive: deactivate + record a version snapshot marking the archive event.
CREATE OR REPLACE FUNCTION public.archive_validation_rule(_rule_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _next integer; _def jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Admin only'; END IF;
  UPDATE public.return_validation_rules SET is_active = false, updated_at = now() WHERE id = _rule_id;
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = _rule_id;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = _rule_id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = _rule_id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (_rule_id, _next, _def || jsonb_build_object('archived', true), auth.uid(), true);
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = _rule_id;
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def,
    'Rule archived', NULL, NULL, jsonb_build_object('event','RULE_ARCHIVED','version',_next));
END $$;
GRANT EXECUTE ON FUNCTION public.archive_validation_rule(uuid) TO authenticated;
