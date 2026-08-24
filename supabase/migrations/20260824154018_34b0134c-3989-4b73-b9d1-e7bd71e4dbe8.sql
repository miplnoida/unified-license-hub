-- ============================================================================
-- REGULATORY OPERATING STRUCTURE · Phase 2.1 closure gate
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Governed lead/alternate eligibility configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regulatory_function_assignment_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulatory_function_id uuid NOT NULL
    REFERENCES public.regulatory_functions(id) ON DELETE CASCADE,
  assignment_role_type text NOT NULL
    CHECK (assignment_role_type IN ('LEAD_SUPERVISOR','ALTERNATE_SUPERVISOR')),
  required_module_key text,
  required_permission_key text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','configuration_required','retired')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rfar_active_needs_permission CHECK (
    status <> 'active'
    OR (required_module_key IS NOT NULL AND required_permission_key IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS rfar_unique_current
  ON public.regulatory_function_assignment_requirements
     (regulatory_function_id, assignment_role_type)
  WHERE status <> 'retired';

GRANT SELECT ON public.regulatory_function_assignment_requirements TO authenticated;
GRANT ALL ON public.regulatory_function_assignment_requirements TO service_role;

ALTER TABLE public.regulatory_function_assignment_requirements
  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rfar_read ON public.regulatory_function_assignment_requirements;
CREATE POLICY rfar_read ON public.regulatory_function_assignment_requirements
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'security_management', 'view')
    OR public.has_permission(auth.uid(), 'role_management', 'view')
    OR public.has_permission(auth.uid(), 'user_management', 'view')
    OR public.has_permission(auth.uid(), 'licensee_management', 'view')
  );
-- deliberately NO write policy: canonical writes go through service_role only.

CREATE OR REPLACE FUNCTION public.rfar_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_rfar_touch ON public.regulatory_function_assignment_requirements;
CREATE TRIGGER trg_rfar_touch
  BEFORE UPDATE ON public.regulatory_function_assignment_requirements
  FOR EACH ROW EXECUTE FUNCTION public.rfar_touch_updated_at();

-- Seed: deterministic ONLY. A function whose canonical module publishes an
-- `edit` permission gets a draft requirement recording that permission. Any
-- other function is recorded as configuration_required — no regulator policy
-- is invented, and nothing is activated, so current behaviour is preserved.
INSERT INTO public.regulatory_function_assignment_requirements
  (regulatory_function_id, assignment_role_type, required_module_key,
   required_permission_key, status, notes)
SELECT rf.id, rt.role_type,
       CASE WHEN e.has_edit THEN lower(rf.module_key) END,
       CASE WHEN e.has_edit THEN 'edit' END,
       CASE WHEN e.has_edit THEN 'draft' ELSE 'configuration_required' END,
       CASE WHEN e.has_edit
            THEN 'Derived deterministically from the canonical module edit permission. Not enforced until status = active.'
            ELSE 'ASSIGNMENT_ELIGIBILITY_CONFIGURATION_REQUIRED: this module publishes no canonical edit permission; the minimum operational permission must be decided by the regulator.'
       END
FROM public.regulatory_functions rf
CROSS JOIN (VALUES ('LEAD_SUPERVISOR'),('ALTERNATE_SUPERVISOR')) AS rt(role_type)
CROSS JOIN LATERAL (
  SELECT EXISTS (
    SELECT 1 FROM public.sec_permissions p
    JOIN public.sec_modules m ON m.id = p.module_id
    WHERE lower(m.key) = lower(rf.module_key) AND p.key = 'edit'
  ) AS has_edit
) e
WHERE rf.status = 'active' AND rf.module_key IS NOT NULL
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Eligibility helpers
-- ---------------------------------------------------------------------------

-- Real, active, internal regulator staff identity.
CREATE OR REPLACE FUNCTION public.regulatory_staff_identity_ok(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id = _user_id
         AND COALESCE(p.status,'active') = 'active'
         AND p.licensee_id IS NULL
     )
     AND public.is_internal_staff(_user_id);
$$;

-- Governed eligibility: compatibility until a requirement is activated.
CREATE OR REPLACE FUNCTION public.user_meets_assignment_eligibility(
  _user_id uuid, _function_id uuid, _role_type text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE fn record; req record;
BEGIN
  IF _user_id IS NULL OR _function_id IS NULL THEN RETURN false; END IF;
  SELECT * INTO fn FROM public.regulatory_functions
   WHERE id = _function_id AND status = 'active';
  IF fn IS NULL THEN RETURN false; END IF;

  SELECT * INTO req FROM public.regulatory_function_assignment_requirements r
   WHERE r.regulatory_function_id = _function_id
     AND r.assignment_role_type = _role_type
     AND r.status = 'active'
     AND r.effective_from <= now()
     AND (r.effective_to IS NULL OR r.effective_to > now())
   ORDER BY r.effective_from DESC LIMIT 1;

  IF req IS NULL THEN
    -- no activated requirement: preserve certified behaviour
    RETURN fn.module_key IS NULL
        OR public.has_permission(_user_id, fn.module_key, 'view');
  END IF;

  RETURN public.has_permission(_user_id,
           COALESCE(req.required_module_key, fn.module_key),
           COALESCE(req.required_permission_key, 'view'));
END;
$$;

CREATE OR REPLACE FUNCTION public.regulatory_team_membership_active(
  _user_id uuid, _team_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _team_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.regulatory_team_members tm
    WHERE tm.team_id = _team_id AND tm.user_id = _user_id
      AND tm.status = 'active'
      AND tm.effective_from <= now()
      AND (tm.effective_to IS NULL OR tm.effective_to > now())
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Composite scope check with an explicit regulatory-function override
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regulatory_scope_allows(
  _user_id uuid, _module text, _action text,
  _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid,
  _entity_id uuid, _owner_id uuid, _function_override uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g jsonb; fn uuid; scope jsonb;
  e_sector uuid; e_sub uuid; e_reg uuid;
  role_ok boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  -- 1. canonical RBAC permission
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;

  -- the narrowing layers are evaluated against the TARGET regulatory function
  fn := COALESCE(_function_override, public.regulatory_function_for_module(_module));

  -- 2. record scope derived server-side; fail closed on conflict
  IF _entity_id IS NOT NULL THEN
    scope := public.entity_regulatory_scope(_entity_id);
    IF scope IS NULL THEN RETURN false; END IF;
    e_sector := NULLIF(scope ->> 'sector_id','')::uuid;
    e_sub := NULLIF(scope ->> 'sub_sector_id','')::uuid;
    e_reg := NULLIF(scope ->> 'regulator_id','')::uuid;

    IF _sector_id IS NOT NULL AND e_sector IS NOT NULL AND _sector_id <> e_sector THEN RETURN false; END IF;
    IF _sub_sector_id IS NOT NULL AND e_sub IS NOT NULL AND _sub_sector_id <> e_sub THEN RETURN false; END IF;
    IF _regulator_id IS NOT NULL AND e_reg IS NOT NULL AND _regulator_id <> e_reg THEN RETURN false; END IF;

    _sector_id := COALESCE(e_sector, _sector_id);
    _sub_sector_id := COALESCE(e_sub, _sub_sector_id);
    _regulator_id := COALESCE(e_reg, _regulator_id);
  END IF;

  IF _sector_id IS NULL AND _sub_sector_id IS NOT NULL THEN
    SELECT ss.sector_id INTO _sector_id FROM public.sub_sectors ss WHERE ss.id = _sub_sector_id;
  END IF;
  IF _regulator_id IS NULL AND _sector_id IS NOT NULL THEN
    SELECT s.regulator_id INTO _regulator_id FROM public.sectors s WHERE s.id = _sector_id;
  END IF;

  -- 3. role grant scope (independent grants)
  g := public.user_scope_grants_for(_user_id, _module, _action);
  IF NOT COALESCE((g ->> 'qualified')::boolean, false) THEN RETURN false; END IF;

  role_ok :=
    COALESCE((g ->> 'all')::boolean, false)
    OR (_regulator_id IS NOT NULL AND (g -> 'regulators') @> to_jsonb(_regulator_id))
    OR (_sector_id IS NOT NULL AND (g -> 'sectors') @> to_jsonb(_sector_id))
    OR (_sub_sector_id IS NOT NULL AND (g -> 'sub_sectors') @> to_jsonb(_sub_sector_id))
    OR (_entity_id IS NOT NULL AND (g -> 'institutions') @> to_jsonb(_entity_id))
    OR (COALESCE((g ->> 'own')::boolean, false) AND _owner_id IS NOT NULL AND _owner_id = _user_id)
    OR (COALESCE((g ->> 'assigned')::boolean, false) AND _entity_id IS NOT NULL
        AND public.user_has_entity_assignment(_user_id, _entity_id, fn))
    OR (COALESCE((g ->> 'team')::boolean, false) AND _entity_id IS NOT NULL
        AND public.user_team_covers_entity(_user_id, _entity_id, fn));

  IF NOT role_ok THEN RETURN false; END IF;

  -- 4. portfolio narrowing (target-function aware)
  IF NOT public.staff_portfolio_allows(_user_id, _regulator_id, fn,
        _sector_id, _sub_sector_id, _entity_id) THEN
    RETURN false;
  END IF;

  -- 5. mandate narrowing for regulator + TARGET function
  IF NOT public.regulator_mandate_supports(_regulator_id, fn, _sector_id, _sub_sector_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.regulatory_scope_allows(
  _user_id uuid, _module text, _action text,
  _regulator_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.regulatory_scope_allows(_user_id, _module, _action, _regulator_id,
           _sector_id, _sub_sector_id, _entity_id, _owner_id, NULL::uuid);
$$;

-- Assignment administration: management permission is separate from the
-- operational permission, but narrowing is evaluated against the TARGET
-- supervisory function being assigned.
CREATE OR REPLACE FUNCTION public.regulatory_assignment_scope_allows(
  _actor_user_id uuid, _management_module text, _management_action text,
  _target_regulatory_function_id uuid, _entity_id uuid, _regulator_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _actor_user_id IS NULL THEN false
    WHEN public.is_super_admin(_actor_user_id) THEN true
    WHEN NOT public.has_permission(_actor_user_id, _management_module, _management_action) THEN false
    WHEN _target_regulatory_function_id IS NULL THEN false
    ELSE public.regulatory_scope_allows(_actor_user_id, _management_module, _management_action,
           _regulator_id, NULL::uuid, NULL::uuid, _entity_id, NULL::uuid,
           _target_regulatory_function_id)
  END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Function-aware entity assignment helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_has_entity_assignment(
  _user_id uuid, _licensee_id uuid, _regulatory_function_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _user_id IS NOT NULL AND _licensee_id IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.entity_supervision_assignments a
      WHERE a.entity_id = _licensee_id
        AND a.status = 'active'
        AND a.effective_from <= now()
        AND (a.effective_to IS NULL OR a.effective_to > now())
        AND (a.lead_supervisor_user_id = _user_id
             OR a.alternate_supervisor_user_id = _user_id
             OR a.supervisor_id = _user_id)
        -- function-specific: a governed row only counts for its own function.
        -- Unmigrated rows (NULL function) keep certified behaviour.
        AND (_regulatory_function_id IS NULL
             OR a.regulatory_function_id IS NULL
             OR a.regulatory_function_id = _regulatory_function_id)
    )
    -- legacy, function-neutral regulator mapping on the licensee record
    OR EXISTS (
      SELECT 1 FROM public.licensees l
      WHERE l.id = _licensee_id
        AND (l.lead_regulator_id = _user_id
             OR l.regulator_officer_id = _user_id
             OR l.alternate_regulator_id = _user_id)
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. Team coverage: recognise the canonical team_id, keep the legacy bridge
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_team_covers_entity(
  _user_id uuid, _entity_id uuid, _function_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  scope jsonb; ent_regulator uuid; ent_sector uuid; ent_sub_sector uuid;
BEGIN
  IF _user_id IS NULL OR _entity_id IS NULL THEN RETURN false; END IF;
  scope := public.entity_regulatory_scope(_entity_id);
  ent_regulator := NULLIF(scope ->> 'regulator_id','')::uuid;
  ent_sector := NULLIF(scope ->> 'sector_id','')::uuid;
  ent_sub_sector := NULLIF(scope ->> 'sub_sector_id','')::uuid;

  RETURN EXISTS (
    SELECT 1
    FROM public.regulatory_team_members tm
    JOIN public.regulatory_teams t ON t.id = tm.team_id
    JOIN public.entity_supervision_assignments esa
      ON esa.entity_id = _entity_id
     AND esa.status = 'active'
     AND esa.effective_from <= now()
     AND (esa.effective_to IS NULL OR esa.effective_to > now())
     AND (esa.team_id = t.id OR (esa.team_id IS NULL AND esa.team = t.code))
     AND (_function_id IS NULL OR esa.regulatory_function_id IS NULL
          OR esa.regulatory_function_id = _function_id)
    WHERE tm.user_id = _user_id
      AND tm.status = 'active'
      AND tm.effective_from <= now()
      AND (tm.effective_to IS NULL OR tm.effective_to > now())
      AND t.status = 'active'
      AND t.effective_from <= now()
      AND (t.effective_to IS NULL OR t.effective_to > now())
      AND (ent_regulator IS NULL OR t.regulator_id = ent_regulator)
      AND (_function_id IS NULL OR t.regulatory_function_id IS NULL
           OR t.regulatory_function_id = _function_id)
      AND (
        NOT public.regulator_mandate_enforcement_active(t.regulator_id, _function_id)
        OR EXISTS (
          SELECT 1 FROM public.regulatory_team_mandates rtm
          JOIN public.regulator_mandates m ON m.id = rtm.regulator_mandate_id
          WHERE rtm.team_id = t.id
            AND m.status = 'active'
            AND m.regulatory_function_id = _function_id
            AND m.effective_from <= now()
            AND (m.effective_to IS NULL OR m.effective_to > now())
            AND (m.sector_id IS NULL OR (ent_sector IS NOT NULL AND m.sector_id = ent_sector))
            AND (m.sub_sector_id IS NULL OR (ent_sub_sector IS NOT NULL AND m.sub_sector_id = ent_sub_sector))
        )
      )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Assignment authority: target-function aware + governed eligibility
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.esa_assert_assignment_authority(
  _actor uuid, _entity_id uuid, _regulator_id uuid, _function_id uuid,
  _team_id uuid, _lead uuid, _alternate uuid,
  _effective_from timestamptz, _effective_to timestamptz)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fn record; scope jsonb; t record;
  ent_sector uuid; ent_sub uuid; ent_regulator uuid;
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;

  -- CAN MANAGE ASSIGNMENTS (never the operational permission of the function)
  IF NOT public.has_permission(_actor, 'licensee_management', 'assign_supervision') THEN
    RAISE EXCEPTION 'not authorised to manage entity supervision assignments';
  END IF;

  IF _entity_id IS NULL THEN RAISE EXCEPTION 'entity_id is required'; END IF;
  scope := public.entity_regulatory_scope(_entity_id);
  IF scope IS NULL THEN RAISE EXCEPTION 'unknown entity'; END IF;
  ent_sector := NULLIF(scope ->> 'sector_id','')::uuid;
  ent_sub := NULLIF(scope ->> 'sub_sector_id','')::uuid;
  ent_regulator := NULLIF(scope ->> 'regulator_id','')::uuid;

  IF _regulator_id IS NULL THEN RAISE EXCEPTION 'regulator_id is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators r
                  WHERE r.id = _regulator_id AND r.status = 'active') THEN
    RAISE EXCEPTION 'regulator does not exist or is inactive';
  END IF;
  IF ent_regulator IS NOT NULL AND ent_regulator <> _regulator_id THEN
    RAISE EXCEPTION 'regulator does not match the entity''s canonical regulator';
  END IF;

  IF _function_id IS NULL THEN RAISE EXCEPTION 'regulatory_function_id is required'; END IF;
  SELECT * INTO fn FROM public.regulatory_functions
   WHERE id = _function_id AND status = 'active';
  IF fn IS NULL THEN RAISE EXCEPTION 'regulatory function does not exist or is inactive'; END IF;

  -- actor authority is evaluated against the TARGET supervisory function
  IF NOT public.is_super_admin(_actor) THEN
    IF NOT public.regulatory_assignment_scope_allows(_actor,
             'licensee_management', 'assign_supervision',
             _function_id, _entity_id, _regulator_id) THEN
      RAISE EXCEPTION 'entity is outside your regulatory authority for the target supervisory function';
    END IF;
  END IF;

  IF NOT public.regulator_mandate_supports(_regulator_id, _function_id, ent_sector, ent_sub) THEN
    RAISE EXCEPTION 'no active mandate covers this regulator/function/sector combination';
  END IF;

  IF _team_id IS NOT NULL THEN
    SELECT * INTO t FROM public.regulatory_teams WHERE id = _team_id;
    IF t IS NULL OR t.status <> 'active'
       OR t.effective_from > now()
       OR (t.effective_to IS NOT NULL AND t.effective_to <= now()) THEN
      RAISE EXCEPTION 'team is not an active, in-date team';
    END IF;
    IF t.regulator_id <> _regulator_id THEN
      RAISE EXCEPTION 'team belongs to a different regulator';
    END IF;
    IF t.regulatory_function_id IS NOT NULL AND t.regulatory_function_id <> _function_id THEN
      RAISE EXCEPTION 'team belongs to a different regulatory function';
    END IF;
    IF public.regulator_mandate_enforcement_active(_regulator_id, _function_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.regulatory_team_mandates rtm
         JOIN public.regulator_mandates m ON m.id = rtm.regulator_mandate_id
         WHERE rtm.team_id = _team_id
           AND m.status = 'active'
           AND m.regulatory_function_id = _function_id
           AND m.effective_from <= now()
           AND (m.effective_to IS NULL OR m.effective_to > now())
           AND (m.sector_id IS NULL OR (ent_sector IS NOT NULL AND m.sector_id = ent_sector))
           AND (m.sub_sector_id IS NULL OR (ent_sub IS NOT NULL AND m.sub_sector_id = ent_sub))
       ) THEN
      RAISE EXCEPTION 'team mandate does not cover this entity';
    END IF;
  END IF;

  IF _lead IS NULL THEN RAISE EXCEPTION 'lead_supervisor_user_id is required'; END IF;
  IF _lead = _alternate THEN RAISE EXCEPTION 'lead and alternate supervisor must differ'; END IF;

  -- CAN PERFORM THE SUPERVISORY FUNCTION (the proposed owner, not the actor)
  IF NOT public.regulatory_staff_identity_ok(_lead) THEN
    RAISE EXCEPTION 'lead supervisor is not an active internal regulatory staff identity';
  END IF;
  IF NOT public.user_meets_assignment_eligibility(_lead, _function_id, 'LEAD_SUPERVISOR') THEN
    RAISE EXCEPTION 'lead supervisor does not meet the eligibility requirement for this regulatory function';
  END IF;
  IF NOT public.staff_portfolio_allows(_lead, _regulator_id, _function_id,
                                       ent_sector, ent_sub, _entity_id) THEN
    RAISE EXCEPTION 'lead supervisor portfolio does not cover this entity';
  END IF;
  IF _team_id IS NOT NULL AND NOT public.regulatory_team_membership_active(_lead, _team_id) THEN
    RAISE EXCEPTION 'lead supervisor is not an active member of the assigned team';
  END IF;

  IF _alternate IS NOT NULL THEN
    IF NOT public.regulatory_staff_identity_ok(_alternate) THEN
      RAISE EXCEPTION 'alternate supervisor is not an active internal regulatory staff identity';
    END IF;
    IF NOT public.user_meets_assignment_eligibility(_alternate, _function_id, 'ALTERNATE_SUPERVISOR') THEN
      RAISE EXCEPTION 'alternate supervisor does not meet the eligibility requirement for this regulatory function';
    END IF;
    IF NOT public.staff_portfolio_allows(_alternate, _regulator_id, _function_id,
                                         ent_sector, ent_sub, _entity_id) THEN
      RAISE EXCEPTION 'alternate supervisor portfolio does not cover this entity';
    END IF;
    IF _team_id IS NOT NULL AND NOT public.regulatory_team_membership_active(_alternate, _team_id) THEN
      RAISE EXCEPTION 'alternate supervisor is not an active member of the assigned team';
    END IF;
  END IF;

  IF _effective_to IS NOT NULL AND _effective_to < COALESCE(_effective_from, now()) THEN
    RAISE EXCEPTION 'effective_to cannot precede effective_from';
  END IF;
END;
$$;

-- closure must also be target-function aware
CREATE OR REPLACE FUNCTION public.end_entity_supervision_assignment(
  _assignment_id uuid, _closure_reason text,
  _effective_to timestamptz DEFAULT now())
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  actor uuid := auth.uid();
  cur public.entity_supervision_assignments;
BEGIN
  SELECT * INTO cur FROM public.entity_supervision_assignments WHERE id = _assignment_id;
  IF cur IS NULL THEN RAISE EXCEPTION 'assignment not found'; END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_permission(actor, 'licensee_management', 'assign_supervision') THEN
    RAISE EXCEPTION 'not authorised to manage entity supervision assignments';
  END IF;
  IF NOT public.is_super_admin(actor)
     AND NOT public.regulatory_assignment_scope_allows(actor,
           'licensee_management', 'assign_supervision',
           cur.regulatory_function_id, cur.entity_id, cur.regulator_id) THEN
    RAISE EXCEPTION 'entity is outside your regulatory authority for the target supervisory function';
  END IF;
  IF _closure_reason IS NULL OR btrim(_closure_reason) = '' THEN
    RAISE EXCEPTION 'a closure reason is required';
  END IF;

  UPDATE public.entity_supervision_assignments
     SET status = 'closed', is_primary = false,
         effective_to = COALESCE(_effective_to, now()),
         closure_reason = _closure_reason, updated_at = now()
   WHERE id = cur.id;

  RETURN cur.id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Migrate FUNCTION_SPECIFIC_AUTHORIZATION callers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_prudential_entity(_user uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'prudential_supervision','view_all_entities')
      OR (
        public.has_permission(_user,'prudential_supervision','view')
        AND (
          _entity_id IS NULL
          OR public.user_has_entity_assignment(_user, _entity_id,
               public.regulatory_function_for_module('prudential_supervision'))
          OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                      WHERE eua.entity_id=_entity_id AND eua.user_id=_user)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_enforcement(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'enforcement_management', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'enforcement_management', 'view')
      AND (
        _entity_id IS NULL
        OR public.user_has_entity_assignment(_user_id, _entity_id,
             public.regulatory_function_for_module('enforcement_management'))
        OR EXISTS (
          SELECT 1 FROM public.enforcement_actions ea
          WHERE ea.entity_id = _entity_id
            AND _user_id IN (ea.referred_by, ea.opened_by, ea.assigned_to)
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_inspection(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'inspection_management', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'inspection_management', 'view')
      AND (_entity_id IS NULL
           OR public.user_has_entity_assignment(_user_id, _entity_id,
                public.regulatory_function_for_module('inspection_management')))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_examination(_user_id uuid, _entity_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'inspection_management', 'view_all_entities')
    OR public.has_permission(_user_id, 'prudential_supervision', 'view_all_entities')
    OR (
      public.has_permission(_user_id, 'inspection_management', 'view')
      AND (_entity_id IS NULL
           OR public.user_has_entity_assignment(_user_id, _entity_id,
                public.regulatory_function_for_module('inspection_management')))
    )
    OR (
      public.has_permission(_user_id, 'prudential_supervision', 'view')
      AND (_entity_id IS NULL
           OR public.user_has_entity_assignment(_user_id, _entity_id,
                public.regulatory_function_for_module('prudential_supervision')))
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_licensee(_user uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR (
        public.has_permission(_user,'fit_and_proper','view')
        AND (
          _licensee_id IS NULL
          OR public.user_has_entity_assignment(_user, _licensee_id,
               public.regulatory_function_for_module('fit_and_proper'))
          OR EXISTS (SELECT 1 FROM public.entity_user_access eua
                      WHERE eua.entity_id=_licensee_id AND eua.user_id=_user)
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_assessment(_user uuid, _assessment_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR EXISTS (
        SELECT 1 FROM public.fp_assessments a
        WHERE a.id = _assessment_id
          AND (
            a.submitted_by = _user
            OR a.created_by = _user
            OR (public.has_permission(_user,'fit_and_proper','view')
                AND public.user_has_entity_assignment(_user, a.licensee_id,
                      public.regulatory_function_for_module('fit_and_proper')))
          )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_read_fp_individual(_user uuid, _individual_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user,'fit_and_proper','view_all_entities')
      OR EXISTS (SELECT 1 FROM public.fp_individuals fi
                  WHERE fi.id=_individual_id AND fi.user_id=_user)
      OR (
        public.has_permission(_user,'fit_and_proper','view')
        AND EXISTS (
          SELECT 1 FROM public.fp_individual_roles r
          WHERE r.individual_id = _individual_id
            AND public.user_has_entity_assignment(_user, r.licensee_id,
                  public.regulatory_function_for_module('fit_and_proper'))
        )
      );
$$;

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(_user_id uuid, _licensee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_super_admin(_user_id)
    OR public.has_permission(_user_id, 'returns_management', 'view_all_entities')
    OR public.user_has_entity_assignment(_user_id, _licensee_id,
         public.regulatory_function_for_module('returns_management'));
$$;

CREATE OR REPLACE FUNCTION public.can_view_entity_returns(
  _user_id uuid, _licensee_id uuid, _workflow_status text, _status text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL OR _licensee_id IS NULL THEN false
    WHEN public.is_super_admin(_user_id) THEN true
    WHEN public.has_permission(_user_id, 'returns_management', 'view_all_entities') THEN true
    WHEN public.has_permission(_user_id, 'returns_management', 'view')
      AND public.user_has_entity_assignment(_user_id, _licensee_id,
            public.regulatory_function_for_module('returns_management')) THEN true
    WHEN public.user_has_entity_assignment(_user_id, _licensee_id,
            public.regulatory_function_for_module('returns_management'))
      AND public.is_assignment_only_regulator(_user_id)
      AND public.return_status_is_submitted_lifecycle(
        COALESCE(NULLIF(_workflow_status, ''), _status)
      ) THEN true
    ELSE false
  END;
$$;

-- write policies that gate on assignment become function-specific too
DROP POLICY IF EXISTS prudential_assessments_insert ON public.prudential_assessments;
CREATE POLICY prudential_assessments_insert ON public.prudential_assessments
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
      OR public.user_has_entity_assignment(auth.uid(), entity_id,
           public.regulatory_function_for_module('prudential_supervision'))));

DROP POLICY IF EXISTS prudential_actions_insert ON public.prudential_actions;
CREATE POLICY prudential_actions_insert ON public.prudential_actions
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
      OR public.user_has_entity_assignment(auth.uid(), entity_id,
           public.regulatory_function_for_module('prudential_supervision'))));

DROP POLICY IF EXISTS prudential_escalations_insert ON public.prudential_escalations;
CREATE POLICY prudential_escalations_insert ON public.prudential_escalations
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_act_on_prudential(auth.uid())
    AND (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'prudential_supervision','view_all_entities')
      OR public.user_has_entity_assignment(auth.uid(), entity_id,
           public.regulatory_function_for_module('prudential_supervision'))));

DROP POLICY IF EXISTS fp_assessments_insert ON public.fp_assessments;
CREATE POLICY fp_assessments_insert ON public.fp_assessments
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_act_on_fp(auth.uid())
    AND (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'fit_and_proper','view_all_entities')
      OR public.user_has_entity_assignment(auth.uid(), licensee_id,
           public.regulatory_function_for_module('fit_and_proper'))));

DROP POLICY IF EXISTS fp_individual_roles_insert ON public.fp_individual_roles;
CREATE POLICY fp_individual_roles_insert ON public.fp_individual_roles
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_act_on_fp(auth.uid())
    AND (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'fit_and_proper','view_all_entities')
      OR public.user_has_entity_assignment(auth.uid(), licensee_id,
           public.regulatory_function_for_module('fit_and_proper'))));

-- ---------------------------------------------------------------------------
-- 8. Function privileges
-- ---------------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOR f IN SELECT format('%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname='public' AND p.proname IN (
             'regulatory_staff_identity_ok','user_meets_assignment_eligibility',
             'regulatory_team_membership_active','regulatory_assignment_scope_allows',
             'regulatory_scope_allows','user_has_entity_assignment','user_team_covers_entity')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END $$;