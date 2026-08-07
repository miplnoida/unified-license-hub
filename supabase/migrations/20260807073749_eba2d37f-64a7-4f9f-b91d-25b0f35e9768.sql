-- ============ Phase 3 F&P: additive only ============
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------- 3A duplicate candidates ----------
CREATE OR REPLACE FUNCTION public.fp_find_duplicate_candidates(
  _full_name text,
  _date_of_birth date DEFAULT NULL,
  _national_id text DEFAULT NULL,
  _limit integer DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  full_name text,
  date_of_birth date,
  national_id text,
  status text,
  name_similarity numeric,
  dob_match boolean,
  id_match boolean,
  match_score numeric,
  match_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.full_name, i.date_of_birth, i.national_id, i.status,
         round(similarity(lower(coalesce(i.full_name,'')), lower(coalesce(_full_name,'')))::numeric, 3) AS name_similarity,
         (_date_of_birth IS NOT NULL AND i.date_of_birth = _date_of_birth) AS dob_match,
         (_national_id IS NOT NULL AND nullif(trim(_national_id),'') IS NOT NULL
            AND lower(trim(i.national_id)) = lower(trim(_national_id))) AS id_match,
         round((
           0.6 * similarity(lower(coalesce(i.full_name,'')), lower(coalesce(_full_name,'')))::numeric
           + CASE WHEN _date_of_birth IS NOT NULL AND i.date_of_birth = _date_of_birth THEN 0.25 ELSE 0 END
           + CASE WHEN _national_id IS NOT NULL AND nullif(trim(_national_id),'') IS NOT NULL
                    AND lower(trim(i.national_id)) = lower(trim(_national_id)) THEN 0.15 ELSE 0 END
         )::numeric, 3) AS match_score,
         concat_ws(' + ',
           CASE WHEN similarity(lower(coalesce(i.full_name,'')), lower(coalesce(_full_name,''))) >= 0.35
                THEN 'similar name' END,
           CASE WHEN _date_of_birth IS NOT NULL AND i.date_of_birth = _date_of_birth THEN 'same date of birth' END,
           CASE WHEN _national_id IS NOT NULL AND nullif(trim(_national_id),'') IS NOT NULL
                     AND lower(trim(i.national_id)) = lower(trim(_national_id)) THEN 'same identifier' END
         ) AS match_reason
  FROM public.fp_individuals i
  WHERE public.fp_regulator_visible(i.regulator_id)
    AND (
      similarity(lower(coalesce(i.full_name,'')), lower(coalesce(_full_name,''))) >= 0.35
      OR (_date_of_birth IS NOT NULL AND i.date_of_birth = _date_of_birth)
      OR (_national_id IS NOT NULL AND nullif(trim(_national_id),'') IS NOT NULL
          AND lower(trim(i.national_id)) = lower(trim(_national_id)))
    )
  ORDER BY match_score DESC, i.full_name
  LIMIT greatest(coalesce(_limit,10), 1);
$$;

REVOKE ALL ON FUNCTION public.fp_find_duplicate_candidates(text, date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_find_duplicate_candidates(text, date, text, integer) TO authenticated;

-- ---------- 3B PQ validation states ----------
ALTER TABLE public.fp_assessments
  ADD COLUMN IF NOT EXISTS pq_state text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS pq_amendment_reason text,
  ADD COLUMN IF NOT EXISTS pq_state_changed_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.fp_pq_state_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.pq_state NOT IN ('draft','incomplete','ready_to_submit','submitted','amendment_required') THEN
    RAISE EXCEPTION 'Invalid pq_state %', NEW.pq_state USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.pq_state = 'amendment_required'
     AND (NEW.pq_amendment_reason IS NULL OR length(trim(NEW.pq_amendment_reason)) < 5) THEN
    RAISE EXCEPTION 'Amendment reason (min 5 chars) required' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.pq_state IS DISTINCT FROM OLD.pq_state THEN
    NEW.pq_state_changed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_pq_state_guard ON public.fp_assessments;
CREATE TRIGGER tg_fp_pq_state_guard
  BEFORE INSERT OR UPDATE ON public.fp_assessments
  FOR EACH ROW EXECUTE FUNCTION public.fp_pq_state_guard();

-- ---------- 3D assessment historical comparison ----------
CREATE OR REPLACE FUNCTION public.fp_assessment_comparison(_assessment_id uuid)
RETURNS TABLE (
  check_type text,
  title text,
  change_class text,
  current_severity text,
  prior_severity text,
  current_finding_id uuid,
  prior_finding_id uuid,
  prior_assessment_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_individual uuid;
  v_created timestamptz;
  v_prior uuid;
BEGIN
  SELECT a.individual_id, a.created_at INTO v_individual, v_created
  FROM public.fp_assessments a
  WHERE a.id = _assessment_id
    AND public.fp_regulator_visible(a.regulator_id);
  IF v_individual IS NULL THEN
    RETURN;
  END IF;

  SELECT a.id INTO v_prior
  FROM public.fp_assessments a
  WHERE a.individual_id = v_individual
    AND a.id <> _assessment_id
    AND a.created_at < v_created
  ORDER BY a.created_at DESC
  LIMIT 1;

  RETURN QUERY
  WITH sev AS (
    SELECT * FROM (VALUES ('high',3),('medium',2),('low',1),('none',0)) s(name, rank)
  ),
  cur AS (
    SELECT f.id, coalesce(f.check_type,'other') AS check_type, coalesce(f.title,'(untitled)') AS title,
           coalesce(f.severity,'none') AS severity
    FROM public.fp_findings f WHERE f.assessment_id = _assessment_id
  ),
  pri AS (
    SELECT f.id, coalesce(f.check_type,'other') AS check_type, coalesce(f.title,'(untitled)') AS title,
           coalesce(f.severity,'none') AS severity
    FROM public.fp_findings f WHERE v_prior IS NOT NULL AND f.assessment_id = v_prior
  )
  SELECT coalesce(c.check_type, p.check_type),
         coalesce(c.title, p.title),
         CASE
           WHEN p.id IS NULL THEN 'new'
           WHEN c.id IS NULL THEN 'resolved'
           WHEN (SELECT rank FROM sev WHERE name = c.severity) >
                (SELECT rank FROM sev WHERE name = p.severity) THEN 'worsened'
           WHEN c.severity IS DISTINCT FROM p.severity THEN 'changed'
           ELSE 'unchanged'
         END,
         c.severity, p.severity, c.id, p.id, v_prior
  FROM cur c
  FULL OUTER JOIN pri p ON p.check_type = c.check_type AND p.title = c.title
  ORDER BY 1, 2;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_assessment_comparison(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_assessment_comparison(uuid) TO authenticated;

-- ---------- 3F committee decision snapshots ----------
CREATE TABLE IF NOT EXISTS public.fp_committee_decision_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.fp_assessments(id) ON DELETE CASCADE,
  committee_id uuid NOT NULL REFERENCES public.fp_committees(id),
  regulator_id uuid,
  quorum integer NOT NULL,
  approval_threshold_pct numeric NOT NULL,
  member_roster jsonb NOT NULL DEFAULT '[]'::jsonb,
  tally jsonb NOT NULL DEFAULT '{}'::jsonb,
  outcome text NOT NULL,
  quorum_met boolean NOT NULL,
  taken_by uuid,
  taken_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fp_committee_decision_snapshots TO authenticated;
GRANT ALL ON public.fp_committee_decision_snapshots TO service_role;
ALTER TABLE public.fp_committee_decision_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_snapshots_read" ON public.fp_committee_decision_snapshots;
CREATE POLICY "fp_snapshots_read" ON public.fp_committee_decision_snapshots
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'fit_and_proper', 'view')
    AND public.fp_regulator_visible(regulator_id)
  );

CREATE OR REPLACE FUNCTION public.fp_snapshot_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Committee decision snapshots are append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_snapshot_append_only ON public.fp_committee_decision_snapshots;
CREATE TRIGGER tg_fp_snapshot_append_only
  BEFORE UPDATE OR DELETE ON public.fp_committee_decision_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.fp_snapshot_append_only();

CREATE OR REPLACE FUNCTION public.fp_record_committee_decision(_assessment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_committee public.fp_committees;
  v_assessment public.fp_assessments;
  v_roster jsonb;
  v_tally jsonb;
  v_approve numeric := 0;
  v_reject numeric := 0;
  v_abstain numeric := 0;
  v_conditional numeric := 0;
  v_votes integer := 0;
  v_total numeric := 0;
  v_pct numeric := 0;
  v_quorum_met boolean;
  v_outcome text;
  v_id uuid;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR public.has_permission(auth.uid(), 'fit_and_proper', 'edit')) THEN
    RAISE EXCEPTION 'Not authorized to record a committee decision' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_assessment FROM public.fp_assessments WHERE id = _assessment_id;
  IF v_assessment.id IS NULL THEN
    RAISE EXCEPTION 'Assessment % not found', _assessment_id USING ERRCODE = 'no_data_found';
  END IF;
  IF v_assessment.committee_id IS NULL THEN
    RAISE EXCEPTION 'Assessment % has no committee assigned', _assessment_id USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_committee_decision_snapshots WHERE assessment_id = _assessment_id) THEN
    RAISE EXCEPTION 'Committee decision already snapshotted for assessment %', _assessment_id
      USING ERRCODE = 'unique_violation';
  END IF;

  SELECT * INTO v_committee FROM public.fp_committees WHERE id = v_assessment.committee_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'member_id', m.id, 'user_id', m.user_id, 'member_role', m.member_role,
           'vote_weight', m.vote_weight, 'is_active', m.is_active,
           'vote', v.vote, 'justification', v.justification, 'voted_at', v.voted_at
         ) ORDER BY m.added_at), '[]'::jsonb)
    INTO v_roster
  FROM public.fp_committee_members m
  LEFT JOIN public.fp_committee_votes v
    ON v.member_id = m.id AND v.assessment_id = _assessment_id
  WHERE m.committee_id = v_committee.id AND m.is_active;

  SELECT count(*)::int,
         coalesce(sum(CASE WHEN v.vote = 'approve' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'reject' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'abstain' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'conditional' THEN coalesce(v.weight,1) ELSE 0 END),0)
    INTO v_votes, v_approve, v_reject, v_abstain, v_conditional
  FROM public.fp_committee_votes v
  WHERE v.assessment_id = _assessment_id;

  v_total := v_approve + v_reject + v_abstain + v_conditional;
  v_pct := CASE WHEN v_total > 0 THEN round((v_approve / v_total) * 100, 2) ELSE 0 END;
  v_quorum_met := v_votes >= coalesce(v_committee.quorum, 1);

  IF NOT v_quorum_met THEN
    v_outcome := 'insufficient_quorum';
  ELSIF v_pct >= coalesce(v_committee.approval_threshold_pct, 50) THEN
    v_outcome := CASE WHEN v_conditional > 0 THEN 'approved_with_conditions' ELSE 'approved' END;
  ELSE
    v_outcome := 'rejected';
  END IF;

  v_tally := jsonb_build_object(
    'votes', v_votes, 'total_weight', v_total,
    'approve_weight', v_approve, 'reject_weight', v_reject,
    'abstain_weight', v_abstain, 'conditional_weight', v_conditional,
    'approval_pct', v_pct
  );

  INSERT INTO public.fp_committee_decision_snapshots (
    assessment_id, committee_id, regulator_id, quorum, approval_threshold_pct,
    member_roster, tally, outcome, quorum_met, taken_by
  ) VALUES (
    _assessment_id, v_committee.id, coalesce(v_assessment.regulator_id, v_committee.regulator_id),
    coalesce(v_committee.quorum, 1), coalesce(v_committee.approval_threshold_pct, 50),
    v_roster, v_tally, v_outcome, v_quorum_met, auth.uid()
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_record_committee_decision(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_record_committee_decision(uuid) TO authenticated;

-- vote integrity: immutable submitted votes + no voting for another member
CREATE OR REPLACE FUNCTION public.fp_vote_integrity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'Submitted committee votes are immutable' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT user_id INTO v_owner FROM public.fp_committee_members WHERE id = NEW.member_id;
  IF auth.uid() IS NOT NULL
     AND v_owner IS DISTINCT FROM auth.uid()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'A vote can only be cast by the committee member who owns it'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_vote_integrity ON public.fp_committee_votes;
CREATE TRIGGER tg_fp_vote_integrity
  BEFORE INSERT OR UPDATE OR DELETE ON public.fp_committee_votes
  FOR EACH ROW EXECUTE FUNCTION public.fp_vote_integrity();

-- ---------- 3G Twin Peaks independent regulator positions ----------
CREATE OR REPLACE FUNCTION public.fp_regulator_positions(_individual_id uuid)
RETURNS TABLE (
  regulator_id uuid,
  regulator_name text,
  determination_id uuid,
  outcome text,
  rationale text,
  determined_by uuid,
  determined_at timestamptz,
  effective_from date,
  condition_count integer,
  coordination_state text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_distinct integer;
  v_regulators integer;
  v_pending boolean;
  v_state text;
BEGIN
  CREATE TEMP TABLE _fp_pos ON COMMIT DROP AS
  SELECT d.regulator_id, d.id AS determination_id, d.outcome, d.rationale,
         d.determined_by, d.determined_at, d.effective_from
  FROM public.fp_determinations d
  WHERE d.individual_id = _individual_id AND d.is_current;

  SELECT count(DISTINCT p.outcome), count(DISTINCT p.regulator_id) INTO v_distinct, v_regulators FROM _fp_pos p;

  SELECT EXISTS (
    SELECT 1 FROM public.coordination_cases c
    WHERE c.subject_type = 'fp_individual' AND c.subject_id = _individual_id
      AND c.status <> 'closed'
  ) INTO v_pending;

  IF v_regulators <= 1 THEN
    v_state := 'SINGLE_REGULATOR';
  ELSIF v_distinct > 1 THEN
    v_state := CASE WHEN v_pending THEN 'COORDINATION_PENDING' ELSE 'DISAGREEMENT' END;
  ELSE
    v_state := 'ALIGNED';
  END IF;

  RETURN QUERY
  SELECT p.regulator_id,
         r.name::text,
         p.determination_id, p.outcome, p.rationale, p.determined_by,
         p.determined_at, p.effective_from,
         (SELECT count(*)::int FROM public.fp_conditions fc WHERE fc.determination_id = p.determination_id),
         v_state
  FROM _fp_pos p
  LEFT JOIN public.regulators r ON r.id = p.regulator_id
  WHERE public.fp_regulator_visible(p.regulator_id)
     OR public.has_permission(auth.uid(), 'fit_and_proper', 'view')
  ORDER BY p.determined_at DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.fp_regulator_positions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fp_regulator_positions(uuid) TO authenticated;

-- ---------- 3H condition evidence + immutable history ----------
CREATE TABLE IF NOT EXISTS public.fp_condition_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES public.fp_conditions(id) ON DELETE CASCADE,
  individual_id uuid REFERENCES public.fp_individuals(id) ON DELETE SET NULL,
  regulator_id uuid,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  description text,
  submitted_by uuid,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.fp_condition_evidence TO authenticated;
GRANT ALL ON public.fp_condition_evidence TO service_role;
ALTER TABLE public.fp_condition_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_condition_evidence_read" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_read" ON public.fp_condition_evidence
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'fit_and_proper', 'view')
    AND public.fp_regulator_visible(regulator_id)
  );

DROP POLICY IF EXISTS "fp_condition_evidence_write" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_write" ON public.fp_condition_evidence
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'fit_and_proper', 'edit')
    AND public.fp_regulator_visible(regulator_id)
  );

DROP POLICY IF EXISTS "fp_condition_evidence_review" ON public.fp_condition_evidence;
CREATE POLICY "fp_condition_evidence_review" ON public.fp_condition_evidence
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'fit_and_proper', 'edit')
    AND public.fp_regulator_visible(regulator_id)
  )
  WITH CHECK (
    public.has_permission(auth.uid(), 'fit_and_proper', 'edit')
    AND public.fp_regulator_visible(regulator_id)
  );

CREATE TABLE IF NOT EXISTS public.fp_condition_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id uuid NOT NULL REFERENCES public.fp_conditions(id) ON DELETE CASCADE,
  individual_id uuid,
  regulator_id uuid,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  reason text,
  actor_id uuid,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fp_condition_events TO authenticated;
GRANT ALL ON public.fp_condition_events TO service_role;
ALTER TABLE public.fp_condition_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fp_condition_events_read" ON public.fp_condition_events;
CREATE POLICY "fp_condition_events_read" ON public.fp_condition_events
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'fit_and_proper', 'view')
    AND public.fp_regulator_visible(regulator_id)
  );

CREATE OR REPLACE FUNCTION public.fp_condition_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'Condition history is append-only' USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_condition_events_append_only ON public.fp_condition_events;
CREATE TRIGGER tg_fp_condition_events_append_only
  BEFORE UPDATE OR DELETE ON public.fp_condition_events
  FOR EACH ROW EXECUTE FUNCTION public.fp_condition_events_append_only();

-- extend the existing lifecycle trigger: allow 'breached', keep all prior rules
CREATE OR REPLACE FUNCTION public.fp_condition_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'waived' THEN
    IF NEW.waiver_reason IS NULL OR length(trim(NEW.waiver_reason)) < 5 THEN
      IF NEW.satisfaction_note IS NOT NULL AND length(trim(NEW.satisfaction_note)) >= 5 THEN
        NEW.waiver_reason := NEW.satisfaction_note;
      ELSE
        RAISE EXCEPTION 'Waiver reason (min 5 chars) required to mark condition as waived';
      END IF;
    END IF;
  END IF;

  IF NEW.status = 'breached'
     AND (NEW.satisfaction_note IS NULL OR length(trim(NEW.satisfaction_note)) < 5) THEN
    RAISE EXCEPTION 'Breach rationale (min 5 chars) required to mark condition as breached'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('open','breached') AND NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE THEN
    IF NEW.overdue_at IS NULL THEN
      NEW.overdue_at := now();
    END IF;
  ELSIF NEW.status IN ('satisfied','waived') THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fp_condition_log_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg uuid;
BEGIN
  SELECT i.regulator_id INTO v_reg FROM public.fp_individuals i WHERE i.id = NEW.individual_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.fp_condition_events (condition_id, individual_id, regulator_id, event_type, to_status, reason, actor_id)
    VALUES (NEW.id, NEW.individual_id, v_reg, 'created', NEW.status, NEW.description, auth.uid());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.fp_condition_events (condition_id, individual_id, regulator_id, event_type, from_status, to_status, reason, actor_id)
    VALUES (NEW.id, NEW.individual_id, v_reg, 'status_change', OLD.status, NEW.status,
            coalesce(NEW.waiver_reason, NEW.satisfaction_note), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_fp_condition_log_event ON public.fp_conditions;
CREATE TRIGGER tg_fp_condition_log_event
  AFTER INSERT OR UPDATE ON public.fp_conditions
  FOR EACH ROW EXECUTE FUNCTION public.fp_condition_log_event();

CREATE INDEX IF NOT EXISTS idx_fp_condition_events_condition ON public.fp_condition_events(condition_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fp_condition_evidence_condition ON public.fp_condition_evidence(condition_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_fp_individuals_name_trgm ON public.fp_individuals USING gin (lower(full_name) gin_trgm_ops);