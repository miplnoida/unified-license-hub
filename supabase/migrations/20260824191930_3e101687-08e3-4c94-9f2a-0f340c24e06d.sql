-- =====================================================================
-- Regulatory Operating Structure — governed administration routines.
-- Narrowing-only: these routines record WHERE authority applies. They
-- never grant a permission. Direct DML stays closed to clients.
-- =====================================================================

REVOKE ALL ON public.regulatory_teams FROM anon, authenticated;
REVOKE ALL ON public.regulatory_team_members FROM anon, authenticated;
REVOKE ALL ON public.regulatory_team_mandates FROM anon, authenticated;
REVOKE ALL ON public.staff_portfolios FROM anon, authenticated;
REVOKE ALL ON public.staff_portfolio_scopes FROM anon, authenticated;
REVOKE ALL ON public.regulator_mandates FROM anon, authenticated;
REVOKE ALL ON public.regulator_mandate_enforcement FROM anon, authenticated;
REVOKE ALL ON public.regulatory_functions FROM anon, authenticated;

GRANT SELECT ON public.regulatory_teams TO authenticated;
GRANT SELECT ON public.regulatory_team_members TO authenticated;
GRANT SELECT ON public.regulatory_team_mandates TO authenticated;
GRANT SELECT ON public.staff_portfolios TO authenticated;
GRANT SELECT ON public.staff_portfolio_scopes TO authenticated;
GRANT SELECT ON public.regulator_mandates TO authenticated;
GRANT SELECT ON public.regulator_mandate_enforcement TO authenticated;
GRANT SELECT ON public.regulatory_functions TO authenticated;

GRANT ALL ON public.regulatory_teams TO service_role;
GRANT ALL ON public.regulatory_team_members TO service_role;
GRANT ALL ON public.regulatory_team_mandates TO service_role;
GRANT ALL ON public.staff_portfolios TO service_role;
GRANT ALL ON public.staff_portfolio_scopes TO service_role;
GRANT ALL ON public.regulator_mandates TO service_role;
GRANT ALL ON public.regulator_mandate_enforcement TO service_role;
GRANT ALL ON public.regulatory_functions TO service_role;

-- ------------------------------------------------------------------ --
-- Guards
-- ------------------------------------------------------------------ --
CREATE OR REPLACE FUNCTION public.regulatory_structure_assert_admin(_actor uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _actor IS NULL THEN RAISE EXCEPTION 'UNAUTHORIZED: not authenticated'; END IF;
  IF public.is_super_admin(_actor) THEN RETURN; END IF;
  IF public.has_permission(_actor,'user_management','edit')
     OR public.has_permission(_actor,'role_management','manage_catalog') THEN RETURN; END IF;
  RAISE EXCEPTION 'FORBIDDEN: you are not allowed to administer the regulatory operating structure';
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_structure_assert_staff(_user_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: a person must be selected'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p
                  WHERE p.id = _user_id AND coalesce(p.status,'active') = 'active') THEN
    RAISE EXCEPTION 'BAD_INPUT: the selected person is not an active staff account';
  END IF;
  IF NOT public.is_internal_staff(_user_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: only internal staff can hold operating-structure responsibilities';
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_structure_audit(
  _action text, _entity_type text, _entity_id uuid, _old jsonb, _new jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value, metadata)
  VALUES (auth.uid(), _action, _entity_type, _entity_id::text, _old, _new,
          jsonb_build_object('source','regulatory_operating_structure'));
END; $$;

-- ------------------------------------------------------------------ --
-- Teams
-- ------------------------------------------------------------------ --
CREATE OR REPLACE FUNCTION public.regulatory_team_upsert(
  _regulator_id uuid,
  _code text,
  _name text,
  _team_type text DEFAULT 'permanent',
  _regulatory_function_id uuid DEFAULT NULL,
  _effective_from timestamptz DEFAULT now(),
  _effective_to timestamptz DEFAULT NULL,
  _status text DEFAULT 'active',
  _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb; v_id uuid;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF coalesce(_code,'') = '' OR coalesce(_name,'') = '' THEN
    RAISE EXCEPTION 'BAD_INPUT: a team code and name are required';
  END IF;
  IF _team_type NOT IN ('permanent','thematic','case','committee') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown team type %', _team_type;
  END IF;
  IF _status NOT IN ('active','inactive') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown team status %', _status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;
  IF _regulatory_function_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.regulatory_functions WHERE id = _regulatory_function_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulatory function';
  END IF;
  IF _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: the end date cannot precede the start date';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.regulatory_teams (regulator_id, regulatory_function_id, code, name,
                                         team_type, status, effective_from, effective_to, created_by)
    VALUES (_regulator_id, _regulatory_function_id, upper(trim(_code)), trim(_name),
            _team_type, _status, _effective_from, _effective_to, v_actor)
    RETURNING id INTO v_id;
    PERFORM public.regulatory_structure_audit('CREATE','regulatory_team',v_id,NULL,
      to_jsonb((SELECT t FROM public.regulatory_teams t WHERE t.id = v_id)));
  ELSE
    SELECT to_jsonb(t) INTO v_old FROM public.regulatory_teams t WHERE t.id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team does not exist'; END IF;
    UPDATE public.regulatory_teams
       SET regulator_id = _regulator_id,
           regulatory_function_id = _regulatory_function_id,
           code = upper(trim(_code)),
           name = trim(_name),
           team_type = _team_type,
           status = _status,
           effective_from = _effective_from,
           effective_to = _effective_to,
           updated_at = now()
     WHERE id = _id;
    v_id := _id;
    PERFORM public.regulatory_structure_audit('UPDATE','regulatory_team',v_id,v_old,
      to_jsonb((SELECT t FROM public.regulatory_teams t WHERE t.id = v_id)));
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_team_set_status(_team_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF _status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'BAD_INPUT: unknown status %', _status; END IF;
  SELECT to_jsonb(t) INTO v_old FROM public.regulatory_teams t WHERE t.id = _team_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team does not exist'; END IF;
  UPDATE public.regulatory_teams
     SET status = _status,
         effective_to = CASE WHEN _status = 'inactive' THEN coalesce(effective_to, now()) ELSE NULL END,
         updated_at = now()
   WHERE id = _team_id;
  IF _status = 'inactive' THEN
    UPDATE public.regulatory_team_members
       SET status = 'inactive', effective_to = coalesce(effective_to, now()), updated_at = now()
     WHERE team_id = _team_id AND status = 'active';
  END IF;
  PERFORM public.regulatory_structure_audit('UPDATE','regulatory_team',_team_id,v_old,
    to_jsonb((SELECT t FROM public.regulatory_teams t WHERE t.id = _team_id)));
  RETURN jsonb_build_object('id', _team_id, 'status', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_team_member_set(
  _team_id uuid,
  _user_id uuid,
  _member_role text DEFAULT 'member',
  _effective_from timestamptz DEFAULT now(),
  _effective_to timestamptz DEFAULT NULL,
  _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid; v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  PERFORM public.regulatory_structure_assert_staff(_user_id);
  IF _member_role NOT IN ('lead','deputy','member','observer') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown team role %', _member_role;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulatory_teams WHERE id = _team_id AND status = 'active') THEN
    RAISE EXCEPTION 'BAD_INPUT: the team does not exist or is inactive';
  END IF;
  IF _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: the end date cannot precede the start date';
  END IF;

  IF _id IS NULL THEN
    SELECT m.id INTO v_id FROM public.regulatory_team_members m
     WHERE m.team_id = _team_id AND m.user_id = _user_id AND m.status = 'active' LIMIT 1;
  ELSE
    v_id := _id;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.regulatory_team_members (team_id, user_id, member_role, effective_from,
                                                effective_to, status, created_by)
    VALUES (_team_id, _user_id, _member_role, _effective_from, _effective_to, 'active', v_actor)
    RETURNING id INTO v_id;
    PERFORM public.regulatory_structure_audit('CREATE','regulatory_team_member',v_id,NULL,
      to_jsonb((SELECT m FROM public.regulatory_team_members m WHERE m.id = v_id)));
  ELSE
    SELECT to_jsonb(m) INTO v_old FROM public.regulatory_team_members m WHERE m.id = v_id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: membership does not exist'; END IF;
    UPDATE public.regulatory_team_members
       SET member_role = _member_role, effective_from = _effective_from,
           effective_to = _effective_to, status = 'active', updated_at = now()
     WHERE id = v_id;
    PERFORM public.regulatory_structure_audit('UPDATE','regulatory_team_member',v_id,v_old,
      to_jsonb((SELECT m FROM public.regulatory_team_members m WHERE m.id = v_id)));
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_team_member_end(
  _membership_id uuid, _effective_to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  SELECT to_jsonb(m) INTO v_old FROM public.regulatory_team_members m WHERE m.id = _membership_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: membership does not exist'; END IF;
  UPDATE public.regulatory_team_members
     SET status = 'inactive', effective_to = coalesce(_effective_to, now()), updated_at = now()
   WHERE id = _membership_id;
  PERFORM public.regulatory_structure_audit('UPDATE','regulatory_team_member',_membership_id,v_old,
    to_jsonb((SELECT m FROM public.regulatory_team_members m WHERE m.id = _membership_id)));
  RETURN jsonb_build_object('id', _membership_id);
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_team_mandate_add(
  _team_id uuid, _regulator_mandate_id uuid, _is_primary boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF NOT EXISTS (SELECT 1 FROM public.regulatory_teams WHERE id = _team_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown team';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulator_mandates WHERE id = _regulator_mandate_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown mandate';
  END IF;
  IF EXISTS (SELECT 1 FROM public.regulatory_team_mandates
              WHERE team_id = _team_id AND regulator_mandate_id = _regulator_mandate_id
                AND effective_to IS NULL) THEN
    RAISE EXCEPTION 'BAD_INPUT: this mandate is already attached to the team';
  END IF;
  INSERT INTO public.regulatory_team_mandates (team_id, regulator_mandate_id, is_primary, created_by)
  VALUES (_team_id, _regulator_mandate_id, coalesce(_is_primary,false), v_actor)
  RETURNING id INTO v_id;
  PERFORM public.regulatory_structure_audit('CREATE','regulatory_team_mandate',v_id,NULL,
    to_jsonb((SELECT m FROM public.regulatory_team_mandates m WHERE m.id = v_id)));
  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.regulatory_team_mandate_end(
  _id uuid, _effective_to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  SELECT to_jsonb(m) INTO v_old FROM public.regulatory_team_mandates m WHERE m.id = _id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: team mandate does not exist'; END IF;
  UPDATE public.regulatory_team_mandates
     SET effective_to = coalesce(_effective_to, now()), updated_at = now() WHERE id = _id;
  PERFORM public.regulatory_structure_audit('UPDATE','regulatory_team_mandate',_id,v_old,
    to_jsonb((SELECT m FROM public.regulatory_team_mandates m WHERE m.id = _id)));
  RETURN jsonb_build_object('id', _id);
END; $$;

-- ------------------------------------------------------------------ --
-- Staff portfolios (functional responsibilities) and their scopes
-- ------------------------------------------------------------------ --
CREATE OR REPLACE FUNCTION public.staff_portfolio_upsert(
  _user_id uuid,
  _regulator_id uuid,
  _regulatory_function_id uuid,
  _team_id uuid DEFAULT NULL,
  _effective_from timestamptz DEFAULT now(),
  _effective_to timestamptz DEFAULT NULL,
  _status text DEFAULT 'active',
  _notes text DEFAULT NULL,
  _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid; v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  PERFORM public.regulatory_structure_assert_staff(_user_id);
  IF _status NOT IN ('active','inactive','requires_admin_review') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown status %', _status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;
  IF _regulatory_function_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.regulatory_functions
        WHERE id = _regulatory_function_id AND status = 'active') THEN
    RAISE EXCEPTION 'BAD_INPUT: an active regulatory function must be selected';
  END IF;
  IF _team_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.regulatory_teams
                    WHERE id = _team_id AND regulator_id = _regulator_id AND status = 'active') THEN
      RAISE EXCEPTION 'BAD_INPUT: the team does not belong to this regulator or is inactive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.regulatory_team_members
                    WHERE team_id = _team_id AND user_id = _user_id AND status = 'active') THEN
      RAISE EXCEPTION 'BAD_INPUT: the person must be an active member of the selected team';
    END IF;
  END IF;
  IF _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: the end date cannot precede the start date';
  END IF;

  IF _id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.staff_portfolios
                WHERE user_id = _user_id AND regulator_id = _regulator_id
                  AND regulatory_function_id = _regulatory_function_id AND status = 'active') THEN
      RAISE EXCEPTION 'BAD_INPUT: this person already holds an active responsibility for that function';
    END IF;
    INSERT INTO public.staff_portfolios (user_id, regulator_id, regulatory_function_id, team_id,
                                         effective_from, effective_to, status, notes, created_by)
    VALUES (_user_id, _regulator_id, _regulatory_function_id, _team_id,
            _effective_from, _effective_to, _status, _notes, v_actor)
    RETURNING id INTO v_id;
    PERFORM public.regulatory_structure_audit('CREATE','staff_portfolio',v_id,NULL,
      to_jsonb((SELECT s FROM public.staff_portfolios s WHERE s.id = v_id)));
  ELSE
    SELECT to_jsonb(s) INTO v_old FROM public.staff_portfolios s WHERE s.id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: responsibility does not exist'; END IF;
    UPDATE public.staff_portfolios
       SET user_id = _user_id, regulator_id = _regulator_id,
           regulatory_function_id = _regulatory_function_id, team_id = _team_id,
           effective_from = _effective_from, effective_to = _effective_to,
           status = _status, notes = _notes, updated_at = now()
     WHERE id = _id;
    v_id := _id;
    PERFORM public.regulatory_structure_audit('UPDATE','staff_portfolio',v_id,v_old,
      to_jsonb((SELECT s FROM public.staff_portfolios s WHERE s.id = v_id)));
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.staff_portfolio_end(
  _portfolio_id uuid, _effective_to timestamptz DEFAULT now())
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  SELECT to_jsonb(s) INTO v_old FROM public.staff_portfolios s WHERE s.id = _portfolio_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: responsibility does not exist'; END IF;
  UPDATE public.staff_portfolios
     SET status = 'inactive', effective_to = coalesce(_effective_to, now()), updated_at = now()
   WHERE id = _portfolio_id;
  PERFORM public.regulatory_structure_audit('UPDATE','staff_portfolio',_portfolio_id,v_old,
    to_jsonb((SELECT s FROM public.staff_portfolios s WHERE s.id = _portfolio_id)));
  RETURN jsonb_build_object('id', _portfolio_id);
END; $$;

CREATE OR REPLACE FUNCTION public.staff_portfolio_scope_add(
  _portfolio_id uuid,
  _scope_kind text,
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _entity_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF NOT EXISTS (SELECT 1 FROM public.staff_portfolios WHERE id = _portfolio_id AND status = 'active') THEN
    RAISE EXCEPTION 'BAD_INPUT: the responsibility does not exist or is no longer active';
  END IF;
  IF _scope_kind = 'sector' THEN
    IF _sector_id IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: a sector must be selected'; END IF;
    _sub_sector_id := NULL; _entity_id := NULL;
    IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE id = _sector_id) THEN
      RAISE EXCEPTION 'BAD_INPUT: unknown sector';
    END IF;
  ELSIF _scope_kind = 'sub_sector' THEN
    IF _sub_sector_id IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: a sub-sector must be selected'; END IF;
    _entity_id := NULL;
    SELECT ss.sector_id INTO _sector_id FROM public.sub_sectors ss WHERE ss.id = _sub_sector_id;
    IF _sector_id IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: unknown sub-sector'; END IF;
  ELSIF _scope_kind = 'entity' THEN
    IF _entity_id IS NULL THEN RAISE EXCEPTION 'BAD_INPUT: an entity must be selected'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = _entity_id) THEN
      RAISE EXCEPTION 'BAD_INPUT: unknown entity';
    END IF;
    SELECT l.sector_id, l.sub_sector_id INTO _sector_id, _sub_sector_id
      FROM public.licensees l WHERE l.id = _entity_id;
  ELSE
    RAISE EXCEPTION 'BAD_INPUT: unknown scope kind %', _scope_kind;
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff_portfolio_scopes
              WHERE portfolio_id = _portfolio_id AND scope_kind = _scope_kind
                AND coalesce(sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                    = coalesce(_sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                AND coalesce(sub_sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                    = coalesce(_sub_sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                AND coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid)
                    = coalesce(_entity_id,'00000000-0000-0000-0000-000000000000'::uuid)) THEN
    RAISE EXCEPTION 'BAD_INPUT: this coverage is already recorded';
  END IF;

  INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sector_id, sub_sector_id,
                                             entity_id, created_by)
  VALUES (_portfolio_id, _scope_kind, _sector_id, _sub_sector_id, _entity_id, v_actor)
  RETURNING id INTO v_id;
  PERFORM public.regulatory_structure_audit('CREATE','staff_portfolio_scope',v_id,NULL,
    to_jsonb((SELECT s FROM public.staff_portfolio_scopes s WHERE s.id = v_id)));
  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.staff_portfolio_scope_remove(_scope_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  SELECT to_jsonb(s) INTO v_old FROM public.staff_portfolio_scopes s WHERE s.id = _scope_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: coverage does not exist'; END IF;
  DELETE FROM public.staff_portfolio_scopes WHERE id = _scope_id;
  PERFORM public.regulatory_structure_audit('DELETE','staff_portfolio_scope',_scope_id,v_old,NULL);
  RETURN jsonb_build_object('id', _scope_id);
END; $$;

-- ------------------------------------------------------------------ --
-- Regulator mandates and enforcement
-- ------------------------------------------------------------------ --
CREATE OR REPLACE FUNCTION public.regulator_mandate_upsert(
  _regulator_id uuid,
  _regulatory_function_id uuid,
  _responsibility_type text DEFAULT 'LEAD',
  _sector_id uuid DEFAULT NULL,
  _sub_sector_id uuid DEFAULT NULL,
  _effective_from timestamptz DEFAULT now(),
  _effective_to timestamptz DEFAULT NULL,
  _status text DEFAULT 'active',
  _notes text DEFAULT NULL,
  _id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid; v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF _responsibility_type NOT IN ('LEAD','JOINT','SUPPORT','ADVISORY') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown responsibility type %', _responsibility_type;
  END IF;
  IF _status NOT IN ('active','inactive','requires_admin_review') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown status %', _status;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulatory_functions
                  WHERE id = _regulatory_function_id AND status = 'active') THEN
    RAISE EXCEPTION 'BAD_INPUT: an active regulatory function must be selected';
  END IF;
  IF _effective_to IS NOT NULL AND _effective_to < _effective_from THEN
    RAISE EXCEPTION 'BAD_INPUT: the end date cannot precede the start date';
  END IF;

  IF _id IS NULL THEN
    INSERT INTO public.regulator_mandates (regulator_id, regulatory_function_id, sector_id,
                                           sub_sector_id, responsibility_type, effective_from,
                                           effective_to, status, notes, created_by)
    VALUES (_regulator_id, _regulatory_function_id, _sector_id, _sub_sector_id,
            _responsibility_type, _effective_from, _effective_to, _status, _notes, v_actor)
    RETURNING id INTO v_id;
    PERFORM public.regulatory_structure_audit('CREATE','regulator_mandate',v_id,NULL,
      to_jsonb((SELECT m FROM public.regulator_mandates m WHERE m.id = v_id)));
  ELSE
    SELECT to_jsonb(m) INTO v_old FROM public.regulator_mandates m WHERE m.id = _id;
    IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: mandate does not exist'; END IF;
    UPDATE public.regulator_mandates
       SET regulator_id = _regulator_id, regulatory_function_id = _regulatory_function_id,
           sector_id = _sector_id, sub_sector_id = _sub_sector_id,
           responsibility_type = _responsibility_type, effective_from = _effective_from,
           effective_to = _effective_to, status = _status, notes = _notes, updated_at = now()
     WHERE id = _id;
    v_id := _id;
    PERFORM public.regulatory_structure_audit('UPDATE','regulator_mandate',v_id,v_old,
      to_jsonb((SELECT m FROM public.regulator_mandates m WHERE m.id = v_id)));
  END IF;

  RETURN jsonb_build_object('id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.regulator_mandate_set_status(_mandate_id uuid, _status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old jsonb;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF _status NOT IN ('active','inactive','requires_admin_review') THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown status %', _status;
  END IF;
  SELECT to_jsonb(m) INTO v_old FROM public.regulator_mandates m WHERE m.id = _mandate_id;
  IF v_old IS NULL THEN RAISE EXCEPTION 'NOT_FOUND: mandate does not exist'; END IF;
  UPDATE public.regulator_mandates
     SET status = _status,
         effective_to = CASE WHEN _status = 'inactive' THEN coalesce(effective_to, now()) ELSE effective_to END,
         updated_at = now()
   WHERE id = _mandate_id;
  PERFORM public.regulatory_structure_audit('UPDATE','regulator_mandate',_mandate_id,v_old,
    to_jsonb((SELECT m FROM public.regulator_mandates m WHERE m.id = _mandate_id)));
  RETURN jsonb_build_object('id', _mandate_id, 'status', _status);
END; $$;

CREATE OR REPLACE FUNCTION public.regulator_mandate_enforcement_set(
  _regulator_id uuid, _regulatory_function_id uuid, _enforcement_status text, _notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_id uuid; v_old jsonb; v_covered integer;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF _enforcement_status NOT IN ('DRAFT','ACTIVE') THEN
    RAISE EXCEPTION 'BAD_INPUT: enforcement must be DRAFT or ACTIVE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = _regulator_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulator';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.regulatory_functions WHERE id = _regulatory_function_id) THEN
    RAISE EXCEPTION 'BAD_INPUT: unknown regulatory function';
  END IF;

  IF _enforcement_status = 'ACTIVE' THEN
    SELECT count(*) INTO v_covered FROM public.regulator_mandates
     WHERE regulator_id = _regulator_id AND regulatory_function_id = _regulatory_function_id
       AND status = 'active' AND (effective_to IS NULL OR effective_to > now());
    IF v_covered = 0 THEN
      RAISE EXCEPTION 'BAD_INPUT: record at least one active mandate before enforcing this function';
    END IF;
  END IF;

  SELECT to_jsonb(e), e.id INTO v_old, v_id FROM public.regulator_mandate_enforcement e
   WHERE e.regulator_id = _regulator_id AND e.regulatory_function_id = _regulatory_function_id;

  IF v_id IS NULL THEN
    INSERT INTO public.regulator_mandate_enforcement (regulator_id, regulatory_function_id,
      enforcement_status, activated_at, activated_by, notes)
    VALUES (_regulator_id, _regulatory_function_id, _enforcement_status,
            CASE WHEN _enforcement_status = 'ACTIVE' THEN now() END,
            CASE WHEN _enforcement_status = 'ACTIVE' THEN v_actor END, _notes)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.regulator_mandate_enforcement
       SET enforcement_status = _enforcement_status,
           activated_at = CASE WHEN _enforcement_status = 'ACTIVE' THEN coalesce(activated_at, now()) ELSE NULL END,
           activated_by = CASE WHEN _enforcement_status = 'ACTIVE' THEN coalesce(activated_by, v_actor) ELSE NULL END,
           notes = coalesce(_notes, notes),
           updated_at = now()
     WHERE id = v_id;
  END IF;

  PERFORM public.regulatory_structure_audit('UPDATE','regulator_mandate_enforcement',v_id,v_old,
    to_jsonb((SELECT e FROM public.regulator_mandate_enforcement e WHERE e.id = v_id)));
  RETURN jsonb_build_object('id', v_id, 'enforcement_status', _enforcement_status);
END; $$;

-- ------------------------------------------------------------------ --
-- Privileges
-- ------------------------------------------------------------------ --
DO $$
DECLARE fn text;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN (
         'regulatory_structure_assert_admin','regulatory_structure_assert_staff',
         'regulatory_structure_audit','regulatory_team_upsert','regulatory_team_set_status',
         'regulatory_team_member_set','regulatory_team_member_end','regulatory_team_mandate_add',
         'regulatory_team_mandate_end','staff_portfolio_upsert','staff_portfolio_end',
         'staff_portfolio_scope_add','staff_portfolio_scope_remove','regulator_mandate_upsert',
         'regulator_mandate_set_status','regulator_mandate_enforcement_set')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
  END LOOP;
END $$;