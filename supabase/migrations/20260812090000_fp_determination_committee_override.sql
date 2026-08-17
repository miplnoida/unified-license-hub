-- ─────────────────────────────────────────────────────────────────────────────
-- fp_check_determination_finalize() has, since the staff-bypass fix, allowed
-- ANY is_fp_staff member to finalize a determination for an assessment with
-- no committee attached — with no requirement that screening ever ran, let
-- alone completed. That means a determination (Fit/Not Fit/Conditional) can
-- be recorded with zero completed screening and zero committee oversight,
-- which defeats the whole point of steps 5-8 of the F&P process.
--
-- Per product decision: keep the fast-track (no-committee) path available —
-- some sectors/institutions legitimately don't run a formal committee — but
-- require it to rest on a completed screening run. Skipping BOTH screening
-- and committee now requires an explicit, separately-permissioned, reasoned
-- override rather than being silently available to any staff member.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New granular permission action for the override, alongside the existing
--    Slice 10 fit_and_proper permission set (view/create/edit/delete/
--    view_all_entities/manage_config/workflow_action).
DO $$
DECLARE mod_id uuid;
BEGIN
  SELECT id INTO mod_id FROM public.permission_modules WHERE key = 'fit_and_proper';
  IF mod_id IS NOT NULL THEN
    INSERT INTO public.permission_actions(module_id, key, label, audience, is_system)
    VALUES (mod_id, 'override_committee', 'Finalize F&P Determination Without Committee', 'internal', true)
    ON CONFLICT (module_id, key) DO NOTHING;

    INSERT INTO public.permissions(module, action_id, name, enforced)
    SELECT 'fit_and_proper', a.id, a.key, true
    FROM public.permission_actions a
    WHERE a.module_id = mod_id AND a.key = 'override_committee'
    ON CONFLICT DO NOTHING;
  END IF;
END$$;

-- 2. Determination rows carry the override explicitly, so it's visible on
--    the record itself (not just inferable from an audit log elsewhere).
ALTER TABLE public.fp_determinations
  ADD COLUMN IF NOT EXISTS is_committee_override boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason text;

ALTER TABLE public.fp_determinations
  DROP CONSTRAINT IF EXISTS fp_determinations_override_reason_check;
ALTER TABLE public.fp_determinations
  ADD CONSTRAINT fp_determinations_override_reason_check
  CHECK (NOT is_committee_override OR (override_reason IS NOT NULL AND length(trim(override_reason)) >= 20));

-- 3. Tightened finalize gate.
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
  v_has_screening BOOLEAN;
  v_open_high_findings INT;
BEGIN
  IF NEW.is_current IS DISTINCT FROM true THEN RETURN NEW; END IF;
  IF NEW.rationale IS NULL OR length(trim(NEW.rationale)) < 10 THEN
    RAISE EXCEPTION 'Determination rationale required (min 10 chars)' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT committee_id INTO v_committee_id FROM public.fp_assessments WHERE id = NEW.assessment_id;

  IF v_committee_id IS NOT NULL THEN
    -- Committee attached: quorum/threshold are mandatory. The override flag
    -- does not apply here — attaching a committee is itself the commitment
    -- to go through it.
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
  END IF;

  -- No committee attached (fast-track path). Require completed screening —
  -- or an explicit, permissioned, documented override in its place.
  SELECT EXISTS (
    SELECT 1 FROM public.fp_screening_runs
    WHERE assessment_id = NEW.assessment_id AND status = 'completed'
  ) INTO v_has_screening;

  IF v_has_screening THEN
    IF NOT public.is_fp_staff(auth.uid()) THEN
      RAISE EXCEPTION 'Cannot finalize determination without an assigned committee' USING ERRCODE = 'check_violation';
    END IF;

    -- Even with completed screening, don't let a determination finalize
    -- over still-open high/critical findings unless explicitly overridden.
    SELECT count(*) INTO v_open_high_findings
      FROM public.fp_findings
      WHERE assessment_id = NEW.assessment_id
        AND severity IN ('high','critical')
        AND coalesce(is_false_positive, false) IS NOT TRUE
        AND coalesce(resolution_status, 'pending') = 'pending';

    IF v_open_high_findings > 0 AND NOT COALESCE(NEW.is_committee_override, false) THEN
      RAISE EXCEPTION '% unresolved high/critical finding(s) remain — resolve them or use the override action with a documented reason', v_open_high_findings
        USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_committee_override, false) THEN
    IF NEW.override_reason IS NULL OR length(trim(NEW.override_reason)) < 20 THEN
      RAISE EXCEPTION 'Committee/screening override reason must be at least 20 characters' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT (public.is_super_admin(auth.uid()) OR public.has_permission(auth.uid(), 'fit_and_proper', 'override_committee')) THEN
      RAISE EXCEPTION 'Finalizing without completed screening/committee requires the F&P committee-override permission' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Cannot finalize determination: no completed screening run and no committee assigned — use the override action with a documented reason'
    USING ERRCODE = 'check_violation';
END;
$$;
