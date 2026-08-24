-- =============================================================
-- REGULATORY OPERATING STRUCTURE — PHASE 1 (FOUNDATION)
-- Additive only. No existing object is dropped or narrowed.
-- =============================================================

-- ---------- 1. CATALOGUE: regulatory_functions ----------
CREATE TABLE public.regulatory_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  module_key text,
  coverage_level text NOT NULL DEFAULT 'sector'
    CHECK (coverage_level IN ('sector','institution','global')),
  sort_order integer NOT NULL DEFAULT 100,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regulatory_functions TO authenticated;
GRANT ALL ON public.regulatory_functions TO service_role;
ALTER TABLE public.regulatory_functions ENABLE ROW LEVEL SECURITY;

-- ---------- 2. regulator_mandates ----------
CREATE TABLE public.regulator_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid NOT NULL REFERENCES public.regulators(id) ON DELETE RESTRICT,
  regulatory_function_id uuid NOT NULL REFERENCES public.regulatory_functions(id) ON DELETE RESTRICT,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE RESTRICT,
  sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE RESTRICT,
  responsibility_type text NOT NULL DEFAULT 'LEAD'
    CHECK (responsibility_type IN ('LEAD','JOINT','SUPPORT','ADVISORY')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','requires_admin_review')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX regulator_mandates_unique_active ON public.regulator_mandates (
  regulator_id, regulatory_function_id,
  COALESCE(sector_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(sub_sector_id, '00000000-0000-0000-0000-000000000000'::uuid),
  effective_from
);
CREATE INDEX idx_regulator_mandates_lookup
  ON public.regulator_mandates (regulator_id, status, sector_id, sub_sector_id);
GRANT SELECT ON public.regulator_mandates TO authenticated;
GRANT ALL ON public.regulator_mandates TO service_role;
ALTER TABLE public.regulator_mandates ENABLE ROW LEVEL SECURITY;

-- sub-sector must belong to the declared sector; sub-sector implies sector
CREATE OR REPLACE FUNCTION public.regulatory_validate_mandate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.sub_sector_id IS NOT NULL THEN
    IF NEW.sector_id IS NULL THEN
      RAISE EXCEPTION 'sector_id is required when sub_sector_id is set'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.sub_sectors ss
      WHERE ss.id = NEW.sub_sector_id AND ss.sector_id = NEW.sector_id
    ) THEN
      RAISE EXCEPTION 'sub_sector % does not belong to sector %', NEW.sub_sector_id, NEW.sector_id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.effective_to IS NOT NULL AND NEW.effective_to <= NEW.effective_from THEN
    RAISE EXCEPTION 'effective_to must be after effective_from' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_regulator_mandates_validate
  BEFORE INSERT OR UPDATE ON public.regulator_mandates
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_mandate();
CREATE TRIGGER trg_regulator_mandates_updated_at
  BEFORE UPDATE ON public.regulator_mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_regulatory_functions_updated_at
  BEFORE UPDATE ON public.regulatory_functions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- 3. regulatory_teams ----------
CREATE TABLE public.regulatory_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid NOT NULL REFERENCES public.regulators(id) ON DELETE RESTRICT,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  team_type text NOT NULL DEFAULT 'permanent'
    CHECK (team_type IN ('permanent','thematic','case','committee')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, code)
);
GRANT SELECT ON public.regulatory_teams TO authenticated;
GRANT ALL ON public.regulatory_teams TO service_role;
ALTER TABLE public.regulatory_teams ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_regulatory_teams_updated_at
  BEFORE UPDATE ON public.regulatory_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.regulatory_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.regulatory_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role text NOT NULL DEFAULT 'member'
    CHECK (member_role IN ('lead','deputy','member','observer')),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_rtm_user ON public.regulatory_team_members (user_id, status);
CREATE INDEX idx_rtm_team ON public.regulatory_team_members (team_id, status);
GRANT SELECT ON public.regulatory_team_members TO authenticated;
GRANT ALL ON public.regulatory_team_members TO service_role;
ALTER TABLE public.regulatory_team_members ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_regulatory_team_members_updated_at
  BEFORE UPDATE ON public.regulatory_team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.regulatory_team_mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.regulatory_teams(id) ON DELETE CASCADE,
  regulator_mandate_id uuid NOT NULL REFERENCES public.regulator_mandates(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, regulator_mandate_id, effective_from)
);
GRANT SELECT ON public.regulatory_team_mandates TO authenticated;
GRANT ALL ON public.regulatory_team_mandates TO service_role;
ALTER TABLE public.regulatory_team_mandates ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_regulatory_team_mandates_updated_at
  BEFORE UPDATE ON public.regulatory_team_mandates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- team may only carry mandates of its own regulator
CREATE OR REPLACE FUNCTION public.regulatory_validate_team_mandate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE t_reg uuid; m_reg uuid;
BEGIN
  SELECT regulator_id INTO t_reg FROM public.regulatory_teams WHERE id = NEW.team_id;
  SELECT regulator_id INTO m_reg FROM public.regulator_mandates WHERE id = NEW.regulator_mandate_id;
  IF t_reg IS DISTINCT FROM m_reg THEN
    RAISE EXCEPTION 'team mandate outside regulator mandate: team regulator % vs mandate regulator %', t_reg, m_reg
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_regulatory_team_mandates_validate
  BEFORE INSERT OR UPDATE ON public.regulatory_team_mandates
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_team_mandate();

-- ---------- 4. staff_portfolios ----------
CREATE TABLE public.staff_portfolios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  regulator_id uuid NOT NULL REFERENCES public.regulators(id) ON DELETE RESTRICT,
  regulatory_function_id uuid REFERENCES public.regulatory_functions(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES public.regulatory_teams(id) ON DELETE SET NULL,
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','requires_admin_review')),
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_staff_portfolios_user ON public.staff_portfolios (user_id, status);
GRANT SELECT ON public.staff_portfolios TO authenticated;
GRANT ALL ON public.staff_portfolios TO service_role;
ALTER TABLE public.staff_portfolios ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_staff_portfolios_updated_at
  BEFORE UPDATE ON public.staff_portfolios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.staff_portfolio_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id uuid NOT NULL REFERENCES public.staff_portfolios(id) ON DELETE CASCADE,
  scope_kind text NOT NULL CHECK (scope_kind IN ('sector','sub_sector','entity')),
  sector_id uuid REFERENCES public.sectors(id) ON DELETE RESTRICT,
  sub_sector_id uuid REFERENCES public.sub_sectors(id) ON DELETE RESTRICT,
  entity_id uuid REFERENCES public.licensees(id) ON DELETE RESTRICT,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sps_portfolio ON public.staff_portfolio_scopes (portfolio_id);
GRANT SELECT ON public.staff_portfolio_scopes TO authenticated;
GRANT ALL ON public.staff_portfolio_scopes TO service_role;
ALTER TABLE public.staff_portfolio_scopes ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_staff_portfolio_scopes_updated_at
  BEFORE UPDATE ON public.staff_portfolio_scopes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.regulatory_validate_portfolio_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.scope_kind = 'sector' AND NEW.sector_id IS NULL THEN
    RAISE EXCEPTION 'sector_id required for sector scope' USING ERRCODE = '23514';
  END IF;
  IF NEW.scope_kind = 'sub_sector' THEN
    IF NEW.sub_sector_id IS NULL THEN
      RAISE EXCEPTION 'sub_sector_id required for sub_sector scope' USING ERRCODE = '23514';
    END IF;
    SELECT ss.sector_id INTO NEW.sector_id FROM public.sub_sectors ss WHERE ss.id = NEW.sub_sector_id;
  END IF;
  IF NEW.scope_kind = 'entity' AND NEW.entity_id IS NULL THEN
    RAISE EXCEPTION 'entity_id required for entity scope' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_staff_portfolio_scopes_validate
  BEFORE INSERT OR UPDATE ON public.staff_portfolio_scopes
  FOR EACH ROW EXECUTE FUNCTION public.regulatory_validate_portfolio_scope();

-- ---------- 5. RLS: read for security viewers, write for security editors ----------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'regulatory_functions','regulator_mandates','regulatory_teams',
    'regulatory_team_members','regulatory_team_mandates',
    'staff_portfolios','staff_portfolio_scopes'
  ] LOOP
    EXECUTE format($f$
      CREATE POLICY "%1$s_read" ON public.%1$I FOR SELECT TO authenticated
      USING (
        public.is_super_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'security_management', 'view')
        OR public.has_permission(auth.uid(), 'role_management', 'view')
        OR public.has_permission(auth.uid(), 'user_management', 'view')
      );
    $f$, t);
  END LOOP;
END $$;

-- ---------- 6. New coverage types (backend-enforced from the start) ----------
INSERT INTO public.sec_scope_types (key, label, description, requires_values, value_kind, is_enforced, sort_order, is_system, is_active)
VALUES
  ('regulator','Selected regulators','Only records belonging to the selected regulators.', true, 'regulator', true, 25, true, true),
  ('sub_sector','Selected sub-sectors','Only records in the selected sub-sectors.', true, 'sub_sector', true, 35, true, true),
  ('team','Team records','Only records assigned to the user''s regulatory teams.', false, null, true, 45, true, true)
ON CONFLICT (key) DO NOTHING;

-- ---------- 7. Independent scope grants (replaces collapsing behaviour) ----------
CREATE OR REPLACE FUNCTION public.user_scope_grants_for(_user_id uuid, _module text, _action text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  has_all boolean := false;
  has_assigned boolean := false;
  has_own boolean := false;
  has_team boolean := false;
  qualified boolean := false;
  sectors_agg uuid[] := '{}';
  sub_sectors_agg uuid[] := '{}';
  institutions_agg uuid[] := '{}';
  regulators_agg uuid[] := '{}';
  rec record;
  vals uuid[];
  legacy jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('qualified', false, 'all', false, 'source', 'anonymous');
  END IF;
  IF public.is_super_admin(_user_id) THEN
    RETURN jsonb_build_object('qualified', true, 'all', true, 'source', 'super_admin',
      'sectors','[]'::jsonb,'sub_sectors','[]'::jsonb,'institutions','[]'::jsonb,
      'regulators','[]'::jsonb,'assigned',true,'team',true,'own',true);
  END IF;

  FOR rec IN
    SELECT COALESCE(st.key,'all') AS scope_key, rs.id AS role_scope_id
    FROM public.sec_user_roles ur
    JOIN public.sec_roles r ON r.id = ur.role_id
    JOIN public.sec_role_permissions rp ON rp.role_id = r.id
    JOIN public.sec_permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.id = p.module_id
    LEFT JOIN public.sec_role_scopes rs ON rs.role_id = r.id AND rs.module_id = m.id
    LEFT JOIN public.sec_scope_types st ON st.id = rs.scope_type_id
    WHERE ur.user_id = _user_id
      AND COALESCE(ur.status,'active') = 'active'
      AND (ur.effective_from IS NULL OR ur.effective_from <= now())
      AND (ur.effective_until IS NULL OR ur.effective_until >= now())
      AND COALESCE(r.status,'active') = 'active'
      AND lower(m.key) = lower(regexp_replace(COALESCE(_module,''),'\s+','_','g'))
      AND lower(p.key) = lower(COALESCE(_action,''))
  LOOP
    qualified := true;
    SELECT COALESCE(array_agg(v.value_id) FILTER (WHERE v.value_id IS NOT NULL), '{}')
      INTO vals
      FROM public.sec_role_scope_values v
      WHERE v.role_scope_id = rec.role_scope_id;

    CASE rec.scope_key
      WHEN 'all' THEN has_all := true;
      WHEN 'sector' THEN sectors_agg := sectors_agg || vals;
      WHEN 'sub_sector' THEN sub_sectors_agg := sub_sectors_agg || vals;
      WHEN 'institution' THEN institutions_agg := institutions_agg || vals;
      WHEN 'regulator' THEN regulators_agg := regulators_agg || vals;
      WHEN 'assigned' THEN has_assigned := true;
      WHEN 'team' THEN has_team := true;
      WHEN 'own' THEN has_own := true;
      ELSE NULL;
    END CASE;
  END LOOP;

  IF NOT qualified THEN
    -- compatibility: fall back to the legacy collapsing resolver
    legacy := public.user_scope_for(_user_id, _module, _action);
    IF COALESCE(legacy ->> 'scope','none') <> 'none' THEN
      qualified := true;
      CASE legacy ->> 'scope'
        WHEN 'all' THEN has_all := true;
        WHEN 'assigned' THEN has_assigned := true;
        WHEN 'own' THEN has_own := true;
        WHEN 'sector' THEN
          sectors_agg := COALESCE(ARRAY(
            SELECT (jsonb_array_elements_text(legacy -> 'sectors'))::uuid), '{}');
        WHEN 'institution' THEN
          institutions_agg := COALESCE(ARRAY(
            SELECT (jsonb_array_elements_text(legacy -> 'licensees'))::uuid), '{}');
        ELSE NULL;
      END CASE;
      RETURN jsonb_build_object(
        'qualified', qualified, 'all', has_all, 'source', 'legacy',
        'sectors', to_jsonb(sectors_agg), 'sub_sectors', to_jsonb(sub_sectors_agg),
        'institutions', to_jsonb(institutions_agg), 'regulators', to_jsonb(regulators_agg),
        'assigned', has_assigned, 'team', has_team, 'own', has_own);
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'qualified', qualified, 'all', has_all, 'source', CASE WHEN qualified THEN 'sec' ELSE 'none' END,
    'sectors', to_jsonb(sectors_agg), 'sub_sectors', to_jsonb(sub_sectors_agg),
    'institutions', to_jsonb(institutions_agg), 'regulators', to_jsonb(regulators_agg),
    'assigned', has_assigned, 'team', has_team, 'own', has_own);
END;
$$;
REVOKE ALL ON FUNCTION public.user_scope_grants_for(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_scope_grants_for(uuid,text,text) TO authenticated, service_role;

-- ---------- 8. Helpers: portfolio + mandate support ----------
CREATE OR REPLACE FUNCTION public.staff_portfolio_allows(
  _user_id uuid, _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE has_portfolio boolean;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.staff_portfolios sp
    WHERE sp.user_id = _user_id AND sp.status = 'active'
      AND sp.effective_from <= now()
      AND (sp.effective_to IS NULL OR sp.effective_to > now())
  ) INTO has_portfolio;
  -- No portfolio configured: portfolios do not restrict (role scope still applies).
  IF NOT has_portfolio THEN RETURN true; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.staff_portfolios sp
    WHERE sp.user_id = _user_id AND sp.status = 'active'
      AND sp.effective_from <= now()
      AND (sp.effective_to IS NULL OR sp.effective_to > now())
      AND (_regulator_id IS NULL OR sp.regulator_id = _regulator_id)
      AND (
        NOT EXISTS (SELECT 1 FROM public.staff_portfolio_scopes s WHERE s.portfolio_id = sp.id)
        OR EXISTS (
          SELECT 1 FROM public.staff_portfolio_scopes s
          WHERE s.portfolio_id = sp.id
            AND (
              (s.scope_kind = 'sector' AND _sector_id IS NOT NULL AND s.sector_id = _sector_id)
              OR (s.scope_kind = 'sub_sector' AND _sub_sector_id IS NOT NULL AND s.sub_sector_id = _sub_sector_id)
              OR (s.scope_kind = 'entity' AND _entity_id IS NOT NULL AND s.entity_id = _entity_id)
            )
        )
      )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.staff_portfolio_allows(uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_portfolio_allows(uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.regulator_mandate_supports(
  _regulator_id uuid, _sector_id uuid, _sub_sector_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN _regulator_id IS NULL THEN true
      -- until a regulator has any mandate recorded, mandates do not restrict
      WHEN NOT EXISTS (
        SELECT 1 FROM public.regulator_mandates m
        WHERE m.regulator_id = _regulator_id AND m.status = 'active'
      ) THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.regulator_mandates m
        WHERE m.regulator_id = _regulator_id
          AND m.status = 'active'
          AND m.effective_from <= now()
          AND (m.effective_to IS NULL OR m.effective_to > now())
          AND (m.sector_id IS NULL OR _sector_id IS NULL OR m.sector_id = _sector_id)
          AND (m.sub_sector_id IS NULL OR _sub_sector_id IS NULL OR m.sub_sector_id = _sub_sector_id)
      )
    END;
$$;
REVOKE ALL ON FUNCTION public.regulator_mandate_supports(uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulator_mandate_supports(uuid,uuid,uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.user_team_covers_entity(_user_id uuid, _entity_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.regulatory_team_members tm
    JOIN public.regulatory_teams t ON t.id = tm.team_id AND t.status = 'active'
    JOIN public.entity_supervision_assignments esa ON esa.entity_id = _entity_id
    WHERE tm.user_id = _user_id
      AND tm.status = 'active'
      AND tm.effective_from <= now()
      AND (tm.effective_to IS NULL OR tm.effective_to > now())
      AND esa.status = 'active'
      AND esa.team = t.code
  );
$$;
REVOKE ALL ON FUNCTION public.user_team_covers_entity(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_team_covers_entity(uuid,uuid) TO authenticated, service_role;

-- ---------- 9. Canonical composite authority check ----------
CREATE OR REPLACE FUNCTION public.regulatory_scope_allows(
  _user_id uuid,
  _module text,
  _action text,
  _regulator_id uuid DEFAULT NULL,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _owner_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  g jsonb;
  sector_of_sub uuid;
  role_ok boolean := false;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  -- break-glass Super Administrator is the ONLY business-authority bypass
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;

  -- 1. canonical RBAC permission must exist
  IF NOT public.has_permission(_user_id, _module, _action) THEN RETURN false; END IF;

  -- derive the sector from the sub-sector when only the sub-sector is known
  IF _sector_id IS NULL AND _sub_sector_id IS NOT NULL THEN
    SELECT ss.sector_id INTO sector_of_sub FROM public.sub_sectors ss WHERE ss.id = _sub_sector_id;
    _sector_id := sector_of_sub;
  END IF;

  -- 2. role grant scope must allow the record (independent grants)
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
        AND public.user_team_covers_entity(_user_id, _entity_id));

  -- a sub-sector-restricted grant must NEVER be satisfied by its parent sector alone
  IF NOT role_ok THEN RETURN false; END IF;

  -- 3. staff portfolio may only narrow
  IF NOT public.staff_portfolio_allows(_user_id, _regulator_id, _sector_id, _sub_sector_id, _entity_id) THEN
    RETURN false;
  END IF;

  -- 4. regulator mandate must support the regulator/sector/sub-sector combination
  IF NOT public.regulator_mandate_supports(_regulator_id, _sector_id, _sub_sector_id) THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.regulatory_scope_allows(uuid,text,text,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.regulatory_scope_allows(uuid,text,text,uuid,uuid,uuid,uuid,uuid) TO authenticated, service_role;

-- ---------- 10. Seed the function catalogue from existing business modules ----------
INSERT INTO public.regulatory_functions (key, name, module_key, coverage_level, sort_order)
VALUES
  ('licensing','Licensing & Authorisation','license_management','sector',10),
  ('registration','Registration & Onboarding','registration_management','sector',20),
  ('returns','Regulatory Returns','returns_management','institution',30),
  ('prudential','Prudential Supervision','prudential_supervision','institution',40),
  ('market_conduct','Market Conduct Supervision','market_conduct','institution',50),
  ('complaints','Complaints Handling','complaint_management','sector',60),
  ('aml_cft','AML/CFT Supervision','aml_supervision','institution',70),
  ('inspection','Onsite Examination','inspection_management','institution',80),
  ('enforcement','Enforcement','enforcement_management','institution',90),
  ('fit_and_proper','Fit & Proper','fit_and_proper','sector',100),
  ('payment_systems','Payment Systems Oversight','prudential_payment_systems','institution',110),
  ('coordination','Regulatory Coordination','coordination','global',120)
ON CONFLICT (key) DO NOTHING;