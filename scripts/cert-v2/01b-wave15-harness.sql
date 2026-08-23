-- Certification V2 — Wave 1.5 governed clean-baseline harness (applied as a migration).
-- Adds: FK-aware cascade deleter, legacy purge ledger registration, web-user
-- integrity repair, and the POST-CLEAN integrity gate.
-- All functions are SECURITY DEFINER and fail closed via cert_v2_assert_allowed().

-- ---------------------------------------------------------------- protected set
CREATE OR REPLACE FUNCTION public.cert_v2_protected_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT ARRAY[
    'audit_logs','compliance_audit_logs','notification_dispatch_log',
    'certification_seed_manifest','cert_fixture_objects','cert_fixture_runs',
    'cert_fixture_object_types','cert_nonproduction_guard',
    'audit_export_jobs','audit_export_downloads',
    'conduct_evidence_access_log','conduct_triage_audit_events'
  ]::text[];
$$;

-- ------------------------------------------------------------- cascade deleter
CREATE OR REPLACE FUNCTION public.cert_v2_cascade_delete(
  _table text, _ids uuid[], _depth integer DEFAULT 0)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r record; v_child_ids uuid[]; v_total integer := 0; v_n integer;
  v_has_id boolean; v_nullable boolean;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  IF _ids IS NULL OR array_length(_ids,1) IS NULL THEN RETURN 0; END IF;
  IF _depth > 12 THEN
    RAISE EXCEPTION 'cert_v2_cascade_delete: depth limit exceeded at %', _table
      USING ERRCODE = '54001';
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

    IF r.del IN ('n','d') THEN CONTINUE; END IF;  -- database nullifies these

    SELECT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name=r.child_table
                      AND column_name='id') INTO v_has_id;

    IF v_has_id THEN
      EXECUTE format('SELECT array_agg(id) FROM public.%I WHERE %I = ANY($1)',
                     r.child_table, r.child_col) INTO v_child_ids USING _ids;
      IF v_child_ids IS NOT NULL AND array_length(v_child_ids,1) > 0 THEN
        v_total := v_total + public.cert_v2_cascade_delete(r.child_table, v_child_ids, _depth + 1);
      END IF;
    ELSE
      EXECUTE format('DELETE FROM public.%I WHERE %I = ANY($1)',
                     r.child_table, r.child_col) USING _ids;
      GET DIAGNOSTICS v_n = ROW_COUNT; v_total := v_total + v_n;
    END IF;
  END LOOP;

  -- self references: clear child rows first, iteratively
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

  EXECUTE format('DELETE FROM public.%I WHERE id = ANY($1)', _table) USING _ids;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_total + v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_cascade_delete(text, uuid[], integer) TO authenticated, service_role;

-- ------------------------------------------------------- reset uses the deleter
CREATE OR REPLACE FUNCTION public.cert_v2_reset(_dataset_key text DEFAULT 'CERT-SUPTECH-V2'::text)
RETURNS TABLE(object_type text, table_name text, deleted_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; v_ids uuid[]; v_deleted integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();
  FOR r IN
    SELECT t.object_type, t.table_name, t.delete_order
      FROM public.cert_fixture_object_types t
     WHERE EXISTS (SELECT 1 FROM public.cert_fixture_objects o
                    WHERE o.object_type = t.object_type
                      AND o.dataset_key = _dataset_key
                      AND o.cleanup_policy = 'purge')
     ORDER BY t.delete_order DESC
  LOOP
    SELECT array_agg(o.object_id) INTO v_ids
      FROM public.cert_fixture_objects o
     WHERE o.object_type = r.object_type
       AND o.dataset_key = _dataset_key
       AND o.cleanup_policy = 'purge';
    v_deleted := public.cert_v2_cascade_delete(r.table_name, v_ids, 0);
    RETURN QUERY SELECT r.object_type, r.table_name, v_deleted;
  END LOOP;
  DELETE FROM public.cert_fixture_objects o
   WHERE o.dataset_key = _dataset_key AND o.cleanup_policy = 'purge';
END;
$$;

-- --------------------------------------------- extra object types for residue
INSERT INTO public.cert_fixture_object_types (object_type, table_name, delete_order, description)
VALUES
  ('workflow_instance','workflow_instances',110,'Workflow runtime instances'),
  ('escalation','escalations',108,'Escalation records'),
  ('correspondence_message','correspondence_messages',106,'Correspondence messages')
ON CONFLICT (object_type) DO NOTHING;

-- ------------------------------------- register the legacy/V1 purge population
CREATE OR REPLACE FUNCTION public.cert_v2_register_legacy_baseline(_notes text DEFAULT NULL)
RETURNS TABLE(object_type text, registered integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_run uuid; v_key text := 'LEGACY-BASELINE-PURGE'; v_n integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  INSERT INTO public.cert_fixture_runs (dataset_key, fixture_version, status, notes, started_by)
  VALUES (v_key, 'wave-1.5', 'running',
          coalesce(_notes,'Wave 1.5 clean-baseline purge ledger'), auth.uid())
  RETURNING id INTO v_run;

  -- helper: register a set of ids for one object type with a reason
  -- parties / organizations / licensees / pre-licensees are roots
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
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'organization', o.id, o.id::text, 'purge',
         jsonb_build_object('reason','ORGANIZATION_SPINE_OF_PURGED_TEST_ENTITY')
    FROM public.organizations o;

  INSERT INTO public.cert_fixture_objects
    (run_id, dataset_key, scenario_code, object_type, object_id, object_reference, cleanup_policy, metadata)
  SELECT v_run, v_key, 'LEGACY-CLEAN', 'pre_license_user', u.id, u.email, 'purge',
         jsonb_build_object('reason','TEST_REGISTRATION_DISPOSABLE_OR_VENDOR_EMAIL_DOMAIN',
                            'domain', split_part(u.email,'@',2))
    FROM public.pre_license_users u;

  -- dependent business populations (also covers orphans with NULL entity links)
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

  -- polymorphic workflow runtime rows whose target is being purged or is missing
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
GRANT EXECUTE ON FUNCTION public.cert_v2_register_legacy_baseline(text) TO authenticated, service_role;

-- --------------------------------------------------- web-user integrity repair
CREATE OR REPLACE FUNCTION public.cert_v2_repair_web_user_links()
RETURNS TABLE(repair text, rows_affected integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_n integer;
BEGIN
  PERFORM public.cert_v2_assert_allowed();

  UPDATE public.profiles p SET licensee_id = NULL, updated_at = now()
   WHERE p.licensee_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = p.licensee_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'profiles.licensee_id cleared (entity missing)', v_n;

  UPDATE public.profiles p SET entity_name = NULL, updated_at = now()
   WHERE p.user_type IN ('primary','secondary')
     AND coalesce(btrim(p.entity_name),'') <> ''
     AND NOT EXISTS (SELECT 1 FROM public.licensees l
                      WHERE lower(btrim(l.name)) = lower(btrim(p.entity_name)));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'profiles.entity_name cleared (unresolvable entity label)', v_n;

  UPDATE public.entity_user_access a SET is_active = false, updated_at = now()
   WHERE a.is_active
     AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = a.entity_id);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'entity_user_access deactivated (entity missing)', v_n;

  UPDATE public.entity_user_memberships m SET status = 'revoked', updated_at = now()
   WHERE m.status = 'active'
     AND (m.revoked_at IS NOT NULL
          OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = m.entity_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'entity_user_memberships revoked (revoked or entity missing)', v_n;

  UPDATE public.ppoc_entity_mappings pm SET is_active = false, updated_at = now()
   WHERE pm.is_active
     AND (NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = pm.licensee_id)
          OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = pm.ppoc_user_id));
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN QUERY SELECT 'ppoc_entity_mappings deactivated (invalid entity or user)', v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_repair_web_user_links() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_repair_web_user_links() TO authenticated, service_role;

-- ----------------------------------------------------- POST-CLEAN integrity gate
CREATE OR REPLACE FUNCTION public.cert_v2_integrity_gate()
RETURNS TABLE(check_name text, actual_count integer, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN QUERY
  WITH c AS (
    SELECT 'orphan_active_user_entity_relationship' AS k,
           (SELECT count(*) FROM public.entity_user_access a
             WHERE a.is_active AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=a.entity_id)) AS n
    UNION ALL SELECT 'stale_active_web_user_entity_link',
           (SELECT count(*) FROM public.profiles p
             WHERE (p.licensee_id IS NOT NULL
                    AND NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=p.licensee_id))
                OR (p.user_type IN ('primary','secondary')
                    AND coalesce(btrim(p.entity_name),'') <> ''
                    AND NOT EXISTS (SELECT 1 FROM public.licensees l
                                     WHERE lower(btrim(l.name))=lower(btrim(p.entity_name)))))
    UNION ALL SELECT 'invalid_active_membership',
           (SELECT count(*) FROM public.entity_user_memberships m
             WHERE m.status='active'
               AND (m.revoked_at IS NOT NULL
                    OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=m.entity_id)))
    UNION ALL SELECT 'invalid_active_ppoc_relationship',
           (SELECT count(*) FROM public.ppoc_entity_mappings pm
             WHERE pm.is_active
               AND (NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=pm.licensee_id)
                    OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=pm.ppoc_user_id)))
    UNION ALL SELECT 'duplicate_primary_web_user_per_entity',
           (SELECT count(*) FROM (
              SELECT a.entity_id FROM public.entity_user_access a
               WHERE a.is_active AND a.access_type='primary_user'
               GROUP BY a.entity_id HAVING count(*) > 1) d)
    UNION ALL SELECT 'active_application_missing_entity',
           (SELECT count(*) FROM public.applications a
             WHERE a.entity_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=a.entity_id))
    UNION ALL SELECT 'active_license_missing_entity',
           (SELECT count(*) FROM public.licenses li
             WHERE li.holder_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=li.holder_id))
    UNION ALL SELECT 'canonical_filing_missing_entity',
           (SELECT count(*) FROM public.return_filings f
             WHERE f.entity_id IS NULL
                OR NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id=f.entity_id))
    UNION ALL SELECT 'active_workflow_missing_definition',
           (SELECT count(*) FROM public.workflow_instances w
             WHERE w.status = 'active'
               AND (NOT EXISTS (SELECT 1 FROM public.approval_workflows aw WHERE aw.id=w.workflow_id)
                    OR (w.workflow_version_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM public.approval_workflow_versions v
                                         WHERE v.id=w.workflow_version_id))))
    UNION ALL SELECT 'active_workflow_missing_target',
           (SELECT count(*) FROM public.workflow_instances w
             WHERE w.status='active'
               AND ((w.entity_type='complaint' AND NOT EXISTS (SELECT 1 FROM public.complaints x WHERE x.id=w.entity_id))
                 OR (w.entity_type='registration' AND NOT EXISTS (SELECT 1 FROM public.pre_license_users x WHERE x.id=w.entity_id))
                 OR (w.entity_type='application' AND NOT EXISTS (SELECT 1 FROM public.applications x WHERE x.id=w.entity_id))))
    UNION ALL SELECT 'duplicate_business_identity',
           (SELECT coalesce(sum(cnt),0) FROM (
              SELECT count(*)-1 AS cnt FROM public.licensees GROUP BY lower(btrim(name)) HAVING count(*)>1) d)
  )
  SELECT c.k, c.n::integer, CASE WHEN c.n = 0 THEN 'PASS' ELSE 'FAIL' END FROM c ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.cert_v2_integrity_gate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cert_v2_integrity_gate() TO authenticated, service_role;
