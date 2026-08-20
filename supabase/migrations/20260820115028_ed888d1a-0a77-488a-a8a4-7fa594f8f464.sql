
CREATE OR REPLACE FUNCTION public.cert_reset_nonproduction_business_data_v1(
  _confirmation text,
  _project_ref text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  g record;
  preserved text[] := public.cert_reset_preserved_tables();
  wipe text[];
  pending text[];
  next_pending text[];
  t text;
  pass int := 0;
  fk record;
  cleared jsonb := '{}'::jsonb;
  before_counts jsonb := '{}'::jsonb;
  after_counts jsonb := '{}'::jsonb;
  n bigint;
  deleted jsonb := '{}'::jsonb;
  total_deleted bigint := 0;
  last_err text;
BEGIN
  IF _confirmation IS DISTINCT FROM 'RESET-NONPRODUCTION-BUSINESS-DATA-CERT-V1' THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','confirmation phrase not supplied');
  END IF;

  SELECT * INTO g FROM public.cert_nonproduction_guard WHERE id;
  IF g IS NULL THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','non-production status cannot be proven: no guard row');
  END IF;
  IF g.environment = 'production' OR NOT g.reset_enabled THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','guard forbids reset','environment',g.environment);
  END IF;
  IF g.project_ref IS DISTINCT FROM _project_ref THEN
    RETURN jsonb_build_object('status','BLOCKED','reason','project reference does not match the allow-list');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('cert_dataset_v1_reset_or_seed'));

  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO wipe
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND NOT (c.relname = ANY (preserved));

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN before_counts := before_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  FOR fk IN
    SELECT con.conrelid::regclass::text AS child_tbl,
           child_att.attname::text AS child_col,
           child_att.attnotnull AS notnull_col,
           con.confrelid::regclass::text AS parent_tbl
    FROM pg_constraint con
    JOIN pg_class cc ON cc.oid = con.conrelid
    JOIN pg_class pc ON pc.oid = con.confrelid
    JOIN unnest(con.conkey) AS k(attnum) ON true
    JOIN pg_attribute child_att
      ON child_att.attrelid = con.conrelid AND child_att.attnum = k.attnum
    WHERE con.contype = 'f'
      AND cc.relnamespace = 'public'::regnamespace
      AND pc.relnamespace = 'public'::regnamespace
      AND cc.relname = ANY (preserved)
      AND NOT (pc.relname = ANY (preserved))
  LOOP
    IF fk.notnull_col THEN
      RAISE EXCEPTION 'reset blocked: preserved table %.% is NOT NULL and references disposable table %',
        fk.child_tbl, fk.child_col, fk.parent_tbl;
    END IF;
    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I IS NOT NULL', fk.child_tbl, fk.child_col, fk.child_col);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      cleared := cleared || jsonb_build_object(fk.child_tbl || '.' || fk.child_col, n);
    END IF;
  END LOOP;

  pending := wipe;
  WHILE array_length(pending, 1) IS NOT NULL AND pass < 15 LOOP
    pass := pass + 1;
    next_pending := ARRAY[]::text[];
    FOREACH t IN ARRAY pending LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
        GET DIAGNOSTICS n = ROW_COUNT;
        IF n > 0 THEN
          deleted := deleted || jsonb_build_object(t, COALESCE((deleted->>t)::bigint, 0) + n);
          total_deleted := total_deleted + n;
        END IF;
      EXCEPTION WHEN others THEN
        last_err := SQLERRM;
        next_pending := next_pending || t;
      END;
    END LOOP;
    EXIT WHEN array_length(next_pending, 1) IS NULL;
    pending := next_pending;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['audit_logs','compliance_audit_logs','notifications',
    'notification_outbox','notification_event_queue','notification_dispatch_log']
  LOOP
    IF NOT (t = ANY (preserved)) THEN
      BEGIN EXECUTE format('DELETE FROM public.%I', t); EXCEPTION WHEN others THEN NULL; END;
    END IF;
  END LOOP;

  IF array_length(pending, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'reset blocked after % passes; undeletable tables: % (last error: %)',
      pass, array_to_string(pending, ', '), last_err;
  END IF;

  FOREACH t IN ARRAY wipe LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    IF n > 0 THEN after_counts := after_counts || jsonb_build_object(t, n); END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','RESET_COMPLETE',
    'environment', g.environment,
    'project_ref', g.project_ref,
    'passes', pass,
    'disposable_tables', array_length(wipe, 1),
    'rows_deleted_total', total_deleted,
    'before_counts', before_counts,
    'deleted_counts', deleted,
    'after_counts_nonzero', after_counts,
    'pointers_cleared', cleared
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_reset_nonproduction_business_data_v1(text, text) TO service_role;
