-- =====================================================================
-- F6-B (1/2) — CANONICAL FEE & PAYMENT MONETARY MODEL (schema layer)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fee_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_number text NOT NULL,
  subject_type text NOT NULL CHECK (subject_type IN ('APPLICATION','LICENSE')),
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE,
  license_id uuid,
  service_id uuid,
  entity_id uuid,
  request_kind text,
  matter_kind text,
  service_code text,
  basis text NOT NULL CHECK (basis IN ('ASSESSED','NO_FEE_RESOLVED','WAIVED_OR_ZERO_RATED','BUSINESS_CONFIGURATION_ABSENT')),
  resolution_source text NOT NULL CHECK (resolution_source IN ('LICENSE_FEE_BINDINGS','FEE_COMPONENTS','FEE_CONFIGURATIONS','NONE')),
  config_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  assessed_total numeric(18,2) NOT NULL DEFAULT 0 CHECK (assessed_total >= 0),
  currency text NOT NULL,
  status text NOT NULL DEFAULT 'ASSESSED' CHECK (status IN ('ASSESSED','SETTLED','WAIVED','VOID')),
  assessed_at timestamptz NOT NULL DEFAULT now(),
  assessed_by uuid,
  assessed_source text NOT NULL DEFAULT 'SERVER',
  superseded_by uuid REFERENCES public.fee_assessments(id),
  superseded_at timestamptz,
  supersede_reason text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fee_assessments_idem_uk ON public.fee_assessments(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS fee_assessments_number_uk ON public.fee_assessments(assessment_number);
CREATE UNIQUE INDEX IF NOT EXISTS fee_assessments_live_app_uk
  ON public.fee_assessments(application_id)
  WHERE application_id IS NOT NULL AND status <> 'VOID';
CREATE INDEX IF NOT EXISTS fee_assessments_license_idx ON public.fee_assessments(license_id);

CREATE TABLE IF NOT EXISTS public.fee_assessment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.fee_assessments(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  fee_type_code text,
  fee_type_id uuid,
  description text,
  unit_amount numeric(18,2) NOT NULL DEFAULT 0,
  quantity numeric(18,4) NOT NULL DEFAULT 1,
  amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency text NOT NULL,
  fee_configuration_id uuid,
  binding_id uuid,
  blocking boolean NOT NULL DEFAULT true,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, line_no)
);

CREATE TABLE IF NOT EXISTS public.fee_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid REFERENCES public.fee_assessments(id) ON DELETE CASCADE,
  application_id uuid,
  payment_id uuid REFERENCES public.payments(id),
  entry_type text NOT NULL CHECK (entry_type IN ('CHARGE','PAYMENT','ALLOCATION','ADJUSTMENT','WAIVER','REVERSAL','REFUND','CREDIT')),
  amount numeric(18,2) NOT NULL,
  currency text NOT NULL,
  external_reference text,
  reversal_of uuid REFERENCES public.fee_ledger_entries(id),
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_ledger_assessment_idx ON public.fee_ledger_entries(assessment_id);
CREATE INDEX IF NOT EXISTS fee_ledger_payment_idx ON public.fee_ledger_entries(payment_id);
CREATE UNIQUE INDEX IF NOT EXISTS fee_ledger_payment_recognition_uk
  ON public.fee_ledger_entries(payment_id) WHERE entry_type = 'PAYMENT';

CREATE TABLE IF NOT EXISTS public.fee_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  assessment_id uuid NOT NULL REFERENCES public.fee_assessments(id) ON DELETE CASCADE,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL,
  ledger_entry_id uuid REFERENCES public.fee_ledger_entries(id),
  allocated_by uuid,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversal_reason text,
  reversal_ledger_entry_id uuid REFERENCES public.fee_ledger_entries(id)
);
CREATE INDEX IF NOT EXISTS fee_payment_allocations_assessment_idx ON public.fee_payment_allocations(assessment_id);

CREATE TABLE IF NOT EXISTS public.fee_payment_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_norm text NOT NULL,
  raw_reference text NOT NULL,
  source text NOT NULL,
  payment_id uuid NOT NULL REFERENCES public.payments(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fee_payment_references_norm_uk ON public.fee_payment_references(reference_norm);

CREATE TABLE IF NOT EXISTS public.fee_waivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.fee_assessments(id) ON DELETE CASCADE,
  waiver_kind text NOT NULL DEFAULT 'WAIVER' CHECK (waiver_kind IN ('WAIVER','EXEMPTION')),
  requested_amount numeric(18,2) NOT NULL CHECK (requested_amount > 0),
  approved_amount numeric(18,2),
  currency text NOT NULL,
  request_reason text NOT NULL,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
  decided_by uuid,
  decided_at timestamptz,
  decision_reason text,
  ledger_entry_id uuid REFERENCES public.fee_ledger_entries(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_waivers_assessment_idx ON public.fee_waivers(assessment_id);

ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS assessment_id uuid REFERENCES public.fee_assessments(id),
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS eligibility_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS decision_reason text,
  ADD COLUMN IF NOT EXISTS executed_by uuid,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz,
  ADD COLUMN IF NOT EXISTS ledger_entry_id uuid REFERENCES public.fee_ledger_entries(id);

CREATE TABLE IF NOT EXISTS public.fee_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  statement_reference text,
  period_start date,
  period_end date,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  total_items integer NOT NULL DEFAULT 0,
  matched_items integer NOT NULL DEFAULT 0,
  unmatched_items integer NOT NULL DEFAULT 0,
  exception_items integer NOT NULL DEFAULT 0,
  run_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.fee_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.fee_reconciliation_runs(id) ON DELETE CASCADE,
  external_reference text NOT NULL,
  external_amount numeric(18,2) NOT NULL,
  external_currency text NOT NULL,
  external_date date,
  payment_id uuid REFERENCES public.payments(id),
  assessment_id uuid REFERENCES public.fee_assessments(id),
  status text NOT NULL CHECK (status IN ('MATCHED','UNMATCHED','EXCEPTION','RESOLVED')),
  exception_code text,
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_reconciliation_items_run_idx ON public.fee_reconciliation_items(run_id);

CREATE OR REPLACE FUNCTION public.fee_assessment_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.assessed_total IS DISTINCT FROM OLD.assessed_total
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.lines IS DISTINCT FROM OLD.lines
     OR NEW.config_snapshot IS DISTINCT FROM OLD.config_snapshot
     OR NEW.assessed_at IS DISTINCT FROM OLD.assessed_at
     OR NEW.resolution_source IS DISTINCT FROM OLD.resolution_source
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'FEE_ASSESSMENT_IMMUTABLE' USING ERRCODE = '22023',
      DETAIL = 'An assessment of record cannot be re-priced. Supersede it instead.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fee_assessments_immutable ON public.fee_assessments;
CREATE TRIGGER fee_assessments_immutable BEFORE UPDATE ON public.fee_assessments
FOR EACH ROW EXECUTE FUNCTION public.fee_assessment_immutability_guard();

CREATE OR REPLACE FUNCTION public.fee_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'FEE_HISTORY_APPEND_ONLY' USING ERRCODE = '22023',
    DETAIL = format('%s is append-only; settled financial history cannot be edited or deleted.', TG_TABLE_NAME);
END $$;

DROP TRIGGER IF EXISTS fee_ledger_append_only ON public.fee_ledger_entries;
CREATE TRIGGER fee_ledger_append_only BEFORE UPDATE OR DELETE ON public.fee_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.fee_append_only_guard();

DROP TRIGGER IF EXISTS fee_assessment_lines_append_only ON public.fee_assessment_lines;
CREATE TRIGGER fee_assessment_lines_append_only BEFORE UPDATE OR DELETE ON public.fee_assessment_lines
FOR EACH ROW EXECUTE FUNCTION public.fee_append_only_guard();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_amount_nonnegative') THEN
    ALTER TABLE public.payments ADD CONSTRAINT payments_amount_nonnegative CHECK (amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_amount_positive') THEN
    ALTER TABLE public.refunds ADD CONSTRAINT refunds_amount_positive CHECK (amount > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fee_components_amount_positive') THEN
    ALTER TABLE public.fee_components ADD CONSTRAINT fee_components_amount_positive CHECK (amount >= 0);
  END IF;
END $$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fee_components FROM authenticated;
REVOKE ALL ON public.fee_components FROM anon;
GRANT SELECT ON public.fee_components TO authenticated;

DROP POLICY IF EXISTS "Applicants insert own fee components" ON public.fee_components;
DROP POLICY IF EXISTS "Applicants update own fee components" ON public.fee_components;
DROP POLICY IF EXISTS "Applicants delete own fee components" ON public.fee_components;

ALTER TABLE public.fee_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_assessment_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_payment_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_waivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_reconciliation_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.fee_assessments, public.fee_assessment_lines, public.fee_ledger_entries,
               public.fee_payment_allocations, public.fee_waivers TO authenticated;
GRANT SELECT ON public.fee_reconciliation_runs, public.fee_reconciliation_items TO authenticated;
GRANT ALL ON public.fee_assessments, public.fee_assessment_lines, public.fee_ledger_entries,
             public.fee_payment_allocations, public.fee_payment_references, public.fee_waivers,
             public.fee_reconciliation_runs, public.fee_reconciliation_items TO service_role;

CREATE POLICY fee_assessments_read ON public.fee_assessments FOR SELECT TO authenticated
USING (
  public.is_internal_staff_user(auth.uid())
  OR EXISTS (SELECT 1 FROM public.applications a
              WHERE a.id = fee_assessments.application_id AND a.applicant_id = auth.uid())
);

CREATE POLICY fee_assessment_lines_read ON public.fee_assessment_lines FOR SELECT TO authenticated
USING (
  public.is_internal_staff_user(auth.uid())
  OR EXISTS (SELECT 1 FROM public.fee_assessments fa
               JOIN public.applications a ON a.id = fa.application_id
              WHERE fa.id = fee_assessment_lines.assessment_id AND a.applicant_id = auth.uid())
);

CREATE POLICY fee_ledger_read ON public.fee_ledger_entries FOR SELECT TO authenticated
USING (
  public.is_internal_staff_user(auth.uid())
  OR EXISTS (SELECT 1 FROM public.applications a
              WHERE a.id = fee_ledger_entries.application_id AND a.applicant_id = auth.uid())
);

CREATE POLICY fee_payment_allocations_read ON public.fee_payment_allocations FOR SELECT TO authenticated
USING (
  public.is_internal_staff_user(auth.uid())
  OR EXISTS (SELECT 1 FROM public.payments p
              WHERE p.id = fee_payment_allocations.payment_id AND p.user_id = auth.uid())
);

CREATE POLICY fee_waivers_read ON public.fee_waivers FOR SELECT TO authenticated
USING (
  public.is_internal_staff_user(auth.uid())
  OR fee_waivers.requested_by = auth.uid()
);

CREATE POLICY fee_reconciliation_runs_read ON public.fee_reconciliation_runs FOR SELECT TO authenticated
USING (public.is_internal_staff_user(auth.uid()));

CREATE POLICY fee_reconciliation_items_read ON public.fee_reconciliation_items FOR SELECT TO authenticated
USING (public.is_internal_staff_user(auth.uid()));

CREATE POLICY fee_payment_references_read ON public.fee_payment_references FOR SELECT TO authenticated
USING (public.is_internal_staff_user(auth.uid()));