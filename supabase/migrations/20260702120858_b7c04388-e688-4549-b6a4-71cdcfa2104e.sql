
-- 2.8 ULRA-011: Auto supervisory plan on approval
CREATE TABLE public.supervisory_plan_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supervisory_plan_templates_sector ON public.supervisory_plan_templates(sector_id) WHERE is_active;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisory_plan_templates TO authenticated;
GRANT ALL ON public.supervisory_plan_templates TO service_role;
ALTER TABLE public.supervisory_plan_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can manage plan templates"
  ON public.supervisory_plan_templates FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                      AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')));

CREATE TRIGGER trg_supervisory_plan_templates_updated_at
  BEFORE UPDATE ON public.supervisory_plan_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

--
CREATE TABLE public.supervisory_plan_template_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.supervisory_plan_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_role TEXT,
  offset_days INTEGER NOT NULL DEFAULT 90,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supervisory_plan_template_actions_template ON public.supervisory_plan_template_actions(template_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisory_plan_template_actions TO authenticated;
GRANT ALL ON public.supervisory_plan_template_actions TO service_role;
ALTER TABLE public.supervisory_plan_template_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal can manage plan template actions"
  ON public.supervisory_plan_template_actions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                 AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                      AND ur.role IN ('super_admin','admin','supervisor','licensing_officer','analyst')));

CREATE TRIGGER trg_supervisory_plan_template_actions_updated_at
  BEFORE UPDATE ON public.supervisory_plan_template_actions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

--
-- Trigger: when an application is approved, create a supervisory plan seeded
-- from the matching sector template (fallback: any active global template).
--
CREATE OR REPLACE FUNCTION public.auto_seed_supervisory_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_license   RECORD;
  v_licensee  RECORD;
  v_template  RECORD;
  v_plan_id   UUID;
  v_exists    BOOLEAN;
BEGIN
  -- Only fire on transition into approved
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN RETURN NEW; END IF;

  -- Find the license issued for this application
  SELECT id, holder_id, sector_id
    INTO v_license
    FROM public.licenses
   WHERE application_id = NEW.id
   ORDER BY issued_at DESC
   LIMIT 1;

  IF v_license IS NULL THEN
    -- License not yet materialised — bail; trigger will fire again from license insert if needed
    RETURN NEW;
  END IF;

  -- Find the licensee entity for this license
  SELECT id, sector_id
    INTO v_licensee
    FROM public.licensees
   WHERE license_id = v_license.id
   LIMIT 1;

  IF v_licensee IS NULL THEN RETURN NEW; END IF;

  -- Idempotent: skip if a plan already exists for this entity from this license
  SELECT EXISTS (
    SELECT 1 FROM public.supervisory_plans
     WHERE entity_id = v_licensee.id
       AND license_id = v_license.id
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  -- Resolve template: sector match > global (sector_id NULL) > any active
  SELECT id INTO v_template
    FROM public.supervisory_plan_templates
   WHERE is_active
     AND (sector_id = v_licensee.sector_id OR sector_id = v_license.sector_id)
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_template IS NULL THEN
    SELECT id INTO v_template
      FROM public.supervisory_plan_templates
     WHERE is_active AND sector_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1;
  END IF;

  -- Create the plan (even without a template we still create an empty plan)
  INSERT INTO public.supervisory_plans (entity_id, license_id, created_from, status, notes)
  VALUES (
    v_licensee.id,
    v_license.id,
    'auto_on_approval',
    'active',
    'Auto-created on application approval'
  )
  RETURNING id INTO v_plan_id;

  -- Seed actions from template (if any)
  IF v_template.id IS NOT NULL THEN
    INSERT INTO public.supervisory_plan_actions (plan_id, title, description, owner_role, due_date, status, source)
    SELECT
      v_plan_id,
      a.title,
      a.description,
      a.owner_role,
      (CURRENT_DATE + (a.offset_days || ' days')::interval)::date,
      'pending',
      'template'
    FROM public.supervisory_plan_template_actions a
    WHERE a.template_id = v_template.id
    ORDER BY a.sort_order;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_applications_auto_supervisory_plan ON public.applications;
CREATE TRIGGER trg_applications_auto_supervisory_plan
  AFTER UPDATE OF status ON public.applications
  FOR EACH ROW
  WHEN (NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved'))
  EXECUTE FUNCTION public.auto_seed_supervisory_plan();

-- Also fire when a license is inserted for an already-approved application
-- (common because license issuance may happen after the status flip).
CREATE OR REPLACE FUNCTION public.auto_seed_supervisory_plan_from_license()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_licensee RECORD;
  v_template RECORD;
  v_plan_id  UUID;
  v_exists   BOOLEAN;
  v_app_status TEXT;
BEGIN
  IF NEW.application_id IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO v_app_status FROM public.applications WHERE id = NEW.application_id;
  IF v_app_status IS DISTINCT FROM 'approved' THEN RETURN NEW; END IF;

  SELECT id, sector_id INTO v_licensee
    FROM public.licensees WHERE license_id = NEW.id LIMIT 1;
  IF v_licensee IS NULL THEN RETURN NEW; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supervisory_plans
     WHERE entity_id = v_licensee.id AND license_id = NEW.id
  ) INTO v_exists;
  IF v_exists THEN RETURN NEW; END IF;

  SELECT id INTO v_template
    FROM public.supervisory_plan_templates
   WHERE is_active
     AND (sector_id = v_licensee.sector_id OR sector_id = NEW.sector_id)
   ORDER BY created_at DESC LIMIT 1;

  IF v_template IS NULL THEN
    SELECT id INTO v_template FROM public.supervisory_plan_templates
     WHERE is_active AND sector_id IS NULL ORDER BY created_at DESC LIMIT 1;
  END IF;

  INSERT INTO public.supervisory_plans (entity_id, license_id, created_from, status, notes)
  VALUES (v_licensee.id, NEW.id, 'auto_on_approval', 'active', 'Auto-created on license issuance')
  RETURNING id INTO v_plan_id;

  IF v_template.id IS NOT NULL THEN
    INSERT INTO public.supervisory_plan_actions (plan_id, title, description, owner_role, due_date, status, source)
    SELECT v_plan_id, a.title, a.description, a.owner_role,
           (CURRENT_DATE + (a.offset_days || ' days')::interval)::date,
           'pending', 'template'
      FROM public.supervisory_plan_template_actions a
     WHERE a.template_id = v_template.id
     ORDER BY a.sort_order;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licenses_auto_supervisory_plan ON public.licenses;
CREATE TRIGGER trg_licenses_auto_supervisory_plan
  AFTER INSERT ON public.licenses
  FOR EACH ROW EXECUTE FUNCTION public.auto_seed_supervisory_plan_from_license();
