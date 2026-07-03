
-- ============ Twin-Peaks clearances ============
CREATE TABLE IF NOT EXISTS public.twinpeaks_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  regulator_role text NOT NULL CHECK (regulator_role IN ('prudential','conduct')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','clear','conditional','blocked')),
  conditions text[] NOT NULL DEFAULT '{}',
  rationale text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, regulator_role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.twinpeaks_clearances TO authenticated;
GRANT ALL ON public.twinpeaks_clearances TO service_role;

ALTER TABLE public.twinpeaks_clearances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff read twinpeaks clearances"
  ON public.twinpeaks_clearances FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Internal staff write twinpeaks clearances"
  ON public.twinpeaks_clearances FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Internal staff update twinpeaks clearances"
  ON public.twinpeaks_clearances FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Service manages twinpeaks clearances"
  ON public.twinpeaks_clearances FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_twinpeaks_clearances_app ON public.twinpeaks_clearances(application_id);

CREATE TRIGGER trg_twinpeaks_clearances_updated_at
  BEFORE UPDATE ON public.twinpeaks_clearances
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ Twin-Peaks disagreements ============
CREATE TABLE IF NOT EXISTS public.twinpeaks_disagreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  raised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  raised_at timestamptz NOT NULL DEFAULT now(),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','escalated')),
  resolution text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.twinpeaks_disagreements TO authenticated;
GRANT ALL ON public.twinpeaks_disagreements TO service_role;

ALTER TABLE public.twinpeaks_disagreements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal staff read twinpeaks disagreements"
  ON public.twinpeaks_disagreements FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Internal staff write twinpeaks disagreements"
  ON public.twinpeaks_disagreements FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Internal staff update twinpeaks disagreements"
  ON public.twinpeaks_disagreements FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role IN ('super_admin','admin','licensing_officer','supervisor','analyst','legal_compliance')
    )
  );

CREATE POLICY "Service manages twinpeaks disagreements"
  ON public.twinpeaks_disagreements FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_twinpeaks_disagreements_app ON public.twinpeaks_disagreements(application_id);

CREATE TRIGGER trg_twinpeaks_disagreements_updated_at
  BEFORE UPDATE ON public.twinpeaks_disagreements
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ Coordination clearance flag ============
ALTER TABLE public.coordination_cases
  ADD COLUMN IF NOT EXISTS clearance_required boolean NOT NULL DEFAULT false;

-- ============ Auto-provision supervisory plan on license issuance ============
CREATE OR REPLACE FUNCTION public.tg_license_issued_seed_plan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
  v_plan_id uuid;
  v_start date;
BEGIN
  -- Only seed for active licenses; on UPDATE we require a status transition into 'active'
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'active' THEN
    RETURN NEW;
  END IF;

  -- Skip if a plan already exists for this license
  IF EXISTS (SELECT 1 FROM public.supervisory_plans WHERE license_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Pick the best-matching active template: prefer sector match, then global
  SELECT id INTO v_template_id
  FROM public.supervisory_plan_templates
  WHERE is_active
    AND (sector_id = NEW.sector_id OR sector_id IS NULL)
  ORDER BY (sector_id IS NOT DISTINCT FROM NEW.sector_id) DESC, created_at DESC
  LIMIT 1;

  IF v_template_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_start := COALESCE(NEW.valid_from, NEW.issued_at::date, CURRENT_DATE);

  INSERT INTO public.supervisory_plans (
    entity_id, license_id, created_from, status, notes, approval_status
  ) VALUES (
    NEW.holder_id, NEW.id, 'auto_license_issued',
    'active',
    'Auto-provisioned from supervisory plan template on license issuance.',
    'draft'
  )
  RETURNING id INTO v_plan_id;

  INSERT INTO public.supervisory_plan_actions (
    plan_id, title, description, owner_role, due_date, source
  )
  SELECT v_plan_id, a.title, a.description, a.owner_role,
         (v_start + (a.offset_days || ' days')::interval)::date,
         'template'
  FROM public.supervisory_plan_template_actions a
  WHERE a.template_id = v_template_id
  ORDER BY a.sort_order;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_license_issued_seed_plan_ins ON public.licenses;
CREATE TRIGGER trg_license_issued_seed_plan_ins
AFTER INSERT ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.tg_license_issued_seed_plan();

DROP TRIGGER IF EXISTS trg_license_issued_seed_plan_upd ON public.licenses;
CREATE TRIGGER trg_license_issued_seed_plan_upd
AFTER UPDATE OF status ON public.licenses
FOR EACH ROW EXECUTE FUNCTION public.tg_license_issued_seed_plan();
