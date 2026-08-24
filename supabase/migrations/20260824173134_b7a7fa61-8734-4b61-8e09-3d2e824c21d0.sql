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

  RETURN jsonb_build_object('success',true,'id',v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.appeal_panel_member_add(_panel_id uuid, _user_id uuid, _member_role text, _is_voting boolean DEFAULT true, _vote_weight numeric DEFAULT 1, _effective_from date DEFAULT NULL::date, _effective_to date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  IF NOT EXISTS (SELECT 1 FROM public.profiles
                  WHERE id = _user_id AND lower(coalesce(status,'active')) = 'active') THEN
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
END; $function$;

DO $$
DECLARE
  v_admin uuid;
  v_a uuid; v_b uuid; v_c uuid;
  v_alt_prud uuid; v_alt_ret uuid; v_alt_cond uuid;
  v_reg uuid := '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3';
  v_fn_prud uuid; v_fn_ret uuid; v_fn_cond uuid;
  v_t_prud uuid; v_t_ret uuid; v_t_insp uuid; v_t_cond uuid; v_t_enf uuid;
  v_e_prud uuid; v_e_cond uuid; v_e_exam uuid;
  v_exam uuid;
  r record;
BEGIN
  IF public.is_production_environment() THEN
    RAISE EXCEPTION 'SMALL-REGULATOR-DEMO-1 is non-production only';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE email = 'super_admin@mishainfotech.com';
  SELECT id INTO v_a FROM public.profiles WHERE email = 'licensing_supervisor@mishainfotech.com';
  SELECT id INTO v_b FROM public.profiles WHERE email = 'complaints_supervisor@mishainfotech.com';
  SELECT id INTO v_c FROM public.profiles WHERE email = 'fit_proper_supervisor@mishainfotech.com';
  SELECT id INTO v_alt_prud FROM public.profiles WHERE email = 'prudential_analyst@mishainfotech.com';
  SELECT id INTO v_alt_ret FROM public.profiles WHERE email = 'returns_officer@mishainfotech.com';
  SELECT id INTO v_alt_cond FROM public.profiles WHERE email = 'conduct_analyst@mishainfotech.com';
  IF v_admin IS NULL OR v_a IS NULL OR v_b IS NULL OR v_c IS NULL THEN
    RAISE EXCEPTION 'SMALL-REGULATOR-DEMO-1: expected certification identities are missing';
  END IF;

  -- ---------- 1. additional canonical roles (existing roles only) ----------
  FOR r IN
    SELECT * FROM (VALUES
      (v_a, 'prudential_supervisor'), (v_a, 'returns_supervisor'),
      (v_b, 'conduct_supervisor'), (v_b, 'enforcement_supervisor'),
      (v_c, 'inspection_supervisor')
    ) AS t(uid, role_key)
  LOOP
    IF EXISTS (SELECT 1 FROM public.sec_roles WHERE key = r.role_key AND status = 'active') THEN
      INSERT INTO public.sec_user_roles (user_id, role_id, status, assigned_by)
      SELECT r.uid, sr.id, 'active', v_admin
        FROM public.sec_roles sr WHERE sr.key = r.role_key
      ON CONFLICT (user_id, role_id) DO UPDATE
        SET status = 'active', effective_until = NULL, updated_at = now();
    ELSE
      RAISE WARNING 'ROLE_REGISTRY_RECONCILIATION_REQUIRED: %', r.role_key;
    END IF;
  END LOOP;

  -- ---------- 2. team memberships ----------
  SELECT id INTO v_t_prud FROM public.regulatory_teams WHERE code = 'TEAM-PRUDENTIAL';
  SELECT id INTO v_t_ret  FROM public.regulatory_teams WHERE code = 'TEAM-RETURNS';
  SELECT id INTO v_t_insp FROM public.regulatory_teams WHERE code = 'TEAM-INSPECTION';
  SELECT id INTO v_t_cond FROM public.regulatory_teams WHERE code = 'TEAM-CONDUCT';
  SELECT id INTO v_t_enf  FROM public.regulatory_teams WHERE code = 'TEAM-ENFORCEMENT';

  FOR r IN
    SELECT * FROM (VALUES
      (v_a, v_t_prud, 'lead'), (v_a, v_t_ret, 'lead'), (v_a, v_t_insp, 'member'),
      (v_b, v_t_cond, 'lead'), (v_b, v_t_enf, 'lead')
    ) AS t(uid, tid, mrole)
  LOOP
    IF r.tid IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.regulatory_team_members m
       WHERE m.team_id = r.tid AND m.user_id = r.uid
    ) THEN
      INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, status, created_by)
      VALUES (r.tid, r.uid, r.mrole, 'active', v_admin);
    END IF;
  END LOOP;

  -- ---------- 3. governed entity supervision + examination team ----------
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);

  SELECT id INTO v_fn_prud FROM public.regulatory_functions WHERE key = 'prudential';
  SELECT id INTO v_fn_ret  FROM public.regulatory_functions WHERE key = 'returns';
  SELECT id INTO v_fn_cond FROM public.regulatory_functions WHERE key = 'market_conduct';
  SELECT id INTO v_e_prud FROM public.licensees WHERE name = 'Meridian Commercial Bank Limited';
  SELECT id INTO v_e_cond FROM public.licensees WHERE name = 'Coral Harbour Bank Limited';
  SELECT id INTO v_e_exam FROM public.licensees WHERE name = 'Windward Trust Bank Limited';

  IF NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments
                  WHERE entity_id = v_e_prud AND regulatory_function_id = v_fn_prud
                    AND status = 'active' AND is_primary AND effective_to IS NULL) THEN
    PERFORM public.assign_entity_supervision(v_e_prud, v_reg, v_fn_prud, v_t_prud,
      v_a, v_alt_prud, 'SMALLREG-MANUAL-: prudential lead (multi-function staff demo)');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments
                  WHERE entity_id = v_e_prud AND regulatory_function_id = v_fn_ret
                    AND status = 'active' AND is_primary AND effective_to IS NULL) THEN
    PERFORM public.assign_entity_supervision(v_e_prud, v_reg, v_fn_ret, v_t_ret,
      v_a, v_alt_ret, 'SMALLREG-MANUAL-: returns responsibility, same entity, different function');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entity_supervision_assignments
                  WHERE entity_id = v_e_cond AND regulatory_function_id = v_fn_cond
                    AND status = 'active' AND is_primary AND effective_to IS NULL) THEN
    PERFORM public.assign_entity_supervision(v_e_cond, v_reg, v_fn_cond, v_t_cond,
      v_b, v_alt_cond, 'SMALLREG-MANUAL-: market conduct lead (multi-function staff demo)');
  END IF;

  SELECT id INTO v_exam FROM public.examinations WHERE reference = 'SMALLREG-MANUAL-EXM-001';
  IF v_exam IS NULL AND v_e_exam IS NOT NULL THEN
    INSERT INTO public.examinations (reference, entity_id, regulator_id, sector_id, title,
      examination_type, stage, period_under_review_start, period_under_review_end,
      lead_examiner_id, created_by)
    SELECT 'SMALLREG-MANUAL-EXM-001', v_e_exam, v_reg, l.sector_id,
           'SMALLREG-MANUAL- Small regulator combined-duty examination',
           'targeted', 'planned', date '2026-01-01', date '2026-06-30', v_c, v_admin
      FROM public.licensees l WHERE l.id = v_e_exam
    RETURNING id INTO v_exam;
  END IF;

  IF v_exam IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.examination_team_members
                    WHERE examination_id = v_exam AND user_id = v_c) THEN
      PERFORM public.examination_team_member_add(v_exam, v_c, 'lead_examiner', NULL,
        'SMALLREG-MANUAL- lead examiner');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.examination_team_members
                    WHERE examination_id = v_exam AND user_id = v_a) THEN
      PERFORM public.examination_team_member_add(v_exam, v_a, 'reviewer', NULL,
        'SMALLREG-MANUAL- reviewer (also prudential/returns lead)');
    END IF;
  END IF;

  PERFORM set_config('request.jwt.claims', '', true);
END $$;