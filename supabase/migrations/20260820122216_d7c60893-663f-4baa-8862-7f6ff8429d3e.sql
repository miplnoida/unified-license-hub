DO $mig$
DECLARE src text; ob text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO src FROM pg_proc
   WHERE proname = 'entity360_overview' AND pronamespace = 'public'::regnamespace;
  ob := $o$WHERE o.entity_id = _entity_id AND o.status = 'active'$o$;
  IF position(ob in src) = 0 THEN
    RAISE EXCEPTION 'entity360_overview: obligations predicate not found';
  END IF;
  EXECUTE replace(src, ob, $n$WHERE o.entity_id = _entity_id AND lower(o.status) = 'active'$n$);
END $mig$;