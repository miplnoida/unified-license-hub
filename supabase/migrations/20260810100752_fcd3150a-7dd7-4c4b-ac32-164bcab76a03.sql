-- 1. Permission helper for returns configuration
CREATE OR REPLACE FUNCTION public.can_manage_returns_config(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user, 'returns_management', 'manage_config')
      OR public.has_permission(_user, 'prudential_supervision', 'manage_config');
$$;

-- 2. Append-only guard: allow controlled versioning routines
CREATE OR REPLACE FUNCTION public.prudential_appendonly_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF current_setting('role', true) = 'service_role' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF current_setting('app.version_maintenance', true) = 'on' AND TG_OP = 'UPDATE' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
END; $$;

-- 3. Ratio version RPCs re-gated + maintenance flag
CREATE OR REPLACE FUNCTION public.publish_prudential_ratio(_ratio_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios', _ratio_id, NULL, to_jsonb(_row), 'Ratio published', NULL, NULL, jsonb_build_object('version',_next,'event','RATIO_PUBLISHED'));
  RETURN _next;
END $$;

CREATE OR REPLACE FUNCTION public.rollback_prudential_ratio(_ratio_id uuid, _to_version integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id,NULL,to_jsonb(_row),'Ratio rolled back',NULL,NULL,jsonb_build_object('event','RATIO_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $$;

CREATE OR REPLACE FUNCTION public.archive_prudential_ratio(_ratio_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _row public.prudential_ratios;
BEGIN
  IF NOT public.can_manage_prudential_config(auth.uid()) THEN
    RAISE EXCEPTION 'You do not have permission to manage prudential configuration';
  END IF;
  SELECT * INTO _row FROM public.prudential_ratios WHERE id=_ratio_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Ratio not found'; END IF;
  UPDATE public.prudential_ratios SET is_active=false, updated_at=now() WHERE id=_ratio_id;
  PERFORM public.log_compliance_audit('UPDATE','prudential_ratios',_ratio_id,to_jsonb(_row),NULL,'Ratio archived',NULL,NULL,jsonb_build_object('event','RATIO_ARCHIVED'));
END $$;

-- 4. Validation rule RPCs re-gated + maintenance flag
CREATE OR REPLACE FUNCTION public.publish_validation_rule(_rule_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def, 'Rule published', NULL, NULL, jsonb_build_object('version',_next,'event','RULE_PUBLISHED'));
  RETURN _next;
END $$;

CREATE OR REPLACE FUNCTION public.rollback_validation_rule(_rule_id uuid, _to_version integer)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def,
    'Rule rolled back', NULL, NULL,
    jsonb_build_object('event','RULE_ROLLBACK','from_version',_to_version,'new_version',_next));
  RETURN _next;
END $$;

CREATE OR REPLACE FUNCTION public.archive_validation_rule(_rule_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('UPDATE','return_validation_rules', _rule_id, NULL, _def,
    'Rule archived', NULL, NULL, jsonb_build_object('event','RULE_ARCHIVED','version',_next));
END $$;

CREATE OR REPLACE FUNCTION public.clone_validation_rule(_rule_id uuid, _new_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
  PERFORM public.log_compliance_audit('INSERT','return_validation_rules', _new_id, NULL, _def,
    'Rule cloned', NULL, NULL, jsonb_build_object('event','RULE_CLONED','from_rule',_rule_id));
  RETURN _new_id;
END $$;

-- 5. Auto-versioning triggers
CREATE OR REPLACE FUNCTION public.trg_prudential_ratio_autoversion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _next integer;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.formula IS NOT DISTINCT FROM OLD.formula
     AND NEW.display_format IS NOT DISTINCT FROM OLD.display_format THEN
    RETURN NULL;
  END IF;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.prudential_ratio_versions WHERE ratio_id = NEW.id;
  INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, published_by)
    VALUES (NEW.id, _next, NEW.formula, NEW.display_format, auth.uid())
    ON CONFLICT (ratio_id, version) DO NOTHING;
  UPDATE public.prudential_ratios SET current_version = _next WHERE id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_prudential_ratio_autoversion ON public.prudential_ratios;
CREATE TRIGGER trg_prudential_ratio_autoversion
AFTER INSERT OR UPDATE OF formula, display_format ON public.prudential_ratios
FOR EACH ROW EXECUTE FUNCTION public.trg_prudential_ratio_autoversion();

CREATE OR REPLACE FUNCTION public.trg_validation_rule_autoversion()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _next integer; _def jsonb;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.scope IS NOT DISTINCT FROM OLD.scope
     AND NEW.rule_type IS NOT DISTINCT FROM OLD.rule_type
     AND NEW.expression IS NOT DISTINCT FROM OLD.expression
     AND NEW.error_message IS NOT DISTINCT FROM OLD.error_message
     AND NEW.severity IS NOT DISTINCT FROM OLD.severity THEN
    RETURN NULL;
  END IF;
  PERFORM set_config('app.version_maintenance','on',true);
  UPDATE public.return_validation_rule_versions SET is_current = false WHERE rule_id = NEW.id AND is_current;
  SELECT COALESCE(MAX(version),0)+1 INTO _next FROM public.return_validation_rule_versions WHERE rule_id = NEW.id;
  SELECT to_jsonb(r.*) INTO _def FROM public.return_validation_rules r WHERE r.id = NEW.id;
  INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
    VALUES (NEW.id, _next, _def, auth.uid(), true)
    ON CONFLICT (rule_id, version) DO NOTHING;
  UPDATE public.return_validation_rules SET current_version = _next WHERE id = NEW.id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_validation_rule_autoversion ON public.return_validation_rules;
CREATE TRIGGER trg_validation_rule_autoversion
AFTER INSERT OR UPDATE OF name, scope, rule_type, expression, error_message, severity ON public.return_validation_rules
FOR EACH ROW EXECUTE FUNCTION public.trg_validation_rule_autoversion();

-- 6. Backfill initial versions
INSERT INTO public.prudential_ratio_versions(ratio_id, version, formula, display_format, effective_from)
SELECT r.id, 1, r.formula, r.display_format, COALESCE(r.created_at::date, current_date)
  FROM public.prudential_ratios r
 WHERE NOT EXISTS (SELECT 1 FROM public.prudential_ratio_versions v WHERE v.ratio_id = r.id);

UPDATE public.prudential_ratios r
   SET current_version = v.max_v
  FROM (SELECT ratio_id, MAX(version) AS max_v FROM public.prudential_ratio_versions GROUP BY ratio_id) v
 WHERE v.ratio_id = r.id AND r.current_version IS DISTINCT FROM v.max_v;

INSERT INTO public.return_validation_rule_versions(rule_id, version, definition, published_by, is_current)
SELECT r.id, 1, to_jsonb(r.*), r.created_by, true
  FROM public.return_validation_rules r
 WHERE NOT EXISTS (SELECT 1 FROM public.return_validation_rule_versions v WHERE v.rule_id = r.id);