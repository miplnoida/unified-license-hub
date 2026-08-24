-- Structured, atomic multi-area responsibility save.
-- Authority semantics are unchanged: same admin assertion, same staff assertion,
-- same duplicate rule and same team-membership rule as staff_portfolio_upsert.

CREATE OR REPLACE FUNCTION public.staff_responsibility_plan_preview(
  _user_id uuid,
  _function_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_actor uuid := auth.uid(); v_out jsonb := '[]'::jsonb; v_fn uuid; v_existing record;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  IF _function_ids IS NULL THEN RETURN v_out; END IF;
  FOREACH v_fn IN ARRAY _function_ids LOOP
    SELECT sp.id, sp.regulator_id, sp.team_id INTO v_existing
      FROM public.staff_portfolios sp
     WHERE sp.user_id = _user_id AND sp.regulatory_function_id = v_fn AND sp.status = 'active'
     LIMIT 1;
    v_out := v_out || jsonb_build_object(
      'regulatory_function_id', v_fn,
      'function_name', (SELECT name FROM public.regulatory_functions WHERE id = v_fn),
      'state', CASE WHEN v_existing.id IS NULL THEN 'new' ELSE 'already_assigned' END,
      'portfolio_id', v_existing.id,
      'regulator_id', v_existing.regulator_id,
      'team_id', v_existing.team_id
    );
  END LOOP;
  RETURN v_out;
END; $$;

REVOKE ALL ON FUNCTION public.staff_responsibility_plan_preview(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_responsibility_plan_preview(uuid, uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_responsibilities_batch_save(
  _user_id uuid,
  _items jsonb,
  _dry_run boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_item jsonb;
  v_results jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_seen uuid[] := '{}';
  v_fn uuid; v_reg uuid; v_team uuid; v_kind text; v_vals uuid[]; v_mode text;
  v_from timestamptz; v_to timestamptz; v_notes text;
  v_existing_id uuid; v_fn_name text; v_val uuid; v_sec uuid; v_sub uuid;
  v_pid uuid; v_old jsonb; v_scope_id uuid; v_created int; v_updated int;
BEGIN
  PERFORM public.regulatory_structure_assert_admin(v_actor);
  PERFORM public.regulatory_structure_assert_staff(_user_id);

  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'BAD_INPUT: at least one area of work must be selected';
  END IF;

  -- ---------- PASS 1: validate everything before any write ----------
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_fn   := nullif(v_item->>'regulatory_function_id','')::uuid;
    v_reg  := nullif(v_item->>'regulator_id','')::uuid;
    v_team := nullif(v_item->>'team_id','')::uuid;
    v_kind := coalesce(nullif(v_item->>'applies_to',''),'all');
    v_mode := lower(coalesce(nullif(v_item->>'mode',''),'create'));
    v_vals := CASE WHEN v_item ? 'values' AND jsonb_typeof(v_item->'values') = 'array'
                   THEN (SELECT coalesce(array_agg((x)::uuid), '{}'::uuid[])
                           FROM jsonb_array_elements_text(v_item->'values') x)
                   ELSE '{}'::uuid[] END;
    v_fn_name := (SELECT name FROM public.regulatory_functions WHERE id = v_fn);

    IF v_fn IS NULL OR NOT EXISTS (SELECT 1 FROM public.regulatory_functions
                                    WHERE id = v_fn AND status = 'active') THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'code','INVALID_FUNCTION','message','An active area of work must be selected.');
      CONTINUE;
    END IF;

    IF v_fn = ANY (v_seen) THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'code','DUPLICATE_FUNCTION_IN_BATCH',
        'message','The same area of work was submitted twice.');
      CONTINUE;
    END IF;
    v_seen := v_seen || v_fn;

    IF v_mode NOT IN ('create','update','skip') THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'code','INVALID_MODE','message','Unknown instruction.');
      CONTINUE;
    END IF;

    IF v_kind NOT IN ('all','sector','sub_sector','entity') THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'code','INVALID_SCOPE_KIND','message','Unknown coverage type.');
      CONTINUE;
    END IF;

    IF v_kind <> 'all' AND coalesce(array_length(v_vals,1),0) = 0 THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'code','COVERAGE_REQUIRED',
        'message','Select at least one item for the chosen coverage.');
      CONTINUE;
    END IF;

    IF v_reg IS NULL OR NOT EXISTS (SELECT 1 FROM public.regulators WHERE id = v_reg) THEN
      v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'code','REGULATOR_COVERAGE_NOT_CONFIGURED',
        'message','REGULATOR COVERAGE NOT CONFIGURED');
      CONTINUE;
    END IF;

    IF v_team IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.regulatory_teams
                      WHERE id = v_team AND regulator_id = v_reg AND status = 'active') THEN
        v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
          'function_name', v_fn_name, 'code','TEAM_NOT_COMPATIBLE',
          'message','The selected team does not belong to this regulator or is inactive.');
        CONTINUE;
      END IF;
      IF NOT public.regulatory_team_membership_active(_user_id, v_team) THEN
        v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
          'function_name', v_fn_name, 'code','NOT_TEAM_MEMBER',
          'message','The person must be an active member of the selected team.');
        CONTINUE;
      END IF;
    END IF;

    -- coverage values must exist
    IF v_kind = 'sector' THEN
      FOREACH v_val IN ARRAY v_vals LOOP
        IF NOT EXISTS (SELECT 1 FROM public.sectors WHERE id = v_val) THEN
          v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
            'function_name', v_fn_name, 'code','UNKNOWN_SECTOR','message','Unknown sector selected.');
        END IF;
      END LOOP;
    ELSIF v_kind = 'sub_sector' THEN
      FOREACH v_val IN ARRAY v_vals LOOP
        IF NOT EXISTS (SELECT 1 FROM public.sub_sectors WHERE id = v_val) THEN
          v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
            'function_name', v_fn_name, 'code','UNKNOWN_SUB_SECTOR','message','Unknown sub-sector selected.');
        END IF;
      END LOOP;
    ELSIF v_kind = 'entity' THEN
      FOREACH v_val IN ARRAY v_vals LOOP
        IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = v_val) THEN
          v_errors := v_errors || jsonb_build_object('regulatory_function_id', v_fn,
            'function_name', v_fn_name, 'code','UNKNOWN_ENTITY','message','Unknown entity selected.');
        END IF;
      END LOOP;
    END IF;

    SELECT sp.id INTO v_existing_id FROM public.staff_portfolios sp
     WHERE sp.user_id = _user_id AND sp.regulator_id = v_reg
       AND sp.regulatory_function_id = v_fn AND sp.status = 'active' LIMIT 1;

    IF v_existing_id IS NOT NULL AND v_mode = 'create' THEN
      -- Never a duplicate insert: treated as an explicit skip.
      v_results := v_results || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'action','skipped_existing', 'portfolio_id', v_existing_id);
    ELSIF v_existing_id IS NULL AND v_mode = 'update' THEN
      v_results := v_results || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'action','planned_create');
    ELSE
      v_results := v_results || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name,
        'action', CASE WHEN v_mode = 'skip' THEN 'skipped'
                       WHEN v_existing_id IS NULL THEN 'planned_create'
                       ELSE 'planned_update' END,
        'portfolio_id', v_existing_id);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_errors) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'committed', false,
                              'errors', v_errors, 'results', v_results);
  END IF;
  IF _dry_run THEN
    RETURN jsonb_build_object('ok', true, 'committed', false,
                              'errors', v_errors, 'results', v_results);
  END IF;

  -- ---------- PASS 2: apply, all-or-nothing ----------
  v_created := 0; v_updated := 0; v_results := '[]'::jsonb;
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    v_fn   := nullif(v_item->>'regulatory_function_id','')::uuid;
    v_reg  := nullif(v_item->>'regulator_id','')::uuid;
    v_team := nullif(v_item->>'team_id','')::uuid;
    v_kind := coalesce(nullif(v_item->>'applies_to',''),'all');
    v_mode := lower(coalesce(nullif(v_item->>'mode',''),'create'));
    v_from := coalesce(nullif(v_item->>'effective_from','')::timestamptz, now());
    v_to   := nullif(v_item->>'effective_to','')::timestamptz;
    v_notes := nullif(v_item->>'notes','');
    v_fn_name := (SELECT name FROM public.regulatory_functions WHERE id = v_fn);
    v_vals := CASE WHEN v_item ? 'values' AND jsonb_typeof(v_item->'values') = 'array'
                   THEN (SELECT coalesce(array_agg((x)::uuid), '{}'::uuid[])
                           FROM jsonb_array_elements_text(v_item->'values') x)
                   ELSE '{}'::uuid[] END;

    IF v_to IS NOT NULL AND v_to < v_from THEN
      RAISE EXCEPTION 'BAD_INPUT: the end date cannot precede the start date';
    END IF;

    SELECT sp.id INTO v_existing_id FROM public.staff_portfolios sp
     WHERE sp.user_id = _user_id AND sp.regulator_id = v_reg
       AND sp.regulatory_function_id = v_fn AND sp.status = 'active' LIMIT 1;

    IF v_mode = 'skip' OR (v_existing_id IS NOT NULL AND v_mode = 'create') THEN
      v_results := v_results || jsonb_build_object('regulatory_function_id', v_fn,
        'function_name', v_fn_name, 'action','skipped_existing', 'portfolio_id', v_existing_id);
      CONTINUE;
    END IF;

    IF v_existing_id IS NULL THEN
      INSERT INTO public.staff_portfolios (user_id, regulator_id, regulatory_function_id, team_id,
                                           effective_from, effective_to, status, notes, created_by)
      VALUES (_user_id, v_reg, v_fn, v_team, v_from, v_to, 'active', v_notes, v_actor)
      RETURNING id INTO v_pid;
      PERFORM public.regulatory_structure_audit('CREATE','staff_portfolio',v_pid,NULL,
        to_jsonb((SELECT s FROM public.staff_portfolios s WHERE s.id = v_pid)));
      v_created := v_created + 1;
    ELSE
      v_pid := v_existing_id;
      SELECT to_jsonb(s) INTO v_old FROM public.staff_portfolios s WHERE s.id = v_pid;
      UPDATE public.staff_portfolios
         SET team_id = v_team, effective_from = v_from, effective_to = v_to,
             notes = v_notes, updated_at = now()
       WHERE id = v_pid;
      PERFORM public.regulatory_structure_audit('UPDATE','staff_portfolio',v_pid,v_old,
        to_jsonb((SELECT s FROM public.staff_portfolios s WHERE s.id = v_pid)));
      v_updated := v_updated + 1;
    END IF;

    -- Coverage: remove what is no longer selected, add what is new, never duplicate.
    FOR v_old IN
      SELECT to_jsonb(s) FROM public.staff_portfolio_scopes s WHERE s.portfolio_id = v_pid
    LOOP
      v_scope_id := (v_old->>'id')::uuid;
      v_val := coalesce(
        CASE (v_old->>'scope_kind')
          WHEN 'sector' THEN nullif(v_old->>'sector_id','')::uuid
          WHEN 'sub_sector' THEN nullif(v_old->>'sub_sector_id','')::uuid
          ELSE nullif(v_old->>'entity_id','')::uuid END,
        '00000000-0000-0000-0000-000000000000'::uuid);
      IF v_kind = 'all' OR (v_old->>'scope_kind') <> v_kind OR NOT (v_val = ANY (v_vals)) THEN
        DELETE FROM public.staff_portfolio_scopes WHERE id = v_scope_id;
        PERFORM public.regulatory_structure_audit('DELETE','staff_portfolio_scope',v_scope_id,v_old,NULL);
      END IF;
    END LOOP;

    IF v_kind <> 'all' THEN
      FOREACH v_val IN ARRAY v_vals LOOP
        v_sec := NULL; v_sub := NULL;
        IF v_kind = 'sector' THEN v_sec := v_val;
        ELSIF v_kind = 'sub_sector' THEN
          v_sub := v_val;
          SELECT ss.sector_id INTO v_sec FROM public.sub_sectors ss WHERE ss.id = v_val;
        ELSE
          SELECT l.sector_id, l.sub_sector_id INTO v_sec, v_sub
            FROM public.licensees l WHERE l.id = v_val;
        END IF;

        IF EXISTS (
          SELECT 1 FROM public.staff_portfolio_scopes
           WHERE portfolio_id = v_pid AND scope_kind = v_kind
             AND coalesce(sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                 = coalesce(v_sec,'00000000-0000-0000-0000-000000000000'::uuid)
             AND coalesce(sub_sector_id,'00000000-0000-0000-0000-000000000000'::uuid)
                 = coalesce(v_sub,'00000000-0000-0000-0000-000000000000'::uuid)
             AND coalesce(entity_id,'00000000-0000-0000-0000-000000000000'::uuid)
                 = coalesce(CASE WHEN v_kind = 'entity' THEN v_val END,
                            '00000000-0000-0000-0000-000000000000'::uuid)
        ) THEN CONTINUE; END IF;

        INSERT INTO public.staff_portfolio_scopes (portfolio_id, scope_kind, sector_id, sub_sector_id,
                                                   entity_id, created_by)
        VALUES (v_pid, v_kind, v_sec, v_sub,
                CASE WHEN v_kind = 'entity' THEN v_val END, v_actor)
        RETURNING id INTO v_scope_id;
        PERFORM public.regulatory_structure_audit('CREATE','staff_portfolio_scope',v_scope_id,NULL,
          to_jsonb((SELECT s FROM public.staff_portfolio_scopes s WHERE s.id = v_scope_id)));
      END LOOP;
    END IF;

    v_results := v_results || jsonb_build_object('regulatory_function_id', v_fn,
      'function_name', v_fn_name, 'portfolio_id', v_pid,
      'action', CASE WHEN v_existing_id IS NULL THEN 'created' ELSE 'updated' END);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'committed', true, 'errors', '[]'::jsonb,
                            'created', v_created, 'updated', v_updated, 'results', v_results);
END; $$;

REVOKE ALL ON FUNCTION public.staff_responsibilities_batch_save(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_responsibilities_batch_save(uuid, jsonb, boolean) TO authenticated;