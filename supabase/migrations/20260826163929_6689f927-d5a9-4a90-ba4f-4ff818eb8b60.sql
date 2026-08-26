CREATE OR REPLACE FUNCTION public.conduct_planning_scope(_uid uuid, _sector_id uuid, _regulator_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE _sectors uuid[];
BEGIN
  -- A named sector must actually exist. An unknown id is a scope error, not an
  -- empty population: fail closed rather than return a misleading blank run.
  IF _sector_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.sectors s WHERE s.id = _sector_id) THEN
    RAISE EXCEPTION 'unknown_sector: the named sector does not exist' USING ERRCODE = '22023';
  END IF;
  IF public.is_super_admin(_uid) THEN
    RETURN CASE WHEN _sector_id IS NULL THEN NULL ELSE ARRAY[_sector_id] END;
  END IF;
  IF _sector_id IS NOT NULL THEN
    IF NOT public.regulatory_scope_allows(_uid, 'market_conduct', 'view',
             _regulator_id, _sector_id, NULL, NULL, _uid) THEN
      RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
    END IF;
    RETURN ARRAY[_sector_id];
  END IF;
  _sectors := public.market_conduct_visible_sectors(_uid, _regulator_id);
  IF _sectors IS NULL OR array_length(_sectors, 1) IS NULL THEN
    RAISE EXCEPTION 'not_authorized: sector out of regulatory scope' USING ERRCODE = '42501';
  END IF;
  RETURN _sectors;
END $$;
