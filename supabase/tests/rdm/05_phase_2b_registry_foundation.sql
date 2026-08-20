-- RDM-ENTITY-001 · Phase 2B — external entity registry SCHEMA foundation.
-- Proves the three architectural modes are representable without any HTTP
-- call, provider adapter or runtime change.
BEGIN;
SELECT plan(26);

-- structure ---------------------------------------------------------------
SELECT has_table('public', 'entity_registry_bindings',    'registry bindings table exists');
SELECT has_table('public', 'entity_external_references',  'external references table exists');
SELECT has_table('public', 'entity_data_authority_rules', 'data authority rules table exists');
SELECT has_table('public', 'entity_identity_snapshots',   'identity snapshots table exists');
SELECT has_table('public', 'entity_registry_sync_states', 'sync state table exists');
SELECT has_table('public', 'entity_sync_conflicts',       'sync conflicts table exists');

-- Integration Manager is reused, never duplicated -------------------------
SELECT hasnt_table('public', 'entity_registry_connections', 'no duplicate registry connection table');
SELECT hasnt_table('public', 'entity_registry_credentials', 'no duplicate registry credential table');
SELECT has_column('public', 'entity_registry_bindings', 'integration_connection_id',
  'bindings reference an existing Integration Manager connection');

-- no credential/secret/base-url column leaked into the new tables
SELECT is(
  (SELECT count(*)::int FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('entity_registry_bindings','entity_external_references',
                         'entity_data_authority_rules','entity_identity_snapshots',
                         'entity_registry_sync_states','entity_sync_conflicts')
      AND (column_name ILIKE '%secret%' OR column_name ILIKE '%credential%'
           OR column_name ILIKE '%api_key%' OR column_name ILIKE '%token%'
           OR column_name ILIKE '%password%' OR column_name ILIKE '%base_url%')),
  0, 'no provider credential or endpoint is duplicated outside Integration Manager');

-- MODE A — local only -----------------------------------------------------
SELECT is((SELECT count(*)::int FROM public.entity_registry_bindings), 0,
  'a local-only deployment needs no registry binding');
SELECT ok((SELECT count(*) FROM public.licensees) > 0,
  'regulated entities operate with zero registry configuration');

-- MODE B — external read-only authority -----------------------------------
CREATE TEMP TABLE _fx AS
SELECT (SELECT id FROM public.integration_connections LIMIT 1) AS conn,
       (SELECT id FROM public.regulators LIMIT 1) AS reg,
       (SELECT id FROM public.licensees LIMIT 1) AS ent,
       (SELECT id FROM public.licensees OFFSET 1 LIMIT 1) AS ent2,
       (SELECT id FROM public.entity_resolution_policies WHERE is_default AND is_active LIMIT 1) AS pol,
       (SELECT id FROM public.entity_registry_failure_policies WHERE is_default AND is_active LIMIT 1) AS fail,
       (SELECT id FROM public.data_domains WHERE key = 'entity_identity' LIMIT 1) AS dom_identity,
       (SELECT id FROM public.data_domains WHERE key = 'entity_regulatory_status' LIMIT 1) AS dom_other;

INSERT INTO public.entity_registry_bindings
  (id, regulator_id, integration_connection_id, authority_mode, resolution_policy_id, failure_policy_id, is_primary, is_active)
SELECT '11111111-1111-1111-1111-111111111111', reg, conn, 'EXTERNAL_AUTHORITATIVE', pol, fail, true, true FROM _fx;

SELECT is((SELECT count(*)::int FROM public.entity_registry_bindings WHERE is_active), 1,
  'an external-authoritative binding can be configured against an existing connection');

-- one current primary binding per scope
SELECT throws_ok($$
  INSERT INTO public.entity_registry_bindings
    (regulator_id, integration_connection_id, authority_mode, failure_policy_id, is_primary, is_active)
  SELECT reg, conn, 'EXTERNAL_AUTHORITATIVE', fail, true, true FROM _fx
$$, '23505', NULL, 'only one current primary binding per regulator scope');

-- external/hybrid authority requires a governed failure policy
SELECT throws_ok($$
  INSERT INTO public.entity_registry_bindings
    (integration_connection_id, authority_mode, is_primary, is_active)
  SELECT conn, 'HYBRID_AUTHORITY', false, true FROM _fx
$$, '23514', NULL, 'external/hybrid authority cannot exist without a failure policy');

-- local entity keeps its own UUID; the external id is only a mapping
INSERT INTO public.entity_external_references
  (entity_id, entity_registry_binding_id, external_entity_id, is_primary_reference, is_authoritative, verification_status)
SELECT ent, '11111111-1111-1111-1111-111111111111', 'EXT-1001', true, true, 'VERIFIED' FROM _fx;

SELECT is(
  (SELECT entity_id FROM public.entity_external_references WHERE external_entity_id = 'EXT-1001'),
  (SELECT ent FROM _fx), 'an external reference always retains the local entity UUID');
SELECT col_not_null('public', 'entity_external_references', 'entity_id',
  'external references cannot exist without a local entity');

-- duplicate external id inside the same binding is blocked
SELECT throws_ok($$
  INSERT INTO public.entity_external_references
    (entity_id, entity_registry_binding_id, external_entity_id)
  SELECT ent2, '11111111-1111-1111-1111-111111111111', 'EXT-1001' FROM _fx
$$, '23505', NULL, 'the same external id cannot map to two entities in one binding');

-- the same external identifier may legitimately exist in a different provider
INSERT INTO public.entity_registry_bindings
  (id, regulator_id, integration_connection_id, authority_mode, failure_policy_id, is_primary, is_active)
SELECT '22222222-2222-2222-2222-222222222222', NULL, conn, 'HYBRID_AUTHORITY', fail, true, true FROM _fx;
INSERT INTO public.entity_external_references
  (entity_id, entity_registry_binding_id, external_entity_id)
SELECT ent2, '22222222-2222-2222-2222-222222222222', 'EXT-1001' FROM _fx;
SELECT is((SELECT count(*)::int FROM public.entity_external_references WHERE external_entity_id = 'EXT-1001'), 2,
  'the same external identifier may exist under a different provider/binding');

SELECT is((SELECT count(*)::int FROM public.entity_registry_bindings
            WHERE is_primary AND is_active AND effective_to IS NULL), 2,
  'deployment-wide and regulator-scoped primaries are independent scopes');

-- MODE C — hybrid authority ----------------------------------------------
INSERT INTO public.entity_data_authority_rules
  (data_domain_id, authority_source, entity_registry_binding_id, allow_local_override, requires_reconciliation)
SELECT dom_identity, 'EXTERNAL_REGISTRY', '22222222-2222-2222-2222-222222222222', false, true FROM _fx;
INSERT INTO public.entity_data_authority_rules
  (data_domain_id, authority_source, allow_local_override, requires_reconciliation)
SELECT dom_other, 'SUPTECH', true, false FROM _fx;

SELECT is((SELECT count(*)::int FROM public.entity_data_authority_rules WHERE is_active), 2,
  'external registry owns identity while this platform owns regulatory status');

SELECT throws_ok($$
  INSERT INTO public.entity_data_authority_rules (data_domain_id, authority_source)
  SELECT dom_other, 'EXTERNAL_REGISTRY' FROM _fx
$$, '23514', NULL, 'an external-registry authority rule must name its binding');

SELECT throws_ok($$
  INSERT INTO public.entity_data_authority_rules
    (data_domain_id, authority_source, entity_registry_binding_id)
  SELECT dom_identity, 'SUPTECH', '22222222-2222-2222-2222-222222222222' FROM _fx
$$, '23514', NULL, 'a platform-authoritative domain cannot point at an external binding');

SELECT throws_ok($$
  INSERT INTO public.entity_data_authority_rules (data_domain_id, authority_source)
  SELECT dom_identity, 'EXTERNAL_REGISTRY' FROM _fx
$$, '23514', NULL, 'authority rules cannot contradict the required binding scope');

-- snapshots are append-only ----------------------------------------------
INSERT INTO public.entity_identity_snapshots
  (id, entity_id, entity_registry_binding_id, external_entity_id, snapshot_data, capture_reason)
SELECT '33333333-3333-3333-3333-333333333333', ent, '11111111-1111-1111-1111-111111111111',
       'EXT-1001', '{"legal_name":"Example Ltd"}'::jsonb, 'IDENTITY_VERIFIED' FROM _fx;

SELECT is((SELECT count(*)::int FROM public.entity_identity_snapshots), 1, 'identity snapshots can be appended');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_eis_append_only'),
  'identity snapshots are protected by an append-only guard');

-- conflicts are recorded, never auto-resolved ----------------------------
INSERT INTO public.entity_sync_conflicts
  (entity_id, data_domain_id, entity_registry_binding_id, local_value, external_value)
SELECT ent, dom_identity, '11111111-1111-1111-1111-111111111111',
       '{"legal_name":"Example Ltd"}'::jsonb, '{"legal_name":"Example Limited"}'::jsonb FROM _fx;

SELECT is((SELECT status FROM public.entity_sync_conflicts LIMIT 1), 'OPEN',
  'a detected discrepancy stays open — no last-write-wins');
SELECT throws_ok($$
  UPDATE public.entity_sync_conflicts SET status = 'RESOLVED_EXTERNAL'
$$, '23514', NULL, 'resolving a conflict requires a recorded reason and timestamp');

-- external portal users cannot read registry configuration ---------------
SELECT is(
  (SELECT count(*)::int FROM information_schema.role_table_grants
    WHERE grantee IN ('anon', 'authenticated') AND table_schema = 'public'
      AND table_name IN ('entity_registry_bindings','entity_data_authority_rules',
                         'entity_registry_sync_states','entity_sync_conflicts',
                         'entity_identity_snapshots','entity_external_references')
      AND privilege_type IN ('INSERT','UPDATE','DELETE')),
  0, 'app users can never write registry configuration or identity provenance');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('entity_registry_bindings','entity_data_authority_rules',
                        'entity_registry_sync_states','entity_sync_conflicts')
      AND qual NOT LIKE '%is_internal_staff%'),
  0, 'registry configuration is restricted to internal staff');

SELECT * FROM finish();
ROLLBACK;
