-- ============================================================
-- CHECKPOINT C — Small-regulator work model
-- Configuration + resolution only. No case state is duplicated and no existing
-- assignment path changes: `entity_supervision_assignments` remains canonical
-- for named relationship ownership.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.work_allocation_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid REFERENCES public.regulators(id) ON DELETE CASCADE,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE CASCADE,
  sector_id uuid,
  sub_sector_id uuid,
  service_id uuid,
  allocation_mode text NOT NULL DEFAULT 'HYBRID',
  named_relationship_policy text NOT NULL DEFAULT 'OPTIONAL',
  routing_mode text NOT NULL DEFAULT 'MANUAL',
  risk_trigger text,
  allow_multi_function_officers boolean NOT NULL DEFAULT true,
  require_independent_reviewer boolean NOT NULL DEFAULT true,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_allocation_policies_mode_chk
    CHECK (allocation_mode IN ('TEAM_POOL','PORTFOLIO','CASE_ONLY','NAMED_ENTITY','HYBRID')),
  CONSTRAINT work_allocation_policies_named_chk
    CHECK (named_relationship_policy IN ('NEVER','OPTIONAL','REQUIRED','RISK_BASED')),
  CONSTRAINT work_allocation_policies_routing_chk
    CHECK (routing_mode IN ('MANUAL','CLAIM_FROM_POOL','ROUND_ROBIN','LOAD_BALANCED','RULE_BASED')),
  CONSTRAINT work_allocation_policies_status_chk CHECK (status IN ('active','inactive'))
);

CREATE INDEX IF NOT EXISTS work_allocation_policies_lookup_idx
  ON public.work_allocation_policies (regulator_id, regulatory_function_id, status);

GRANT SELECT ON public.work_allocation_policies TO authenticated;
GRANT ALL ON public.work_allocation_policies TO service_role;
ALTER TABLE public.work_allocation_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_allocation_policies_read ON public.work_allocation_policies
  FOR SELECT TO authenticated
  USING (public.is_internal_staff(auth.uid()));

DROP TRIGGER IF EXISTS set_work_allocation_policies_updated_at ON public.work_allocation_policies;
CREATE TRIGGER set_work_allocation_policies_updated_at
  BEFORE UPDATE ON public.work_allocation_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Resolve the applicable policy (most specific active configuration wins).
CREATE OR REPLACE FUNCTION public.resolve_work_allocation_policy(
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
              'policy_id', p.id,
              'allocation_mode', p.allocation_mode,
              'named_relationship_policy', p.named_relationship_policy,
              'routing_mode', p.routing_mode,
              'risk_trigger', p.risk_trigger,
              'allow_multi_function_officers', p.allow_multi_function_officers,
              'require_independent_reviewer', p.require_independent_reviewer,
              'source', 'configured')
       FROM public.work_allocation_policies p
      WHERE p.status = 'active'
        AND p.effective_from <= now()
        AND (p.effective_to IS NULL OR p.effective_to > now())
        AND (p.regulator_id IS NULL OR p.regulator_id = _regulator_id)
        AND (p.regulatory_function_id IS NULL OR p.regulatory_function_id = _regulatory_function_id)
        AND (p.sector_id IS NULL OR p.sector_id = _sector_id)
        AND (p.sub_sector_id IS NULL OR p.sub_sector_id = _sub_sector_id)
        AND (p.service_id IS NULL OR p.service_id = _service_id)
      ORDER BY (p.service_id IS NOT NULL)::int DESC,
               (p.sub_sector_id IS NOT NULL)::int DESC,
               (p.sector_id IS NOT NULL)::int DESC,
               (p.regulatory_function_id IS NOT NULL)::int DESC,
               (p.regulator_id IS NOT NULL)::int DESC,
               p.effective_from DESC
      LIMIT 1),
    -- Default preserves today's behaviour: manual allocation, named ownership optional.
    jsonb_build_object('policy_id', NULL, 'allocation_mode', 'HYBRID',
      'named_relationship_policy', 'OPTIONAL', 'routing_mode', 'MANUAL',
      'risk_trigger', NULL, 'allow_multi_function_officers', true,
      'require_independent_reviewer', true, 'source', 'default'));
$$;

REVOKE ALL ON FUNCTION public.resolve_work_allocation_policy(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_work_allocation_policy(uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

-- Coverage test: may this officer take pooled work in this area under the policy?
-- Coverage is NOT authority: RBAC is checked independently by the module RPCs.
CREATE OR REPLACE FUNCTION public.work_allocation_can_take(
  _user_id uuid,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy jsonb;
  v_mode text;
  v_named text;
  v_team boolean := false;
  v_portfolio boolean := false;
  v_named_owner boolean := false;
  v_reasons jsonb := '[]'::jsonb;
  v_allowed boolean := false;
BEGIN
  IF _user_id IS NULL OR NOT public.is_internal_staff(_user_id) THEN
    RETURN jsonb_build_object('can_take', false, 'reasons',
      jsonb_build_array('actor_not_internal_staff'));
  END IF;

  v_policy := public.resolve_work_allocation_policy(_regulator_id, _regulatory_function_id,
                                                    _sector_id, _sub_sector_id, _service_id);
  v_mode := v_policy->>'allocation_mode';
  v_named := v_policy->>'named_relationship_policy';

  -- Team coverage via the officer's active team memberships and team mandates.
  SELECT EXISTS (
    SELECT 1
      FROM public.regulatory_team_members m
      JOIN public.regulatory_teams t ON t.id = m.team_id
     WHERE m.user_id = _user_id
       AND m.status = 'active'
       AND (m.effective_to IS NULL OR m.effective_to > now())
       AND t.status = 'active'
       AND (_regulator_id IS NULL OR t.regulator_id = _regulator_id)
       AND (_regulatory_function_id IS NULL
            OR t.regulatory_function_id IS NULL
            OR t.regulatory_function_id = _regulatory_function_id
            OR EXISTS (SELECT 1 FROM public.regulatory_team_mandates tm
                        JOIN public.regulator_mandates rm ON rm.id = tm.regulator_mandate_id
                       WHERE tm.team_id = t.id
                         AND (tm.effective_to IS NULL OR tm.effective_to > now())
                         AND rm.regulatory_function_id = _regulatory_function_id
                         AND rm.status = 'active'))
  ) INTO v_team;

  -- Portfolio coverage: sector / sub-sector / named entity scope.
  SELECT EXISTS (
    SELECT 1
      FROM public.staff_portfolios sp
      LEFT JOIN public.staff_portfolio_scopes ss ON ss.portfolio_id = sp.id
     WHERE sp.user_id = _user_id
       AND sp.status = 'active'
       AND (sp.effective_to IS NULL OR sp.effective_to > now())
       AND (_regulator_id IS NULL OR sp.regulator_id = _regulator_id)
       AND (_regulatory_function_id IS NULL OR sp.regulatory_function_id IS NULL
            OR sp.regulatory_function_id = _regulatory_function_id)
       AND (
         ss.id IS NULL
         OR (ss.entity_id IS NOT NULL AND ss.entity_id = _entity_id)
         OR (ss.sub_sector_id IS NOT NULL AND ss.sub_sector_id = _sub_sector_id)
         OR (ss.sector_id IS NOT NULL AND ss.sector_id = _sector_id)
       )
  ) INTO v_portfolio;

  -- Named entity supervision ownership (canonical register, unchanged).
  IF _entity_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.entity_supervision_assignments a
       WHERE a.entity_id = _entity_id
         AND a.status = 'active'
         AND (a.effective_to IS NULL OR a.effective_to > now())
         AND (a.lead_supervisor_user_id = _user_id
              OR a.alternate_supervisor_user_id = _user_id)
    ) INTO v_named_owner;
  END IF;

  v_allowed := CASE v_mode
    WHEN 'TEAM_POOL'   THEN v_team
    WHEN 'PORTFOLIO'   THEN v_portfolio
    WHEN 'NAMED_ENTITY' THEN v_named_owner
    WHEN 'CASE_ONLY'   THEN true          -- case assignment alone governs; module RPC decides
    ELSE (v_team OR v_portfolio OR v_named_owner)   -- HYBRID
  END;

  IF v_named = 'REQUIRED' AND _entity_id IS NOT NULL AND NOT v_named_owner THEN
    v_allowed := false;
    v_reasons := v_reasons || jsonb_build_array('named_relationship_required');
  END IF;

  IF NOT v_allowed AND v_reasons = '[]'::jsonb THEN
    v_reasons := v_reasons || jsonb_build_array('no_coverage_for_allocation_mode:' || v_mode);
  END IF;

  RETURN jsonb_build_object(
    'can_take', v_allowed,
    'allocation_mode', v_mode,
    'named_relationship_policy', v_named,
    'routing_mode', v_policy->>'routing_mode',
    'team_coverage', v_team,
    'portfolio_coverage', v_portfolio,
    'named_owner', v_named_owner,
    'policy_source', v_policy->>'source',
    'reasons', v_reasons,
    'note', 'coverage only — not a permission or decision authority');
END;
$$;

REVOKE ALL ON FUNCTION public.work_allocation_can_take(uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_allocation_can_take(uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.work_allocation_policy_upsert(
  _allocation_mode text,
  _named_relationship_policy text,
  _routing_mode text,
  _regulator_id uuid DEFAULT NULL,
  _regulatory_function_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _service_id uuid DEFAULT NULL,
  _risk_trigger text DEFAULT NULL,
  _allow_multi_function_officers boolean DEFAULT true,
  _require_independent_reviewer boolean DEFAULT true,
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
    RAISE EXCEPTION 'not_authorised: work allocation configuration requires role_management.manage_config';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.work_allocation_policies(regulator_id, regulatory_function_id, sector_id,
      sub_sector_id, service_id, allocation_mode, named_relationship_policy, routing_mode,
      risk_trigger, allow_multi_function_officers, require_independent_reviewer, notes, created_by)
    VALUES (_regulator_id, _regulatory_function_id, _sector_id, _sub_sector_id, _service_id,
      _allocation_mode, _named_relationship_policy, _routing_mode, _risk_trigger,
      _allow_multi_function_officers, _require_independent_reviewer, _notes, v_uid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.work_allocation_policies SET
      regulator_id = _regulator_id, regulatory_function_id = _regulatory_function_id,
      sector_id = _sector_id, sub_sector_id = _sub_sector_id, service_id = _service_id,
      allocation_mode = _allocation_mode, named_relationship_policy = _named_relationship_policy,
      routing_mode = _routing_mode, risk_trigger = _risk_trigger,
      allow_multi_function_officers = _allow_multi_function_officers,
      require_independent_reviewer = _require_independent_reviewer,
      notes = _notes, updated_at = now()
    WHERE id = _id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'policy_not_found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.work_allocation_policy_upsert(text,text,text,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.work_allocation_policy_upsert(text,text,text,uuid,uuid,uuid,uuid,uuid,text,boolean,boolean,text,uuid) TO authenticated, service_role;