-- =====================================================================
-- PRU-GRP-001 Financial Group Consolidated Risk Profile
-- =====================================================================

-- 1. Groups ------------------------------------------------------------
CREATE TABLE public.financial_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code text NOT NULL UNIQUE,
  name text NOT NULL,
  holding_entity_id uuid REFERENCES public.licensees(id) ON DELETE SET NULL,
  sector_id uuid REFERENCES public.sectors(id) ON DELETE SET NULL,
  supervisory_lead_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT financial_groups_status_check CHECK (status IN ('active','inactive','dissolved'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_groups TO authenticated;
GRANT ALL ON public.financial_groups TO service_role;

CREATE TABLE public.financial_group_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  licensee_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  parent_member_id uuid REFERENCES public.financial_group_members(id) ON DELETE SET NULL,
  member_role text NOT NULL DEFAULT 'subsidiary',
  ownership_percentage numeric,
  consolidation_treatment text NOT NULL DEFAULT 'full',
  effective_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fgm_unique UNIQUE (group_id, licensee_id),
  CONSTRAINT fgm_role_check CHECK (member_role IN ('ultimate_holding','subsidiary','associate','joint_venture','branch')),
  CONSTRAINT fgm_treatment_check CHECK (consolidation_treatment IN ('full','proportional','equity','excluded')),
  CONSTRAINT fgm_ownership_check CHECK (ownership_percentage IS NULL OR (ownership_percentage >= 0 AND ownership_percentage <= 100))
);
CREATE INDEX idx_fgm_group ON public.financial_group_members(group_id);
CREATE INDEX idx_fgm_licensee ON public.financial_group_members(licensee_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_group_members TO authenticated;
GRANT ALL ON public.financial_group_members TO service_role;

-- 2. Consolidation methodology (versioned) ----------------------------
CREATE TABLE public.group_consolidation_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  ratio_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  eliminate_exposure_types text[] NOT NULL DEFAULT ARRAY['loan','deposit','capital']::text[],
  large_exposure_pct numeric NOT NULL DEFAULT 10,
  total_assets_ratio_key text,
  capital_ratio_key text,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gcm_unique UNIQUE (group_id, version)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_consolidation_methods TO authenticated;
GRANT ALL ON public.group_consolidation_methods TO service_role;

-- 3. Intra-group exposures --------------------------------------------
CREATE TABLE public.intragroup_exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  from_entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  to_entity_id uuid NOT NULL REFERENCES public.licensees(id) ON DELETE CASCADE,
  exposure_type text NOT NULL DEFAULT 'loan',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JMD',
  period_key text NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  source_ref text,
  notes text,
  captured_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ige_type_check CHECK (exposure_type IN ('loan','deposit','capital','guarantee','other')),
  CONSTRAINT ige_distinct_check CHECK (from_entity_id <> to_entity_id),
  CONSTRAINT ige_amount_check CHECK (amount >= 0)
);
CREATE INDEX idx_ige_group_period ON public.intragroup_exposures(group_id, period_key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.intragroup_exposures TO authenticated;
GRANT ALL ON public.intragroup_exposures TO service_role;

-- 4. Consolidated snapshots + group score -----------------------------
CREATE TABLE public.group_consolidated_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  ratios jsonb NOT NULL DEFAULT '[]'::jsonb,
  eliminations jsonb NOT NULL DEFAULT '{}'::jsonb,
  member_count integer NOT NULL DEFAULT 0,
  methodology_version integer,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gcs_unique UNIQUE (group_id, period_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_consolidated_snapshots TO authenticated;
GRANT ALL ON public.group_consolidated_snapshots TO service_role;

CREATE TABLE public.group_risk_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  period_key text NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  band text NOT NULL DEFAULT 'low',
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_current boolean NOT NULL DEFAULT true,
  computed_at timestamptz NOT NULL DEFAULT now(),
  computed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grs_unique UNIQUE (group_id, period_key),
  CONSTRAINT grs_band_check CHECK (band IN ('low','medium','high','critical'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_risk_scores TO authenticated;
GRANT ALL ON public.group_risk_scores TO service_role;

-- 5. Group EWIs -------------------------------------------------------
CREATE TABLE public.group_ewi_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  condition jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'high',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ger_severity_check CHECK (severity IN ('low','medium','high','critical'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_ewi_rules TO authenticated;
GRANT ALL ON public.group_ewi_rules TO service_role;

CREATE TABLE public.group_ewi_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.financial_groups(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  rule_name text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  status text NOT NULL DEFAULT 'open',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  fired_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gea_status_check CHECK (status IN ('open','acknowledged','closed'))
);
CREATE INDEX idx_gea_group ON public.group_ewi_alerts(group_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_ewi_alerts TO authenticated;
GRANT ALL ON public.group_ewi_alerts TO service_role;

-- updated_at triggers -------------------------------------------------
CREATE TRIGGER trg_fg_updated BEFORE UPDATE ON public.financial_groups FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_fgm_updated BEFORE UPDATE ON public.financial_group_members FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gcm_updated BEFORE UPDATE ON public.group_consolidation_methods FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ige_updated BEFORE UPDATE ON public.intragroup_exposures FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gcs_updated BEFORE UPDATE ON public.group_consolidated_snapshots FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_grs_updated BEFORE UPDATE ON public.group_risk_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_ger_updated BEFORE UPDATE ON public.group_ewi_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_gea_updated BEFORE UPDATE ON public.group_ewi_alerts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =====================================================================
-- Access helpers
-- =====================================================================
CREATE OR REPLACE FUNCTION public.can_read_financial_group(_user uuid, _group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR public.has_permission(_user, 'prudential_supervision', 'view_all_entities')
      OR EXISTS (
           SELECT 1 FROM public.financial_group_members m
           WHERE m.group_id = _group_id
             AND public.can_read_prudential_entity(_user, m.licensee_id)
         )
      OR EXISTS (
           SELECT 1 FROM public.financial_groups g
           WHERE g.id = _group_id AND g.holding_entity_id IS NOT NULL
             AND public.can_read_prudential_entity(_user, g.holding_entity_id)
         );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_financial_group(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin(_user)
      OR (public.can_act_on_prudential(_user)
          AND (public.has_permission(_user, 'prudential_supervision', 'edit')
            OR public.has_permission(_user, 'prudential_supervision', 'workflow_action')));
$$;

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.financial_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY fg_read ON public.financial_groups FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), id));
CREATE POLICY fg_insert ON public.financial_groups FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_financial_group(auth.uid()));
CREATE POLICY fg_update ON public.financial_groups FOR UPDATE TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));
CREATE POLICY fg_delete ON public.financial_groups FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

ALTER TABLE public.financial_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY fgm_read ON public.financial_group_members FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY fgm_write ON public.financial_group_members FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.group_consolidation_methods ENABLE ROW LEVEL SECURITY;
CREATE POLICY gcm_read ON public.group_consolidation_methods FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gcm_write ON public.group_consolidation_methods FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.intragroup_exposures ENABLE ROW LEVEL SECURITY;
CREATE POLICY ige_read ON public.intragroup_exposures FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY ige_write ON public.intragroup_exposures FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.group_consolidated_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY gcs_read ON public.group_consolidated_snapshots FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gcs_write ON public.group_consolidated_snapshots FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.group_risk_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY grs_read ON public.group_risk_scores FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY grs_write ON public.group_risk_scores FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.group_ewi_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY ger_read ON public.group_ewi_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY ger_write ON public.group_ewi_rules FOR ALL TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));

ALTER TABLE public.group_ewi_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY gea_read ON public.group_ewi_alerts FOR SELECT TO authenticated
  USING (public.can_read_financial_group(auth.uid(), group_id));
CREATE POLICY gea_insert ON public.group_ewi_alerts FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_financial_group(auth.uid()));
CREATE POLICY gea_update ON public.group_ewi_alerts FOR UPDATE TO authenticated
  USING (public.can_manage_financial_group(auth.uid()))
  WITH CHECK (public.can_manage_financial_group(auth.uid()));
CREATE POLICY gea_delete ON public.group_ewi_alerts FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Seed the FRD group EWIs (EWI-007 per R-PRU-025)
INSERT INTO public.group_ewi_rules (code, name, description, condition, severity)
VALUES
  ('EWI-007', 'Two or more subsidiaries rated High risk',
   'Fires when two or more members of the group hold a current risk band of high or critical.',
   '{"type":"member_band_count","band_in":["high","critical"],"min_count":2}'::jsonb, 'high'),
  ('EWI-G02', 'Large intra-group exposure concentration',
   'Fires when any intra-group exposure exceeds the configured large-exposure percentage of group capital.',
   '{"type":"large_exposure"}'::jsonb, 'medium'),
  ('EWI-G03', 'Circular intra-group exposure detected',
   'Fires when a circular exposure chain is detected between group members.',
   '{"type":"circular_exposure"}'::jsonb, 'high')
ON CONFLICT (code) DO NOTHING;