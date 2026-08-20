-- RDM-ENTITY-001 · Phase 2A — party / organization / regulated entity /
-- multi-licence foundation. Scenarios A–F plus backfill invariants.
BEGIN;
SELECT plan(22);

-- structure ---------------------------------------------------------------
SELECT has_table('public', 'parties', 'parties table exists');
SELECT has_table('public', 'organizations', 'organizations table exists');
SELECT has_table('public', 'persons', 'persons table exists');
SELECT has_table('public', 'entity_licenses', 'entity_licenses table exists');
SELECT has_table('public', 'entity_identifiers', 'entity_identifiers table exists');

-- Person identities are NOT fabricated in Phase 2A
SELECT is((SELECT count(*)::int FROM public.persons), 0,
  'no person identities fabricated (fp_individuals/profiles consolidation deferred)');

-- backfill invariants -----------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.licensees WHERE party_id IS NULL), 0,
  'every regulated entity binds to an organisation party');
SELECT is((SELECT count(*)::int FROM public.licensees WHERE identity_status_id IS NULL), 0,
  'every regulated entity carries a transitional identity status');
SELECT is(
  (SELECT count(*)::int FROM public.licensees e
    WHERE e.license_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.entity_licenses el
                      WHERE el.entity_id = e.id AND el.license_id = e.license_id)),
  0, 'no legacy licence link lost during entity_licenses backfill');
SELECT is(
  (SELECT count(*)::int FROM public.licenses l
    WHERE NOT EXISTS (SELECT 1 FROM public.entity_licenses el WHERE el.license_id = l.id)),
  0, 'every licence has an entity relationship after backfill');
SELECT is((SELECT count(*)::int FROM public.parties WHERE party_kind = 'ORGANIZATION'),
          (SELECT count(*)::int FROM public.licensees),
          'one organisation party per regulated entity');

-- duplicate legal names must NOT share a party (no silent merge)
SELECT is(
  (SELECT count(*)::int FROM (
     SELECT party_id FROM public.licensees WHERE party_id IS NOT NULL
     GROUP BY 1 HAVING count(*) > 1) d),
  0, 'duplicate entity names were never merged onto one party');

-- identity status truthfulness
SELECT ok(
  EXISTS (SELECT 1 FROM public.entity_identity_statuses WHERE key = 'legacy_known'),
  'transitional legacy_known identity status exists'
);
SELECT is(
  (SELECT count(*)::int FROM public.licensees e
    JOIN public.entity_identity_statuses s ON s.id = e.identity_status_id
   WHERE s.key IN ('verified','externally_verified')),
  0, 'no legacy entity claims external verification provenance'
);

-- entity lifecycle stages are entity-domain only
SELECT is(
  (SELECT count(*)::int FROM public.licensees e
    JOIN public.lifecycle_stages s ON s.id = e.lifecycle_stage_id
   WHERE s.domain <> 'entity'),
  0, 'entity lifecycle stages never reference licence/application domains'
);
SELECT throws_ok(
  $$UPDATE public.licensees
       SET lifecycle_stage_id = (SELECT id FROM public.lifecycle_stages WHERE domain = 'license' LIMIT 1)
     WHERE id = (SELECT id FROM public.licensees LIMIT 1)$$,
  '23514', NULL, 'a licence-domain lifecycle stage is rejected on an entity'
);

-- form versions were not fabricated
SELECT is(
  (SELECT count(*)::int FROM public.applications WHERE form_version_id IS NOT NULL),
  0, 'no historical application form version was fabricated'
);

-- SCENARIO A · existing entity keeps its UUID and gains a relationship
SELECT ok(
  EXISTS (
    SELECT 1 FROM public.licensees e
    JOIN public.entity_licenses el ON el.entity_id = e.id AND el.license_id = e.license_id
    WHERE e.license_id IS NOT NULL),
  'SCENARIO A: existing entity + existing licence linked via entity_licenses on the same entity UUID'
);

-- SCENARIO B/C/F use isolated fixtures inside the rolled-back transaction
DO $$
DECLARE v_party uuid; v_party2 uuid; v_entity uuid; v_lic1 uuid; v_lic2 uuid;
        v_reg uuid; v_type uuid; v_j1 uuid; v_j2 uuid; v_e2 uuid;
BEGIN
  SELECT id INTO v_reg FROM public.regulators LIMIT 1;

  -- SCENARIO F: non-regulated organisation party without a regulated entity
  INSERT INTO public.parties (party_kind, display_name) VALUES ('ORGANIZATION','ZZ Test Audit Firm')
    RETURNING id INTO v_party;
  INSERT INTO public.organizations (party_id, legal_name) VALUES (v_party, 'ZZ Test Audit Firm');

  -- SCENARIO B: regulated entity with zero licences
  INSERT INTO public.parties (party_kind, display_name) VALUES ('ORGANIZATION','ZZ Test Entity No Licence')
    RETURNING id INTO v_party2;
  INSERT INTO public.organizations (party_id, legal_name) VALUES (v_party2, 'ZZ Test Entity No Licence');
  INSERT INTO public.licensees (name, status, party_id)
    VALUES ('ZZ Test Entity No Licence', 'active', v_party2) RETURNING id INTO v_entity;

  -- SCENARIO C: same entity, two licences
  SELECT id INTO v_lic1 FROM public.licenses ORDER BY created_at LIMIT 1;
  SELECT id INTO v_lic2 FROM public.licenses ORDER BY created_at DESC LIMIT 1;
  INSERT INTO public.entity_licenses (entity_id, license_id, effective_from, is_primary, source)
    VALUES (v_entity, v_lic1, now() - interval '2 year', true, 'TEST'),
           (v_entity, v_lic2, now() - interval '1 year', false, 'TEST');

  -- SCENARIO D: jurisdiction-scoped identifier, same string, two jurisdictions
  SELECT id INTO v_type FROM public.entity_identifier_types WHERE uniqueness_scope = 'JURISDICTION' LIMIT 1;
  SELECT id INTO v_j1 FROM public.countries ORDER BY name LIMIT 1;
  SELECT id INTO v_j2 FROM public.countries ORDER BY name DESC LIMIT 1;
  INSERT INTO public.parties (party_kind, display_name) VALUES ('ORGANIZATION','ZZ Test Entity Two')
    RETURNING id INTO v_party;
  INSERT INTO public.organizations (party_id, legal_name) VALUES (v_party, 'ZZ Test Entity Two');
  INSERT INTO public.licensees (name, status, party_id)
    VALUES ('ZZ Test Entity Two', 'active', v_party) RETURNING id INTO v_e2;
  INSERT INTO public.entity_identifiers (entity_id, identifier_type_id, identifier_value, normalized_value,
                                         uniqueness_scope, jurisdiction_id, source_type)
    VALUES (v_entity, v_type, 'RC-12345', '', 'X', v_j1, 'MANUAL'),
           (v_e2,     v_type, 'RC-12345', '', 'X', v_j2, 'MANUAL');
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.entity_licenses el
    JOIN public.licensees e ON e.id = el.entity_id
   WHERE e.name = 'ZZ Test Entity No Licence'),
  2, 'SCENARIO C: one entity UUID holds two licences without a duplicate entity'
);
SELECT ok(
  EXISTS (SELECT 1 FROM public.organizations WHERE legal_name = 'ZZ Test Audit Firm'
            AND party_id NOT IN (SELECT party_id FROM public.licensees WHERE party_id IS NOT NULL)),
  'SCENARIO F: non-regulated organisation party exists without a regulated entity row'
);
SELECT is(
  (SELECT count(*)::int FROM public.entity_identifiers WHERE identifier_value = 'RC-12345'),
  2, 'SCENARIO D: identical registration numbers allowed in different jurisdictions'
);

-- SCENARIO E: same jurisdiction + same scoped identifier is prevented
SELECT throws_ok(
  $$INSERT INTO public.entity_identifiers (entity_id, identifier_type_id, identifier_value, normalized_value,
                                            uniqueness_scope, jurisdiction_id, source_type)
     SELECT (SELECT id FROM public.licensees WHERE name = 'ZZ Test Entity Two'),
            ei.identifier_type_id, 'RC 12345', '', 'X', ei.jurisdiction_id, 'MANUAL'
       FROM public.entity_identifiers ei
      WHERE ei.identifier_value = 'RC-12345'
      ORDER BY ei.created_at DESC LIMIT 1$$,
  '23505', NULL, 'SCENARIO E: duplicate scoped identifier in the same jurisdiction is prevented'
);

-- missing required scope value is rejected
SELECT throws_ok(
  $$INSERT INTO public.entity_identifiers (entity_id, identifier_type_id, identifier_value, normalized_value,
                                            uniqueness_scope, source_type)
     VALUES ((SELECT id FROM public.licensees LIMIT 1),
             (SELECT id FROM public.entity_identifier_types WHERE uniqueness_scope = 'JURISDICTION' LIMIT 1),
             'NO-JURISDICTION', '', 'X', 'MANUAL')$$,
  '23514', NULL, 'jurisdiction-scoped identifier without a jurisdiction is rejected'
);

-- external applicants must not read unrelated parties
SELECT ok(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('parties','organizations','entity_licenses','entity_identifiers')
      AND cmd = 'SELECT') = 4,
  'read-only RLS policies exist on all new Phase 2A tables'
);
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee IN ('authenticated','anon')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')
      AND table_name IN ('parties','organizations','persons','entity_licenses','entity_identifiers')),
  0, 'no direct write grants on Phase 2A tables for app users'
);

SELECT * FROM finish();
ROLLBACK;
