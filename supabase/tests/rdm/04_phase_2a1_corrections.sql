-- RDM-ENTITY-001 · Phase 2A.1 — corrective invariants.
--   A. licence number is not entity identity
--   B. controlled, deterministic identifier normalization strategies
--   C. entity delete never erases regulatory lineage
--   D. entity_licenses temporal integrity
--   E. person data remains deferred
BEGIN;
SELECT plan(19);

-- ---------------------------------------------------------------- A
SELECT is(
  (SELECT count(*)::int FROM public.entity_identifiers i
     JOIN public.entity_identifier_types t ON t.id = i.identifier_type_id
    WHERE t.key = 'license_number'),
  0, 'no licence number is stored as an entity identifier');

SELECT is(
  (SELECT count(*)::int FROM public.entity_identifiers
    WHERE source_reference LIKE 'licenses.license_number:%'),
  0, 'every Phase 2A licence-number backfill row was removed');

SELECT is(
  (SELECT is_active FROM public.entity_identifier_types WHERE key = 'license_number'),
  false, 'license_number identifier type is retired, not deleted');

-- licence records themselves are untouched and remain authoritative
SELECT is(
  (SELECT count(*)::int FROM public.licenses WHERE license_number IS NULL),
  0, 'licences still carry their licence number (licenses.license_number is authoritative)');

-- retired types cannot be used for new entity identity
SELECT throws_ok($$
  INSERT INTO public.entity_identifiers (entity_id, identifier_type_id, identifier_value, source_type, regulator_id)
  SELECT (SELECT id FROM public.licensees LIMIT 1),
         (SELECT id FROM public.entity_identifier_types WHERE key = 'license_number'),
         'LIC-0001', 'MANUAL',
         (SELECT regulator_id FROM public.licenses WHERE regulator_id IS NOT NULL LIMIT 1)
$$, '23514', NULL, 'a retired identifier type cannot be used for entity identity');

-- ---------------------------------------------------------------- B
SELECT has_column('public', 'entity_identifier_types', 'normalization_strategy',
  'identifier types carry a controlled normalization strategy');
SELECT hasnt_column('public', 'entity_identifier_types', 'normalization_rule',
  'free-text normalisation description is gone');
SELECT has_function('public', 'normalize_entity_identifier', ARRAY['uuid', 'text'],
  'one canonical normalization service exists');

-- strategy vocabulary is closed (no arbitrary SQL/regex/expression)
-- the strategy vocabulary is closed: no arbitrary SQL/regex/expression can be stored
SELECT ok(
  (SELECT pg_get_constraintdef(oid) FROM pg_constraint
    WHERE conrelid = 'public.entity_identifier_types'::regclass
      AND pg_get_constraintdef(oid) LIKE '%normalization_strategy%')
    LIKE '%UPPER_TRIM%UPPER_ALPHANUMERIC%DIGITS_ONLY%',
  'normalization strategy is restricted to a closed set of engine algorithms');

-- deterministic, strategy-specific results (exercised through the write path, which
-- is what production uses; the canonical service is called by the trigger)
CREATE TEMP TABLE _n AS
WITH ins AS (
  INSERT INTO public.entity_identifiers
    (entity_id, identifier_type_id, identifier_value, source_type, jurisdiction_id)
  SELECT (SELECT id FROM public.licensees ORDER BY id OFFSET v.entity_offset LIMIT 1),
         t.id, v.raw, 'MANUAL',
         CASE WHEN t.uniqueness_scope = 'JURISDICTION' THEN (SELECT id FROM public.countries LIMIT 1) END
    FROM (VALUES
      ('legal_entity_identifier', '  549300ab  cd12 ', 0),
      ('taxpayer_registration_number', 'trn-123 456', 0),
      ('company_registration_number', ' c-123/ab ', 0),
      ('company_registration_number', 'C123AB', 1)
    ) AS v(type_key, raw, entity_offset)
    JOIN public.entity_identifier_types t ON t.key = v.type_key
  RETURNING identifier_type_id, identifier_value, normalized_value)
SELECT t.key, i.identifier_value, i.normalized_value
  FROM ins i JOIN public.entity_identifier_types t ON t.id = i.identifier_type_id;

SELECT is((SELECT normalized_value FROM _n WHERE key = 'legal_entity_identifier'),
  '549300AB CD12', 'UPPER_TRIM upper-cases and collapses whitespace');
SELECT is((SELECT normalized_value FROM _n WHERE key = 'taxpayer_registration_number'),
  '123456', 'DIGITS_ONLY keeps digits only');
SELECT is((SELECT count(DISTINCT normalized_value)::int FROM _n WHERE key = 'company_registration_number'),
  1, 'UPPER_ALPHANUMERIC is deterministic across equivalent inputs');
SELECT is((SELECT DISTINCT normalized_value FROM _n WHERE key = 'company_registration_number'),
  'C123AB', 'UPPER_ALPHANUMERIC strips separators');
SELECT isnt(
  (SELECT normalized_value FROM _n WHERE key = 'legal_entity_identifier'),
  (SELECT DISTINCT normalized_value FROM _n WHERE key = 'company_registration_number'),
  'different strategies produce different normalisations');
SELECT ok(
  (SELECT prosrc FROM pg_proc WHERE proname = 'entity_identifier_normalize')
    LIKE '%normalize_entity_identifier%',
  'entity_identifier_normalize() delegates to the canonical service');

-- ---------------------------------------------------------------- C
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'entity_licenses_entity_id_fkey'),
  'r', 'entity deletion cannot erase licence relationships');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'entity_identifiers_entity_id_fkey'),
  'r', 'entity deletion cannot erase entity identifiers');
SELECT is((SELECT confdeltype::text FROM pg_constraint WHERE conname = 'applications_entity_id_fkey'),
  'r', 'entity deletion cannot silently detach applications');

-- ---------------------------------------------------------------- D
SELECT col_not_null('public', 'entity_licenses', 'effective_from',
  'an entity-licence relationship always has a known effective start');

-- ---------------------------------------------------------------- E
SELECT is((SELECT count(*)::int FROM public.persons), 0,
  'person identities remain deferred — nothing cloned from profiles/fp_individuals');

SELECT * FROM finish();
ROLLBACK;
