-- =====================================================================
-- SMALL-REGULATOR OPERATING MODEL
-- Multi-responsibility staff allowed; independence enforced per record.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Accidental uniqueness review
--    sec_user_roles / regulatory_team_members / staff_portfolios carry no
--    per-user uniqueness -> multi-role, multi-team, multi-portfolio already
--    permitted. Legitimate uniqueness kept:
--      esa_one_active_primary_per_function (one primary supervisor / function)
--      license_appeal_panel_members (panel_id,user_id)
--      fp_committee_members (committee_id,user_id)
--    Only integrity gap: duplicate examination case-team rows.
-- ---------------------------------------------------------------------
DELETE FROM public.examination_team_members a
USING public.examination_team_members b
WHERE a.ctid < b.ctid
  AND a.examination_id = b.examination_id
  AND a.user_id IS NOT DISTINCT FROM b.user_id
  AND a.team_role IS NOT DISTINCT FROM b.team_role;

CREATE UNIQUE INDEX IF NOT EXISTS examination_team_members_unique_role
  ON public.examination_team_members (examination_id, user_id, team_role)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 1. APPEAL PARTICIPATION (attendance, conflict, recusal, voting)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.license_appeal_participation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appeal_id uuid NOT NULL REFERENCES public.license_appeals(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.license_appeal_panel_snapshots(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  member_role text,
  is_voting boolean NOT NULL DEFAULT false,
  attendance text NOT NULL DEFAULT 'pending'
    CHECK (attendance IN ('pending','attended','absent','recused')),
  conflict_declared boolean NOT NULL DEFAULT false,
  conflict_note text,
  vote text CHECK (vote IS NULL OR vote IN ('allow','dismiss','abstain')),
  vote_rationale text,
  voted_at timestamptz,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appeal_id, user_id)
);

GRANT SELECT ON public.license_appeal_participation TO authenticated;
GRANT ALL    ON public.license_appeal_participation TO service_role;
ALTER TABLE public.license_appeal_participation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lap_read ON public.license_appeal_participation;
CREATE POLICY lap_read ON public.license_appeal_participation
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR public.has_permission(auth.uid(),'license_appeals','view')
    OR user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.lap_touch() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_lap_touch ON public.license_appeal_participation;
CREATE TRIGGER trg_lap_touch BEFORE UPDATE ON public.license_appeal_participation
  FOR EACH ROW EXECUTE FUNCTION public.lap_touch();

-- Independence policy (never invented; configured per regulator/scope)
CREATE TABLE IF NOT EXISTS public.appeal_independence_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulator_id uuid,
  appeal_scope text NOT NULL,
  prior_decision_maker_may_sit boolean NOT NULL DEFAULT false,
  legal_adviser_votes boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regulator_id, appeal_scope)
);
GRANT SELECT ON public.appeal_independence_policies TO authenticated;
GRANT ALL    ON public.appeal_independence_policies TO service_role;
ALTER TABLE public.appeal_independence_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aip_read ON public.appeal_independence_policies;
CREATE POLICY aip_read ON public.appeal_independence_policies
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(),'license_appeals','view')
         OR public.is_super_admin(auth.uid()));

-- Latest snapshot helper
CREATE OR REPLACE FUNCTION public.appeal_latest_snapshot(_appeal_id uuid)
RETURNS public.license_appeal_panel_snapshots
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.license_appeal_panel_snapshots
   WHERE appeal_id = _appeal_id ORDER BY snapshot_at DESC LIMIT 1;
$$;

-- Snapshot member row for a user (NULL when not on the panel for this appeal)
CREATE OR REPLACE FUNCTION public.appeal_snapshot_member(_appeal_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m
    FROM public.license_appeal_panel_snapshots s,
         LATERAL jsonb_array_elements(s.member_roster) m
   WHERE s.appeal_id = _appeal_id
     AND (m->>'user_id')::uuid = _user_id
   ORDER BY s.snapshot_at DESC
   LIMIT 1;
$$;

-- Can this snapshot member vote?
CREATE OR REPLACE FUNCTION public.appeal_member_may_vote(_appeal_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m jsonb; s public.license_appeal_panel_snapshots; pol record; part record;
BEGIN
  m := public.appeal_snapshot_member(_appeal_id, _user_id);
  IF m IS NULL THEN
    RETURN jsonb_build_object('may_vote',false,'code','NOT_PANEL_MEMBER');
  END IF;
  s := public.appeal_latest_snapshot(_appeal_id);
  SELECT * INTO pol FROM public.appeal_independence_policies
   WHERE appeal_scope = s.appeal_scope
     AND (regulator_id IS NULL OR regulator_id = (SELECT regulator_id FROM public.license_appeals WHERE id=_appeal_id))
   ORDER BY regulator_id NULLS LAST LIMIT 1;

  IF coalesce(m->>'member_role','') = 'observer' THEN
    RETURN jsonb_build_object('may_vote',false,'code','OBSERVER_CANNOT_VOTE');
  END IF;
  IF coalesce(m->>'member_role','') = 'legal_adviser'
     AND NOT coalesce(pol.legal_adviser_votes,false) THEN
    RETURN jsonb_build_object('may_vote',false,'code','LEGAL_ADVISER_NON_VOTING');
  END IF;
  IF NOT coalesce((m->>'is_voting')::boolean,false) THEN
    RETURN jsonb_build_object('may_vote',false,'code','NON_VOTING_MEMBER');
  END IF;

  SELECT * INTO part FROM public.license_appeal_participation
   WHERE appeal_id=_appeal_id AND user_id=_user_id;
  IF part.id IS NOT NULL AND (part.attendance='recused' OR part.conflict_declared) THEN
    RETURN jsonb_build_object('may_vote',false,'code','RECUSED');
  END IF;

  -- prior decision-maker on the same matter: policy-driven, never invented
  IF EXISTS (
      SELECT 1 FROM public.license_appeals a
      LEFT JOIN public.applications ap ON ap.id = a.application_id
      WHERE a.id=_appeal_id
        AND (a.decided_by = _user_id
             OR EXISTS (SELECT 1 FROM public.approval_actions aa
                         WHERE aa.entity_id = a.application_id
                           AND aa.actor_id = _user_id))
  ) THEN
    IF pol.id IS NULL THEN
      RETURN jsonb_build_object('may_vote',true,'code','APPEAL_INDEPENDENCE_POLICY_REQUIRED',
                                'flag','APPEAL_INDEPENDENCE_POLICY_REQUIRED');
    ELSIF NOT pol.prior_decision_maker_may_sit THEN
      RETURN jsonb_build_object('may_vote',false,'code','PRIOR_DECISION_MAKER_EXCLUDED');
    END IF;
  END IF;

  RETURN jsonb_build_object('may_vote',true,'code','OK');
END; $$;

-- Record own participation / recusal
CREATE OR REPLACE FUNCTION public.appeal_record_participation(
  _appeal_id uuid, _attendance text, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); m jsonb; s public.license_appeal_panel_snapshots;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401); END IF;
  IF _attendance NOT IN ('attended','absent','recused') THEN
    RETURN jsonb_build_object('error','Unknown attendance value','code','BAD_INPUT','http',400); END IF;
  m := public.appeal_snapshot_member(_appeal_id, v_uid);
  IF m IS NULL THEN
    RETURN jsonb_build_object('error','You are not on the panel for this appeal','code','NOT_PANEL_MEMBER','http',403); END IF;
  s := public.appeal_latest_snapshot(_appeal_id);

  INSERT INTO public.license_appeal_participation
    (appeal_id, snapshot_id, user_id, member_role, is_voting, attendance,
     conflict_declared, conflict_note, recorded_by)
  VALUES (_appeal_id, s.id, v_uid, m->>'member_role',
          coalesce((m->>'is_voting')::boolean,false), _attendance,
          (_attendance='recused'), _note, v_uid)
  ON CONFLICT (appeal_id, user_id) DO UPDATE
    SET attendance = EXCLUDED.attendance,
        snapshot_id = EXCLUDED.snapshot_id,
        conflict_declared = public.license_appeal_participation.conflict_declared OR (EXCLUDED.attendance='recused'),
        conflict_note = coalesce(EXCLUDED.conflict_note, public.license_appeal_participation.conflict_note),
        vote = CASE WHEN EXCLUDED.attendance='recused' THEN NULL ELSE public.license_appeal_participation.vote END,
        recorded_by = EXCLUDED.recorded_by;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (_appeal_id,
          CASE WHEN _attendance='recused' THEN 'member_recused' ELSE 'participation_recorded' END,
          format('Panel member marked %s', _attendance), v_uid,
          jsonb_build_object('attendance',_attendance));
  RETURN jsonb_build_object('success',true,'http',200);
END; $$;

CREATE OR REPLACE FUNCTION public.appeal_declare_conflict(_appeal_id uuid, _note text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF nullif(btrim(coalesce(_note,'')),'') IS NULL THEN
    RETURN jsonb_build_object('error','Describe the conflict','code','NOTE_REQUIRED','http',400);
  END IF;
  RETURN public.appeal_record_participation(_appeal_id, 'recused', _note);
END; $$;

-- Cast a vote
CREATE OR REPLACE FUNCTION public.appeal_cast_vote(
  _appeal_id uuid, _vote text, _rationale text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); chk jsonb; s public.license_appeal_panel_snapshots; a record;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401); END IF;
  IF _vote NOT IN ('allow','dismiss','abstain') THEN
    RETURN jsonb_build_object('error','Unknown vote','code','BAD_INPUT','http',400); END IF;

  SELECT * INTO a FROM public.license_appeals WHERE id=_appeal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404); END IF;
  IF a.status='decided' THEN
    RETURN jsonb_build_object('error','This appeal has already been decided','code','ALREADY_DECIDED','http',409); END IF;

  chk := public.appeal_member_may_vote(_appeal_id, v_uid);
  IF NOT coalesce((chk->>'may_vote')::boolean,false) THEN
    RETURN jsonb_build_object('error','You cannot vote on this appeal','code',chk->>'code','http',403);
  END IF;

  s := public.appeal_latest_snapshot(_appeal_id);
  INSERT INTO public.license_appeal_participation
    (appeal_id, snapshot_id, user_id, member_role, is_voting, attendance, vote, vote_rationale, voted_at, recorded_by)
  SELECT _appeal_id, s.id, v_uid, m->>'member_role', true, 'attended', _vote, _rationale, now(), v_uid
    FROM (SELECT public.appeal_snapshot_member(_appeal_id, v_uid) AS m) x
  ON CONFLICT (appeal_id, user_id) DO UPDATE
    SET vote = EXCLUDED.vote, vote_rationale = EXCLUDED.vote_rationale,
        voted_at = now(), attendance='attended', is_voting = true, snapshot_id = EXCLUDED.snapshot_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (_appeal_id,'vote_cast','A panel member recorded their vote', v_uid,
          jsonb_build_object('vote',_vote,'flag',chk->>'flag'));

  RETURN jsonb_build_object('success',true,'http',200,'flag',chk->>'flag');
END; $$;

-- Live tally
CREATE OR REPLACE FUNCTION public.appeal_participation_status(_appeal_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s public.license_appeal_panel_snapshots;
        v_roster int; v_part int; v_allow int; v_dismiss int; v_abstain int; v_recused int;
BEGIN
  s := public.appeal_latest_snapshot(_appeal_id);
  IF s.id IS NULL THEN RETURN jsonb_build_object('has_panel',false); END IF;
  SELECT count(*) INTO v_roster FROM jsonb_array_elements(s.member_roster) r WHERE (r->>'is_voting')::boolean;
  SELECT count(*) FILTER (WHERE attendance='attended' AND is_voting AND NOT conflict_declared),
         count(*) FILTER (WHERE vote='allow'),
         count(*) FILTER (WHERE vote='dismiss'),
         count(*) FILTER (WHERE vote='abstain'),
         count(*) FILTER (WHERE attendance='recused' OR conflict_declared)
    INTO v_part, v_allow, v_dismiss, v_abstain, v_recused
    FROM public.license_appeal_participation WHERE appeal_id=_appeal_id;
  RETURN jsonb_build_object(
    'has_panel',true,'snapshot_id',s.id,'quorum',s.quorum,'decision_rule',s.decision_rule,
    'roster_voting',v_roster,'participating_voters',coalesce(v_part,0),
    'votes_allow',coalesce(v_allow,0),'votes_dismiss',coalesce(v_dismiss,0),
    'votes_abstain',coalesce(v_abstain,0),'recused',coalesce(v_recused,0),
    'quorum_met', coalesce(v_part,0) >= s.quorum);
END; $$;

-- Hardened finalisation: participation-based quorum + panel membership
CREATE OR REPLACE FUNCTION public.record_appeal_decision(
  _appeal_id uuid, _decision text, _rationale text,
  _dissent text DEFAULT NULL::text, _conditions text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_appeal record; v_snapshot record; v_reinstate jsonb;
  v_status jsonb; v_part int; v_allow int; v_dismiss int; v_family text; chk jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED','http',401); END IF;
  IF NOT public.has_permission(v_uid,'license_appeals','decide') THEN
    RETURN jsonb_build_object('error','You are not allowed to decide appeals','code','FORBIDDEN','http',403); END IF;
  IF nullif(trim(coalesce(_rationale,'')),'') IS NULL OR length(trim(_rationale)) < 10 THEN
    RETURN jsonb_build_object('error','A written rationale of at least 10 characters is required','code','RATIONALE_REQUIRED','http',400); END IF;
  IF _decision NOT IN ('upheld','partially_upheld','dismissed','remitted','overturned_to_approved') THEN
    RETURN jsonb_build_object('error','Unknown appeal decision','code','BAD_DECISION','http',400); END IF;

  SELECT * INTO v_appeal FROM public.license_appeals WHERE id=_appeal_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Appeal not found','code','NOT_FOUND','http',404); END IF;
  IF v_appeal.status='decided' THEN
    RETURN jsonb_build_object('error','This appeal has already been decided','code','ALREADY_DECIDED','http',409); END IF;

  SELECT * INTO v_snapshot FROM public.license_appeal_panel_snapshots
   WHERE appeal_id=_appeal_id ORDER BY snapshot_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','A panel must be constituted before an appeal can be decided','code','NO_PANEL','http',409); END IF;

  IF NOT public.is_super_admin(v_uid) THEN
    chk := public.appeal_member_may_vote(_appeal_id, v_uid);
    IF public.appeal_snapshot_member(_appeal_id, v_uid) IS NULL THEN
      RETURN jsonb_build_object('error','Only a member of this appeal panel may finalise the decision','code','NOT_PANEL_MEMBER','http',403); END IF;
    IF NOT coalesce((chk->>'may_vote')::boolean,false) THEN
      RETURN jsonb_build_object('error','You cannot finalise this appeal','code',chk->>'code','http',403); END IF;
  END IF;

  v_status := public.appeal_participation_status(_appeal_id);
  v_part    := (v_status->>'participating_voters')::int;
  v_allow   := (v_status->>'votes_allow')::int;
  v_dismiss := (v_status->>'votes_dismiss')::int;

  IF v_part < v_snapshot.quorum THEN
    RETURN jsonb_build_object('error',
      format('Quorum is not met: %s participating voter(s) against a quorum of %s', v_part, v_snapshot.quorum),
      'code','QUORUM_NOT_MET','http',422,'participation',v_status); END IF;

  v_family := CASE WHEN _decision IN ('upheld','partially_upheld','overturned_to_approved')
                   THEN 'allow' ELSE 'dismiss' END;

  IF v_snapshot.decision_rule = 'unanimous' THEN
    IF (v_family='allow' AND v_dismiss > 0) OR (v_family='dismiss' AND v_allow > 0)
       OR (v_allow + v_dismiss) < v_part THEN
      RETURN jsonb_build_object('error','A unanimous decision is required and the votes are not unanimous',
        'code','DECISION_RULE_NOT_SATISFIED','http',422,'participation',v_status); END IF;
  ELSE
    IF (v_family='allow' AND v_allow <= v_dismiss) OR (v_family='dismiss' AND v_dismiss <= v_allow) THEN
      IF v_snapshot.decision_rule = 'chair_casting' AND v_allow = v_dismiss
         AND EXISTS (SELECT 1 FROM jsonb_array_elements(v_snapshot.member_roster) r
                      WHERE (r->>'is_chair')::boolean AND (r->>'user_id')::uuid = v_uid) THEN
        NULL; -- chair exercises the casting vote
      ELSE
        RETURN jsonb_build_object('error','The recorded votes do not support this decision',
          'code','DECISION_RULE_NOT_SATISFIED','http',422,'participation',v_status);
      END IF;
    END IF;
  END IF;

  UPDATE public.license_appeals
     SET decision=_decision, decision_rationale=_rationale, dissent_note=_dissent,
         decision_conditions=_conditions, decided_at=now(), decided_by=v_uid,
         quorum_met=true, status='decided', updated_at=now()
   WHERE id=_appeal_id;

  INSERT INTO public.license_appeal_events (appeal_id, event_type, description, actor_id, metadata)
  VALUES (_appeal_id,'decided',
    CASE WHEN v_family='allow' THEN 'Appeal accepted for consideration' ELSE 'Appeal declined' END,
    v_uid, jsonb_build_object('decision',_decision,'participation',v_status,'snapshot_id',v_snapshot.id));

  IF v_family='allow' THEN
    v_reinstate := public.reinstate_application_after_appeal(_appeal_id, _rationale);
  END IF;

  RETURN jsonb_build_object('success',true,'http',200,'quorum_met',true,
                            'participation',v_status,'reinstatement',v_reinstate);
END; $$;

-- ---------------------------------------------------------------------
-- 2. EXAMINATION CASE-TEAM AWARENESS
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.examination_case_team_role(_user_id uuid, _examination_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT 'lead_examiner' FROM public.examinations e
      WHERE e.id=_examination_id AND e.lead_examiner_id=_user_id),
    (SELECT tm.team_role FROM public.examination_team_members tm
      WHERE tm.examination_id=_examination_id AND tm.user_id=_user_id
      ORDER BY tm.created_at LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION public.examination_action_allowed(
  _user_id uuid, _examination_id uuid, _action text, _require_case_team boolean DEFAULT true)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_entity uuid;
BEGIN
  IF _user_id IS NULL THEN RETURN false; END IF;
  IF public.is_super_admin(_user_id) THEN RETURN true; END IF;
  IF NOT public.can_act_on_examination(_user_id, _action) THEN RETURN false; END IF;

  SELECT entity_id INTO v_entity FROM public.examinations WHERE id=_examination_id;
  IF v_entity IS NOT NULL
     AND NOT public.regulatory_scope_allows(_user_id,'inspection_management',_action,
                                            NULL,NULL,NULL,v_entity,NULL) THEN
    RETURN false;
  END IF;

  IF _require_case_team
     AND public.examination_case_team_role(_user_id,_examination_id) IS NULL THEN
    RETURN false;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.examination_signoff_workpaper(
  _workpaper_id uuid, _role text, _notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wp public.examination_workpapers;
BEGIN
  SELECT * INTO v_wp FROM public.examination_workpapers WHERE id=_workpaper_id;
  IF v_wp.id IS NULL THEN RAISE EXCEPTION 'workpaper_not_found'; END IF;

  IF NOT (public.examination_action_allowed(auth.uid(), v_wp.examination_id,'workflow_action')
          OR public.examination_action_allowed(auth.uid(), v_wp.examination_id,'edit')) THEN
    IF public.can_act_on_examination(auth.uid(),'workflow_action')
       OR public.can_act_on_examination(auth.uid(),'edit') THEN
      RAISE EXCEPTION 'unassigned_examination_action';
    END IF;
    RAISE EXCEPTION 'not_authorised_for_examination_workflow';
  END IF;

  IF _role = 'preparer' THEN
    UPDATE public.examination_workpapers
       SET prepared_by=auth.uid(), prepared_at=now(), status='prepared', updated_at=now()
     WHERE id=_workpaper_id;
  ELSIF _role = 'reviewer' THEN
    IF v_wp.prepared_at IS NULL THEN RAISE EXCEPTION 'workpaper_not_prepared'; END IF;
    IF v_wp.prepared_by = auth.uid() THEN
      RAISE EXCEPTION 'workpaper_reviewer_must_differ_from_preparer'; END IF;
    UPDATE public.examination_workpapers
       SET reviewed_by=auth.uid(), reviewed_at=now(), review_notes=_notes,
           status='reviewed', updated_at=now()
     WHERE id=_workpaper_id;
  ELSE
    RAISE EXCEPTION 'invalid_signoff_role';
  END IF;

  INSERT INTO public.examination_events (examination_id, event_type, actor_id, notes, metadata)
  VALUES (v_wp.examination_id,'workpaper_'||_role||'_signoff', auth.uid(), _notes,
          jsonb_build_object('workpaper_id',_workpaper_id,'area',v_wp.area));
  RETURN jsonb_build_object('ok',true);
END; $$;

CREATE OR REPLACE FUNCTION public.examination_report_signoff(
  _report_id uuid, _role text, _notes text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.examination_reports;
BEGIN
  SELECT * INTO r FROM public.examination_reports WHERE id=_report_id;
  IF r.id IS NULL THEN RETURN jsonb_build_object('error','Report not found','code','NOT_FOUND','http',404); END IF;

  IF NOT public.examination_action_allowed(auth.uid(), r.examination_id,'workflow_action') THEN
    IF public.can_act_on_examination(auth.uid(),'workflow_action') THEN
      RETURN jsonb_build_object('error','You are not on this examination case team','code','UNASSIGNED_EXAMINATION_ACTION','http',403);
    END IF;
    RETURN jsonb_build_object('error','You are not allowed to sign off examination reports','code','FORBIDDEN','http',403);
  END IF;

  IF _role='prepare' THEN
    UPDATE public.examination_reports
       SET prepared_by=auth.uid(), prepared_at=now(), status='prepared', updated_at=now()
     WHERE id=_report_id;
  ELSIF _role='review' THEN
    IF r.prepared_at IS NULL THEN
      RETURN jsonb_build_object('error','The report has not been prepared yet','code','NOT_PREPARED','http',409); END IF;
    IF r.prepared_by = auth.uid() THEN
      RETURN jsonb_build_object('error','The reviewer must differ from the preparer','code','SELF_REVIEW_DENIED','http',403); END IF;
    UPDATE public.examination_reports
       SET reviewed_by=auth.uid(), reviewed_at=now(), status='reviewed', updated_at=now()
     WHERE id=_report_id;
  ELSIF _role='approve' THEN
    IF r.reviewed_at IS NULL THEN
      RETURN jsonb_build_object('error','The report has not been reviewed yet','code','NOT_REVIEWED','http',409); END IF;
    IF r.prepared_by = auth.uid() THEN
      RETURN jsonb_build_object('error','The approver must differ from the preparer','code','SELF_APPROVAL_DENIED','http',403); END IF;
    UPDATE public.examination_reports
       SET approved_by=auth.uid(), approved_at=now(), status='approved', updated_at=now()
     WHERE id=_report_id;
  ELSE
    RETURN jsonb_build_object('error','Unknown sign-off role','code','BAD_INPUT','http',400);
  END IF;

  INSERT INTO public.examination_events (examination_id, event_type, actor_id, notes, metadata)
  VALUES (r.examination_id,'report_'||_role, auth.uid(), _notes, jsonb_build_object('report_id',_report_id));
  RETURN jsonb_build_object('success',true,'http',200);
END; $$;

-- ---------------------------------------------------------------------
-- 3. STAFF RESPONSIBILITY PROFILE (multi-duty visibility)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.staff_responsibility_profile(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); res jsonb;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('error','Not authenticated','code','UNAUTHORIZED'); END IF;
  IF NOT (public.is_super_admin(v_uid) OR v_uid=_user_id
          OR public.has_permission(v_uid,'user_management','view')
          OR public.has_permission(v_uid,'role_management','view')
          OR public.has_permission(v_uid,'security_management','view')) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;

  SELECT jsonb_build_object(
    'user', (SELECT jsonb_build_object('id',p.id,'full_name',coalesce(p.full_name,p.email),
                                       'email',p.email,'department',p.department,'status',p.status)
               FROM public.profiles p WHERE p.id=_user_id),
    'roles', (SELECT coalesce(jsonb_agg(jsonb_build_object('key',r.key,'name',r.name,
                        'role_type',r.role_type,'status',ur.status) ORDER BY r.name),'[]'::jsonb)
                FROM public.sec_user_roles ur JOIN public.sec_roles r ON r.id=ur.role_id
               WHERE ur.user_id=_user_id AND ur.status='active'
                 AND (ur.effective_until IS NULL OR ur.effective_until > now())),
    'teams', (SELECT coalesce(jsonb_agg(jsonb_build_object('team_id',t.id,'code',t.code,'name',t.name,
                        'member_role',tm.member_role,'function',f.name,
                        'effective_from',tm.effective_from,'effective_to',tm.effective_to,
                        'expired', tm.effective_to IS NOT NULL AND tm.effective_to <= now())
                        ORDER BY t.name),'[]'::jsonb)
                FROM public.regulatory_team_members tm
                JOIN public.regulatory_teams t ON t.id=tm.team_id
                LEFT JOIN public.regulatory_functions f ON f.id=t.regulatory_function_id
               WHERE tm.user_id=_user_id AND tm.status='active'),
    'portfolios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id',sp.id,'function',f.name,
                        'regulator',rg.name,'effective_from',sp.effective_from,'effective_to',sp.effective_to)
                        ORDER BY f.name),'[]'::jsonb)
                FROM public.staff_portfolios sp
                LEFT JOIN public.regulatory_functions f ON f.id=sp.regulatory_function_id
                LEFT JOIN public.regulators rg ON rg.id=sp.regulator_id
               WHERE sp.user_id=_user_id AND sp.status='active'),
    'entity_assignments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
                        'entity_id',e.entity_id,'entity_name',l.name,'function',f.name,
                        'role', CASE WHEN e.lead_supervisor_user_id=_user_id THEN 'Lead'
                                     WHEN e.alternate_supervisor_user_id=_user_id THEN 'Alternate'
                                     ELSE 'Supervisor' END,
                        'is_primary',e.is_primary,'effective_to',e.effective_to,
                        'expired', e.effective_to IS NOT NULL AND e.effective_to <= now())
                        ORDER BY l.name),'[]'::jsonb)
                FROM public.entity_supervision_assignments e
                LEFT JOIN public.licensees l ON l.id=e.entity_id
                LEFT JOIN public.regulatory_functions f ON f.id=e.regulatory_function_id
               WHERE e.status='active'
                 AND (e.lead_supervisor_user_id=_user_id OR e.alternate_supervisor_user_id=_user_id
                      OR e.supervisor_id=_user_id)),
    'examinations', (SELECT coalesce(jsonb_agg(jsonb_build_object('examination_id',x.id,
                        'reference',x.reference,'title',x.title,'stage',x.stage,
                        'team_role', public.examination_case_team_role(_user_id, x.id)) ORDER BY x.created_at DESC),'[]'::jsonb)
                FROM public.examinations x
               WHERE x.lead_examiner_id=_user_id
                  OR EXISTS (SELECT 1 FROM public.examination_team_members tm
                              WHERE tm.examination_id=x.id AND tm.user_id=_user_id)),
    'appeal_panels', (SELECT coalesce(jsonb_agg(jsonb_build_object('panel_id',pl.id,'name',pl.name,
                        'scope',pl.appeal_scope,'member_role',pm.member_role,
                        'is_chair',pm.is_chair,'is_voting',pm.is_voting) ORDER BY pl.name),'[]'::jsonb)
                FROM public.license_appeal_panel_members pm
                JOIN public.license_appeal_panels pl ON pl.id=pm.panel_id
               WHERE pm.user_id=_user_id AND pm.is_active),
    'committees', (SELECT coalesce(jsonb_agg(jsonb_build_object('committee_id',c.id,'name',c.name,
                        'member_role',cm.member_role,'vote_weight',cm.vote_weight) ORDER BY c.name),'[]'::jsonb)
                FROM public.fp_committee_members cm
                JOIN public.fp_committees c ON c.id=cm.committee_id
               WHERE cm.user_id=_user_id AND cm.is_active)
  ) INTO res;
  RETURN res;
END; $$;

CREATE OR REPLACE FUNCTION public.staff_responsibility_directory()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'user_management','view')
          OR public.has_permission(v_uid,'role_management','view')
          OR public.has_permission(v_uid,'security_management','view')) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;
  RETURN (
    SELECT coalesce(jsonb_agg(x ORDER BY x->>'full_name'),'[]'::jsonb) FROM (
      SELECT jsonb_build_object(
        'user_id',p.id,'full_name',coalesce(p.full_name,p.email),'email',p.email,
        'roles',(SELECT count(*) FROM public.sec_user_roles ur WHERE ur.user_id=p.id AND ur.status='active'),
        'teams',(SELECT count(*) FROM public.regulatory_team_members tm WHERE tm.user_id=p.id AND tm.status='active'),
        'functions',(SELECT count(DISTINCT t.regulatory_function_id)
                       FROM public.regulatory_team_members tm JOIN public.regulatory_teams t ON t.id=tm.team_id
                      WHERE tm.user_id=p.id AND tm.status='active'),
        'entities',(SELECT count(*) FROM public.entity_supervision_assignments e
                     WHERE e.status='active' AND (e.lead_supervisor_user_id=p.id
                            OR e.alternate_supervisor_user_id=p.id OR e.supervisor_id=p.id)),
        'panels',(SELECT count(*) FROM public.license_appeal_panel_members pm WHERE pm.user_id=p.id AND pm.is_active),
        'committees',(SELECT count(*) FROM public.fp_committee_members cm WHERE cm.user_id=p.id AND cm.is_active)
      ) x
      FROM public.profiles p
      WHERE p.user_type IS DISTINCT FROM 'primary'
        AND EXISTS (SELECT 1 FROM public.sec_user_roles ur
                    JOIN public.sec_roles r ON r.id=ur.role_id
                    WHERE ur.user_id=p.id AND ur.status='active' AND r.role_type='internal')
    ) s
  );
END; $$;

-- ---------------------------------------------------------------------
-- 4. COVERAGE WARNINGS (management information only)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regulatory_coverage_warnings()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT (public.is_super_admin(v_uid)
          OR public.has_permission(v_uid,'user_management','view')
          OR public.has_permission(v_uid,'role_management','view')
          OR public.has_permission(v_uid,'security_management','view')) THEN
    RETURN jsonb_build_object('error','Not allowed','code','FORBIDDEN');
  END IF;

  RETURN (SELECT coalesce(jsonb_agg(w ORDER BY w->>'code', w->>'subject'),'[]'::jsonb) FROM (

    -- SINGLE_PERSON_FUNCTION / NO_BACKUP_AVAILABLE / TEAM_WITHOUT_LEAD
    SELECT jsonb_build_object('code','SINGLE_PERSON_FUNCTION','severity','high',
             'subject_type','team','subject_id',t.id,'subject',t.name,
             'detail','Only one active member covers this function') w
      FROM public.regulatory_teams t
     WHERE t.status='active'
       AND (SELECT count(*) FROM public.regulatory_team_members m
             WHERE m.team_id=t.id AND m.status='active'
               AND (m.effective_to IS NULL OR m.effective_to > now())) = 1

    UNION ALL
    SELECT jsonb_build_object('code','NO_BACKUP_AVAILABLE','severity','medium',
             'subject_type','team','subject_id',t.id,'subject',t.name,
             'detail','No deputy or second member is available to cover absence')
      FROM public.regulatory_teams t
     WHERE t.status='active'
       AND NOT EXISTS (SELECT 1 FROM public.regulatory_team_members m
                        WHERE m.team_id=t.id AND m.status='active'
                          AND m.member_role IN ('deputy','member')
                          AND (m.effective_to IS NULL OR m.effective_to > now()))

    UNION ALL
    SELECT jsonb_build_object('code','TEAM_WITHOUT_LEAD','severity','high',
             'subject_type','team','subject_id',t.id,'subject',t.name,
             'detail','No active lead is assigned to this team')
      FROM public.regulatory_teams t
     WHERE t.status='active'
       AND NOT EXISTS (SELECT 1 FROM public.regulatory_team_members m
                        WHERE m.team_id=t.id AND m.status='active' AND m.member_role='lead'
                          AND (m.effective_to IS NULL OR m.effective_to > now()))

    UNION ALL
    SELECT jsonb_build_object('code','EXPIRED_TEAM_MEMBERSHIP','severity','low',
             'subject_type','team','subject_id',t.id,
             'subject',t.name||' — '||coalesce(p.full_name,p.email,'member'),
             'detail','Membership cover expired on '||to_char(m.effective_to,'DD Mon YYYY'))
      FROM public.regulatory_team_members m
      JOIN public.regulatory_teams t ON t.id=m.team_id
      LEFT JOIN public.profiles p ON p.id=m.user_id
     WHERE m.status='active' AND m.effective_to IS NOT NULL AND m.effective_to <= now()

    UNION ALL
    SELECT jsonb_build_object('code','NO_ELIGIBLE_ALTERNATE','severity','medium',
             'subject_type','entity','subject_id',e.entity_id,'subject',coalesce(l.name,'Entity'),
             'detail','Primary supervisor has no alternate for this regulatory function')
      FROM public.entity_supervision_assignments e
      LEFT JOIN public.licensees l ON l.id=e.entity_id
     WHERE e.status='active' AND e.is_primary AND e.effective_to IS NULL
       AND e.alternate_supervisor_user_id IS NULL

    UNION ALL
    SELECT jsonb_build_object('code','EXPIRED_ASSIGNMENT','severity','low',
             'subject_type','entity','subject_id',e.entity_id,'subject',coalesce(l.name,'Entity'),
             'detail','Supervision assignment expired on '||to_char(e.effective_to,'DD Mon YYYY'))
      FROM public.entity_supervision_assignments e
      LEFT JOIN public.licensees l ON l.id=e.entity_id
     WHERE e.status='active' AND e.effective_to IS NOT NULL AND e.effective_to <= now()

    UNION ALL
    SELECT jsonb_build_object('code','ENTITY_WITHOUT_PRIMARY_SUPERVISOR','severity','high',
             'subject_type','entity','subject_id',l.id,'subject',l.name,
             'detail','No active primary supervisor is assigned')
      FROM public.licensees l
     WHERE coalesce(l.status,'') IN ('active','approved','licensed')
       AND NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments e
                        WHERE e.entity_id=l.id AND e.status='active' AND e.is_primary
                          AND (e.effective_to IS NULL OR e.effective_to > now()))

    UNION ALL
    SELECT jsonb_build_object('code','PANEL_BELOW_QUORUM','severity','high',
             'subject_type','panel','subject_id',pl.id,'subject',pl.name,
             'detail',format('%s eligible voting member(s) against a quorum of %s',
               (SELECT count(*) FROM public.license_appeal_panel_members m
                 WHERE m.panel_id=pl.id AND m.is_active AND m.is_voting), pl.quorum))
      FROM public.license_appeal_panels pl
     WHERE (SELECT count(*) FROM public.license_appeal_panel_members m
             WHERE m.panel_id=pl.id AND m.is_active AND m.is_voting) < pl.quorum

    UNION ALL
    SELECT jsonb_build_object('code','COMMITTEE_BELOW_QUORUM','severity','high',
             'subject_type','committee','subject_id',c.id,'subject',c.name,
             'detail',format('%s active member(s) against a quorum of %s',
               (SELECT count(*) FROM public.fp_committee_members m
                 WHERE m.committee_id=c.id AND m.is_active AND m.member_role <> 'observer'), c.quorum))
      FROM public.fp_committees c
     WHERE (SELECT count(*) FROM public.fp_committee_members m
             WHERE m.committee_id=c.id AND m.is_active AND m.member_role <> 'observer') < c.quorum

    UNION ALL
    SELECT jsonb_build_object('code','NO_INDEPENDENT_CHECKER_AVAILABLE','severity','high',
             'subject_type','team','subject_id',t.id,'subject',t.name,
             'detail','Fewer than two active members — maker-checker cannot be satisfied inside this team')
      FROM public.regulatory_teams t
     WHERE t.status='active'
       AND (SELECT count(*) FROM public.regulatory_team_members m
             WHERE m.team_id=t.id AND m.status='active'
               AND (m.effective_to IS NULL OR m.effective_to > now())) < 2
  ) s);
END; $$;

-- ---------------------------------------------------------------------
-- 5. Function privileges
-- ---------------------------------------------------------------------
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.appeal_latest_snapshot(uuid)',
    'public.appeal_snapshot_member(uuid,uuid)',
    'public.appeal_member_may_vote(uuid,uuid)',
    'public.appeal_record_participation(uuid,text,text)',
    'public.appeal_declare_conflict(uuid,text)',
    'public.appeal_cast_vote(uuid,text,text)',
    'public.appeal_participation_status(uuid)',
    'public.record_appeal_decision(uuid,text,text,text,text)',
    'public.examination_case_team_role(uuid,uuid)',
    'public.examination_action_allowed(uuid,uuid,text,boolean)',
    'public.examination_report_signoff(uuid,text,text)',
    'public.examination_signoff_workpaper(uuid,text,text)',
    'public.staff_responsibility_profile(uuid)',
    'public.staff_responsibility_directory()',
    'public.regulatory_coverage_warnings()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
END $$;
