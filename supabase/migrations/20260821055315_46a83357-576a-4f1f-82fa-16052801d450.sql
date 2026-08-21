-- FINAL CERTIFICATION DEFECT FIX (F&P determination integrity, forward-only)
-- The governed decision gate (fp_check_determination_finalize) correctly refuses
-- determinations without screening/committee evidence, so historic certification-seed
-- rows cannot be back-filled by a migration; they must be finalised by an authorised
-- F&P officer through the governed action. This migration therefore:
--   1) prevents any future assessment from reaching 'determined' without an artifact
--   2) exposes an invariant view so the gap is monitorable rather than silent
CREATE OR REPLACE FUNCTION public.tg_fp_require_determination_artifact()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'determined'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'determined') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.fp_determinations d
      WHERE d.assessment_id = NEW.id
        AND d.outcome IS NOT NULL
        AND length(btrim(coalesce(d.rationale, ''))) >= 10
    ) THEN
      RAISE EXCEPTION 'fit and proper assessment % cannot be marked determined without a determination artifact (outcome + rationale)', NEW.id
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_require_determination_artifact ON public.fp_assessments;
CREATE CONSTRAINT TRIGGER trg_fp_require_determination_artifact
AFTER INSERT OR UPDATE OF status ON public.fp_assessments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_fp_require_determination_artifact();

CREATE OR REPLACE VIEW public.v_fp_determination_integrity
WITH (security_invoker = on)
AS
SELECT
  a.id            AS assessment_id,
  a.individual_id,
  a.licensee_id,
  a.status,
  a.determined_at,
  'determined_without_artifact'::text AS defect
FROM public.fp_assessments a
WHERE a.status = 'determined'
  AND NOT EXISTS (
    SELECT 1 FROM public.fp_determinations d WHERE d.assessment_id = a.id
  );

GRANT SELECT ON public.v_fp_determination_integrity TO authenticated;
GRANT SELECT ON public.v_fp_determination_integrity TO service_role;