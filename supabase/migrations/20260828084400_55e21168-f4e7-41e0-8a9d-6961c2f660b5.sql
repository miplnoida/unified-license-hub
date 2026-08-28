DO $$
DECLARE r record; _q text;
BEGIN
  FOR r IN
    SELECT g.table_name,
           EXISTS (SELECT 1 FROM public.config_public_read_allowlist a WHERE a.table_name = g.table_name) AS public_read,
           has_table_privilege('authenticated', 'public.' || quote_ident(g.table_name), 'SELECT') AS auth_select
      FROM public.config_governed_tables g
     WHERE to_regclass('public.' || quote_ident(g.table_name)) IS NOT NULL
  LOOP
    _q := 'public.' || quote_ident(r.table_name);
    EXECUTE format('REVOKE ALL ON %s FROM anon', _q);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON %s FROM authenticated', _q);
    EXECUTE format('REVOKE ALL ON %s FROM PUBLIC', _q);
    IF r.public_read THEN
      EXECUTE format('GRANT SELECT ON %s TO anon', _q);
    END IF;
    IF r.auth_select THEN
      EXECUTE format('GRANT SELECT ON %s TO authenticated', _q);
    END IF;
    EXECUTE format('GRANT ALL ON %s TO service_role', _q);
  END LOOP;
END
$$;