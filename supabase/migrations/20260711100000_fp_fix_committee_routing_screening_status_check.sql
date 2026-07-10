-- ─────────────────────────────────────────────────────────────────────────────
-- fp_check_assessment_transition() has always checked
--   fp_screening_runs.status = 'success'
-- to decide whether an assessment may move from submitted/screening to
-- awaiting_committee (committee assignment). But fp_screening_runs.status
-- only ever takes 'running' | 'in_progress' | 'completed' | 'failed' — no
-- code path, and no CHECK constraint on the table, has ever allowed
-- 'success'. fp-screening-run/index.ts marks a finished run 'completed', so
-- this trigger's condition could never be satisfied by a real, successful
-- screening run: assigning a committee failed with "Cannot route to
-- committee: no successful screening run and no override" unconditionally,
-- regardless of how many screening runs actually completed.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fp_check_assessment_transition()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_has_screening BOOLEAN;
  v_has_determination BOOLEAN;
  v_override BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    IF OLD.status IN ('determined','closed') THEN
      SELECT EXISTS (
        SELECT 1 FROM public.rule_overrides
        WHERE rule_key = 'fit_and_proper.assessment.edit_finalized'
          AND (entity_id = OLD.id::text OR entity_id IS NULL)
          AND created_at > (now() - interval '1 hour')
      ) INTO v_override;
      IF NOT v_override AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
        RAISE EXCEPTION 'F&P assessment % is % and cannot be edited without an admin override', OLD.id, OLD.status
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'submitted' AND OLD.status = 'draft' THEN
    IF NEW.form_response_id IS NULL AND (NEW.declaration_data IS NULL OR NEW.declaration_data = '{}'::jsonb) THEN
      RAISE EXCEPTION 'Cannot submit assessment: PQ/declaration is empty' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'awaiting_committee' AND OLD.status IN ('submitted','screening') THEN
    SELECT EXISTS (SELECT 1 FROM public.fp_screening_runs WHERE assessment_id = NEW.id AND status = 'completed')
      INTO v_has_screening;
    IF NOT v_has_screening THEN
      SELECT EXISTS (
        SELECT 1 FROM public.rule_overrides
        WHERE rule_key = 'fit_and_proper.skip_screening'
          AND entity_id = NEW.id::text
          AND created_at > (now() - interval '1 hour')
      ) INTO v_override;
      IF NOT v_override THEN
        RAISE EXCEPTION 'Cannot route to committee: no successful screening run and no override'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  ELSIF NEW.status = 'determined' AND OLD.status IN ('awaiting_committee','submitted') THEN
    SELECT EXISTS (SELECT 1 FROM public.fp_determinations WHERE assessment_id = NEW.id AND is_current = true)
      INTO v_has_determination;
    IF NOT v_has_determination THEN
      RAISE EXCEPTION 'Cannot mark determined: no finalized determination exists' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status = 'closed' AND OLD.status = 'determined' THEN
    NULL;
  ELSIF NEW.status = 'screening' AND OLD.status = 'submitted' THEN
    NULL;
  ELSE
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Invalid F&P assessment transition: % -> %', OLD.status, NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
