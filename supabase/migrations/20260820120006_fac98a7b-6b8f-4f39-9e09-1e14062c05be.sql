
CREATE OR REPLACE FUNCTION public.cert_reset_nonproduction_business_data_v1(
  _confirmation text,
  _project_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g record;
  preserved text[] := public.cert_reset_preserved_tables();
  wipe text[]; pending text[]; next_pending text[]; t text;
  pass int := 0; fk record;
  cleared jsonb := '{}'::jsonb; detached jsonb := '{}'::jsonb;
  before_counts jsonb := '{}'::jsonb; after_counts jsonb := '{}'::jsonb;
  n bigint; deleted jsonb := '{}'::jsonb;
  total_deleted bigint := 0; errs jsonb := '{}'::jsonb;
  suspended text[] := ARRAY[]::text[];
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

  -- Suspend business guard triggers on disposable tables only, for the
  -- duration of the deletion phase. FK constraints and RLS remain enforced.
  FOREACH t IN ARRAY wipe LOOP
    IF EXISTS (SELECT 1 FROM pg_trigger tg
               WHERE tg.tgrelid = format('public.%I', t)::regclass AND NOT tg.tgisinternal) THEN
      EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t);
      suspended := suspended || t;
    END IF;
  END LOOP;

  detached := public.cert_reset_detach_optional_links(wipe);

  pending := wipe;
  WHILE array_length(pending, 1) IS NOT NULL AND pass < 40 LOOP
    pass := pass + 1;
    next_pending := ARRAY[]::text[];
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(t, COALESCE((deleted->>t)::bigint,0) + n);
          total_deleted := total_deleted + n;
        END IF;
      EXCEPTION WHEN others THEN
        errs := errs || jsonb_build_object(t, SQLERRM);
        next_pending := next_pending || t;
      END;
    END LOOP;
    EXIT WHEN array_length(next_pending, 1) IS NULL;
    pending := next_pending;
  END LOOP;

  IF array_length(pending, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'reset blocked after % passes; undeletable: % :: %',
      pass, array_to_string(pending, ', '), errs::text;
  END IF;

  -- Restore every suspended trigger before completing.
  FOREACH t IN ARRAY suspended LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t);
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_trigger tg JOIN pg_class c ON c.oid = tg.tgrelid
    WHERE c.relnamespace = 'public'::regnamespace AND NOT tg.tgisinternal AND tg.tgenabled = 'D'
  ) THEN
    RAISE EXCEPTION 'reset aborted: one or more business triggers remained disabled';
  END IF;

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN after_counts := after_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','RESET_COMPLETE','environment',g.environment,'project_ref',g.project_ref,
    'passes',pass,'disposable_tables',array_length(wipe,1),'rows_deleted_total',total_deleted,
    'triggers_suspended_count',array_length(suspended,1),
    'triggers_restored', true,
    'optional_links_detached',detached,
    'before_counts',before_counts,'deleted_counts',deleted,
    'after_counts_nonzero',after_counts,'pointers_cleared',cleared);
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) TO service_role;

DROP FUNCTION IF EXISTS public.cert_reset_probe_delete(text[]);
