
-- Phase 5C: F&P depth
ALTER TABLE public.fp_individual_roles
  ADD COLUMN IF NOT EXISTS reassessment_cycle_months integer,
  ADD COLUMN IF NOT EXISTS last_reassessment_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_reassessment_due date;

ALTER TABLE public.fp_findings
  ADD COLUMN IF NOT EXISTS confidence_score numeric,
  ADD COLUMN IF NOT EXISTS resolution_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS resolution_reason text,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS citations jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_fp_findings_resolution_status ON public.fp_findings(resolution_status);
CREATE INDEX IF NOT EXISTS idx_fp_individual_roles_next_due ON public.fp_individual_roles(next_reassessment_due) WHERE is_current;

-- Auto-mark bands on insert
CREATE OR REPLACE FUNCTION public.fp_finding_apply_confidence_bands()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.resolution_status = 'pending' AND NEW.confidence_score IS NOT NULL THEN
    IF NEW.confidence_score < 30 THEN
      NEW.resolution_status := 'false_positive_draft';
    ELSIF NEW.confidence_score >= 80 THEN
      NEW.resolution_status := 'true_positive_draft';
    ELSE
      NEW.resolution_status := 'needs_review';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_finding_bands ON public.fp_findings;
CREATE TRIGGER trg_fp_finding_bands
  BEFORE INSERT ON public.fp_findings
  FOR EACH ROW EXECUTE FUNCTION public.fp_finding_apply_confidence_bands();
