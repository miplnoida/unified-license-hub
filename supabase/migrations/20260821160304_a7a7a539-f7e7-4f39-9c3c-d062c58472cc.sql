-- =====================================================================
-- P04 A.6 / A.14–A.18 / A.21 — variation, decision appeals, fee bindings,
-- verification cases, gates and Entity 360 licence summary (tables).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.license_variations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  variation_reference text,
  variation_type text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  rationale text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decision_id uuid REFERENCES public.license_decisions(id) ON DELETE SET NULL,
  decision text,
  decided_by uuid,
  decided_at timestamptz,
  effective_date date,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_variation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variation_id uuid NOT NULL REFERENCES public.license_variations(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  label text NOT NULL,
  current_value text,
  requested_value text,
  approved_value text,
  requires_assessment boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_decision_appeals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_reference text,
  decision_id uuid NOT NULL REFERENCES public.license_decisions(id) ON DELETE CASCADE,
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  entity_id uuid,
  status text NOT NULL DEFAULT 'lodged',
  grounds text NOT NULL,
  relief_sought text,
  lodged_by uuid,
  lodged_at timestamptz NOT NULL DEFAULT now(),
  appeal_deadline date,
  stay_of_effect boolean NOT NULL DEFAULT false,
  outcome text,
  outcome_rationale text,
  decided_by uuid,
  decided_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_fee_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid,
  sector_id uuid,
  sub_sector_id uuid,
  category_id uuid,
  license_type text,
  matter_kind text NOT NULL,
  action_key text,
  fee_configuration_id uuid REFERENCES public.fee_configurations(id) ON DELETE SET NULL,
  fee_type_code text,
  description text,
  amount_override numeric,
  currency text NOT NULL DEFAULT 'JMD',
  blocking boolean NOT NULL DEFAULT true,
  payment_verification_required boolean NOT NULL DEFAULT true,
  due_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_fee_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  binding_id uuid REFERENCES public.license_fee_bindings(id) ON DELETE SET NULL,
  matter_kind text,
  fee_type_code text,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'JMD',
  status text NOT NULL DEFAULT 'due',
  blocking boolean NOT NULL DEFAULT true,
  payment_verification_required boolean NOT NULL DEFAULT true,
  due_date date,
  binding_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  assessed_by uuid,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  payment_reference text,
  paid_at timestamptz,
  recorded_by uuid,
  verified_by uuid,
  verified_at timestamptz,
  waived_by uuid,
  waived_at timestamptz,
  waiver_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_verification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  matter_kind text NOT NULL,
  license_type text,
  sector_id uuid,
  regulator_id uuid,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_verification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  license_id uuid NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
  matter_id uuid REFERENCES public.license_lifecycle_matters(id) ON DELETE SET NULL,
  matter_kind text,
  template_id uuid REFERENCES public.license_verification_templates(id) ON DELETE SET NULL,
  template_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'in_progress',
  outcome text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.license_verification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.license_verification_cases(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  label text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  result text,
  note text,
  evidence_document_id uuid,
  recorded_by uuid,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['license_variations','license_variation_items','license_decision_appeals',
                           'license_fee_bindings','license_fee_assessments','license_verification_templates',
                           'license_verification_cases','license_verification_items']
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY "internal read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_internal_staff_user(auth.uid()))',
      t);
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS idx_license_variations_license ON public.license_variations(license_id);
CREATE INDEX IF NOT EXISTS idx_license_decision_appeals_license ON public.license_decision_appeals(license_id);
CREATE INDEX IF NOT EXISTS idx_license_fee_assessments_license ON public.license_fee_assessments(license_id, status);
CREATE INDEX IF NOT EXISTS idx_license_verification_cases_license ON public.license_verification_cases(license_id, status);