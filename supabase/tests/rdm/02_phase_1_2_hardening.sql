-- RDM-ENTITY-001 · Phase 1.2 — metadata governance hardening.
-- Proves: RPC-only writes, exactly one active default policy, identifier
-- scope consistency, and that existing metadata/business tables survive.
BEGIN;
SELECT plan(16);

-- 1..3 · direct authenticated writes are not a supported path
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.classification_values', 'INSERT'),
  'authenticated cannot INSERT directly into metadata tables'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.classification_values', 'UPDATE'),
  'authenticated cannot UPDATE directly into metadata tables'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.classification_values', 'DELETE'),
  'authenticated cannot DELETE directly from metadata tables'
);

-- 4 · reads are preserved for the RDM UI
SELECT ok(
  has_table_privilege('authenticated', 'public.entity_identifier_types', 'SELECT'),
  'authenticated retains SELECT on metadata tables'
);

-- 5 · no metadata table leaks write privilege to authenticated/anon
SELECT is(
  (SELECT count(*)::int
     FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('authenticated', 'anon')
      AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
      AND table_name IN ('classification_schemes','classification_values','lifecycle_stages',
                         'entity_identity_statuses','relationship_types','role_types',
                         'form_purposes','form_trigger_types','data_domains',
                         'entity_identifier_types','entity_resolution_policies',
                         'entity_registry_failure_policies')),
  0, 'zero direct write grants across the 12 metadata tables'
);

-- 6..8 · governed write boundary exists
SELECT has_function('public', 'rdm_save_metadata', ARRAY['text','jsonb','uuid']);
SELECT has_function('public', 'rdm_retire_metadata', ARRAY['text','uuid','uuid']);
SELECT has_function('public', 'rdm_delete_metadata', ARRAY['text','uuid','uuid']);

-- 9..10 · exactly one active default, never zero
SELECT is(
  (SELECT count(*)::int FROM public.entity_resolution_policies WHERE is_default AND is_active),
  1, 'exactly one active default entity resolution policy'
);
SELECT is(
  (SELECT count(*)::int FROM public.entity_registry_failure_policies WHERE is_default AND is_active),
  1, 'exactly one active default registry failure policy'
);

-- 11 · a second active default is rejected
SELECT throws_ok(
  $$UPDATE public.entity_resolution_policies SET is_default = true, is_active = true
     WHERE id = (SELECT id FROM public.entity_resolution_policies
                  WHERE NOT is_default AND is_active ORDER BY sort_order LIMIT 1)$$,
  NULL, NULL, 'two active default resolution policies are rejected'
);

-- 12 · the last active default cannot simply disappear
SELECT throws_ok(
  $$UPDATE public.entity_resolution_policies SET is_active = false WHERE is_default AND is_active$$,
  NULL, NULL, 'retiring the active default without promotion is rejected'
);

-- 13..15 · identifier scope consistency is derived, not hand-maintained
SELECT is(
  (SELECT count(*)::int FROM public.entity_identifier_types
    WHERE (uniqueness_scope = 'JURISDICTION') <> scope_requires_jurisdiction),
  0, 'scope_requires_jurisdiction always matches uniqueness_scope'
);
SELECT is(
  (SELECT count(*)::int FROM public.entity_identifier_types
    WHERE (uniqueness_scope = 'ISSUER') <> scope_requires_issuer),
  0, 'scope_requires_issuer always matches uniqueness_scope'
);
SELECT is(
  (SELECT count(*)::int FROM public.entity_identifier_types
    WHERE (uniqueness_scope = 'GLOBAL') <> is_unique_global),
  0, 'legacy is_unique_global is derived from GLOBAL scope only'
);

-- 16 · existing metadata preserved
SELECT ok(
  (SELECT count(*) FROM public.lifecycle_stages WHERE domain = 'entity') > 0
  AND (SELECT count(*) FROM public.classification_values) > 0,
  'seeded metadata rows are preserved'
);

SELECT * FROM finish();
ROLLBACK;
