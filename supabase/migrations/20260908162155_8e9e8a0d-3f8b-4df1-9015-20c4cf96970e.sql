-- Reference package binding rule: a MIPL reference profile may bind reference
-- content that stays DRAFT by design; regulator policy still requires approved
-- component versions.
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

  IF _p.origin = 'MIPL_REFERENCE' THEN
    IF (_probe->>'origin') <> 'MIPL_REFERENCE' THEN
      RAISE EXCEPTION 'reference_package_component: a MIPL reference package may only bind MIPL reference components'
        USING ERRCODE = '22023'; END IF;
  ELSIF (_probe->>'component_status') NOT IN ('APPROVED','ACTIVE') THEN
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

-- ---------------- MIPL AML/CFT reference policy profile (platform reference)
DO $$
DECLARE _pid uuid; _mid uuid;
BEGIN
  SELECT id INTO _mid FROM public.supervisory_methodology
   WHERE code = 'AML-CFT-RBA' AND version = '1.1' AND origin = 'MIPL_REFERENCE';
  IF _mid IS NULL THEN
    RAISE NOTICE 'AML-CFT-RBA v1.1 reference methodology absent; reference profile not seeded';
    RETURN;
  END IF;

  SELECT id INTO _pid FROM public.supervisory_policy_profile
   WHERE code = 'AML-CFT-POLICY' AND profile_version = '1.1';

  IF _pid IS NULL THEN
    INSERT INTO public.supervisory_policy_profile(
      code, profile_version, domain_code, regulator_id, name, title, purpose, status, origin, notes)
    VALUES ('AML-CFT-POLICY','1.1','AML_CFT', NULL,
            'AML/CFT supervisory policy package',
            'MIPL reference AML/CFT policy package v1.1',
            'The MIPL reference package a regulator adopts to obtain its own AML/CFT supervisory policy configuration. Reference content carries no regulator approval and no calibrated values.',
            'DRAFT','MIPL_REFERENCE',
            'Reference package. Adoption produces a regulator-owned policy profile bound to a regulator-adopted methodology.')
    RETURNING id INTO _pid;
  END IF;

  INSERT INTO public.supervisory_policy_profile_binding(
    profile_id, component_type, component_table, component_id, component_code,
    component_version, component_status, rationale)
  SELECT _pid, 'METHODOLOGY', 'supervisory_methodology', m.id, m.code, m.version, m.status,
         'MIPL reference methodology version carried by this reference package.'
    FROM public.supervisory_methodology m WHERE m.id = _mid
  ON CONFLICT (profile_id, component_type) DO UPDATE SET
    component_id = EXCLUDED.component_id, component_code = EXCLUDED.component_code,
    component_version = EXCLUDED.component_version, component_status = EXCLUDED.component_status,
    updated_at = now();

  INSERT INTO public.supervisory_policy_profile_event(profile_id, event_type, to_status, rationale, detail)
  SELECT _pid, 'REFERENCE_PACKAGE_REGISTERED', 'DRAFT',
         'MIPL reference AML/CFT policy package registered with its reference methodology binding.',
         jsonb_build_object('methodology_id', _mid, 'calculation_config', 'none approved; requirement remains unmet')
   WHERE NOT EXISTS (SELECT 1 FROM public.supervisory_policy_profile_event
                      WHERE profile_id = _pid AND event_type = 'REFERENCE_PACKAGE_REGISTERED');
END $$;