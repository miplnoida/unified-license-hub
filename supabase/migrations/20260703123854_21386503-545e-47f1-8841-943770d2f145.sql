
-- Slice 3C-4: Fit & Proper workflow + committee governance triggers

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
    SELECT EXISTS (SELECT 1 FROM public.fp_screening_runs WHERE assessment_id = NEW.id AND status = 'success')
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

DROP TRIGGER IF EXISTS trg_fp_assessment_transition ON public.fp_assessments;
CREATE TRIGGER trg_fp_assessment_transition
  BEFORE UPDATE ON public.fp_assessments
  FOR EACH ROW EXECUTE FUNCTION public.fp_check_assessment_transition();

CREATE OR REPLACE FUNCTION public.fp_check_committee_vote()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_active BOOLEAN;
  v_exists BOOLEAN;
BEGIN
  SELECT is_active INTO v_active FROM public.fp_committee_members WHERE id = NEW.member_id;
  IF v_active IS NULL OR v_active = false THEN
    RAISE EXCEPTION 'Committee member % is not active', NEW.member_id USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.vote IN ('reject','conditional') AND (NEW.justification IS NULL OR length(trim(NEW.justification)) < 10) THEN
    RAISE EXCEPTION 'Justification (min 10 chars) required for % votes', NEW.vote USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.fp_committee_votes
      WHERE assessment_id = NEW.assessment_id AND member_id = NEW.member_id
    ) INTO v_exists;
    IF v_exists THEN
      RAISE EXCEPTION 'Member % has already voted on assessment %', NEW.member_id, NEW.assessment_id
        USING ERRCODE = 'unique_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_vote_check ON public.fp_committee_votes;
CREATE TRIGGER trg_fp_vote_check
  BEFORE INSERT OR UPDATE ON public.fp_committee_votes
  FOR EACH ROW EXECUTE FUNCTION public.fp_check_committee_vote();

CREATE OR REPLACE FUNCTION public.fp_check_determination_finalize()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_committee_id UUID;
  v_quorum INT;
  v_threshold NUMERIC;
  v_total INT;
  v_approve INT;
  v_conditional INT;
  v_pct NUMERIC;
BEGIN
  IF NEW.is_current IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF NEW.rationale IS NULL OR length(trim(NEW.rationale)) < 10 THEN
    RAISE EXCEPTION 'Determination rationale required (min 10 chars)' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT committee_id INTO v_committee_id FROM public.fp_assessments WHERE id = NEW.assessment_id;
  IF v_committee_id IS NULL THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Cannot finalize determination without an assigned committee' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  SELECT quorum, approval_threshold_pct INTO v_quorum, v_threshold
    FROM public.fp_committees WHERE id = v_committee_id;

  SELECT count(*), count(*) FILTER (WHERE vote = 'approve'), count(*) FILTER (WHERE vote = 'conditional')
    INTO v_total, v_approve, v_conditional
    FROM public.fp_committee_votes WHERE assessment_id = NEW.assessment_id;

  IF v_total < COALESCE(v_quorum, 1) THEN
    RAISE EXCEPTION 'Quorum not met: % votes cast, % required', v_total, v_quorum USING ERRCODE = 'check_violation';
  END IF;

  v_pct := CASE WHEN v_total > 0 THEN ((v_approve + v_conditional)::numeric / v_total) * 100 ELSE 0 END;

  IF NEW.outcome IN ('approved','conditional') AND v_pct < COALESCE(v_threshold, 50) THEN
    RAISE EXCEPTION 'Approval threshold not met: % percent vs required % percent', round(v_pct,1), v_threshold
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_determination_finalize ON public.fp_determinations;
CREATE TRIGGER trg_fp_determination_finalize
  BEFORE INSERT ON public.fp_determinations
  FOR EACH ROW EXECUTE FUNCTION public.fp_check_determination_finalize();

CREATE OR REPLACE FUNCTION public.fp_check_determination_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_override BOOLEAN;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_current = true AND NEW.is_current = false
     AND OLD.outcome IS NOT DISTINCT FROM NEW.outcome
     AND OLD.rationale IS NOT DISTINCT FROM NEW.rationale
     AND OLD.assessment_id IS NOT DISTINCT FROM NEW.assessment_id THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'UPDATE' AND OLD.is_current = true) OR (TG_OP = 'DELETE' AND OLD.is_current = true) THEN
    SELECT EXISTS (
      SELECT 1 FROM public.rule_overrides
      WHERE rule_key = 'fit_and_proper.determination.edit_finalized'
        AND entity_id = OLD.id::text
        AND created_at > (now() - interval '1 hour')
    ) INTO v_override;
    IF NOT v_override AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'Finalized determination % is immutable; use appeal or admin override', OLD.id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fp_determination_immutable ON public.fp_determinations;
CREATE TRIGGER trg_fp_determination_immutable
  BEFORE UPDATE OR DELETE ON public.fp_determinations
  FOR EACH ROW EXECUTE FUNCTION public.fp_check_determination_immutable();
