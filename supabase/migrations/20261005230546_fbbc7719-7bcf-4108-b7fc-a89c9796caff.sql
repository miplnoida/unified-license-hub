-- AML-CLOSE-06: case ownership, governed reassignment, orphan detection.
CREATE TABLE public.supervisory_assessment_assignment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id uuid NOT NULL REFERENCES public.supervisory_assessment(id),
  assignment_role text NOT NULL CHECK (assignment_role IN ('OWNER','REVIEWER')),
  from_user_id uuid,
  to_user_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 10),
  status_at_assignment text NOT NULL,
  review_round_id uuid,
  assigned_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX supervisory_assessment_assignment_a_idx ON public.supervisory_assessment_assignment(assessment_id, created_at);
GRANT SELECT ON public.supervisory_assessment_assignment TO authenticated;
GRANT ALL ON public.supervisory_assessment_assignment TO service_role;
ALTER TABLE public.supervisory_assessment_assignment ENABLE ROW LEVEL SECURITY;
CREATE POLICY saa_read ON public.supervisory_assessment_assignment FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()) OR public.has_any_permission(auth.uid(),
    ARRAY['supervisory_spine.view','prudential_supervision.view','market_conduct.view','aml_supervision.view']));
CREATE OR REPLACE FUNCTION public.supervisory_assessment_assignment_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'supervisory_assessment_assignment is append-only' USING ERRCODE = '42501';
  END IF;
  IF current_setting('app.supervisory_review_writer', true) IS DISTINCT FROM 'governed' THEN
    RAISE EXCEPTION 'assignment history is written only by a governed assignment operation' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER saa_append_only BEFORE INSERT OR UPDATE OR DELETE ON public.supervisory_assessment_assignment
  FOR EACH ROW EXECUTE FUNCTION public.supervisory_assessment_assignment_append_only();

CREATE OR REPLACE FUNCTION public.supervisory_entity_in_scope(_uid uuid, _entity_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.supervisory_entity_scope_check(_uid, _entity_id);
  RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_can_reassign(_uid uuid, _domain_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (public.is_super_admin(_uid)
    OR public.has_any_permission(_uid, public.supervisory_domain_actions(_domain_code,'approve') || ARRAY['supervisory_spine.approve']));
$$;

-- Returns NULL when eligible, else a reason code. Never trusts the caller.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_assignee_ineligibility(_user uuid, _assessment_id uuid, _role text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _st text;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _user IS NULL THEN RETURN 'MISSING'; END IF;
  IF NOT public.sec_is_internal_user(_user) THEN RETURN 'NOT_INTERNAL_STAFF'; END IF;
  SELECT status INTO _st FROM public.profiles WHERE id = _user;
  IF _st IS DISTINCT FROM 'active' THEN RETURN 'INACTIVE'; END IF;
  IF _role = 'OWNER' AND NOT public.is_super_admin(_user)
     AND NOT public.has_any_permission(_user, public.supervisory_domain_actions(_a.domain_code,'edit')) THEN
    RETURN 'LACKS_EDIT_AUTHORITY'; END IF;
  IF _role = 'REVIEWER' AND NOT public.has_any_permission(_user, ARRAY['aml_supervision.review','supervisory_spine.review',
        'aml_supervision.approve','supervisory_spine.approve']) THEN
    RETURN 'LACKS_REVIEW_AUTHORITY'; END IF;
  IF NOT public.supervisory_entity_in_scope(_user, _a.entity_id) THEN RETURN 'OUT_OF_SCOPE'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_assignment_flags_internal(_assessment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _a public.supervisory_assessment; _f jsonb := '[]'::jsonb; _r text;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL OR _a.status NOT IN ('draft','returned_for_revision','submitted','reviewed') THEN RETURN _f; END IF;
  _r := public.supervisory_assessment_assignee_ineligibility(_a.owner_id, _a.id, 'OWNER');
  IF _r IS NOT NULL THEN _f := _f || jsonb_build_array('OWNER_' || _r); END IF;
  IF _a.status IN ('submitted','reviewed') THEN
    _r := public.supervisory_assessment_assignee_ineligibility(_a.reviewer_id, _a.id, 'REVIEWER');
    IF _r IS NOT NULL THEN _f := _f || jsonb_build_array('REVIEWER_' || _r); END IF;
  END IF;
  RETURN _f;
END $$;

-- Only the current, eligible case owner (or a super administrator) may work a case.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_case_actor_require(_uid uuid, _assessment_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid;
BEGIN
  IF public.is_super_admin(_uid) THEN RETURN; END IF;
  SELECT owner_id INTO _owner FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _owner IS DISTINCT FROM _uid THEN
    RAISE EXCEPTION 'not_case_owner: only the assigned case owner may work this assessment; ask a supervisor to reassign it'
      USING ERRCODE = '42501';
  END IF;
END $$;
-- Patch existing command bodies in place (asserted, deterministic) so the only change is the added guard.
DO $patch$
DECLARE _f text; _src text; _k text := 'PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);';
  _g text := E'\n  PERFORM public.supervisory_assessment_case_actor_require(_uid, _assessment_id);';
  _r text[][]; i int;
BEGIN
  FOREACH _f IN ARRAY ARRAY['supervisory_assessment_execution_require_edit','supervisory_assessment_question_upsert',
      'supervisory_assessment_calculate','supervisory_assessment_dimension_upsert','supervisory_assessment_submit_for_review'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _src FROM pg_proc p WHERE p.proname=_f AND p.pronamespace='public'::regnamespace;
    IF _src LIKE '%case_actor_require%' THEN CONTINUE; END IF;
    IF (length(_src)-length(replace(_src,_k,'')))/length(_k) <> 1 THEN RAISE EXCEPTION 'patch anchor not unique in %', _f; END IF;
    EXECUTE replace(_src, _k, _k || _g);
  END LOOP;

  SELECT pg_get_functiondef('public.supervisory_assessment_lifecycle_state(uuid)'::regprocedure) INTO _src;
  IF _src NOT LIKE '%REASSIGN_OWNER%' THEN
    _r := ARRAY[
      ARRAY['DECLARE _uid uuid := auth.uid();','DECLARE _owner_ok boolean; _can_reassign boolean; _uid uuid := auth.uid();'],
      ARRAY['_maker := (', E'_owner_ok := (_a.owner_id = _uid OR public.is_super_admin(_uid));\n  _can_reassign := public.supervisory_assessment_can_reassign(_uid, _a.domain_code);\n  _maker := ('],
      ARRAY['ELSE upper(_a.status) END;', 'ELSE ''UNKNOWN'' END;'],
      ARRAY['_editable := _a.status IN (''draft'',''returned_for_revision'');', '_editable := _a.status IN (''draft'',''returned_for_revision'') AND _state <> ''UNKNOWN'';'],
      ARRAY['AND _can_submit AND NOT _submit_blocked)', 'AND _can_submit AND _owner_ok AND NOT _submit_blocked)'],
      ARRAY[E'WHEN NOT _can_submit THEN ''PERMISSION_MISSING''\n', E'WHEN NOT _can_submit THEN ''PERMISSION_MISSING''\n                          WHEN NOT _owner_ok THEN ''NOT_CASE_OWNER''\n'],
      ARRAY['''editing_allowed'', _editable,', E'''editing_allowed'', _editable AND _owner_ok,\n    ''case_actor'', _owner_ok,\n    ''assignment_flags'', public.supervisory_assessment_assignment_flags_internal(_a.id),'],
      ARRAY[E'      ''maker_checker_required'', true));', E'      ''maker_checker_required'', true),
    jsonb_build_object(''action'',''REASSIGN_OWNER'',''label'',''Reassign case owner'',
      ''required_permission'',''aml_supervision.approve'',
      ''permitted'', (_a.status IN (''draft'',''returned_for_revision'',''submitted'',''reviewed'') AND _can_reassign),
      ''reason_code'', CASE WHEN _a.status NOT IN (''draft'',''returned_for_revision'',''submitted'',''reviewed'') THEN ''STATE_NOT_ELIGIBLE''
                          WHEN NOT _can_reassign THEN ''PERMISSION_MISSING'' ELSE ''OK'' END,
      ''maker_checker_required'', false),
    jsonb_build_object(''action'',''ASSIGN_REVIEWER'',''label'',''Assign or reassign reviewer'',
      ''required_permission'',''aml_supervision.approve'',
      ''permitted'', (_a.status IN (''submitted'',''reviewed'') AND _can_reassign),
      ''reason_code'', CASE WHEN _a.status NOT IN (''submitted'',''reviewed'') THEN ''STATE_NOT_ELIGIBLE''
                          WHEN NOT _can_reassign THEN ''PERMISSION_MISSING'' ELSE ''OK'' END,
      ''maker_checker_required'', false));']];
    FOR i IN 1..array_length(_r,1) LOOP
      IF (length(_src)-length(replace(_src,_r[i][1],'')))/length(_r[i][1]) <> 1 THEN
        RAISE EXCEPTION 'lifecycle patch anchor % not unique', i; END IF;
      _src := replace(_src, _r[i][1], _r[i][2]);
    END LOOP;
    EXECUTE _src;
  END IF;
END $patch$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_reassign(
  _assessment_id uuid, _role text, _to_user_id uuid, _expected_current_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _r public.supervisory_assessment_review_round;
        _cur uuid; _bad text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authorized: authentication required' USING ERRCODE = '42501'; END IF;
  IF _role NOT IN ('OWNER','REVIEWER') THEN RAISE EXCEPTION 'unsupported_role: %', _role USING ERRCODE = '22023'; END IF;
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id FOR UPDATE;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_assessment_can_reassign(_uid, _a.domain_code) THEN
    RAISE EXCEPTION 'not_authorized: supervisory approval authority is required to assign case actors' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  IF length(btrim(COALESCE(_reason,''))) < 10 THEN
    RAISE EXCEPTION 'an assignment reason of at least 10 characters is required' USING ERRCODE = '22023';
  END IF;
  IF _role = 'OWNER' AND _a.status NOT IN ('draft','returned_for_revision','submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: the owner of a % assessment cannot be changed', _a.status USING ERRCODE = '22023';
  END IF;
  IF _role = 'REVIEWER' AND _a.status NOT IN ('submitted','reviewed') THEN
    RAISE EXCEPTION 'transition_not_permitted: a reviewer can be assigned only while the assessment is under review' USING ERRCODE = '22023';
  END IF;
  _cur := CASE WHEN _role = 'OWNER' THEN _a.owner_id ELSE _a.reviewer_id END;
  IF _cur IS DISTINCT FROM _expected_current_id THEN
    RAISE EXCEPTION 'stale_assignment: the assignment changed since the screen was loaded — reload and try again' USING ERRCODE = '40001';
  END IF;
  IF _to_user_id IS NOT DISTINCT FROM _cur THEN
    RAISE EXCEPTION 'already_assigned: this person already holds the assignment' USING ERRCODE = '22023';
  END IF;
  _bad := public.supervisory_assessment_assignee_ineligibility(_to_user_id, _a.id, _role);
  IF _bad IS NOT NULL THEN
    RAISE EXCEPTION 'assignee_ineligible: %', _bad USING ERRCODE = '42501';
  END IF;
  IF _role = 'REVIEWER' AND (_to_user_id = _a.created_by OR _to_user_id = _a.submitted_by OR _to_user_id = _a.owner_id) THEN
    RAISE EXCEPTION 'not_authorized: the preparer, owner or submitter cannot review the assessment' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _r FROM public.supervisory_assessment_review_round
   WHERE assessment_id = _assessment_id ORDER BY round_seq DESC LIMIT 1;

  PERFORM set_config('app.supervisory_review_writer','governed', true);
  IF _role = 'OWNER' THEN
    UPDATE public.supervisory_assessment SET owner_id = _to_user_id, updated_at = now() WHERE id = _assessment_id;
  ELSE
    UPDATE public.supervisory_assessment SET reviewer_id = _to_user_id, updated_at = now() WHERE id = _assessment_id;
    IF _r.id IS NOT NULL AND _r.outcome = 'PENDING' THEN
      UPDATE public.supervisory_assessment_review_round
         SET reviewer_id = _to_user_id, reviewer_assigned_by = _uid, reviewer_assigned_at = now()
       WHERE id = _r.id;
    END IF;
  END IF;
  INSERT INTO public.supervisory_assessment_assignment(assessment_id, assignment_role, from_user_id, to_user_id,
    reason, status_at_assignment, review_round_id, assigned_by)
  VALUES (_assessment_id, _role, _cur, _to_user_id, btrim(_reason), _a.status,
          CASE WHEN _role='REVIEWER' THEN _r.id END, _uid);
  PERFORM set_config('app.supervisory_review_writer','', true);

  INSERT INTO public.supervisory_assessment_event(assessment_id, event_type, from_status, to_status, rationale, detail, actor_id)
  VALUES (_assessment_id, CASE WHEN _role='OWNER' THEN 'OWNER_REASSIGNMENT' ELSE 'REVIEW_ASSIGNMENT' END,
          _a.status, _a.status, btrim(_reason),
          jsonb_build_object('role', _role, 'from_user_id', _cur, 'to_user_id', _to_user_id, 'round_id', _r.id), _uid);
  PERFORM public.log_compliance_audit('UPDATE','supervisory_assessment', _assessment_id,
    jsonb_build_object(lower(_role) || '_id', _cur), jsonb_build_object(lower(_role) || '_id', _to_user_id),
    initcap(_role) || ' reassigned for assessment ' || _a.reference);
  RETURN jsonb_build_object('assessment_id', _assessment_id, 'role', _role,
    'from_user_id', _cur, 'to_user_id', _to_user_id, 'round_id', _r.id);
END $$;

-- Legacy entry point now routes through the single governed assignment command.
CREATE OR REPLACE FUNCTION public.supervisory_assessment_review_assign(_assessment_id uuid, _reviewer_id uuid, _rationale text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cur uuid;
BEGIN
  SELECT reviewer_id INTO _cur FROM public.supervisory_assessment WHERE id = _assessment_id;
  RETURN public.supervisory_assessment_reassign(_assessment_id, 'REVIEWER', _reviewer_id, _cur, _rationale);
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_assignment_candidates(_assessment_id uuid, _role text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _a public.supervisory_assessment; _out jsonb;
BEGIN
  SELECT * INTO _a FROM public.supervisory_assessment WHERE id = _assessment_id;
  IF _a.id IS NULL THEN RAISE EXCEPTION 'not_found: assessment' USING ERRCODE = '22023'; END IF;
  IF NOT public.supervisory_assessment_can_reassign(_uid, _a.domain_code) THEN
    RAISE EXCEPTION 'not_authorized: supervisory approval authority is required' USING ERRCODE = '42501';
  END IF;
  PERFORM public.supervisory_entity_scope_check(_uid, _a.entity_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('user_id', p.id, 'full_name', p.full_name, 'email', p.email)
           ORDER BY p.full_name), '[]'::jsonb) INTO _out
    FROM public.profiles p
   WHERE p.status = 'active'
     AND public.supervisory_assessment_assignee_ineligibility(p.id, _a.id, _role) IS NULL
     AND (_role <> 'REVIEWER' OR p.id NOT IN (COALESCE(_a.created_by, gen_random_uuid()),
           COALESCE(_a.submitted_by, gen_random_uuid()), COALESCE(_a.owner_id, gen_random_uuid())));
  RETURN _out;
END $$;

CREATE OR REPLACE FUNCTION public.supervisory_assessment_orphan_cases(_domain_code text DEFAULT 'AML_CFT')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _out jsonb;
BEGIN
  IF NOT public.supervisory_assessment_can_reassign(_uid, _domain_code) THEN
    RAISE EXCEPTION 'not_authorized: supervisory approval authority is required' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'reference'), '[]'::jsonb) INTO _out FROM (
    SELECT jsonb_build_object('assessment_id', a.id, 'reference', a.reference, 'entity_id', a.entity_id,
             'status', a.status, 'owner_id', a.owner_id, 'reviewer_id', a.reviewer_id,
             'flags', public.supervisory_assessment_assignment_flags_internal(a.id)) x
      FROM public.supervisory_assessment a
     WHERE a.domain_code = _domain_code
       AND a.status IN ('draft','returned_for_revision','submitted','reviewed')
       AND public.supervisory_entity_in_scope(_uid, a.entity_id)) q
   WHERE jsonb_array_length(x->'flags') > 0;
  RETURN _out;
END $$;

REVOKE ALL ON FUNCTION public.supervisory_entity_in_scope(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_can_reassign(uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_assignee_ineligibility(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_assignment_flags_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_case_actor_require(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supervisory_assessment_reassign(uuid,text,uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_review_assign(uuid,uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_assignment_candidates(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.supervisory_assessment_orphan_cases(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_reassign(uuid,text,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_review_assign(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_assignment_candidates(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.supervisory_assessment_orphan_cases(text) TO authenticated;