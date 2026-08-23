CREATE OR REPLACE FUNCTION public.cert_v2_detach_users(_keep_user_ids uuid[], _reassign_to uuid)
RETURNS TABLE(target text, action text, rows_affected integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_n integer; v_keep text[];
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  -- Only configuration/reference/security tables are detached; RUNTIME_MUST_ZERO
  -- tables are emptied by cert_v2_zero_runtime and may carry immutability triggers.
  SELECT array_agg(c.table_name) INTO v_keep
    FROM public.cert_v2_table_classification() c
   WHERE c.category <> 'RUNTIME_MUST_ZERO';

  FOR r IN
    SELECT src.relname::text AS tbl, a.attname::text AS col, a.attnotnull AS nn
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace tn ON tn.oid = tgt.relnamespace
      JOIN pg_namespace sn ON sn.oid = src.relnamespace
      JOIN unnest(c.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     WHERE c.contype = 'f' AND sn.nspname = 'public'
       AND array_length(c.conkey,1) = 1
       AND (tgt.relname = 'profiles' OR (tn.nspname = 'auth' AND tgt.relname = 'users'))
       AND src.relname <> 'profiles'
       AND src.relname = ANY (v_keep)
       AND NOT (src.relname = ANY (public.cert_v2_user_identity_tables()))
     ORDER BY 1,2
  LOOP
    IF r.nn THEN
      EXECUTE format('UPDATE public.%I SET %I = $2 WHERE NOT (%I = ANY($1))',
                     r.tbl, r.col, r.col) USING _keep_user_ids, _reassign_to;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN RETURN QUERY SELECT r.tbl||'.'||r.col, 'reassigned', v_n; END IF;
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND NOT (%I = ANY($1))',
                     r.tbl, r.col, r.col, r.col) USING _keep_user_ids;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n > 0 THEN RETURN QUERY SELECT r.tbl||'.'||r.col, 'nulled', v_n; END IF;
    END IF;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_detach_users(uuid[], uuid) TO service_role;