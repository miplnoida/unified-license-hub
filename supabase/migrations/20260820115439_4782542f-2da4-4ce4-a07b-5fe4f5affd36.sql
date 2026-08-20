
CREATE OR REPLACE FUNCTION public.cert_reset_detach_optional_links(_tables text[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  fk record; n bigint; out_j jsonb := '{}'::jsonb;
BEGIN
  FOR fk IN
    SELECT DISTINCT cc.relname::text AS child_tbl, a.attname::text AS child_col
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'f'
      AND cc.relnamespace = 'public'::regnamespace
      AND pc.relnamespace = 'public'::regnamespace
      AND cc.relname = ANY (_tables)
      AND pc.relname = ANY (_tables)
      AND NOT a.attnotnull
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', fk.child_tbl);
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL',
                     fk.child_tbl, fk.child_col, fk.child_col);
      GET DIAGNOSTICS n = ROW_COUNT;
      EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', fk.child_tbl);
      IF n > 0 THEN
        out_j := out_j || jsonb_build_object(fk.child_tbl || '.' || fk.child_col, n);
      END IF;
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
  RETURN out_j;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_reset_detach_optional_links(text[]) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_reset_detach_optional_links(text[]) TO service_role;
