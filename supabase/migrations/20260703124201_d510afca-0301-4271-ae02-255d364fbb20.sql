
-- Screening run: snapshot of active configs at time of run
ALTER TABLE public.fp_screening_runs ADD COLUMN IF NOT EXISTS config_snapshot jsonb;

-- Allow the value the edge function actually inserts
ALTER TABLE public.fp_screening_runs DROP CONSTRAINT IF EXISTS fp_screening_runs_status_check;
ALTER TABLE public.fp_screening_runs ADD CONSTRAINT fp_screening_runs_status_check
  CHECK (status = ANY (ARRAY['running','in_progress','completed','failed']));

-- Findings: severity provenance
ALTER TABLE public.fp_findings ADD COLUMN IF NOT EXISTS severity_basis jsonb;

-- Conditions: overdue timestamp + waiver reason
ALTER TABLE public.fp_conditions ADD COLUMN IF NOT EXISTS overdue_at timestamptz;
ALTER TABLE public.fp_conditions ADD COLUMN IF NOT EXISTS waiver_reason text;

-- Trigger: enforce waiver_reason (min 5 chars) when status transitions to waived,
-- and stamp overdue_at when due_date < today and status still open.
CREATE OR REPLACE FUNCTION public.fp_condition_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'waived' THEN
    IF NEW.waiver_reason IS NULL OR length(trim(NEW.waiver_reason)) < 5 THEN
      -- fall back to satisfaction_note if caller stored the reason there
      IF NEW.satisfaction_note IS NOT NULL AND length(trim(NEW.satisfaction_note)) >= 5 THEN
        NEW.waiver_reason := NEW.satisfaction_note;
      ELSE
        RAISE EXCEPTION 'Waiver reason (min 5 chars) required to mark condition as waived';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'open' AND NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    IF NEW.overdue_at IS NULL THEN
      NEW.overdue_at := now();
    END IF;
  ELSIF NEW.status IN ('satisfied','waived') THEN
    -- keep overdue_at as historical record; do not clear
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_condition_lifecycle ON public.fp_conditions;
CREATE TRIGGER trg_fp_condition_lifecycle
  BEFORE INSERT OR UPDATE ON public.fp_conditions
  FOR EACH ROW EXECUTE FUNCTION public.fp_condition_lifecycle();

-- Appeals: expand decision CHECK to include legacy labels for back-compat with existing UI
ALTER TABLE public.fp_appeals DROP CONSTRAINT IF EXISTS fp_appeals_decision_check;
ALTER TABLE public.fp_appeals ADD CONSTRAINT fp_appeals_decision_check
  CHECK (decision IS NULL OR decision = ANY (ARRAY[
    'upheld',
    'partially_upheld',
    'dismissed',
    'remitted',
    'upheld_original',
    'overturned_to_approved',
    'overturned_to_conditional'
  ]));
