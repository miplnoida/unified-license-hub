-- examination_team_member_add: add canonical prudential audit event
CREATE OR REPLACE FUNCTION public.examination_team_member_add(_examination_id uuid, _user_id uuid, _team_role text, _allocated_days numeric DEFAULT NULL::numeric, _specialisation text DEFAULT NULL::text, _conflict_declared boolean DEFAULT false, _conflict_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_name text; v_id uuid;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.examinations WHERE id = _examination_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: examination not found';
  END IF;
  IF NOT public.examination_action_allowed(v_actor, _examination_id, 'edit', true) THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not authorised to administer this examination team';
  END IF;
  IF _team_role NOT IN ('lead_examiner','examiner','reviewer','specialist','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: invalid case role %', _team_role;
  END IF;
  IF NOT public.is_internal_staff(_user_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: only internal staff may join an examination team';
  END IF;
  SELECT coalesce(full_name, email) INTO v_name FROM public.profiles
   WHERE id = _user_id AND lower(coalesce(status,'active')) = 'active';
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

  PERFORM public.prudential_audit_event(
    'examination_team_member_added',
    'examination_team_member',
    v_id,
    NULL,
    jsonb_build_object(
      'examination_id', _examination_id,
      'user_id', _user_id,
      'member_name', v_name,
      'team_role', _team_role,
      'allocated_days', _allocated_days,
      'specialisation', _specialisation,
      'conflict_declared', coalesce(_conflict_declared,false),
      'conflict_notes', _conflict_notes),
    jsonb_build_object('examination_id', _examination_id, 'module', 'examinations'),
    NULL,
    'CREATE'::public.compliance_audit_action);

  RETURN jsonb_build_object('success',true,'id',v_id);
END; $function$;

-- examination_team_member_update: add canonical prudential audit event
CREATE OR REPLACE FUNCTION public.examination_team_member_update(_member_id uuid, _team_role text DEFAULT NULL::text, _allocated_days numeric DEFAULT NULL::numeric, _specialisation text DEFAULT NULL::text, _conflict_declared boolean DEFAULT NULL::boolean, _conflict_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_row public.examination_team_members; v_role text;
        v_after public.examination_team_members;
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
  WHERE id = _member_id
  RETURNING * INTO v_after;

  PERFORM public.prudential_audit_event(
    'examination_team_member_updated',
    'examination_team_member',
    _member_id,
    jsonb_build_object(
      'team_role', v_row.team_role,
      'allocated_days', v_row.allocated_days,
      'specialisation', v_row.specialisation,
      'conflict_declared', v_row.conflict_declared,
      'conflict_notes', v_row.conflict_notes),
    jsonb_build_object(
      'team_role', v_after.team_role,
      'allocated_days', v_after.allocated_days,
      'specialisation', v_after.specialisation,
      'conflict_declared', v_after.conflict_declared,
      'conflict_notes', v_after.conflict_notes),
    jsonb_build_object('examination_id', v_row.examination_id, 'user_id', v_row.user_id, 'module', 'examinations'),
    NULL,
    'UPDATE'::public.compliance_audit_action);

  RETURN jsonb_build_object('success',true,'id',_member_id);
END; $function$;

-- examination_team_member_end: add canonical prudential audit event
CREATE OR REPLACE FUNCTION public.examination_team_member_end(_member_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_actor uuid := auth.uid(); v_row public.examination_team_members;
BEGIN
  IF v_actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  SELECT * INTO v_row FROM public.examination_team_members WHERE id = _member_id;
  IF v_row IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team member not found'; END IF;
  IF NOT public.examination_action_allowed(v_actor, v_row.examination_id, 'edit', true) THEN
    RAISE EXCEPTION 'FORBIDDEN: you are not authorised to change this examination team';
  END IF;

  DELETE FROM public.examination_team_members WHERE id = _member_id;

  PERFORM public.prudential_audit_event(
    'examination_team_member_ended',
    'examination_team_member',
    _member_id,
    jsonb_build_object(
      'examination_id', v_row.examination_id,
      'user_id', v_row.user_id,
      'member_name', v_row.member_name,
      'team_role', v_row.team_role,
      'allocated_days', v_row.allocated_days,
      'specialisation', v_row.specialisation,
      'conflict_declared', v_row.conflict_declared),
    NULL,
    jsonb_build_object('examination_id', v_row.examination_id, 'module', 'examinations'),
    NULL,
    'DELETE'::public.compliance_audit_action);

  RETURN jsonb_build_object('success',true,'id',_member_id);
END; $function$;

-- pfmi_save_principle: add canonical prudential audit event
CREATE OR REPLACE FUNCTION public.pfmi_save_principle(_assessment_id uuid, _principle_number integer, _self_score text DEFAULT NULL::text, _regulatory_score text DEFAULT NULL::text, _narrative text DEFAULT NULL::text, _evidence jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_status text;
        v_before public.pfmi_assessment_principles;
        v_after public.pfmi_assessment_principles;
BEGIN
  IF NOT public.can_act_on_payment_oversight(auth.uid(), 'edit') THEN
    RAISE EXCEPTION 'not_authorised_for_payment_oversight';
  END IF;
  SELECT status INTO v_status FROM public.pfmi_assessments WHERE id = _assessment_id;
  IF v_status IS NULL THEN RAISE EXCEPTION 'assessment_not_found'; END IF;
  IF v_status <> 'in_progress' THEN RAISE EXCEPTION 'assessment_not_editable'; END IF;

  IF _regulatory_score IS NOT NULL AND _regulatory_score NOT IN
     ('observed','broadly_observed','partly_observed','not_observed','not_applicable') THEN
    RAISE EXCEPTION 'invalid_regulatory_score';
  END IF;

  SELECT * INTO v_before FROM public.pfmi_assessment_principles
   WHERE assessment_id = _assessment_id AND principle_number = _principle_number;

  UPDATE public.pfmi_assessment_principles
     SET self_score = COALESCE(_self_score, self_score),
         regulatory_score = COALESCE(_regulatory_score, regulatory_score),
         narrative = COALESCE(_narrative, narrative),
         evidence = COALESCE(_evidence, evidence),
         assessed_by = auth.uid(), assessed_at = now(), updated_at = now()
   WHERE assessment_id = _assessment_id AND principle_number = _principle_number
  RETURNING * INTO v_after;

  IF NOT FOUND THEN RAISE EXCEPTION 'principle_not_in_assessment'; END IF;

  PERFORM public.prudential_audit_event(
    'pfmi_principle_saved',
    'pfmi_assessment_principle',
    v_after.id,
    jsonb_build_object(
      'self_score', v_before.self_score,
      'regulatory_score', v_before.regulatory_score,
      'narrative', v_before.narrative),
    jsonb_build_object(
      'self_score', v_after.self_score,
      'regulatory_score', v_after.regulatory_score,
      'narrative', v_after.narrative),
    jsonb_build_object('assessment_id', _assessment_id, 'principle_number', _principle_number, 'module', 'pfmi'),
    NULL,
    'UPDATE'::public.compliance_audit_action);

  RETURN jsonb_build_object('ok', true);
END $function$;