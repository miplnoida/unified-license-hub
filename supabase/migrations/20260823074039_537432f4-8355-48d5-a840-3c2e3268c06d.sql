-- Fixture purge must be able to remove non-production append-only history rows.
-- Achieved by temporarily disabling USER triggers (FK/system triggers stay on) for
-- the duration of the harness transaction. Non-production guard still applies.
CREATE OR REPLACE FUNCTION public.cert_v2_exec_unguarded(_table text, _sql text, _ids uuid[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', _table);
  EXECUTE _sql USING _ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', _table);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_exec_unguarded(text, text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_exec_unguarded(text, text, uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public.cert_v2_cascade_delete(
  _table text, _ids uuid[], _depth integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record; v_child_ids uuid[]; v_total integer := 0; v_n integer;
  v_child_pk text; v_pk text; v_nullable boolean;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN RETURN 0; END IF;
  IF _depth > 12 THEN
    RAISE EXCEPTION 'cert_v2_cascade_delete: depth limit exceeded at %', _table
      USING ERRCODE = '54001';
  END IF;

  v_pk := public.cert_v2_pk_column(_table);
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'MANUAL_BLOCKER: % has no single-column primary key', _table
      USING ERRCODE = '22023';
  END IF;

  FOR r IN
    SELECT src.relname AS child_table, a.attname AS child_col, c.confdeltype AS del
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN pg_namespace ns ON ns.oid = src.relnamespace
      JOIN unnest(c.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     WHERE c.contype = 'f' AND ns.nspname = 'public'
       AND tgt.relname = _table
       AND array_length(c.conkey,1) = 1
       AND src.relname <> _table
  LOOP
    IF r.child_table = ANY (public.cert_v2_protected_tables()) THEN
      SELECT is_nullable = 'YES' INTO v_nullable
        FROM information_schema.columns
       WHERE table_schema='public' AND table_name=r.child_table AND column_name=r.child_col;
      IF coalesce(v_nullable,false) THEN
        PERFORM public.cert_v2_exec_unguarded(
          r.child_table,
          format('UPDATE public.%I SET %I = NULL WHERE %I = ANY($1)',
                 r.child_table, r.child_col, r.child_col), _ids);
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'MANUAL_BLOCKER: protected table %.% has a NOT NULL reference to %',
        r.child_table, r.child_col, _table USING ERRCODE = '23503';
    END IF;

    IF r.del IN ('n','d') THEN CONTINUE; END IF;

    v_child_pk := public.cert_v2_pk_column(r.child_table);

    IF v_child_pk IS NOT NULL THEN
      EXECUTE format('SELECT array_agg(%I) FROM public.%I WHERE %I = ANY($1)',
                     v_child_pk, r.child_table, r.child_col) INTO v_child_ids USING _ids;
      IF v_child_ids IS NOT NULL AND array_length(v_child_ids,1) > 0 THEN
        v_total := v_total + public.cert_v2_cascade_delete(r.child_table, v_child_ids, _depth + 1);
      END IF;
    ELSE
      v_total := v_total + public.cert_v2_exec_unguarded(
        r.child_table,
        format('DELETE FROM public.%I WHERE %I = ANY($1)', r.child_table, r.child_col), _ids);
    END IF;
  END LOOP;

  FOR r IN
    SELECT a.attname AS col
      FROM pg_constraint c
      JOIN pg_class src ON src.oid = c.conrelid
      JOIN pg_class tgt ON tgt.oid = c.confrelid
      JOIN unnest(c.conkey) k ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
     WHERE c.contype='f' AND src.relname=_table AND tgt.relname=_table
       AND array_length(c.conkey,1)=1
  LOOP
    PERFORM public.cert_v2_exec_unguarded(
      _table, format('UPDATE public.%I SET %I = NULL WHERE %I = ANY($1)', _table, r.col, r.col), _ids);
  END LOOP;

  v_n := public.cert_v2_exec_unguarded(
    _table, format('DELETE FROM public.%I WHERE %I = ANY($1)', _table, v_pk), _ids);
  RETURN v_total + v_n;
END;
$$;
REVOKE ALL ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) TO service_role;