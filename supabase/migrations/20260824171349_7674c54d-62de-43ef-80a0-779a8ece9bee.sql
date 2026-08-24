-- =========================================================================
-- Governed composition writes: appeal panels + examination case teams
-- =========================================================================

-- ---------------------------- appeal panels ------------------------------
CREATE OR REPLACE FUNCTION public.appeal_panel_quorum_feasibility(_panel_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object(
    'quorum', p.quorum,
    'voting_members', (SELECT count(*) FROM public.license_appeal_panel_members m
                        WHERE m.panel_id = p.id AND m.is_active AND m.is_voting),
    'chair_appointed', EXISTS (SELECT 1 FROM public.license_appeal_panel_members m
                        WHERE m.panel_id = p.id AND m.is_active AND m.is_chair),
    'ready', (SELECT count(*) FROM public.license_appeal_panel_members m
               WHERE m.panel_id = p.id AND m.is_active AND m.is_voting) >= p.quorum
             AND EXISTS (SELECT 1 FROM public.license_appeal_panel_members m
                          WHERE m.panel_id = p.id AND m.is_active AND m.is_chair))
  FROM public.license_appeal_panels p WHERE p.id = _panel_id;
$$;

CREATE OR REPLACE FUNCTION public.appeal_panel_assert_config(_actor uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  IF public.is_super_admin(_actor) THEN RETURN; END IF;
  IF NOT public.has_permission(_actor,'license_appeals','manage_config') THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not allowed to configure appeal panels';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.appeal_panel_create(
  _name text, _appeal_scope text, _quorum integer, _decision_rule text,
  _default_hearing_format text DEFAULT 'written', _regulator_id uuid DEFAULT NULL,
  _description text DEFAULT NULL, _effective_from date DEFAULT NULL,
  _effective_to date DEFAULT NULL, _is_active boolean DEFAULT true,
  _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM public.appeal_panel_assert_config(v_actor);
  IF coalesce(_name,'') = '' THEN RAISE EXCEPTION 'BAD_INPUT: a panel name is required'; END IF;
  IF _appeal_scope NOT IN ('licensing','fit_and_proper','enforcement') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown appeal scope %', _appeal_scope;
  END IF;
  IF coalesce(_quorum,0) < 1 THEN RAISE EXCEPTION 'BAD_INPUT: quorum must be at least 1'; END IF;
  IF _effective_to IS NOT NULL AND _effective_from IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: effective to cannot precede effective from';
  END IF;
  IF _regulator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;

  INSERT INTO public.license_appeal_panels (
    name, description, regulator_id, is_active, appeal_scope, effective_from,
    effective_to, default_hearing_format, quorum, decision_rule, notes)
  VALUES (_name, _description, _regulator_id, coalesce(_is_active,true), _appeal_scope,
          _effective_from, _effective_to, coalesce(_default_hearing_format,'written'),
          _quorum, _decision_rule, _notes)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success',true,'id',v_id,
    'quorum_feasibility', public.appeal_panel_quorum_feasibility(v_id));
END; $$;

CREATE OR REPLACE FUNCTION public.appeal_panel_update(
  _panel_id uuid, _name text DEFAULT NULL, _appeal_scope text DEFAULT NULL,
  _quorum integer DEFAULT NULL, _decision_rule text DEFAULT NULL,
  _default_hearing_format text DEFAULT NULL, _regulator_id uuid DEFAULT NULL,
  _description text DEFAULT NULL, _effective_from date DEFAULT NULL,
  _effective_to date DEFAULT NULL, _is_active boolean DEFAULT NULL,
  _notes text DEFAULT NULL, _clear_regulator boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.license_appeal_panels;
BEGIN
  PERFORM public.appeal_panel_assert_config(v_actor);
  SELECT * INTO v_row FROM public.license_appeal_panels WHERE id = _panel_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: panel not found'; END IF;
  IF _appeal_scope IS NOT NULL AND _appeal_scope NOT IN ('licensing','fit_and_proper','enforcement') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown appeal scope %', _appeal_scope;
  END IF;
  IF _quorum IS NOT NULL AND _quorum < 1 THEN RAISE EXCEPTION 'BAD_INPUT: quorum must be at least 1'; END IF;
  IF _regulator_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;

  UPDATE public.license_appeal_panels SET
    name = coalesce(_name, name),
    description = coalesce(_description, description),
    regulator_id = CASE WHEN _clear_regulator THEN NULL ELSE coalesce(_regulator_id, regulator_id) END,
    is_active = coalesce(_is_active, is_active),
    appeal_scope = coalesce(_appeal_scope, appeal_scope),
    effective_from = coalesce(_effective_from, effective_from),
    effective_to = coalesce(_effective_to, effective_to),
    default_hearing_format = coalesce(_default_hearing_format, default_hearing_format),
    quorum = coalesce(_quorum, quorum),
    decision_rule = coalesce(_decision_rule, decision_rule),
    notes = coalesce(_notes, notes),
    updated_at = now()
  WHERE id = _panel_id;

  IF (SELECT effective_to FROM public.license_appeal_panels WHERE id=_panel_id) IS NOT NULL
     AND (SELECT effective_from FROM public.license_appeal_panels WHERE id=_panel_id) IS NOT NULL
     AND (SELECT effective_to < effective_from FROM public.license_appeal_panels WHERE id=_panel_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: effective to cannot precede effective from';
  END IF;

  RETURN jsonb_build_object('success',true,'id',_panel_id,
    'quorum_feasibility', public.appeal_panel_quorum_feasibility(_panel_id));
END; $$;

-- Membership. Multi-panel / multi-team / multi-function participation is allowed
-- deliberately; only same-matter conflicts are restricted (at case level).
CREATE OR REPLACE FUNCTION public.appeal_panel_member_add(
  _panel_id uuid, _user_id uuid, _member_role text,
  _is_voting boolean DEFAULT true, _vote_weight numeric DEFAULT 1,
  _effective_from date DEFAULT NULL, _effective_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_panel public.license_appeal_panels;
  v_voting boolean;
  v_id uuid;
BEGIN
  PERFORM public.appeal_panel_assert_config(v_actor);
  SELECT * INTO v_panel FROM public.license_appeal_panels WHERE id = _panel_id;
  IF v_panel IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: panel not found'; END IF;
  IF _member_role NOT IN ('chair','member','legal_adviser','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: invalid member role %', _member_role;
  END IF;
  IF NOT public.is_internal_staff(_user_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: only active internal staff may sit on an appeal panel';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND coalesce(is_active,true)) THEN
    RAISE EXCEPTION 'BAD_INPUT: the selected staff account is not active';
  END IF;
  IF _effective_to IS NOT NULL AND _effective_from IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: effective to cannot precede effective from';
  END IF;
  IF EXISTS (SELECT 1 FROM public.license_appeal_panel_members
              WHERE panel_id = _panel_id AND user_id = _user_id AND is_active) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBERSHIP: this person is already an active member of the panel';
  END IF;
  IF _member_role = 'chair' AND EXISTS (
       SELECT 1 FROM public.license_appeal_panel_members
        WHERE panel_id = _panel_id AND is_active AND is_chair) THEN
    RAISE EXCEPTION 'CHAIR_ALREADY_APPOINTED: stand the current chair down first';
  END IF;

  v_voting := CASE WHEN _member_role = 'observer' THEN false ELSE coalesce(_is_voting,true) END;

  INSERT INTO public.license_appeal_panel_members (
    panel_id, user_id, member_role, is_chair, is_voting, vote_weight,
    effective_from, effective_to, is_active)
  VALUES (_panel_id, _user_id, _member_role, _member_role = 'chair', v_voting,
          coalesce(_vote_weight,1), _effective_from, _effective_to, true)
  ON CONFLICT (panel_id, user_id) DO UPDATE SET
    member_role = EXCLUDED.member_role, is_chair = EXCLUDED.is_chair,
    is_voting = EXCLUDED.is_voting, vote_weight = EXCLUDED.vote_weight,
    effective_from = EXCLUDED.effective_from, effective_to = EXCLUDED.effective_to,
    is_active = true, updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success',true,'id',v_id,
    'quorum_feasibility', public.appeal_panel_quorum_feasibility(_panel_id));
END; $$;

CREATE OR REPLACE FUNCTION public.appeal_panel_member_update(
  _member_id uuid, _member_role text DEFAULT NULL, _is_voting boolean DEFAULT NULL,
  _vote_weight numeric DEFAULT NULL, _effective_from date DEFAULT NULL,
  _effective_to date DEFAULT NULL, _is_active boolean DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_row public.license_appeal_panel_members;
  v_role text; v_voting boolean;
BEGIN
  PERFORM public.appeal_panel_assert_config(v_actor);
  SELECT * INTO v_row FROM public.license_appeal_panel_members WHERE id = _member_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: panel member not found'; END IF;
  v_role := coalesce(_member_role, v_row.member_role);
  IF v_role NOT IN ('chair','member','legal_adviser','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: invalid member role %', v_role;
  END IF;
  IF v_role = 'chair' AND NOT v_row.is_chair AND EXISTS (
       SELECT 1 FROM public.license_appeal_panel_members
        WHERE panel_id = v_row.panel_id AND is_active AND is_chair AND id <> _member_id) THEN
    RAISE EXCEPTION 'CHAIR_ALREADY_APPOINTED: stand the current chair down first';
  END IF;
  v_voting := CASE WHEN v_role = 'observer' THEN false
                   ELSE coalesce(_is_voting, v_row.is_voting) END;

  UPDATE public.license_appeal_panel_members SET
    member_role = v_role,
    is_chair = (v_role = 'chair'),
    is_voting = v_voting,
    vote_weight = coalesce(_vote_weight, vote_weight),
    effective_from = coalesce(_effective_from, effective_from),
    effective_to = coalesce(_effective_to, effective_to),
    is_active = coalesce(_is_active, is_active),
    updated_at = now()
  WHERE id = _member_id;

  RETURN jsonb_build_object('success',true,'id',_member_id,
    'quorum_feasibility', public.appeal_panel_quorum_feasibility(v_row.panel_id));
END; $$;

-- Stand-down, never delete: historic snapshots must stay explainable.
CREATE OR REPLACE FUNCTION public.appeal_panel_member_end(
  _member_id uuid, _effective_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.license_appeal_panel_members;
BEGIN
  PERFORM public.appeal_panel_assert_config(v_actor);
  SELECT * INTO v_row FROM public.license_appeal_panel_members WHERE id = _member_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: panel member not found'; END IF;

  UPDATE public.license_appeal_panel_members
     SET is_active = false, is_chair = false,
         effective_to = coalesce(_effective_to, current_date),
         updated_at = now()
   WHERE id = _member_id;

  RETURN jsonb_build_object('success',true,'id',_member_id,
    'quorum_feasibility', public.appeal_panel_quorum_feasibility(v_row.panel_id));
END; $$;

-- ------------------------ examination case teams -------------------------
CREATE OR REPLACE FUNCTION public.examination_team_member_add(
  _examination_id uuid, _user_id uuid, _team_role text,
  _allocated_days numeric DEFAULT NULL, _specialisation text DEFAULT NULL,
  _conflict_declared boolean DEFAULT false, _conflict_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_name text; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id = _examination_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: examination not found';
  END IF;
  -- The person forming the team must already hold examination authority for this
  -- case (super admin, permission + entity scope, and case-team standing).
  IF NOT public.examination_action_allowed(v_actor, _examination_id, 'edit', true) THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not authorised to administer this examination team';
  END IF;
  IF _team_role NOT IN ('lead_examiner','examiner','reviewer','specialist','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: invalid case role %', _team_role;
  END IF;
  IF NOT public.is_internal_staff(_user_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: only internal staff may join an examination team';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = _user_id AND coalesce(is_active,true);
  IF v_name IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: the selected staff account is not active'; END IF;
  IF EXISTS (SELECT 1 FROM public.examination_team_members
              WHERE examination_id = _examination_id AND user_id = _user_id) THEN
    RAISE EXCEPTION 'DUPLICATE_MEMBERSHIP: this person is already on the examination team';
  END IF;
  IF _team_role = 'lead_examiner' AND EXISTS (
       SELECT 1 FROM public.examination_team_members
        WHERE examination_id = _examination_id AND team_role = 'lead_examiner') THEN
    RAISE EXCEPTION 'LEAD_ALREADY_ASSIGNED: end the current lead examiner assignment first';
  END IF;

  INSERT INTO public.examination_team_members (
    examination_id, user_id, member_name, team_role, allocated_days,
    specialisation, conflict_declared, conflict_notes, created_by)
  VALUES (_examination_id, _user_id, v_name, _team_role, _allocated_days,
          _specialisation, coalesce(_conflict_declared,false), _conflict_notes, v_actor)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success',true,'id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.examination_team_member_update(
  _member_id uuid, _team_role text DEFAULT NULL, _allocated_days numeric DEFAULT NULL,
  _specialisation text DEFAULT NULL, _conflict_declared boolean DEFAULT NULL,
  _conflict_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.examination_team_members; v_role text;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  SELECT * INTO v_row FROM public.examination_team_members WHERE id = _member_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team member not found'; END IF;
  -- A member may always declare their own conflict; other changes need authority.
  IF NOT (v_row.user_id = v_actor AND _team_role IS NULL AND _allocated_days IS NULL
          AND _specialisation IS NULL)
     AND NOT public.examination_action_allowed(v_actor, v_row.examination_id, 'edit', true) THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not authorised to change this examination team';
  END IF;
  v_role := coalesce(_team_role, v_row.team_role);
  IF v_role NOT IN ('lead_examiner','examiner','reviewer','specialist','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: invalid case role %', v_role;
  END IF;
  IF v_role = 'lead_examiner' AND v_row.team_role <> 'lead_examiner' AND EXISTS (
       SELECT 1 FROM public.examination_team_members
        WHERE examination_id = v_row.examination_id AND team_role = 'lead_examiner'
          AND id <> _member_id) THEN
    RAISE EXCEPTION 'LEAD_ALREADY_ASSIGNED: end the current lead examiner assignment first';
  END IF;

  UPDATE public.examination_team_members SET
    team_role = v_role,
    allocated_days = coalesce(_allocated_days, allocated_days),
    specialisation = coalesce(_specialisation, specialisation),
    conflict_declared = coalesce(_conflict_declared, conflict_declared),
    conflict_notes = coalesce(_conflict_notes, conflict_notes),
    updated_at = now()
  WHERE id = _member_id;

  RETURN jsonb_build_object('success',true,'id',_member_id);
END; $$;

CREATE OR REPLACE FUNCTION public.examination_team_member_end(_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_actor uuid := auth.uid(); v_row public.examination_team_members;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  SELECT * INTO v_row FROM public.examination_team_members WHERE id = _member_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team member not found'; END IF;
  IF NOT public.examination_action_allowed(v_actor, v_row.examination_id, 'edit', true) THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not authorised to change this examination team';
  END IF;

  DELETE FROM public.examination_team_members WHERE id = _member_id;
  RETURN jsonb_build_object('success',true,'id',_member_id);
END; $$;

-- --------------------------- lock down direct DML -------------------------
REVOKE INSERT, UPDATE, DELETE ON public.license_appeal_panels FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.license_appeal_panel_members FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.examination_team_members FROM authenticated, anon;

GRANT EXECUTE ON FUNCTION public.appeal_panel_quorum_feasibility(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_panel_create(text, text, integer, text, text, uuid, text, date, date, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_panel_update(uuid, text, text, integer, text, text, uuid, text, date, date, boolean, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_panel_member_add(uuid, uuid, text, boolean, numeric, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_panel_member_update(uuid, text, boolean, numeric, date, date, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.appeal_panel_member_end(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.examination_team_member_add(uuid, uuid, text, numeric, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.examination_team_member_update(uuid, text, numeric, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.examination_team_member_end(uuid) TO authenticated;