-- ─────────────────────────────────────────────────────────────────────────────
-- fp_check_determination_finalize() blocked EVERY determination for an
-- assessment with no committee attached unless the caller held the literal
-- 'admin' role — stricter than the table's own RLS policy ("Internal
-- manages determinations"), which already trusts any F&P staff member
-- (is_fp_staff) to write to fp_determinations. In practice this meant the
-- flat /fpa/determinations screen — whose Fit/Not Fit/Conditionally
-- Fit/Deferred vocabulary exists specifically as a non-committee-governed
-- path — was unusable by ordinary staff for any assessment, full stop,
-- unless a committee happened to be attached (and then quorum applies).
--
-- Loosen the "no committee assigned" bypass to any F&P staff member,
-- matching the RLS trust boundary. Committee-governed assessments
-- (committee_id set) are unaffected — quorum and approval-threshold checks
-- below remain unconditional for everyone once a committee is attached.
-- ─────────────────────────────────────────────────────────────────────────────

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
    IF NOT public.is_fp_staff(auth.uid()) THEN
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
