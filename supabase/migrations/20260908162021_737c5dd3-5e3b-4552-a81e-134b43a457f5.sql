-- =====================================================================
-- AML-01 continuation — Correction A (adoption orchestration)
--                     + Correction B (server-owned domain requirement floor)
-- Additive only. No object dropped, renamed or replaced.
-- =====================================================================

-- ---------------------------------------------- A. domain requirement floor
CREATE TABLE IF NOT EXISTS public.supervisory_policy_domain_component_requirement (
  domain_code             text NOT NULL,
  component_type          text NOT NULL REFERENCES public.supervisory_policy_component_type(component_type),
  requirement             text NOT NULL CHECK (requirement IN ('REQUIRED','OPTIONAL','NOT_APPLICABLE')),
  required_for_approval   boolean NOT NULL DEFAULT false,
  required_for_activation boolean NOT NULL DEFAULT false,
  is_locked               boolean NOT NULL DEFAULT true,
  rationale               text NOT NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (domain_code, component_type)
);

GRANT SELECT ON public.supervisory_policy_domain_component_requirement TO authenticated;
GRANT ALL    ON public.supervisory_policy_domain_component_requirement TO service_role;
ALTER TABLE public.supervisory_policy_domain_component_requirement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "domain component requirement floor readable by staff"
  ON public.supervisory_policy_domain_component_requirement;
CREATE POLICY "domain component requirement floor readable by staff"
  ON public.supervisory_policy_domain_component_requirement FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

-- the floor is platform architecture, not regulator policy: no authenticated write path
INSERT INTO public.supervisory_policy_domain_component_requirement
  (domain_code, component_type, requirement, required_for_approval, required_for_activation, is_locked, rationale)
VALUES
  ('AML_CFT','METHODOLOGY','REQUIRED',true,true,true,
   'An AML/CFT policy profile has no meaning without the exact methodology version it applies.'),
  ('AML_CFT','CALCULATION_CONFIG','REQUIRED',true,true,true,
   'AML/CFT risk ratings cannot be produced without an approved calculation policy version; the requirement is an architecture floor, not a scoring value.'),
  ('PRUDENTIAL','METHODOLOGY','REQUIRED',true,true,true,
   'A prudential policy profile must state the exact methodology version it applies.')
ON CONFLICT (domain_code, component_type) DO UPDATE SET
  requirement = EXCLUDED.requirement,
  required_for_approval = EXCLUDED.required_for_approval,
  required_for_activation = EXCLUDED.required_for_activation,
  is_locked = EXCLUDED.is_locked,
  rationale = EXCLUDED.rationale,
  updated_at = now();

-- ------------------------------------------- requirement resolution (server)
CREATE OR REPLACE FUNCTION public.supervisory_policy_requirement_strictness(_requirement text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE upper(COALESCE(_requirement,''))
           WHEN 'REQUIRED' THEN 3 WHEN 'OPTIONAL' THEN 2 WHEN 'NOT_APPLICABLE' THEN 1 ELSE 0 END;
$$;
REVOKE ALL ON FUNCTION public.supervisory_policy_requirement_strictness(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_requirement_strictness(text) TO authenticated, service_role;

-- DOMAIN MINIMUM + PROFILE-SPECIFIC -> EFFECTIVE (stricter wins; a locked floor cannot be relaxed)
CREATE OR REPLACE FUNCTION public.supervisory_policy_requirement_effective(
  _domain_code text, _component_type text, _profile_requirement text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE _f record; _t record; _prof text; _eff text; _locked boolean := false; _reason text;
BEGIN
  SELECT * INTO _t FROM public.supervisory_policy_component_type WHERE component_type = _component_type;
  IF _t.component_type IS NULL THEN
    RAISE EXCEPTION 'unknown_component_type: %', _component_type USING ERRCODE = '22023'; END IF;

  SELECT * INTO _f FROM public.supervisory_policy_domain_component_requirement
   WHERE domain_code = _domain_code AND component_type = _component_type;

  _prof := NULLIF(upper(btrim(COALESCE(_profile_requirement,''))),'');

  IF _f.component_type IS NULL THEN
    _eff := COALESCE(_prof, _t.default_requirement);
  ELSIF _f.is_locked THEN
    _eff := _f.requirement;
    _locked := true;
    _reason := _f.rationale;
  ELSE
    _eff := CASE WHEN public.supervisory_policy_requirement_strictness(COALESCE(_prof,_t.default_requirement))
                    >= public.supervisory_policy_requirement_strictness(_f.requirement)
                 THEN COALESCE(_prof,_t.default_requirement) ELSE _f.requirement END;
    _reason := _f.rationale;
  END IF;

  RETURN jsonb_build_object(
    'component_type', _component_type,
    'domain_requirement', _f.requirement,
    'domain_requirement_locked', _locked,
    'domain_requirement_reason', _reason,
    'profile_requirement', _prof,
    'effective_requirement', _eff,
    'required_for_approval', COALESCE(_f.required_for_approval, _eff = 'REQUIRED'),
    'required_for_activation', COALESCE(_f.required_for_activation, _eff = 'REQUIRED'),
    'is_editable', NOT _locked AND _t.is_available);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_policy_requirement_effective(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_requirement_effective(text, text, text) TO authenticated, service_role;

-- ------------------------------- requirement write now honours the floor
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_requirement_set(
  _profile_id uuid, _payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _p public.supervisory_policy_profile; _ct text; _req text; _t record; _rid uuid;
        _floor record;
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

  -- server-owned domain requirement floor: locked floors cannot be edited at all,
  -- unlocked floors can only be made stricter by a profile.
  SELECT * INTO _floor FROM public.supervisory_policy_domain_component_requirement
   WHERE domain_code = _p.domain_code AND component_type = _ct;
  IF _floor.component_type IS NOT NULL THEN
    IF _floor.is_locked AND _req <> _floor.requirement THEN
      RAISE EXCEPTION 'domain_requirement_locked: % is % for domain % by platform architecture and cannot be changed to % — %',
        _ct, _floor.requirement, _p.domain_code, _req, _floor.rationale USING ERRCODE = '42501'; END IF;
    IF NOT _floor.is_locked
       AND public.supervisory_policy_requirement_strictness(_req)
         < public.supervisory_policy_requirement_strictness(_floor.requirement) THEN
      RAISE EXCEPTION 'domain_requirement_floor: % may not be weakened below % for domain % — %',
        _ct, _floor.requirement, _p.domain_code, _floor.rationale USING ERRCODE = '42501'; END IF;
  END IF;

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
          jsonb_build_object('component_type', _ct, 'requirement', _req,
                             'effective', public.supervisory_policy_requirement_effective(_p.domain_code, _ct, _req)));
  RETURN _rid;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_requirement_set(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_requirement_set(uuid, jsonb) TO authenticated, service_role;

-- ------------------------- readiness now uses the effective server requirement
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_readiness(_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.supervisory_policy_profile; _components jsonb := '[]'::jsonb;
        _blockers text[] := ARRAY[]::text[]; _act_blockers text[] := ARRAY[]::text[];
        _r record; _state text; _live jsonb; _detail text; _eff jsonb; _req text;
BEGIN
  SELECT * INTO _p FROM public.supervisory_policy_profile WHERE id = _profile_id;
  IF _p.id IS NULL THEN RAISE EXCEPTION 'not_found: policy profile' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_methodology_regulator_scope_readable(_p.domain_code, _p.regulator_id) THEN
    RAISE EXCEPTION 'not_authorized: this policy profile is outside your supervisory scope' USING ERRCODE = '42501'; END IF;

  FOR _r IN
    SELECT t.component_type, t.label, t.is_available, t.sort_order,
           rq.requirement AS profile_requirement, rq.rationale AS requirement_rationale,
           b.component_id, b.component_code, b.component_version,
           b.component_status AS bound_status, b.component_table, b.bound_at
      FROM public.supervisory_policy_component_type t
      LEFT JOIN public.supervisory_policy_profile_requirement rq
             ON rq.profile_id = _profile_id AND rq.component_type = t.component_type
      LEFT JOIN public.supervisory_policy_profile_binding b
             ON b.profile_id = _profile_id AND b.component_type = t.component_type
     ORDER BY t.sort_order
  LOOP
    _eff := public.supervisory_policy_requirement_effective(_p.domain_code, _r.component_type, _r.profile_requirement);
    _req := _eff->>'effective_requirement';
    _live := NULL; _detail := NULL;

    IF _r.component_id IS NOT NULL THEN
      BEGIN
        _live := public.supervisory_policy_component_probe(_r.component_type, _r.component_id);
      EXCEPTION WHEN OTHERS THEN _live := NULL;
      END;
    END IF;

    IF _req = 'NOT_APPLICABLE' THEN
      _state := 'NOT_APPLICABLE';
    ELSIF _r.component_id IS NULL THEN
      IF NOT _r.is_available THEN
        _state := CASE WHEN _req = 'REQUIRED' THEN 'BLOCKED_NOT_IMPLEMENTED' ELSE 'AWAITING_ARCHITECTURE' END;
        _detail := 'This policy component does not exist on the platform yet.';
      ELSE
        _state := CASE WHEN _req = 'REQUIRED' THEN 'MISSING' ELSE 'UNBOUND' END;
        _detail := 'No component version is bound.';
      END IF;
    ELSIF _live IS NULL THEN
      _state := 'INVALID';
      _detail := 'The bound component version can no longer be resolved.';
    ELSIF (_live->>'component_status') IN ('DRAFT','REVIEW') THEN
      _state := 'PENDING_COMPONENT_APPROVAL';
      _detail := 'The bound component version is ' || (_live->>'component_status')
                 || ' and must be approved through its own governance before this profile can be approved.';
    ELSIF (_live->>'component_status') NOT IN ('APPROVED','ACTIVE') THEN
      _state := 'INVALID';
      _detail := 'The bound component version is now ' || (_live->>'component_status') || '.';
    ELSE
      _state := 'SATISFIED';
    END IF;

    IF _state <> 'SATISFIED' THEN
      IF (_eff->>'required_for_approval')::boolean AND _req = 'REQUIRED' THEN
        _blockers := _blockers || (_r.label || ': ' || COALESCE(_detail, _state));
      END IF;
      IF (_eff->>'required_for_activation')::boolean AND _req = 'REQUIRED' THEN
        _act_blockers := _act_blockers || (_r.label || ': ' || COALESCE(_detail, _state));
      END IF;
    END IF;

    _components := _components || jsonb_build_object(
      'component_type', _r.component_type, 'label', _r.label,
      'is_available', _r.is_available,
      'requirement', _req,
      'profile_requirement', _r.profile_requirement,
      'domain_requirement', _eff->>'domain_requirement',
      'domain_requirement_locked', (_eff->>'domain_requirement_locked')::boolean,
      'domain_requirement_reason', _eff->>'domain_requirement_reason',
      'requirement_editable', (_eff->>'is_editable')::boolean,
      'required_for_approval', (_eff->>'required_for_approval')::boolean,
      'required_for_activation', (_eff->>'required_for_activation')::boolean,
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
    'is_ready_for_activation', array_length(_act_blockers,1) IS NULL,
    'blockers', to_jsonb(_blockers),
    'activation_blockers', to_jsonb(_act_blockers),
    'required_count', (SELECT count(*) FROM jsonb_array_elements(_components) c
                        WHERE c->>'requirement' = 'REQUIRED'),
    'satisfied_count', (SELECT count(*) FROM jsonb_array_elements(_components) c
                         WHERE c->>'requirement' = 'REQUIRED' AND c->>'state' = 'SATISFIED'),
    'components', _components);
END $$;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_readiness(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_readiness(uuid) TO authenticated, service_role;

-- ---------------- activation must use the same effective requirement contract
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

    _ready := public.supervisory_policy_profile_readiness(_profile_id);
    IF NOT (_ready->>'is_ready_for_activation')::boolean THEN
      RAISE EXCEPTION 'activation_refused: required policy components are not satisfied: %',
        COALESCE(array_to_string(ARRAY(SELECT jsonb_array_elements_text(_ready->'activation_blockers')), '; '), 'unknown')
        USING ERRCODE = '22023'; END IF;

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

-- ------------- B. adoption orchestrates the existing component adoption path
CREATE OR REPLACE FUNCTION public.supervisory_policy_profile_adopt_reference(
  _reference_profile_id uuid, _regulator_id uuid, _rationale text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid; _src public.supervisory_policy_profile; _new_id uuid; _regcode text; _ver text;
        _b record; _probe jsonb; _adopted_id uuid; _adopted jsonb; _adoptions jsonb := '[]'::jsonb;
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

  -- Each reference component binding is adopted through that component's own
  -- governed adoption operation. No MIPL reference component is ever bound into
  -- regulator policy, and no adoption logic is duplicated here. The whole
  -- function is one transaction: any failure below leaves no adopted profile.
  FOR _b IN SELECT * FROM public.supervisory_policy_profile_binding WHERE profile_id = _src.id
  LOOP
    _probe := public.supervisory_policy_component_probe(_b.component_type, _b.component_id);

    IF _b.component_type = 'METHODOLOGY' THEN
      IF (_probe->>'origin') = 'MIPL_REFERENCE' THEN
        -- reuse the canonical governed methodology reference adoption
        _adopted_id := public.supervisory_methodology_adopt_reference(_b.component_id, _regulator_id, btrim(_rationale));
      ELSE
        _adopted_id := _b.component_id;
      END IF;
      _adopted := public.supervisory_policy_component_probe(_b.component_type, _adopted_id);

      IF (_adopted->>'origin') = 'MIPL_REFERENCE' THEN
        RAISE EXCEPTION 'adoption_integrity: a MIPL reference methodology cannot be bound as regulator policy'
          USING ERRCODE = '42501'; END IF;
      IF (_adopted->>'regulator_id') IS DISTINCT FROM _regulator_id::text THEN
        RAISE EXCEPTION 'adoption_integrity: the adopted methodology does not belong to the adopting regulator'
          USING ERRCODE = '42501'; END IF;

      INSERT INTO public.supervisory_policy_profile_binding(
        profile_id, component_type, component_table, component_id, component_code,
        component_version, component_status, rationale, bound_by)
      VALUES (_new_id, _b.component_type, _adopted->>'component_table', _adopted_id,
              _adopted->>'component_code', _adopted->>'component_version',
              _adopted->>'component_status',
              'Bound by governed policy profile adoption of ' || _src.code || ' ' || _src.profile_version, _uid);

      _adoptions := _adoptions || jsonb_build_object(
        'component_type', _b.component_type, 'reference_component', _probe, 'adopted_component', _adopted);

      INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
      VALUES (_new_id, 'COMPONENT_ADOPTED', 'DRAFT', btrim(_rationale), _uid,
              jsonb_build_object('component_type', _b.component_type,
                                 'reference_component', _probe, 'adopted_component', _adopted,
                                 'via', 'supervisory_methodology_adopt_reference'));
    ELSE
      RAISE EXCEPTION 'component_adoption_not_implemented: % has no governed adoption operation yet; the reference profile must not bind it',
        _b.component_type USING ERRCODE = '22023';
    END IF;
  END LOOP;

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, actor_id, detail)
  VALUES (_new_id, 'ADOPTED', 'DRAFT', btrim(_rationale), _uid,
          jsonb_build_object('adopted_from', _src.id, 'reference_version', _src.profile_version,
                             'regulator_id', _regulator_id, 'component_adoptions', _adoptions));

  PERFORM public.log_compliance_audit('CREATE'::compliance_audit_action, 'supervisory_policy_profile', _new_id::text,
          NULL, jsonb_build_object('adopted_from', _src.id, 'profile_version', _ver,
                                   'regulator_id', _regulator_id, 'component_adoptions', _adoptions),
          btrim(_rationale), NULL, NULL, '{}'::jsonb);
  RETURN _new_id;
END $$;
REVOKE ALL ON FUNCTION public.supervisory_policy_profile_adopt_reference(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supervisory_policy_profile_adopt_reference(uuid, uuid, text) TO authenticated, service_role;