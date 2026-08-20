DROP FUNCTION IF EXISTS public.cert_reset_dependency_order();

CREATE OR REPLACE FUNCTION public.cert_reset_dependency_order(_hard_edges_only boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  preserved text[] := public.cert_reset_preserved_tables();
  pending text[];
  ordered text[] := ARRAY[]::text[];
  layer text[];
  cycles jsonb := '[]'::jsonb;
  guard int := 0;
BEGIN
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO pending
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT (c.relname = ANY (preserved));

  WHILE array_length(pending, 1) IS NOT NULL AND guard < 400 LOOP
    guard := guard + 1;

    SELECT array_agg(t ORDER BY t) INTO layer
    FROM unnest(pending) AS t
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_constraint con
      JOIN pg_class cc ON cc.oid = con.conrelid
      JOIN pg_class pc ON pc.oid = con.confrelid
      JOIN unnest(con.conkey) AS k(attnum) ON true
      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
      WHERE con.contype = 'f'
        AND cc.relnamespace = 'public'::regnamespace
        AND pc.relnamespace = 'public'::regnamespace
        AND pc.relname = t
        AND cc.relname <> t
        AND cc.relname = ANY (pending)
        AND (NOT _hard_edges_only OR a.attnotnull)
    );

    IF layer IS NULL THEN
      cycles := cycles || jsonb_build_array(to_jsonb(pending));
      ordered := ordered || pending;
      pending := NULL;
      EXIT;
    END IF;

    ordered := ordered || layer;
    SELECT array_agg(t ORDER BY t) INTO pending
    FROM unnest(pending) AS t WHERE NOT (t = ANY (layer));
  END LOOP;

  RETURN jsonb_build_object(
    'order', to_jsonb(ordered),
    'table_count', COALESCE(array_length(ordered, 1), 0),
    'hard_edges_only', _hard_edges_only,
    'cycle_groups', cycles,
    'acyclic', (cycles = '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cert_reset_dependency_order(boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cert_reset_nonproduction_business_data_v1(_confirmation text, _project_ref text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g record;
  preserved text[] := public.cert_reset_preserved_tables();
  wipe text[]; t text; fk record;
  dep jsonb; ordered text[];
  cleared jsonb := '{}'::jsonb; detached jsonb := '{}'::jsonb;
  optional_cleared bigint := 0;
  before_counts jsonb := '{}'::jsonb; after_counts jsonb := '{}'::jsonb;
  n bigint; deleted jsonb := '{}'::jsonb;
  total_deleted bigint := 0;
  trig_before jsonb := '{}'::jsonb; trig_after jsonb := '{}'::jsonb;
  suspended text[] := ARRAY[]::text[];
  residual text[] := ARRAY[]::text[];
BEGIN
  IF _confirmation IS DISTINCT FROM 'RESET-NONPRODUCTION-BUSINESS-DATA-CERT-V1' THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','confirmation phrase not supplied');
  END IF;
  SELECT * INTO g FROM public.cert_nonproduction_guard WHERE id;
  IF g IS NULL THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','non-production status cannot be proven');
  END IF;
  IF g.environment = 'production' OR NOT g.reset_enabled THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','guard forbids reset','environment',g.environment);
  END IF;
  IF g.project_ref IS DISTINCT FROM _project_ref THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','project reference does not match the allow-list');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cert_dataset_v1_reset_or_seed'));

  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO wipe
  FROM pg_class c JOIN pg_namespace n2 ON n2.oid = c.relnamespace
  WHERE n2.nspname = 'public' AND c.relkind = 'r' AND NOT (c.relname = ANY (preserved));

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN before_counts := before_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  SELECT COALESCE(jsonb_object_agg(c.relname || '.' || tg.tgname, tg.tgenabled::text), '{}'::jsonb)
    INTO trig_before
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
  WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal;

  FOR fk IN
    SELECT con.conrelid::regclass::text AS child_tbl, a.attname::text AS child_col,
           a.attnotnull AS notnull_col, con.confrelid::regclass::text AS parent_tbl
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'f' AND cc.relnamespace = 'public'::regnamespace
      AND pc.relnamespace = 'public'::regnamespace
      AND cc.relname = ANY (preserved) AND NOT (pc.relname = ANY (preserved))
  LOOP
    IF fk.notnull_col THEN
      RAISE EXCEPTION 'reset blocked: preserved table %.% is NOT NULL and references disposable table %',
        fk.child_tbl, fk.child_col, fk.parent_tbl;
    END IF;
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IS NOT NULL', fk.child_tbl, fk.child_col, fk.child_col);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN cleared := cleared || jsonb_build_object(fk.child_tbl||'.'||fk.child_col, n); END IF;
  END LOOP;

  FOREACH t IN ARRAY wipe LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger tg
               WHERE tg.tgrelid = format('public.%I', t)::regclass AND NOT tg.tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
      suspended := suspended || t;
    END IF;
  END LOOP;

  detached := public.cert_reset_detach_optional_links(wipe);

  -- Cycle resolution: clear EVERY optional link between disposable business
  -- tables. All of these rows are being removed anyway, so detaching optional
  -- pointers is loss-free and makes the remaining graph acyclic.
  FOR fk IN
    SELECT con.conrelid::regclass::text AS child_tbl, a.attname::text AS child_col
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
    WHERE con.contype = 'f' AND cc.relnamespace = 'public'::regnamespace
      AND pc.relnamespace = 'public'::regnamespace
      AND NOT a.attnotnull
      AND cc.relname = ANY (wipe) AND pc.relname = ANY (wipe)
    ORDER BY 1, 2
  LOOP
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IS NOT NULL', fk.child_tbl, fk.child_col, fk.child_col);
    GET DIAGNOSTICS n = ROW_COUNT;
    optional_cleared := optional_cleared + n;
  END LOOP;

  -- Deterministic dependency-sorted order over mandatory links only.
  dep := public.cert_reset_dependency_order(true);
  IF NOT (dep->>'acyclic')::boolean THEN
    RAISE EXCEPTION 'reset blocked: mandatory foreign-key cycle detected among disposable tables: %',
      (dep->'cycle_groups')::text;
  END IF;

  SELECT array_agg(value ORDER BY ord) INTO ordered
  FROM jsonb_array_elements_text(dep->'order') WITH ORDINALITY AS x(value, ord);

  FOREACH t IN ARRAY ordered LOOP
    EXECUTE format('DELETE FROM public.%I', t);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      deleted := deleted || jsonb_build_object(t, n);
      total_deleted := total_deleted + n;
    END IF;
  END LOOP;

  FOREACH t IN ARRAY suspended LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;

  SELECT COALESCE(jsonb_object_agg(c.relname || '.' || tg.tgname, tg.tgenabled::text), '{}'::jsonb)
    INTO trig_after
  FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
  WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal;

  IF trig_before IS DISTINCT FROM trig_after THEN
    RAISE EXCEPTION 'reset aborted: trigger state was not restored exactly';
  END IF;

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN
      after_counts := after_counts || jsonb_build_object(t, n);
      residual := residual || t;
    END IF;
  END LOOP;

  IF array_length(residual, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'reset incomplete: disposable rows remain in % :: %',
      array_to_string(residual, ', '), after_counts::text;
  END IF;

  RETURN jsonb_build_object(
    'status','RESET_COMPLETE','environment',g.environment,'project_ref',g.project_ref,
    'algorithm','dependency_sorted_hard_edges',
    'dependency_acyclic', true,
    'optional_links_nulled_rows', optional_cleared,
    'disposable_tables',array_length(wipe,1),'rows_deleted_total',total_deleted,
    'triggers_suspended_count',array_length(suspended,1),
    'trigger_restoration_mismatches', 0,
    'optional_links_detached',detached,
    'before_counts',before_counts,'deleted_counts',deleted,
    'after_counts_nonzero',after_counts,'pointers_cleared',cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) FROM PUBLIC, anon, authenticated;