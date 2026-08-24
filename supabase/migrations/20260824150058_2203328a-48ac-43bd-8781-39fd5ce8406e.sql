-- ============================================================
-- REGULATORY OPERATING STRUCTURE — PHASE 1.1 HARDENING
-- ============================================================

-- ---------- 1. canonical module -> regulatory function ----------
CREATE OR REPLACE FUNCTION public.regulatory_function_for_module(_module text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rf.id
  FROM public.regulatory_functions rf
  WHERE rf.status = 'active'
    AND rf.module_key IS NOT NULL
    AND lower(rf.module_key) = lower(regexp_replace(COALESCE(_module,''), '\s+', '_', 'g'))
  ORDER BY rf.sort_order, rf.key
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.regulatory_function_for_module(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulatory_function_for_module(text) TO authenticated, service_role;

-- administrator review surface: business modules with no governed function mapping
CREATE OR REPLACE FUNCTION public.regulatory_function_mapping_report()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_functions', (SELECT count(*) FROM public.regulatory_functions WHERE status='active'),
    'unmapped_regulatory_function_modules', (
      SELECT count(*) FROM public.regulatory_functions rf
      WHERE rf.status='active'
        AND (rf.module_key IS NULL
             OR NOT EXISTS (SELECT 1 FROM public.sec_modules m WHERE lower(m.key)=lower(rf.module_key)))),
    'unmapped_module_keys', COALESCE((
      SELECT jsonb_agg(rf.key ORDER BY rf.key) FROM public.regulatory_functions rf
      WHERE rf.status='active'
        AND (rf.module_key IS NULL
             OR NOT EXISTS (SELECT 1 FROM public.sec_modules m WHERE lower(m.key)=lower(rf.module_key)))), '[]'::jsonb),
    'duplicate_module_to_function_mappings', (
      SELECT count(*) FROM (
        SELECT lower(module_key) k FROM public.regulatory_functions
        WHERE status='active' AND module_key IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1) d),
    'business_modules_without_function', COALESCE((
      SELECT jsonb_agg(m.key ORDER BY m.key) FROM public.sec_modules m
      WHERE NOT EXISTS (
        SELECT 1 FROM public.regulatory_functions rf
        WHERE rf.status='active' AND lower(rf.module_key)=lower(m.key))), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION public.regulatory_function_mapping_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulatory_function_mapping_report() TO authenticated, service_role;

-- ---------- 2. explicit mandate enforcement activation ----------
CREATE TABLE IF NOT EXISTS public.regulator_mandate_enforcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid NOT NULL REFERENCES public.regulators(id) ON DELETE RESTRICT,
  regulatory_function_id uuid NOT NULL REFERENCES public.regulatory_functions(id) ON DELETE RESTRICT,
  enforcement_status text NOT NULL DEFAULT 'DRAFT' CHECK (enforcement_status IN ('DRAFT','ACTIVE')),
  activated_at timestamptz,
  activated_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, regulatory_function_id)
);

GRANT SELECT ON public.regulator_mandate_enforcement TO authenticated;
GRANT ALL ON public.regulator_mandate_enforcement TO service_role;
ALTER TABLE public.regulator_mandate_enforcement ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS regulator_mandate_enforcement_read ON public.regulator_mandate_enforcement;
CREATE POLICY regulator_mandate_enforcement_read ON public.regulator_mandate_enforcement
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid())
      OR public.has_permission(auth.uid(),'security_management','view')
      OR public.has_permission(auth.uid(),'role_management','view')
      OR public.has_permission(auth.uid(),'user_management','view'));

DROP TRIGGER IF EXISTS trg_rme_updated_at ON public.regulator_mandate_enforcement;
CREATE TRIGGER trg_rme_updated_at BEFORE UPDATE ON public.regulator_mandate_enforcement
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.regulator_mandate_enforcement_active(_regulator_id uuid, _function_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _regulator_id IS NOT NULL AND _function_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.regulator_mandate_enforcement e
    WHERE e.regulator_id = _regulator_id
      AND e.regulatory_function_id = _function_id
      AND e.enforcement_status = 'ACTIVE'
  );
$$;
REVOKE ALL ON FUNCTION public.regulator_mandate_enforcement_active(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulator_mandate_enforcement_active(uuid,uuid) TO authenticated, service_role;

-- ---------- 3. function-aware, fail-closed mandate check ----------
CREATE OR REPLACE FUNCTION public.regulator_mandate_supports(
  _regulator_id uuid, _function_id uuid, _sector_id uuid, _sub_sector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- the mandate layer is inert until an administrator activates the
    -- regulator + regulatory function mandate set explicitly
    WHEN NOT public.regulator_mandate_enforcement_active(_regulator_id, _function_id) THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.regulator_mandates m
      WHERE m.regulator_id = _regulator_id
        AND m.regulatory_function_id = _function_id
        AND m.status = 'active'
        AND m.effective_from <= now()
        AND (m.effective_to IS NULL OR m.effective_to > now())
        -- a sector-restricted mandate requires a KNOWN, matching sector
        AND (m.sector_id IS NULL OR (_sector_id IS NOT NULL AND m.sector_id = _sector_id))
        -- a sub-sector-restricted mandate requires a KNOWN, matching sub-sector
        AND (m.sub_sector_id IS NULL OR (_sub_sector_id IS NOT NULL AND m.sub_sector_id = _sub_sector_id))
    )
  END;
$$;
REVOKE ALL ON FUNCTION public.regulator_mandate_supports(uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulator_mandate_supports(uuid,uuid,uuid,uuid) TO authenticated, service_role;

-- legacy 3-arg signature retained for compatibility: no regulatory function is
-- known, so the (function-scoped) mandate layer stays inert by definition.
CREATE OR REPLACE FUNCTION public.regulator_mandate_supports(
  _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.regulator_mandate_supports(_regulator_id, NULL::uuid, _sector_id, _sub_sector_id);
$$;

-- ---------- 4. canonical entity scope derivation ----------
CREATE OR REPLACE FUNCTION public.entity_regulatory_scope(_entity_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
           'found', true,
           'sector_id', l.sector_id,
           'sub_sector_id', l.sub_sector_id,
           'regulator_id', COALESCE(ss.regulator_id, s.regulator_id))
  FROM public.licensees l
  LEFT JOIN public.sectors s ON s.id = l.sector_id
  LEFT JOIN public.sectors ss ON ss.id = (SELECT sx.sector_id FROM public.sub_sectors sx WHERE sx.id = l.sub_sector_id)
  WHERE l.id = _entity_id;
$$;
REVOKE ALL ON FUNCTION public.entity_regulatory_scope(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.entity_regulatory_scope(uuid) TO authenticated, service_role;

-- ---------- 5. function-aware staff portfolio narrowing ----------
CREATE OR REPLACE FUNCTION public.staff_portfolio_allows(
  _user_id uuid, _regulator_id uuid, _function_id uuid,
  _sector_id uuid, _sub_sector_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE applicable boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;

  -- "applicable" = active, in-date, and either scoped to this regulatory
  -- function or deliberately function-neutral (regulatory_function_id IS NULL).
  SELECT EXISTS (
    SELECT 1 FROM public.staff_portfolios sp
    WHERE sp.user_id = _user_id AND sp.status = 'active'
      AND sp.effective_from <= now()
      AND (sp.effective_to IS NULL OR sp.effective_to > now())
      AND (sp.regulatory_function_id IS NULL
           OR _function_id IS NULL
           OR sp.regulatory_function_id = _function_id)
  ) INTO applicable;

  -- No applicable portfolio for this function: portfolios do not restrict.
  IF NOT applicable THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.staff_portfolios sp
    WHERE sp.user_id = _user_id AND sp.status = 'active'
      AND sp.effective_from <= now()
      AND (sp.effective_to IS NULL OR sp.effective_to > now())
      AND (sp.regulatory_function_id IS NULL
           OR _function_id IS NULL
           OR sp.regulatory_function_id = _function_id)
      AND (_regulator_id IS NULL OR sp.regulator_id = _regulator_id)
      AND (
        NOT EXISTS (SELECT 1 FROM public.staff_portfolio_scopes s WHERE s.portfolio_id = sp.id)
        OR EXISTS (
          SELECT 1 FROM public.staff_portfolio_scopes s
          WHERE s.portfolio_id = sp.id
            AND (
              (s.scope_kind = 'sector'     AND _sector_id     IS NOT NULL AND s.sector_id     = _sector_id)
              OR (s.scope_kind = 'sub_sector' AND _sub_sector_id IS NOT NULL AND s.sub_sector_id = _sub_sector_id)
              OR (s.scope_kind = 'entity'     AND _entity_id     IS NOT NULL AND s.entity_id     = _entity_id)
            )
        )
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_portfolio_allows(uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_portfolio_allows(uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_portfolio_allows(
  _user_id uuid, _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.staff_portfolio_allows(_user_id, _regulator_id, NULL::uuid, _sector_id, _sub_sector_id, _entity_id);
$$;

-- ---------- 6. portfolio data integrity ----------
CREATE OR REPLACE FUNCTION public.regulatory_validate_portfolio_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE parent_sector uuid;
BEGIN
  IF NEW.scope_kind = 'sector' THEN
    IF NEW.sector_id IS NULL THEN RAISE EXCEPTION 'sector scope requires sector_id'; END IF;
    IF NEW.sub_sector_id IS NOT NULL OR NEW.entity_id IS NOT NULL THEN
      RAISE EXCEPTION 'sector scope must not mix sub_sector_id/entity_id';
    END IF;
  ELSIF NEW.scope_kind = 'sub_sector' THEN
    IF NEW.sub_sector_id IS NULL THEN RAISE EXCEPTION 'sub_sector scope requires sub_sector_id'; END IF;
    IF NEW.entity_id IS NOT NULL THEN RAISE EXCEPTION 'sub_sector scope must not set entity_id'; END IF;
    SELECT ss.sector_id INTO parent_sector FROM public.sub_sectors ss WHERE ss.id = NEW.sub_sector_id;
    IF parent_sector IS NULL THEN RAISE EXCEPTION 'sub_sector % does not exist', NEW.sub_sector_id; END IF;
    IF NEW.sector_id IS NOT NULL AND NEW.sector_id <> parent_sector THEN
      RAISE EXCEPTION 'sub_sector scope sector_id must be the parent sector';
    END IF;
    NEW.sector_id := parent_sector;
  ELSIF NEW.scope_kind = 'entity' THEN
    IF NEW.entity_id IS NULL THEN RAISE EXCEPTION 'entity scope requires entity_id'; END IF;
    IF NEW.sector_id IS NOT NULL OR NEW.sub_sector_id IS NOT NULL THEN
      RAISE EXCEPTION 'entity scope must not set sector_id/sub_sector_id';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sps_validate ON public.staff_portfolio_scopes;
CREATE TRIGGER trg_sps_validate BEFORE INSERT OR UPDATE ON public.staff_portfolio_scopes
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_portfolio_scope();

CREATE OR REPLACE FUNCTION public.regulatory_validate_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE t record;
BEGIN
  IF NEW.team_id IS NOT NULL THEN
    SELECT regulator_id, regulatory_function_id INTO t
    FROM public.regulatory_teams WHERE id = NEW.team_id;
    IF t.regulator_id <> NEW.regulator_id THEN
      RAISE EXCEPTION 'portfolio team belongs to a different regulator';
    END IF;
    IF t.regulatory_function_id IS NOT NULL AND NEW.regulatory_function_id IS NOT NULL
       AND t.regulatory_function_id <> NEW.regulatory_function_id THEN
      RAISE EXCEPTION 'portfolio team regulatory function is incompatible';
    END IF;
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from THEN
    RAISE EXCEPTION 'portfolio effective_to must be after effective_from';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_portfolios_validate ON public.staff_portfolios;
CREATE TRIGGER trg_staff_portfolios_validate BEFORE INSERT OR UPDATE ON public.staff_portfolios
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_portfolio();

-- ---------- 7. function-aware, date-aware team coverage ----------
CREATE OR REPLACE FUNCTION public.user_team_covers_entity(
  _user_id uuid, _entity_id uuid, _function_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  scope jsonb;
  ent_regulator uuid;
  ent_sector uuid;
  ent_sub_sector uuid;
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
     AND esa.team = t.code      -- compatibility bridge (legacy text field)
    WHERE tm.user_id = _user_id
      AND tm.status = 'active'
      AND tm.effective_from <= now()
      AND (tm.effective_to IS NULL OR tm.effective_to > now())
      AND t.status = 'active'
      AND t.effective_from <= now()
      AND (t.effective_to IS NULL OR t.effective_to > now())
      -- correct regulator (when the entity's regulator can be derived)
      AND (ent_regulator IS NULL OR t.regulator_id = ent_regulator)
      -- correct regulatory function (NULL on the team = function-neutral)
      AND (_function_id IS NULL OR t.regulatory_function_id IS NULL
           OR t.regulatory_function_id = _function_id)
      -- an active team mandate must cover the entity once enforcement is active
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
REVOKE ALL ON FUNCTION public.user_team_covers_entity(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_team_covers_entity(uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_team_covers_entity(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_team_covers_entity(_user_id, _entity_id, NULL::uuid);
$$;

-- ---------- 8. composite check: function-aware + entity-derived ----------
CREATE OR REPLACE FUNCTION public.regulatory_scope_allows(
  _user_id uuid, _module text, _action text,
  _regulator_id uuid DEFAULT NULL, _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL, _entity_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g jsonb;
  fn uuid;
  scope jsonb;
  e_sector uuid; e_sub uuid; e_reg uuid;
  role_ok boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  -- break-glass Super Administrator is the ONLY business-authority bypass
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  -- 1. canonical RBAC permission must exist
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;

  -- resolve the regulatory function once, canonically
  fn := public.regulatory_function_for_module(_module);

  -- 2. derive record scope from canonical entity data; fail closed on conflict
  IF _entity_id IS NOT NULL THEN
    scope := public.entity_regulatory_scope(_entity_id);
    IF scope IS NULL THEN RETURN false; END IF;   -- unknown entity
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

  -- derive the parent sector when only the sub-sector is known
  IF _sector_id IS NULL AND _sub_sector_id IS NOT NULL THEN
    SELECT ss.sector_id INTO _sector_id FROM public.sub_sectors ss WHERE ss.id = _sub_sector_id;
  END IF;
  IF _regulator_id IS NULL AND _sector_id IS NOT NULL THEN
    SELECT s.regulator_id INTO _regulator_id FROM public.sectors s WHERE s.id = _sector_id;
  END IF;

  -- 3. role grant scope must allow the record (independent grants)
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
        AND public.user_has_entity_assignment(_user_id, _entity_id))
    OR (COALESCE((g ->> 'team')::boolean, false) AND _entity_id IS NOT NULL
        AND public.user_team_covers_entity(_user_id, _entity_id, fn));

  IF NOT role_ok THEN RETURN false; END IF;

  -- 4. staff portfolio may only narrow (function-aware)
  IF NOT public.staff_portfolio_allows(_user_id, _regulator_id, fn, _sector_id, _sub_sector_id, _entity_id) THEN
    RETURN false;
  END IF;

  -- 5. regulator mandate must support regulator + function + sector/sub-sector
  IF NOT public.regulator_mandate_supports(_regulator_id, fn, _sector_id, _sub_sector_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.regulatory_scope_allows(uuid,text,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulatory_scope_allows(uuid,text,text,uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;