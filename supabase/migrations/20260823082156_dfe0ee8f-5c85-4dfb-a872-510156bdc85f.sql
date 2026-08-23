CREATE OR REPLACE FUNCTION public.cert_v2_zero_runtime(_keep_user_ids uuid[] DEFAULT '{}'::uuid[])
RETURNS TABLE(table_name text, rows_before bigint, rows_after bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_tables text[];
  v_sql text;
  r record;
  v_lost text;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  CREATE TEMP TABLE _zs_before ON COMMIT DROP AS
    SELECT c.table_name, c.category, c.row_count FROM public.cert_v2_table_classification() c;

  SELECT array_agg(b.table_name ORDER BY b.table_name) INTO v_tables
    FROM _zs_before b
   WHERE b.category = 'RUNTIME_MUST_ZERO'
     AND NOT (b.table_name = ANY (public.cert_v2_user_identity_tables()));

  IF v_tables IS NOT NULL THEN
    SELECT 'TRUNCATE TABLE ' || string_agg(format('public.%I', t), ', ') || ' CASCADE'
      INTO v_sql FROM unnest(v_tables) t;
    EXECUTE v_sql;
  END IF;

  -- user-identity tables keep only the certification accounts
  DELETE FROM public.sec_user_roles     WHERE NOT (user_id = ANY (_keep_user_ids));
  DELETE FROM public.user_roles         WHERE NOT (user_id = ANY (_keep_user_ids));
  DELETE FROM public.user_dynamic_roles WHERE NOT (user_id = ANY (_keep_user_ids));
  DELETE FROM public.profiles           WHERE NOT (id      = ANY (_keep_user_ids));

  -- config integrity guard
  SELECT string_agg(format('%s (%s -> %s)', b.table_name, b.row_count, a.row_count), ', ')
    INTO v_lost
    FROM _zs_before b
    JOIN public.cert_v2_table_classification() a ON a.table_name = b.table_name
   WHERE b.category <> 'RUNTIME_MUST_ZERO' AND a.row_count < b.row_count;
  IF v_lost IS NOT NULL THEN
    RAISE EXCEPTION 'CONFIG_LOSS_DETECTED: %', v_lost USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT b.table_name AS tn, b.row_count AS rb, a.row_count AS ra
      FROM _zs_before b
      JOIN public.cert_v2_table_classification() a ON a.table_name = b.table_name
     WHERE b.category = 'RUNTIME_MUST_ZERO' AND b.row_count > 0
     ORDER BY 1
  LOOP
    RETURN QUERY SELECT r.tn, r.rb, r.ra;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_zero_runtime(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_zero_runtime(uuid[]) TO service_role;