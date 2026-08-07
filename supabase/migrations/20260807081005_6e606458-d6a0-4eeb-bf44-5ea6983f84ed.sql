CREATE OR REPLACE FUNCTION public.fp_record_committee_decision(_assessment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
  v_entitled integer := 0;
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

  SELECT count(*)::int INTO v_entitled
  FROM public.fp_committee_members m
  WHERE m.committee_id = v_committee.id AND m.is_active;

  -- Only votes cast by entitled (active) members of this committee count.
  SELECT count(*)::int,
         coalesce(sum(CASE WHEN v.vote = 'approve' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'reject' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'abstain' THEN coalesce(v.weight,1) ELSE 0 END),0),
         coalesce(sum(CASE WHEN v.vote = 'conditional' THEN coalesce(v.weight,1) ELSE 0 END),0)
    INTO v_votes, v_approve, v_reject, v_abstain, v_conditional
  FROM public.fp_committee_votes v
  JOIN public.fp_committee_members m
    ON m.id = v.member_id AND m.committee_id = v_committee.id AND m.is_active
  WHERE v.assessment_id = _assessment_id;

  -- Abstentions are recorded but excluded from the approval denominator.
  v_total := v_approve + v_reject + v_conditional;
  v_pct := CASE WHEN v_total > 0 THEN round((v_approve / v_total) * 100, 2) ELSE 0 END;
  v_quorum_met := v_votes >= coalesce(v_committee.quorum, 1);

  IF NOT v_quorum_met THEN
    v_outcome := 'insufficient_quorum';
  ELSIF v_total = 0 THEN
    -- quorum reached but every vote was an abstention: no decision can be taken
    v_outcome := 'insufficient_quorum';
    v_quorum_met := false;
  ELSIF v_pct >= coalesce(v_committee.approval_threshold_pct, 50) THEN
    v_outcome := CASE WHEN v_conditional > 0 THEN 'approved_with_conditions' ELSE 'approved' END;
  ELSE
    v_outcome := 'rejected';
  END IF;

  v_tally := jsonb_build_object(
    'votes', v_votes,
    'entitled_members', v_entitled,
    'total_weight', v_total,
    'approve_weight', v_approve,
    'reject_weight', v_reject,
    'abstain_weight', v_abstain,
    'conditional_weight', v_conditional,
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
$fn$;