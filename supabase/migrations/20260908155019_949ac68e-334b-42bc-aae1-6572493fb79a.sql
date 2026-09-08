-- =====================================================================
-- AML-01 — Governed operations + read models for Supervisory Policy Profiles
-- =====================================================================

-- ------------------------------------------------------------- authority
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_require_manage(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _d text; _reg uuid;
BEGIN
  SELECT domain_code, regulator_id INTO _d, _reg
    FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF _reg IS NULL THEN RETURN public.supervisory_domain_require_manage(_d); END IF;
  RETURN public.supervisory_domain_require_manage_for_regulator(_d, _reg);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_require_manage(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_require_manage(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_require_approval(_profile_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _d text; _reg uuid; _perm text; _regcode text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;

  SELECT p.domain_code, p.regulator_id, a.policy_approval_permission
    INTO _d, _reg, _perm
    FROM public.supervisory_policy_profile p
    LEFT JOIN public.supervisory_domain_authority a ON a.domain_code = p.domain_code
   WHERE p.id = _profile_id;
  IF _d IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;

  IF _perm IS NULL THEN
    RAISE EXCEPTION 'not_authorized: no dedicated policy approval permission is registered for domain %; supervisory policy profiles cannot be approved', _d
      USING ERRCODE = '42501'; END IF;

  SELECT code INTO _regcode FROM public.regulators WHERE id = _reg;

  IF public.user_has_regulator_authority(_uid, split_part(_perm,'.',1), split_part(_perm,'.',2), _reg) THEN
    RETURN _uid; END IF;

  RAISE EXCEPTION 'not_authorized: % for regulator % is required to approve this supervisory policy profile; assessment approval and platform administration do not substitute',
    _perm, COALESCE(_regcode,'(unscoped)') USING ERRCODE = '42501';
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_require_approval(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_require_approval(uuid) TO authenticated, service_role;

-- --------------------------------------------------------- component probe
CREATE OR REPLACE FUNCTION public.supervisory_policy_component_probe(
  _component_type text, _component_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _t record; _out jsonb;
BEGIN
  SELECT * INTO _t FROM public.supervisory_policy_component_type
   WHERE component_type = upper(btrim(COALESCE(_component_type,'')));
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _component_type USING ERRCODE = '22023'; END IF;
  IF NOT _t.is_available THEN
    RAISE EXCEPTION 'component_type_not_implemented: % is registered in the component catalogue but its architecture does not exist yet, so it cannot be bound', _t.component_type
      USING ERRCODE = '22023'; END IF;

  IF _t.component_type = 'METHODOLOGY' THEN
    SELECT jsonb_build_object(
             'component_id', m.id, 'component_table', 'supervisory_methodology',
             'component_code', m.code, 'component_version', m.version,
             'component_status', m.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version)
      INTO _out FROM public.supervisory_methodology m WHERE m.id = _component_id;

  ELSIF _t.component_type = 'CALCULATION_CONFIG' THEN
    SELECT jsonb_build_object(
             'component_id', c.id, 'component_table', 'supervisory_calculation_config',
             'component_code', m.code || '/calc', 'component_version', c.config_version::text,
             'component_status', c.status, 'domain_code', m.domain_code,
             'regulator_id', m.regulator_id, 'sector_id', m.sector_id, 'origin', m.origin,
             'label', m.code || ' ' || m.version || ' calculation v' || c.config_version)
      INTO _out
      FROM public.supervisory_calculation_config c
      JOIN public.supervisory_methodology m ON m.id = c.methodology_id
     WHERE c.id = _component_id;
  END IF;

  IF _out IS NULL THEN
    RAISE EXCEPTION 'not_found: no % component exists with id %', _t.component_type, _component_id
      USING ERRCODE = '22023'; END IF;
  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_component_probe(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_component_probe(text, uuid) TO authenticated, service_role;

-- ------------------------------------------------------------ create draft
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_create(_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _d text; _reg uuid; _code text; _ver text; _id uuid; _origin text;
BEGIN
  _d := upper(btrim(COALESCE(_payload->>'domain_code','')));
  _reg := NULLIF(_payload->>'regulator_id','')::uuid;
  _code := upper(btrim(COALESCE(_payload->>'code','')));
  _ver := btrim(COALESCE(_payload->>'profile_version',''));
  _origin := upper(btrim(COALESCE(_payload->>'origin','REGULATOR_AUTHORED')));

  IF _d = '' OR _code = '' OR _ver = '' OR btrim(COALESCE(_payload->>'name','')) = '' THEN
    RAISE EXCEPTION 'a domain, code, version and name are required' USING ERRCODE = '22023'; END IF;
  IF _origin NOT IN ('MIPL_REFERENCE','REGULATOR_AUTHORED') THEN
    RAISE EXCEPTION 'origin must be MIPL_REFERENCE or REGULATOR_AUTHORED; adopted profiles are created through adoption'
      USING ERRCODE = '22023'; END IF;
  IF _origin = 'REGULATOR_AUTHORED' AND _reg IS NULL THEN
    RAISE EXCEPTION 'a regulator-authored profile must name its regulator' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.supervisory_domain_authority WHERE domain_code = _d) THEN
    RAISE EXCEPTION 'unknown_supervisory_domain: %', _d USING ERRCODE = '22023'; END IF;

  IF _reg IS NULL THEN _uid := public.supervisory_domain_require_manage(_d);
  ELSE _uid := public.supervisory_domain_require_manage_for_regulator(_d, _reg); END IF;

  IF _origin = 'MIPL_REFERENCE' AND NOT public.is_super_admin(_uid) THEN
    RAISE EXCEPTION 'not_authorized: only platform administration may author a MIPL reference profile'
      USING ERRCODE = '42501'; END IF;

  INSERT INTO public.supervisory_policy_profile(
    code, profile_version, domain_code, regulator_id, sector_id,
    name, title, purpose, status, origin, notes, created_by)
  VALUES (_code, _ver, _d, _reg, NULLIF(_payload->>'sector_id','')::uuid,
          btrim(_payload->>'name'), NULLIF(btrim(COALESCE(_payload->>'title','')),''),
          NULLIF(btrim(COALESCE(_payload->>'purpose','')),''),
          'DRAFT', _origin, NULLIF(btrim(COALESCE(_payload->>'notes','')),''), _uid)
  RETURNING id INTO _id;

  INSERT INTO public.supervisory_policy_profile_requirement(profile_id, component_type, requirement, set_by)
  SELECT _id, component_type, default_requirement, _uid
    FROM public.supervisory_policy_component_type;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_id, 'CREATED', 'DRAFT', NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid,
          jsonb_build_object('origin', _origin, 'domain_code', _d, 'regulator_id', _reg));

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action, 'supervisory_policy_profile', _id::text,
          NULL, jsonb_build_object('code', _code, 'profile_version', _ver, 'domain_code', _d, 'regulator_id', _reg),
          'Supervisory policy profile draft created', NULL, NULL, '{}'::jsonb);
  RETURN _id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_create(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_create(jsonb) TO authenticated, service_role;

-- -------------------------------------------------------------- save draft
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_save(_profile_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_policy_profile;
BEGIN
  SELECT * INTO _row FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_policy_profile_require_manage(_profile_id);
  IF _row.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'policy_profile_immutable: % % is %; issue a new version instead',
      _row.code, _row.profile_version, _row.status USING ERRCODE = '42501'; END IF;

  UPDATE public.supervisory_policy_profile SET
    name    = COALESCE(NULLIF(btrim(COALESCE(_payload->>'name','')),''), name),
    title   = CASE WHEN _payload ? 'title' THEN NULLIF(btrim(COALESCE(_payload->>'title','')),'') ELSE title END,
    purpose = CASE WHEN _payload ? 'purpose' THEN NULLIF(btrim(COALESCE(_payload->>'purpose','')),'') ELSE purpose END,
    notes   = CASE WHEN _payload ? 'notes' THEN NULLIF(btrim(COALESCE(_payload->>'notes','')),'') ELSE notes END,
    effective_from = CASE WHEN _payload ? 'effective_from' THEN NULLIF(_payload->>'effective_from','')::date ELSE effective_from END
  WHERE id = _profile_id;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, actor_id, detail)
  VALUES (_profile_id, 'EDITED', _row.status, _row.status, _uid, jsonb_build_object('fields', _payload));

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action, 'supervisory_policy_profile', _profile_id::text,
          to_jsonb(_row), _payload, 'Supervisory policy profile draft edited', NULL, NULL, '{}'::jsonb);
  RETURN _profile_id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_save(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_save(uuid, jsonb) TO authenticated, service_role;

-- --------------------------------------------------------------- adoption
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_adopt_reference(
  _reference_profile_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _src public.supervisory_policy_profile; _new_id uuid; _regcode text; _ver text;
BEGIN
  SELECT * INTO _src FROM public.supervisory_policy_profile WHERE id = _reference_profile_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF _src.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'not_a_reference_profile: % % has origin %', _src.code, _src.profile_version, _src.origin
      USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_domain_require_manage_for_regulator(_src.domain_code, _regulator_id);

  SELECT code INTO _regcode FROM public.regulators WHERE id = _regulator_id;
  _ver := _src.profile_version || '+' || _regcode;
  IF EXISTS (SELECT 1 FROM public.supervisory_policy_profile
              WHERE code = _src.code AND profile_version = _ver) THEN
    RAISE EXCEPTION 'already_adopted: % % is already adopted by %', _src.code, _src.profile_version, _regcode
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_policy_profile(
    code, profile_version, domain_code, regulator_id, sector_id, name, title, purpose,
    status, origin, adopted_from_id, notes, created_by)
  VALUES (_src.code, _ver, _src.domain_code, _regulator_id, _src.sector_id,
          _src.name, _src.title, _src.purpose, 'DRAFT', 'REGULATOR_ADOPTED', _src.id, _src.notes, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_policy_profile_requirement(profile_id, component_type, requirement, rationale, set_by)
  SELECT _new_id, component_type, requirement, rationale, _uid
    FROM public.supervisory_policy_profile_requirement WHERE profile_id = _src.id;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'ADOPTED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('adopted_from', _src.id, 'reference_version', _src.profile_version,
                             'regulator_id', _regulator_id,
                             'note', 'Component bindings are deliberately not copied; the adopting regulator must bind its own component versions.'));

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action, 'supervisory_policy_profile', _new_id::text,
          NULL, jsonb_build_object('adopted_from', _src.id, 'profile_version', _ver, 'regulator_id', _regulator_id),
          btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN _new_id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_adopt_reference(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_adopt_reference(uuid, uuid, text) TO authenticated, service_role;

-- ------------------------------------------------------------ new version
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_new_version(
  _profile_id uuid, _new_version text, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _src public.supervisory_policy_profile; _new_id uuid;
BEGIN
  SELECT * INTO _src FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _src.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_policy_profile_require_manage(_profile_id);
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;
  IF btrim(COALESCE(_new_version,'')) = '' THEN
    RAISE EXCEPTION 'a new version label is required' USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_policy_profile(
    code, profile_version, domain_code, regulator_id, sector_id, name, title, purpose,
    status, origin, adopted_from_id, supersedes_id, notes, created_by)
  VALUES (_src.code, btrim(_new_version), _src.domain_code, _src.regulator_id, _src.sector_id,
          _src.name, _src.title, _src.purpose, 'DRAFT', _src.origin, _src.adopted_from_id,
          _src.id, _src.notes, _uid)
  RETURNING id INTO _new_id;

  INSERT INTO public.supervisory_policy_profile_requirement(profile_id, component_type, requirement, rationale, set_by)
  SELECT _new_id, component_type, requirement, rationale, _uid
    FROM public.supervisory_policy_profile_requirement WHERE profile_id = _src.id;

  INSERT INTO public.supervisory_policy_profile_binding(
    profile_id, component_type, component_table, component_id, component_code,
    component_version, component_status, rationale, bound_by)
  SELECT _new_id, component_type, component_table, component_id, component_code,
         component_version, component_status, rationale, _uid
    FROM public.supervisory_policy_profile_binding WHERE profile_id = _src.id;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'NEW_VERSION', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('supersedes', _src.id, 'from_version', _src.profile_version));

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action, 'supervisory_policy_profile', _new_id::text,
          NULL, jsonb_build_object('supersedes', _src.id, 'profile_version', btrim(_new_version)),
          btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN _new_id;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_new_version(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_new_version(uuid, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------- binding write
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_binding_set(
  _profile_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _p public.supervisory_policy_profile; _ct text; _cid uuid; _probe jsonb; _bid uuid;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_policy_profile_require_manage(_profile_id);
  IF _p.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'policy_profile_immutable: % % is %; component bindings can only change on a draft or in-review profile',
      _p.code, _p.profile_version, _p.status USING ERRCODE = '42501'; END IF;

  _ct := upper(btrim(COALESCE(_payload->>'component_type','')));
  _cid := NULLIF(_payload->>'component_id','')::uuid;
  IF _ct = '' OR _cid IS NULL THEN
    RAISE EXCEPTION 'a component type and component id are required' USING ERRCODE = '22023'; END IF;

  _probe := public.supervisory_policy_component_probe(_ct, _cid);

  IF (_probe->>'domain_code') IS DISTINCT FROM _p.domain_code THEN
    RAISE EXCEPTION 'domain_mismatch: the component belongs to domain % but the profile governs %',
      _probe->>'domain_code', _p.domain_code USING ERRCODE = '22023'; END IF;

  IF _p.regulator_id IS NOT NULL
     AND (_probe->>'regulator_id') IS NOT NULL
     AND (_probe->>'regulator_id')::uuid <> _p.regulator_id THEN
    RAISE EXCEPTION 'regulator_mismatch: the component belongs to another regulator and cannot be bound into this profile'
      USING ERRCODE = '22023'; END IF;

  IF (_probe->>'origin') = 'MIPL_REFERENCE' AND _p.origin <> 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_component_not_bindable: a MIPL reference component must be adopted by the regulator before a regulator profile can bind it'
      USING ERRCODE = '22023'; END IF;

  IF (_probe->>'component_status') NOT IN ('APPROVED','ACTIVE') THEN
    RAISE EXCEPTION 'component_not_approved: % % is % and cannot be bound; only an approved or active component version may be bound',
      _probe->>'component_code', _probe->>'component_version', _probe->>'component_status'
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_policy_profile_binding(
    profile_id, component_type, component_table, component_id, component_code,
    component_version, component_status, rationale, bound_by)
  VALUES (_profile_id, _ct, _probe->>'component_table', _cid, _probe->>'component_code',
          _probe->>'component_version', _probe->>'component_status',
          NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid)
  ON CONFLICT (profile_id, component_type) DO UPDATE SET
    component_table = EXCLUDED.component_table,
    component_id = EXCLUDED.component_id,
    component_code = EXCLUDED.component_code,
    component_version = EXCLUDED.component_version,
    component_status = EXCLUDED.component_status,
    rationale = EXCLUDED.rationale,
    bound_by = EXCLUDED.bound_by,
    bound_at = now()
  RETURNING id INTO _bid;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, actor_id, detail)
  VALUES (_profile_id, 'BINDING_SET', _p.status, _p.status, _uid,
          jsonb_build_object('component_type', _ct, 'component', _probe));

  PERFORM public.log_compliance_audit('UPDATE'::compliance_audit_action, 'supervisory_policy_profile_binding', _bid::text,
          NULL, jsonb_build_object('profile_id', _profile_id, 'component_type', _ct, 'component', _probe),
          'Supervisory policy component version bound', NULL, NULL, '{}'::jsonb);
  RETURN _bid;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_binding_set(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_binding_set(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_binding_clear(
  _profile_id uuid, _component_type text, _rationale text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _p public.supervisory_policy_profile; _ct text; _old jsonb;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_policy_profile_require_manage(_profile_id);
  IF _p.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'policy_profile_immutable: % % is %', _p.code, _p.profile_version, _p.status
      USING ERRCODE = '42501'; END IF;
  IF length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  _ct := upper(btrim(COALESCE(_component_type,'')));
  SELECT to_jsonb(b) INTO _old FROM public.supervisory_policy_profile_binding b
   WHERE b.profile_id = _profile_id AND b.component_type = _ct;
  IF _old IS NULL THEN RETURN false; END IF;

  DELETE FROM public.supervisory_policy_profile_binding
   WHERE profile_id = _profile_id AND component_type = _ct;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_profile_id, 'BINDING_CLEARED', _p.status, _p.status, btrim(_rationale), _uid, _old);

  PERFORM public.log_compliance_audit('DELETE'::compliance_audit_action, 'supervisory_policy_profile_binding',
          (_old->>'id'), _old, NULL, btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_binding_clear(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_binding_clear(uuid, text, text) TO authenticated, service_role;

-- ------------------------------------------------------- requirement write
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_requirement_set(
  _profile_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _p public.supervisory_policy_profile; _ct text; _req text; _t record; _rid uuid;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  _uid := public.supervisory_policy_profile_require_manage(_profile_id);
  IF _p.status NOT IN ('DRAFT','REVIEW') THEN
    RAISE EXCEPTION 'policy_profile_immutable: % % is %', _p.code, _p.profile_version, _p.status
      USING ERRCODE = '42501'; END IF;

  _ct := upper(btrim(COALESCE(_payload->>'component_type','')));
  _req := upper(btrim(COALESCE(_payload->>'requirement','')));
  IF _req NOT IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE') THEN
    RAISE EXCEPTION 'requirement must be REQUIRED, OPTIONAL or NOT_APPLICABLE' USING ERRCODE = '22023'; END IF;

  SELECT * INTO _t FROM public.supervisory_policy_component_type WHERE component_type = _ct;
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _ct USING ERRCODE = '22023'; END IF;
  IF _req = 'REQUIRED' AND NOT _t.is_available THEN
    RAISE EXCEPTION 'component_type_not_implemented: % cannot be marked required because its architecture does not exist yet', _ct
      USING ERRCODE = '22023'; END IF;
  IF _req = 'NOT_APPLICABLE' AND EXISTS (
       SELECT 1 FROM public.supervisory_policy_profile_binding
        WHERE profile_id = _profile_id AND component_type = _ct) THEN
    RAISE EXCEPTION 'binding_present: clear the bound % component before marking it not applicable', _ct
      USING ERRCODE = '22023'; END IF;

  INSERT INTO public.supervisory_policy_profile_requirement(profile_id, component_type, requirement, rationale, set_by)
  VALUES (_profile_id, _ct, _req, NULLIF(btrim(COALESCE(_payload->>'rationale','')),''), _uid)
  ON CONFLICT (profile_id, component_type) DO UPDATE SET
    requirement = EXCLUDED.requirement, rationale = EXCLUDED.rationale,
    set_by = EXCLUDED.set_by
  RETURNING id INTO _rid;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, actor_id, detail)
  VALUES (_profile_id, 'REQUIREMENT_SET', _p.status, _p.status, _uid,
          jsonb_build_object('component_type', _ct, 'requirement', _req));
  RETURN _rid;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_requirement_set(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_requirement_set(uuid, jsonb) TO authenticated, service_role;

-- --------------------------------------------------------------- readiness
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_readiness(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _components jsonb := '[]'::jsonb;
        _blockers text[] := ARRAY[]::text[]; _r record; _state text; _live jsonb; _detail text;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  FOR _r IN
    SELECT t.component_type, t.label, t.is_available, t.sort_order,
           COALESCE(rq.requirement, t.default_requirement) AS requirement,
           rq.rationale AS requirement_rationale,
           b.component_id, b.component_code, b.component_version,
           b.component_status AS bound_status, b.component_table, b.bound_at
      FROM public.supervisory_policy_component_type t
      LEFT JOIN public.supervisory_policy_profile_requirement rq
             ON rq.profile_id = _profile_id AND rq.component_type = t.component_type
      LEFT JOIN public.supervisory_policy_profile_binding b
             ON b.profile_id = _profile_id AND b.component_type = t.component_type
     ORDER BY t.sort_order
  LOOP
    _live := NULL; _detail := NULL;
    IF _r.component_id IS NOT NULL THEN
      BEGIN
        _live := public.supervisory_policy_component_probe(_r.component_type, _r.component_id);
      EXCEPTION WHEN OTHERS THEN _live := NULL;
      END;
    END IF;

    IF _r.requirement = 'NOT_APPLICABLE' THEN
      _state := 'NOT_APPLICABLE';
    ELSIF _r.component_id IS NULL THEN
      IF NOT _r.is_available THEN
        _state := CASE WHEN _r.requirement = 'REQUIRED' THEN 'BLOCKED_NOT_IMPLEMENTED' ELSE 'AWAITING_ARCHITECTURE' END;
        _detail := 'This policy component does not exist on the platform yet.';
      ELSE
        _state := CASE WHEN _r.requirement = 'REQUIRED' THEN 'MISSING' ELSE 'UNBOUND' END;
        _detail := 'No component version is bound.';
      END IF;
    ELSIF _live IS NULL THEN
      _state := 'INVALID';
      _detail := 'The bound component version can no longer be resolved.';
    ELSIF (_live->>'component_status') NOT IN ('APPROVED','ACTIVE') THEN
      _state := 'INVALID';
      _detail := 'The bound component version is now ' || (_live->>'component_status') || '.';
    ELSE
      _state := 'SATISFIED';
    END IF;

    IF _r.requirement = 'REQUIRED' AND _state <> 'SATISFIED' THEN
      _blockers := _blockers || (_r.label || ': ' || COALESCE(_detail, _state));
    END IF;

    _components := _components || jsonb_build_object(
      'component_type', _r.component_type, 'label', _r.label,
      'is_available', _r.is_available, 'requirement', _r.requirement,
      'requirement_rationale', _r.requirement_rationale,
      'state', _state, 'detail', _detail,
      'bound_component_id', _r.component_id, 'bound_component_code', _r.component_code,
      'bound_component_version', _r.component_version,
      'bound_component_table', _r.component_table,
      'bound_status_at_binding', _r.bound_status,
      'bound_status_now', _live->>'component_status',
      'bound_at', _r.bound_at);
  END LOOP;

  RETURN jsonb_build_object(
    'profile_id', _p.id, 'status', _p.status, 'origin', _p.origin,
    'is_ready_for_approval', array_length(_blockers,1) IS NULL,
    'blockers', to_jsonb(_blockers),
    'required_count', (SELECT count(*) FROM jsonb_array_elements(_components) c
                        WHERE c->>'requirement' = 'REQUIRED'),
    'satisfied_count', (SELECT count(*) FROM jsonb_array_elements(_components) c
                         WHERE c->>'requirement' = 'REQUIRED' AND c->>'state' = 'SATISFIED'),
    'components', _components);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_readiness(uuid) TO authenticated, service_role;

-- --------------------------------------------------------------- lifecycle
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_lifecycle(
  _profile_id uuid, _to_status text, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _row public.supervisory_policy_profile; _to text; _allowed boolean;
        _ready jsonb; _superseded int := 0;
BEGIN
  _to := upper(COALESCE(_to_status,''));
  SELECT * INTO _row FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;

  _uid := public.supervisory_policy_profile_require_manage(_profile_id);

  _allowed := CASE _row.status
    WHEN 'DRAFT'    THEN _to = 'REVIEW'
    WHEN 'REVIEW'   THEN _to IN ('APPROVED','DRAFT')
    WHEN 'APPROVED' THEN _to = 'ACTIVE'
    WHEN 'ACTIVE'   THEN _to = 'RETIRED'
    ELSE false END;
  IF NOT _allowed THEN
    RAISE EXCEPTION 'transition_not_permitted: % -> %', _row.status, _to USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','ACTIVE','RETIRED') AND length(btrim(COALESCE(_rationale,''))) < 10 THEN
    RAISE EXCEPTION 'a rationale of at least 10 characters is required' USING ERRCODE = '22023'; END IF;

  IF _to IN ('APPROVED','ACTIVE') AND _row.origin = 'MIPL_REFERENCE' THEN
    RAISE EXCEPTION 'reference_profile_not_adoptable_in_place: % % is a MIPL reference profile; a regulator must adopt it before it can be approved or activated',
      _row.code, _row.profile_version USING ERRCODE = '42501'; END IF;

  IF _to = 'APPROVED' THEN
    PERFORM public.supervisory_policy_profile_require_approval(_profile_id);
    IF _row.created_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the author of a policy profile version cannot approve it' USING ERRCODE = '42501'; END IF;
    IF _row.reviewed_by IS NOT NULL AND _row.reviewed_by = _uid THEN
      RAISE EXCEPTION 'not_authorized: the reviewer who submitted this version cannot also approve it' USING ERRCODE = '42501'; END IF;

    _ready := public.supervisory_policy_profile_readiness(_profile_id);
    IF NOT (_ready->>'is_ready_for_approval')::boolean THEN
      RAISE EXCEPTION 'approval_refused: required policy components are not satisfied: %',
        COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(_ready->'blockers')), '; '), 'unknown')
        USING ERRCODE = '22023'; END IF;
  END IF;

  IF _to = 'ACTIVE' THEN
    IF _row.approved_by IS NULL THEN
      RAISE EXCEPTION 'activation_refused: % % carries no recorded approval', _row.code, _row.profile_version
        USING ERRCODE = '42501'; END IF;

    UPDATE public.supervisory_policy_profile
       SET status = 'SUPERSEDED', superseded_at = now(),
           effective_to = COALESCE(effective_to, current_date), updated_at = now()
     WHERE domain_code = _row.domain_code
       AND COALESCE(regulator_id::text,'*') = COALESCE(_row.regulator_id::text,'*')
       AND COALESCE(sector_id::text,'*') = COALESCE(_row.sector_id::text,'*')
       AND status = 'ACTIVE' AND id <> _profile_id;
    GET DIAGNOSTICS _superseded = ROW_COUNT;
  END IF;

  UPDATE public.supervisory_policy_profile SET
    status = _to,
    reviewed_by  = CASE WHEN _to = 'REVIEW'   THEN _uid ELSE reviewed_by END,
    reviewed_at  = CASE WHEN _to = 'REVIEW'   THEN now() ELSE reviewed_at END,
    approved_by  = CASE WHEN _to = 'APPROVED' THEN _uid ELSE approved_by END,
    approved_at  = CASE WHEN _to = 'APPROVED' THEN now() ELSE approved_at END,
    activated_at = CASE WHEN _to = 'ACTIVE'   THEN now() ELSE activated_at END,
    retired_at   = CASE WHEN _to = 'RETIRED'  THEN now() ELSE retired_at END,
    effective_from = CASE WHEN _to = 'ACTIVE' THEN COALESCE(effective_from, current_date) ELSE effective_from END,
    effective_to = CASE WHEN _to = 'RETIRED' THEN COALESCE(effective_to, current_date) ELSE effective_to END
  WHERE id = _profile_id;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, from_status, to_status, rationale, actor_id, detail)
  VALUES (_profile_id, 'LIFECYCLE', _row.status, _to, NULLIF(btrim(COALESCE(_rationale,'')),''), _uid,
          jsonb_build_object('superseded_profiles', _superseded, 'readiness', _ready));

  PERFORM public.log_compliance_audit(
          CASE WHEN _to = 'APPROVED' THEN 'APPROVE' ELSE 'WORKFLOW_TRANSITION' END::compliance_audit_action,
          'supervisory_policy_profile', _profile_id::text,
          jsonb_build_object('status', _row.status), jsonb_build_object('status', _to),
          NULLIF(btrim(COALESCE(_rationale,'')),''), NULL, NULL, '{}'::jsonb);

  RETURN jsonb_build_object('id', _profile_id, 'status', _to, 'superseded_profiles', _superseded);
END $$;

REVOKE ALL ON FUNCTION public.supervisory_policy_profile_lifecycle(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_lifecycle(uuid, text, text) TO authenticated, service_role;