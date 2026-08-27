-- ============================================================
-- CHECKPOINT B — Generic Regulatory Authority & Decision Authority
-- Additive only. Default enforcement mode is OBSERVE_ONLY, so no existing
-- decision path changes behaviour on deploy.
-- ============================================================

-- 1. Generic hierarchical, effective-dated operating scope.
--    Deliberately generic: no country/island/department specific columns.
CREATE TABLE IF NOT EXISTS public.regulator_operating_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid NOT NULL REFERENCES public.regulators(id) ON DELETE CASCADE,
  parent_scope_id uuid REFERENCES public.regulator_operating_scopes(id) ON DELETE SET NULL,
  scope_type text NOT NULL,                -- configured concept key (e.g. jurisdiction, operating_unit)
  code text NOT NULL,
  name text NOT NULL,
  description text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT regulator_operating_scopes_status_chk CHECK (status IN ('active','inactive')),
  CONSTRAINT regulator_operating_scopes_code_uk UNIQUE (regulator_id, scope_type, code)
);

GRANT SELECT ON public.regulator_operating_scopes TO authenticated;
GRANT ALL ON public.regulator_operating_scopes TO service_role;
ALTER TABLE public.regulator_operating_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY regulator_operating_scopes_read ON public.regulator_operating_scopes
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- 2. Canonical decision authority rules (server-side governance of final outcomes).
CREATE TABLE IF NOT EXISTS public.decision_authority_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE CASCADE,
  operating_scope_id uuid REFERENCES public.regulator_operating_scopes(id) ON DELETE SET NULL,
  decision_type text NOT NULL,
  sector_id uuid,
  sub_sector_id uuid,
  service_id uuid,
  required_module_key text,
  required_permission_key text,
  requires_maker_checker boolean NOT NULL DEFAULT true,
  requires_committee boolean NOT NULL DEFAULT false,
  committee_kind text,
  minimum_quorum integer,
  requires_conflict_clearance boolean NOT NULL DEFAULT true,
  allow_delegation boolean NOT NULL DEFAULT true,
  enforcement_mode text NOT NULL DEFAULT 'OBSERVE_ONLY',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_authority_rules_mode_chk
    CHECK (enforcement_mode IN ('OFF','OBSERVE_ONLY','ENFORCED')),
  CONSTRAINT decision_authority_rules_status_chk CHECK (status IN ('active','inactive')),
  CONSTRAINT decision_authority_rules_quorum_chk
    CHECK (minimum_quorum IS NULL OR minimum_quorum > 0)
);

CREATE INDEX IF NOT EXISTS decision_authority_rules_lookup_idx
  ON public.decision_authority_rules (decision_type, regulator_id, regulatory_function_id, status);

GRANT SELECT ON public.decision_authority_rules TO authenticated;
GRANT ALL ON public.decision_authority_rules TO service_role;
ALTER TABLE public.decision_authority_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_authority_rules_read ON public.decision_authority_rules
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

-- 3. Append-only observation register (evidence for OBSERVE_ONLY → ENFORCED).
CREATE TABLE IF NOT EXISTS public.decision_authority_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES public.decision_authority_rules(id) ON DELETE SET NULL,
  actor_id uuid,
  decision_type text NOT NULL,
  regulator_id uuid,
  regulatory_function_id uuid,
  entity_id uuid,
  subject_reference text,
  evaluated_mode text NOT NULL,
  would_allow boolean NOT NULL,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS decision_authority_observations_recent_idx
  ON public.decision_authority_observations (created_at DESC);

GRANT SELECT ON public.decision_authority_observations TO authenticated;
GRANT ALL ON public.decision_authority_observations TO service_role;
ALTER TABLE public.decision_authority_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY decision_authority_observations_read ON public.decision_authority_observations
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit_logs', 'view')
         OR public.has_role(auth.uid(), 'super_admin'::public.app_role));

-- 4. updated_at triggers (reuse canonical helper).
DROP TRIGGER IF EXISTS set_regulator_operating_scopes_updated_at ON public.regulator_operating_scopes;
CREATE TRIGGER set_regulator_operating_scopes_updated_at
  BEFORE UPDATE ON public.regulator_operating_scopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS set_decision_authority_rules_updated_at ON public.decision_authority_rules;
CREATE TRIGGER set_decision_authority_rules_updated_at
  BEFORE UPDATE ON public.decision_authority_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Resolver: subject + function + service + date -> applicable authority.
CREATE OR REPLACE FUNCTION public.resolve_decision_authority(
  _actor_id uuid,
  _decision_type text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _subject_reference text DEFAULT NULL,
  _record boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.decision_authority_rules;
  v_reasons jsonb := '[]'::jsonb;
  v_allow boolean := true;
  v_mode text := 'OFF';
  v_mandate_ok boolean;
BEGIN
  IF _decision_type IS NULL OR btrim(_decision_type) = '' THEN
    RETURN jsonb_build_object('allowed', false, 'mode', 'OFF',
      'reasons', jsonb_build_array('decision_type_required'));
  END IF;

  -- Most specific active rule wins: sector/sub-sector/service beat wildcards.
  SELECT * INTO v_rule
    FROM public.decision_authority_rules r
   WHERE r.status = 'active'
     AND r.decision_type = _decision_type
     AND (r.effective_from <= now())
     AND (r.effective_to IS NULL OR r.effective_to > now())
     AND (r.regulator_id IS NULL OR r.regulator_id = _regulator_id)
     AND (r.regulatory_function_id IS NULL OR r.regulatory_function_id = _regulatory_function_id)
     AND (r.sector_id IS NULL OR r.sector_id = _sector_id)
     AND (r.sub_sector_id IS NULL OR r.sub_sector_id = _sub_sector_id)
     AND (r.service_id IS NULL OR r.service_id = _service_id)
   ORDER BY (r.service_id IS NOT NULL)::int DESC,
            (r.sub_sector_id IS NOT NULL)::int DESC,
            (r.sector_id IS NOT NULL)::int DESC,
            (r.regulatory_function_id IS NOT NULL)::int DESC,
            (r.regulator_id IS NOT NULL)::int DESC,
            r.effective_from DESC
   LIMIT 1;

  IF v_rule.id IS NULL THEN
    -- No configured authority: preserve existing behaviour, flag for review.
    v_reasons := jsonb_build_array('no_rule_configured', 'REQUIRES_REVIEW');
    IF _record THEN
      INSERT INTO public.decision_authority_observations(
        rule_id, actor_id, decision_type, regulator_id, regulatory_function_id,
        entity_id, subject_reference, evaluated_mode, would_allow, reasons, context)
      VALUES (NULL, _actor_id, _decision_type, _regulator_id, _regulatory_function_id,
        _entity_id, _subject_reference, 'OFF', true, v_reasons,
        jsonb_build_object('sector_id', _sector_id, 'sub_sector_id', _sub_sector_id,
                           'service_id', _service_id));
    END IF;
    RETURN jsonb_build_object('allowed', true, 'mode', 'OFF', 'rule_id', NULL,
      'requires_review', true, 'reasons', v_reasons);
  END IF;

  v_mode := v_rule.enforcement_mode;

  -- RBAC never widened here: the rule can only require additional permission.
  IF v_rule.required_module_key IS NOT NULL AND v_rule.required_permission_key IS NOT NULL THEN
    IF NOT public.has_permission(_actor_id, v_rule.required_module_key, v_rule.required_permission_key) THEN
      v_allow := false;
      v_reasons := v_reasons || jsonb_build_array('missing_permission:' ||
        v_rule.required_module_key || '.' || v_rule.required_permission_key);
    END IF;
  END IF;

  -- Mandate must cover the function/sector for the resolving authority.
  IF _regulator_id IS NOT NULL AND v_rule.regulatory_function_id IS NOT NULL THEN
    SELECT public.regulator_mandate_supports(_regulator_id, v_rule.regulatory_function_id,
                                             _sector_id, _sub_sector_id)
      INTO v_mandate_ok;
    IF v_mandate_ok IS DISTINCT FROM true THEN
      v_allow := false;
      v_reasons := v_reasons || jsonb_build_array('mandate_not_applicable');
    END IF;
  END IF;

  IF _actor_id IS NULL OR NOT public.is_internal_staff(_actor_id) THEN
    v_allow := false;
    v_reasons := v_reasons || jsonb_build_array('actor_not_internal_staff');
  END IF;

  IF _record THEN
    INSERT INTO public.decision_authority_observations(
      rule_id, actor_id, decision_type, regulator_id, regulatory_function_id,
      entity_id, subject_reference, evaluated_mode, would_allow, reasons, context)
    VALUES (v_rule.id, _actor_id, _decision_type, _regulator_id, v_rule.regulatory_function_id,
      _entity_id, _subject_reference, v_mode, v_allow, v_reasons,
      jsonb_build_object('sector_id', _sector_id, 'sub_sector_id', _sub_sector_id,
                         'service_id', _service_id));
  END IF;

  RETURN jsonb_build_object(
    'allowed', CASE WHEN v_mode = 'ENFORCED' THEN v_allow ELSE true END,
    'would_allow', v_allow,
    'mode', v_mode,
    'rule_id', v_rule.id,
    'requires_maker_checker', v_rule.requires_maker_checker,
    'requires_committee', v_rule.requires_committee,
    'committee_kind', v_rule.committee_kind,
    'minimum_quorum', v_rule.minimum_quorum,
    'requires_conflict_clearance', v_rule.requires_conflict_clearance,
    'allow_delegation', v_rule.allow_delegation,
    'reasons', v_reasons);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_decision_authority(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_decision_authority(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,boolean) TO authenticated, service_role;

-- 6. Governed configuration RPCs (no direct DML from the browser).
CREATE OR REPLACE FUNCTION public.decision_authority_rule_upsert(
  _decision_type text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _required_module_key text DEFAULT NULL,
  _required_permission_key text DEFAULT NULL,
  _requires_maker_checker boolean DEFAULT true,
  _requires_committee boolean DEFAULT false,
  _committee_kind text DEFAULT NULL,
  _minimum_quorum integer DEFAULT NULL,
  _requires_conflict_clearance boolean DEFAULT true,
  _allow_delegation boolean DEFAULT true,
  _enforcement_mode text DEFAULT 'OBSERVE_ONLY',
  _notes text DEFAULT NULL,
  _id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_permission(v_uid, 'role_management', 'manage_config')
          OR public.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorised: decision authority configuration requires role_management.manage_config';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.decision_authority_rules(
      regulator_id, regulatory_function_id, decision_type, sector_id, sub_sector_id,
      service_id, required_module_key, required_permission_key, requires_maker_checker,
      requires_committee, committee_kind, minimum_quorum, requires_conflict_clearance,
      allow_delegation, enforcement_mode, notes, created_by)
    VALUES (_regulator_id, _regulatory_function_id, _decision_type, _sector_id, _sub_sector_id,
      _service_id, _required_module_key, _required_permission_key, _requires_maker_checker,
      _requires_committee, _committee_kind, _minimum_quorum, _requires_conflict_clearance,
      _allow_delegation, _enforcement_mode, _notes, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.decision_authority_rules SET
      regulator_id = _regulator_id,
      regulatory_function_id = _regulatory_function_id,
      decision_type = _decision_type,
      sector_id = _sector_id,
      sub_sector_id = _sub_sector_id,
      service_id = _service_id,
      required_module_key = _required_module_key,
      required_permission_key = _required_permission_key,
      requires_maker_checker = _requires_maker_checker,
      requires_committee = _requires_committee,
      committee_kind = _committee_kind,
      minimum_quorum = _minimum_quorum,
      requires_conflict_clearance = _requires_conflict_clearance,
      allow_delegation = _allow_delegation,
      enforcement_mode = _enforcement_mode,
      notes = _notes,
      updated_at = now()
    WHERE id = _id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'rule_not_found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.decision_authority_rule_upsert(text,uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean,text,integer,boolean,boolean,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decision_authority_rule_upsert(text,uuid,uuid,uuid,uuid,uuid,text,text,boolean,boolean,text,integer,boolean,boolean,text,text,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.regulator_operating_scope_upsert(
  _regulator_id uuid,
  _scope_type text,
  _code text,
  _name text,
  _parent_scope_id uuid DEFAULT NULL,
  _description text DEFAULT NULL,
  _effective_from timestamptz DEFAULT now(),
  _effective_to timestamptz DEFAULT NULL,
  _status text DEFAULT 'active',
  _id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.has_permission(v_uid, 'role_management', 'manage_config')
          OR public.has_role(v_uid, 'super_admin'::public.app_role)) THEN
    RAISE EXCEPTION 'not_authorised: operating scope configuration requires role_management.manage_config';
  END IF;

  IF _parent_scope_id IS NOT NULL AND _parent_scope_id = _id THEN
    RAISE EXCEPTION 'invalid_parent: a scope cannot be its own parent';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.regulator_operating_scopes(
      regulator_id, parent_scope_id, scope_type, code, name, description,
      effective_from, effective_to, status, created_by)
    VALUES (_regulator_id, _parent_scope_id, _scope_type, _code, _name, _description,
      _effective_from, _effective_to, _status, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.regulator_operating_scopes SET
      regulator_id = _regulator_id, parent_scope_id = _parent_scope_id,
      scope_type = _scope_type, code = _code, name = _name, description = _description,
      effective_from = _effective_from, effective_to = _effective_to,
      status = _status, updated_at = now()
    WHERE id = _id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'scope_not_found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.regulator_operating_scope_upsert(uuid,text,text,text,uuid,text,timestamptz,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.regulator_operating_scope_upsert(uuid,text,text,text,uuid,text,timestamptz,timestamptz,text,uuid) TO authenticated, service_role;