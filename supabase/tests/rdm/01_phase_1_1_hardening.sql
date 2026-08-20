-- RDM-ENTITY-001 Phase 1.1 — metadata hardening assertions
BEGIN;
SELECT plan(18);

-- lifecycle vocabularies are domain-separated
SELECT is(
  (SELECT count(*)::int FROM public.lifecycle_stages WHERE domain = 'entity' AND is_active
     AND key IN ('withdrawn','restricted','suspended')),
  0, 'application/licence outcomes are not active entity stages');

SELECT ok((SELECT count(*) FROM public.lifecycle_stages WHERE domain = 'license' AND is_active) >= 5,
  'licence status vocabulary exists');
SELECT ok((SELECT count(*) FROM public.lifecycle_stages WHERE domain = 'application' AND is_active) >= 5,
  'application status vocabulary exists');
SELECT ok((SELECT is_active FROM public.lifecycle_stages WHERE key = 'supervised_non_licensed'),
  'supervised non-licensed entity stage exists');

-- identity authority is deployment-configured
SELECT is((SELECT default_authority FROM public.data_domains WHERE key = 'entity_identity'),
  'DEPLOYMENT_CONFIGURED', 'entity identity authority is deployment-configured');
SELECT is((SELECT default_authority FROM public.data_domains WHERE key = 'entity_regulatory_status'),
  'SUPTECH', 'regulatory status is always platform-owned');

-- identifier uniqueness scope
SELECT is((SELECT uniqueness_scope FROM public.entity_identifier_types WHERE key = 'company_registration_number'),
  'JURISDICTION', 'company registration number is jurisdiction-scoped');
SELECT ok(NOT (SELECT is_unique_global FROM public.entity_identifier_types WHERE key = 'company_registration_number'),
  'company registration number is not globally unique');
SELECT is((SELECT uniqueness_scope FROM public.entity_identifier_types WHERE key = 'legal_entity_identifier'),
  'GLOBAL', 'LEI is globally unique');
SELECT throws_ok(
  $$UPDATE public.entity_identifier_types SET uniqueness_scope = 'PLANETARY' WHERE key = 'legal_entity_identifier'$$,
  NULL, NULL, 'uniqueness_scope is constrained');

-- relationship inverse integrity
SELECT is(
  (SELECT count(*)::int FROM public.relationship_types WHERE inverse_key IS NOT NULL AND inverse_relationship_type_id IS NULL),
  0, 'every inverse key resolves to a relationship type');
SELECT throws_ok(
  $$INSERT INTO public.relationship_types (key,label,category,inverse_key) VALUES ('t_bad','Bad','group','does_not_exist')$$,
  NULL, NULL, 'unresolvable inverse keys are rejected');

-- key immutability & system protection
SELECT throws_ok(
  $$UPDATE public.lifecycle_stages SET key = 'renamed' WHERE key = 'authorised'$$,
  NULL, NULL, 'machine keys are immutable');
SELECT throws_ok(
  $$DELETE FROM public.lifecycle_stages WHERE key = 'authorised'$$,
  NULL, NULL, 'system metadata cannot be deleted');
SELECT throws_ok(
  $$UPDATE public.role_types SET is_system = false WHERE key = 'director'$$,
  NULL, NULL, 'is_system cannot be flipped');

-- single active default policy
SELECT is((SELECT count(*)::int FROM public.entity_resolution_policies WHERE is_default AND is_active),
  1, 'exactly one active default resolution policy');
SELECT is((SELECT count(*)::int FROM public.entity_registry_failure_policies WHERE is_default AND is_active),
  1, 'exactly one active default registry failure policy');

-- taxonomy deletes never cascade
SELECT is(
  (SELECT confdeltype::text FROM pg_constraint WHERE conname = 'classification_values_scheme_id_fkey'),
  'r', 'classification values restrict scheme deletion');

SELECT * FROM finish();
ROLLBACK;
