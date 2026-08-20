DO $mig$
DECLARE r record; src text;
BEGIN
  FOR r IN
    SELECT oid, proname FROM pg_proc
     WHERE pronamespace = 'public'::regnamespace
       AND proname IN ('entity360_overview','entity360_section','entity360_timeline','entity360_as_of','e360_section_allowed')
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src, 'IF u IS NULL OR public.has_external_role(u) THEN',
                        'IF u IS NULL OR NOT public.is_internal_staff(u) THEN');
    src := replace(src, 'WHEN public.has_external_role(_user) THEN false',
                        'WHEN NOT public.is_internal_staff(_user) THEN false');
    EXECUTE src;
  END LOOP;
END $mig$;