CREATE OR REPLACE FUNCTION public.staff_portfolio_scope_add(_portfolio_id uuid, _scope_kind text, _sector_id uuid DEFAULT NULL::uuid, _sub_sector_id uuid DEFAULT NULL::uuid, _entity_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- An entity scope names only the entity (the scope validator forbids sector/sub-sector).
    _sector_id := NULL; _sub_sector_id := NULL;
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
END; $function$;