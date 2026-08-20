DO $$
DECLARE r record; src text;
BEGIN
  FOR r IN
    SELECT oid FROM pg_proc
     WHERE prosrc LIKE '%COALESCE(entity_name, legal_name%'
       AND pronamespace = 'public'::regnamespace
  LOOP
    src := pg_get_functiondef(r.oid);
    src := replace(src, 'COALESCE(entity_name, legal_name, id::text)', 'COALESCE(name, id::text)');
    EXECUTE src;
  END LOOP;
END $$;