-- Verification: canonical entity/licence linkage lifecycle
-- Regression target: "insert or update on table \"entity_licenses\" violates foreign key
-- constraint \"entity_licenses_entity_id_fkey\"" raised during final workflow approval.
--
-- Root cause covered: the BEFORE INSERT guard trg_licensees_legacy_license_id used to insert
-- a child public.entity_licenses row referencing NEW.id while the parent public.licensees row
-- did not yet exist. The guard is now validation-only and public.entity_link_license() is the
-- single authoritative runtime writer.
--
-- Rollback-scoped: the transaction always ends with ROLLBACK.
-- Run: psql -f scripts/verify-entity-license-provisioning.sql

\set ON_ERROR_STOP on

BEGIN;

DO $verify$
DECLARE
  v_user            uuid;
  v_regulator       uuid;
  v_party           uuid;
  v_entity          uuid;
  v_license_a       uuid;
  v_license_b       uuid;
  v_app             uuid;
  v_link            uuid;
  v_link2           uuid;
  v_res             jsonb;
  v_cnt             int;
  v_fk_ok           boolean := true;
  v_dangling        int;
  v_dupes           int;
  v_before_licensee timestamptz;
  v_link_created    timestamptz;
  v_pass            int := 0;
  v_fail            int := 0;

  PROCEDURE_NOTE text;

  -- local helper via nested block is not available; use inline asserts
BEGIN
  SELECT id INTO v_user FROM auth.users ORDER BY created_at LIMIT 1;
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'FIXTURE_UNAVAILABLE: no auth user present';
  END IF;
  SELECT id INTO v_regulator FROM public.regulators ORDER BY created_at LIMIT 1;

  PERFORM set_config('app.workflow_mutation_context', 'trusted', true);

  --------------------------------------------------------------------------
  -- GATE 1: direct reproduction — trusted licensees INSERT carrying the
  -- deprecated license_id must not raise an FK violation.
  --------------------------------------------------------------------------
  INSERT INTO public.licenses (holder_id, license_type, regulator_id, valid_from, valid_until)
  VALUES (v_user, 'VERIFY-ELP-A', v_regulator, now(), now() + interval '365 days')
  RETURNING id INTO v_license_a;

  INSERT INTO public.parties (party_kind, display_name)
  VALUES ('ORGANIZATION', 'VERIFY ELP Entity One')
  RETURNING id INTO v_party;

  INSERT INTO public.organizations (party_id, legal_name, display_name, legal_name_authority)
  VALUES (v_party, 'VERIFY ELP Entity One', 'VERIFY ELP Entity One', 'LOCAL_VERIFIED')
  ON CONFLICT (party_id) DO UPDATE
    SET legal_name = EXCLUDED.legal_name;

  BEGIN
    INSERT INTO public.licensees (license_id, name, applicant_id, party_id)
    VALUES (v_license_a, 'VERIFY ELP Entity One', v_user, v_party)
    RETURNING id, created_at INTO v_entity, v_before_licensee;
  EXCEPTION WHEN foreign_key_violation THEN
    v_fk_ok := false;
    RAISE EXCEPTION 'GATE 1 FAIL: FK violation still raised on licensees INSERT (%).', SQLERRM;
  END;
  RAISE NOTICE 'GATE 1 PASS: trusted licensees INSERT with legacy license_id committed, no FK violation';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 2: the BEFORE guard no longer mirrors into entity_licenses, so no
  -- child row exists until the canonical writer runs.
  --------------------------------------------------------------------------
  SELECT count(*) INTO v_cnt FROM public.entity_licenses WHERE entity_id = v_entity;
  IF v_cnt <> 0 THEN
    RAISE EXCEPTION 'GATE 2 FAIL: legacy trigger mirrored % entity_licenses row(s); expected 0', v_cnt;
  END IF;
  RAISE NOTICE 'GATE 2 PASS: legacy BEFORE guard performed no child mirroring';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 3: parent ordering — canonical linkage after the parent exists.
  --------------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = v_entity) THEN
    RAISE EXCEPTION 'GATE 3 FAIL: parent licensees row missing';
  END IF;
  v_link := public.entity_link_license(v_entity, v_license_a, NULL);
  SELECT created_at INTO v_link_created FROM public.entity_licenses WHERE id = v_link;
  IF v_link IS NULL OR v_link_created < v_before_licensee THEN
    RAISE EXCEPTION 'GATE 3 FAIL: link not created after parent (% vs %)', v_link_created, v_before_licensee;
  END IF;
  RAISE NOTICE 'GATE 3 PASS: parent licensees row precedes canonical entity_licenses child';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 4: exactly one link, pointing at a genuine licensees.id.
  --------------------------------------------------------------------------
  SELECT count(*) INTO v_cnt FROM public.entity_licenses
   WHERE entity_id = v_entity AND license_id = v_license_a;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'GATE 4 FAIL: expected exactly 1 link, found %', v_cnt;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.entity_licenses el
      JOIN public.licensees l ON l.id = el.entity_id
     WHERE el.id = v_link) THEN
    RAISE EXCEPTION 'GATE 4 FAIL: entity_licenses.entity_id does not resolve to a licensees row';
  END IF;
  RAISE NOTICE 'GATE 4 PASS: single link whose entity_id is a genuine licensees.id';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 5: idempotent linkage — re-running creates no duplicate.
  --------------------------------------------------------------------------
  IF public.entity_link_license(v_entity, v_license_a, NULL) IS DISTINCT FROM v_link THEN
    RAISE EXCEPTION 'GATE 5 FAIL: re-link produced a different row';
  END IF;
  SELECT count(*) INTO v_cnt FROM public.entity_licenses
   WHERE entity_id = v_entity AND license_id = v_license_a;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'GATE 5 FAIL: duplicate link after re-run (%).', v_cnt;
  END IF;
  RAISE NOTICE 'GATE 5 PASS: canonical linkage is idempotent';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 6: multiple licences on ONE canonical entity.
  --------------------------------------------------------------------------
  INSERT INTO public.licenses (holder_id, license_type, regulator_id, valid_from, valid_until)
  VALUES (v_user, 'VERIFY-ELP-B', v_regulator, now(), now() + interval '365 days')
  RETURNING id INTO v_license_b;

  v_link2 := public.entity_link_license(v_entity, v_license_b, NULL);
  SELECT count(*) INTO v_cnt FROM public.entity_licenses WHERE entity_id = v_entity;
  IF v_cnt <> 2 OR v_link2 = v_link THEN
    RAISE EXCEPTION 'GATE 6 FAIL: expected 2 links on one entity, found %', v_cnt;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.licensees
   WHERE upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
       = upper(regexp_replace('VERIFY ELP Entity One', '[^A-Za-z0-9]', '', 'g'));
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'GATE 6 FAIL: entity duplicated (% rows)', v_cnt;
  END IF;
  RAISE NOTICE 'GATE 6 PASS: one canonical entity, two licence links';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 7: NEW-ENTITY governed provisioning path (approved + paid application
  -- whose applicant has no entity row bound).
  --------------------------------------------------------------------------
  INSERT INTO public.applications (applicant_id, license_type, status, regulator_id,
                                   request_kind, data)
  VALUES (v_user, 'VERIFY-ELP-NEW', 'approved', v_regulator, 'new_license',
          jsonb_build_object('entity_name', 'VERIFY ELP Fresh Entity'))
  RETURNING id INTO v_app;

  INSERT INTO public.payments (user_id, application_id, amount, status, currency)
  VALUES (v_user, v_app, 100, 'success', 'XCD');

  v_res := public.provision_application_entity(v_app);
  IF COALESCE((v_res->>'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'GATE 7 FAIL: provisioning returned %', v_res;
  END IF;

  SELECT count(*) INTO v_cnt
    FROM public.entity_licenses el
   WHERE el.entity_id = (v_res->>'licensee_id')::uuid
     AND el.license_id = (v_res->>'license_id')::uuid;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'GATE 7 FAIL: expected 1 link for new entity, found %', v_cnt;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.licensees WHERE id = (v_res->>'licensee_id')::uuid) THEN
    RAISE EXCEPTION 'GATE 7 FAIL: canonical entity row missing';
  END IF;
  RAISE NOTICE 'GATE 7 PASS: new-entity provisioning created entity then link (entity %, licence %)',
    v_res->>'licensee_id', v_res->>'license_number';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 8: idempotent provisioning — re-run yields the same licence/entity.
  --------------------------------------------------------------------------
  DECLARE
    v_res2 jsonb;
    v_lic_cnt int;
    v_ent_cnt int;
  BEGIN
    v_res2 := public.provision_application_entity(v_app);
    IF (v_res2->>'license_id') IS DISTINCT FROM (v_res->>'license_id')
       OR (v_res2->>'licensee_id') IS DISTINCT FROM (v_res->>'licensee_id') THEN
      RAISE EXCEPTION 'GATE 8 FAIL: re-provisioning produced different identities: % vs %', v_res2, v_res;
    END IF;
    SELECT count(*) INTO v_lic_cnt FROM public.licenses WHERE application_id = v_app;
    SELECT count(*) INTO v_ent_cnt FROM public.entity_licenses
      WHERE license_id = (v_res->>'license_id')::uuid;
    IF v_lic_cnt <> 1 OR v_ent_cnt <> 1 THEN
      RAISE EXCEPTION 'GATE 8 FAIL: duplicates after re-run (licences %, links %)', v_lic_cnt, v_ent_cnt;
    END IF;
  END;
  RAISE NOTICE 'GATE 8 PASS: provisioning idempotent (no duplicate licence / entity / link)';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 9: EXISTING-ENTITY provisioning reuses the canonical entity.
  --------------------------------------------------------------------------
  DECLARE
    v_app2 uuid;
    v_res3 jsonb;
    v_dup  int;
  BEGIN
    INSERT INTO public.applications (applicant_id, license_type, status, regulator_id,
                                     request_kind, data)
    VALUES (v_user, 'VERIFY-ELP-EXISTING', 'approved', v_regulator, 'new_license',
            jsonb_build_object('entity_name', 'VERIFY ELP Fresh Entity'))
    RETURNING id INTO v_app2;

    INSERT INTO public.payments (user_id, application_id, amount, status, currency)
    VALUES (v_user, v_app2, 100, 'success', 'XCD');

    v_res3 := public.provision_application_entity(v_app2);
    IF (v_res3->>'licensee_id') IS DISTINCT FROM (v_res->>'licensee_id') THEN
      RAISE EXCEPTION 'GATE 9 FAIL: existing entity not reused (% vs %)',
        v_res3->>'licensee_id', v_res->>'licensee_id';
    END IF;
    SELECT count(*) INTO v_dup FROM public.licensees
     WHERE upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
         = upper(regexp_replace('VERIFY ELP Fresh Entity', '[^A-Za-z0-9]', '', 'g'));
    IF v_dup <> 1 THEN
      RAISE EXCEPTION 'GATE 9 FAIL: duplicate licensees row created (%)', v_dup;
    END IF;
    SELECT count(*) INTO v_cnt FROM public.entity_licenses
     WHERE entity_id = (v_res->>'licensee_id')::uuid;
    IF v_cnt <> 2 THEN
      RAISE EXCEPTION 'GATE 9 FAIL: expected 2 links on reused entity, found %', v_cnt;
    END IF;
  END;
  RAISE NOTICE 'GATE 9 PASS: existing entity reused, second licence linked, no duplicate entity';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 10: integrity sweep — no dangling or duplicate links anywhere.
  --------------------------------------------------------------------------
  SELECT count(*) INTO v_dangling
    FROM public.entity_licenses el
   WHERE NOT EXISTS (SELECT 1 FROM public.licensees l WHERE l.id = el.entity_id);
  SELECT COALESCE(sum(c - 1), 0) INTO v_dupes FROM (
    SELECT count(*) AS c FROM public.entity_licenses
     GROUP BY entity_id, license_id HAVING count(*) > 1) d;
  IF v_dangling <> 0 OR v_dupes <> 0 THEN
    RAISE EXCEPTION 'GATE 10 FAIL: dangling % duplicate %', v_dangling, v_dupes;
  END IF;
  RAISE NOTICE 'GATE 10 PASS: 0 dangling entity_licenses.entity_id, 0 duplicate (entity, licence) links';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 11: guard still protects the deprecated legacy column.
  --------------------------------------------------------------------------
  PERFORM set_config('app.workflow_mutation_context', '', true);
  BEGIN
    UPDATE public.licensees SET license_id = v_license_b WHERE id = v_entity;
    RAISE EXCEPTION 'GATE 11 FAIL: untrusted write to licensees.license_id was allowed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'GATE 11 PASS: untrusted write to deprecated licensees.license_id still blocked';
  END;
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 12: FK constraint intact (not dropped, not weakened, not deferred).
  --------------------------------------------------------------------------
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'entity_licenses_entity_id_fkey'
       AND conrelid = 'public.entity_licenses'::regclass
       AND contype = 'f'
       AND NOT condeferrable
       AND confrelid = 'public.licensees'::regclass) THEN
    RAISE EXCEPTION 'GATE 12 FAIL: entity_licenses_entity_id_fkey missing, deferred or re-targeted';
  END IF;
  RAISE NOTICE 'GATE 12 PASS: entity_licenses_entity_id_fkey present, NOT DEFERRABLE, targets licensees(id)';
  v_pass := v_pass + 1;

  --------------------------------------------------------------------------
  -- GATE 13: legacy guard is validation-only (no child writes in its body).
  --------------------------------------------------------------------------
  IF pg_get_functiondef('public.enforce_licensee_license_id_legacy()'::regprocedure)
       ILIKE '%entity_licenses%' THEN
    RAISE EXCEPTION 'GATE 13 FAIL: legacy guard still references entity_licenses';
  END IF;
  RAISE NOTICE 'GATE 13 PASS: enforce_licensee_license_id_legacy() performs no entity_licenses writes';
  v_pass := v_pass + 1;

  RAISE NOTICE '--------------------------------------------------';
  RAISE NOTICE 'VERIFY ENTITY/LICENCE PROVISIONING: % gate(s) passed', v_pass;
END
$verify$;

ROLLBACK;
