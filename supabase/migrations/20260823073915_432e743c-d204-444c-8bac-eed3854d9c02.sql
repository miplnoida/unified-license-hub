CREATE OR REPLACE FUNCTION public.cert_v2_pk_column(_table text)
RETURNS text LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT a.attname
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    JOIN unnest(c.conkey) k ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
   WHERE c.contype = 'p' AND ns.nspname = 'public' AND rel.relname = _table
     AND array_length(c.conkey,1) = 1
   LIMIT 1;
$$;

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
        EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = ANY($1)',
                       r.child_table, r.child_col, r.child_col) USING _ids;
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
      EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)',
                     r.child_table, r.child_col) USING _ids;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
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
    EXECUTE format('UPDATE public.%I SET %I = NULL WHERE %I = ANY($1)', _table, r.col, r.col)
      USING _ids;
  END LOOP;

  EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)', _table, v_pk) USING _ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_total + v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) TO service_role;
REVOKE ALL ON FUNCTION public.cert_v2_pk_column(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_pk_column(text) TO service_role;

-- organizations are keyed by party_id and always cascade from parties: drop the
-- redundant root registration for that population.
CREATE OR REPLACE FUNCTION public.cert_v2_register_legacy_baseline(_notes text DEFAULT NULL)
RETURNS TABLE(object_type text, registered integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run uuid; v_key text := 'LEGACY-BASELINE-PURGE';
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  INSERT INTO public.cert_fixture_runs (dataset_key, fixture_version, status, notes, started_by)
  VALUES (v_key, 'wave-1.5', 'in_progress',
          coalesce(_notes,'Wave 1.5 clean-baseline purge ledger'), auth.uid())
  RETURNING id INTO v_run;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'licensee', l.id, l.name, 'purge',
         jsonb_build_object('reason',
           CASE WHEN EXISTS (SELECT 1 FROM public.certification_seed_manifest m
                              WHERE m.dataset_key='CERTIFICATION_DATASET_V1' AND m.entity_id=l.id)
                THEN 'V1_CERTIFICATION_FIXTURE' ELSE 'ADHOC_TEST_ENTITY_NO_LEGITIMATE_DEPENDENCY' END)
    FROM public.licensees l;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'party', p.id, p.id::text, 'purge',
         jsonb_build_object('reason',
           CASE WHEN EXISTS (SELECT 1 FROM public.certification_seed_manifest m
                              WHERE m.dataset_key='CERTIFICATION_DATASET_V1'
                                AND (m.party_id=p.id OR m.organization_party_id=p.id))
                THEN 'V1_CERTIFICATION_FIXTURE' ELSE 'TEST_PARTY_ONLY_USED_BY_V1_FIXTURES' END)
    FROM public.parties p;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'pre_license_user', u.id, u.email, 'purge',
         jsonb_build_object('reason','TEST_REGISTRATION_DISPOSABLE_OR_VENDOR_EMAIL_DOMAIN',
                            'domain', split_part(u.email,'@',2))
    FROM public.pre_license_users u;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'application', a.id, a.application_number, 'purge',
         jsonb_build_object('reason', CASE WHEN a.entity_id IS NULL THEN 'ORPHAN_NO_CANONICAL_ENTITY'
                                           ELSE 'DEPENDENT_OF_PURGED_TEST_ENTITY' END)
    FROM public.applications a;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'license', l.id, l.id::text, 'purge',
         jsonb_build_object('reason', CASE WHEN l.holder_id IS NULL THEN 'ORPHAN_NO_HOLDER'
                                           ELSE 'DEPENDENT_OF_PURGED_TEST_ENTITY' END)
    FROM public.licenses l;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'return_filing', f.id, f.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OF_PURGED_TEST_ENTITY') FROM public.return_filings f;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'complaint', c.id, c.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OR_ORPHAN_TEST_COMPLAINT') FROM public.complaints c;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'correspondence_thread', t.id, t.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OR_ORPHAN_TEST_THREAD') FROM public.correspondence_threads t;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'fp_assessment', a.id, a.id::text, 'purge',
         jsonb_build_object('reason', CASE WHEN a.licensee_id IS NULL THEN 'ORPHAN_NO_ENTITY'
                                           ELSE 'DEPENDENT_OF_PURGED_TEST_ENTITY' END)
    FROM public.fp_assessments a;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'examination', e.id, e.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OR_ORPHAN_TEST_EXAMINATION') FROM public.examinations e;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'enforcement_action', e.id, e.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OR_ORPHAN_TEST_ENFORCEMENT') FROM public.enforcement_actions e;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'conduct_investigation', i.id, i.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OR_ORPHAN_TEST_INVESTIGATION') FROM public.conduct_investigations i;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'entity_resolution_case', c.id, c.id::text, 'purge',
         jsonb_build_object('reason','DEPENDENT_OF_PURGED_TEST_ENTITY') FROM public.entity_resolution_cases c;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'escalation', e.id, e.id::text, 'purge',
         jsonb_build_object('reason','RUNTIME_RESIDUE_OF_PURGED_TEST_CASE') FROM public.escalations e;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'workflow_instance', w.id, w.entity_type, 'purge',
         jsonb_build_object('reason','POLYMORPHIC_RUNTIME_RESIDUE_OF_PURGED_TARGET')
    FROM public.workflow_instances w
   WHERE (w.entity_type = 'complaint'     AND w.entity_id IN (SELECT id FROM public.complaints))
      OR (w.entity_type = 'registration'  AND w.entity_id IN (SELECT id FROM public.pre_license_users))
      OR (w.entity_type = 'application'   AND w.entity_id IN (SELECT id FROM public.applications))
      OR (w.entity_type = 'complaint'     AND w.entity_id NOT IN (SELECT id FROM public.complaints))
      OR (w.entity_type = 'registration'  AND w.entity_id NOT IN (SELECT id FROM public.pre_license_users));

  UPDATE public.cert_fixture_runs SET status='completed', completed_at=now() WHERE id = v_run;

  RETURN QUERY
    SELECT o.object_type, count(*)::integer
      FROM public.cert_fixture_objects o
     WHERE o.dataset_key = v_key AND o.run_id = v_run
     GROUP BY o.object_type ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_register_legacy_baseline(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_register_legacy_baseline(text) TO service_role;