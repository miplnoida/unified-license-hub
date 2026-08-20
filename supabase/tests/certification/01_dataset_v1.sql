-- CERTIFICATION DATASET v1 — drift control
-- Asserts that the live database still matches
-- docs/testing/certification-entity-matrix.md and that the dataset reports
-- zero integrity failures.
BEGIN;
SELECT plan(22);

CREATE TEMP TABLE cert_report AS
SELECT public.cert_verify_dataset_v1() AS r;

CREATE TEMP TABLE cert_counts AS
SELECT (r -> 'counts') AS c, (r -> 'failures') AS f, (r ->> 'failure_count')::int AS fc
FROM cert_report;

-- 1. integrity
SELECT is((SELECT fc FROM cert_counts), 0,
  'certification dataset reports zero integrity failures: '
  || (SELECT f::text FROM cert_counts));

-- 2..N documented volumes
SELECT is((SELECT (c ->> 'regulated_entities')::int FROM cert_counts), 20, '20 regulated entities');
SELECT is((SELECT (c ->> 'supporting_organizations')::int FROM cert_counts), 5, '5 supporting organizations');
SELECT is((SELECT (c ->> 'persons')::int FROM cert_counts), 50, '50 canonical persons');
SELECT is((SELECT (c ->> 'applications')::int FROM cert_counts), 27, '27 cohort applications');
SELECT is((SELECT (c ->> 'distinct_licences')::int FROM cert_counts), 23, '23 distinct licences');
SELECT is((SELECT (c ->> 'entity_license_links')::int FROM cert_counts), 28, '28 entity-licence links');
SELECT is((SELECT (c ->> 'ownership_rows')::int FROM cert_counts), 73, '73 ownership rows');
SELECT is((SELECT (c ->> 'appointments')::int FROM cert_counts), 160, '160 appointments');
SELECT is((SELECT (c ->> 'appointments_current')::int FROM cert_counts), 152, '152 current appointments');
SELECT is((SELECT (c ->> 'party_relationships')::int FROM cert_counts), 23, '23 party relationships');
SELECT is((SELECT (c ->> 'regulatory_requests')::int FROM cert_counts), 26, '26 regulatory requests');
SELECT is((SELECT (c ->> 'change_sets')::int FROM cert_counts), 15, '15 change sets');
SELECT is((SELECT (c ->> 'return_definitions')::int FROM cert_counts), 6, '6 active return definitions');
SELECT is((SELECT (c ->> 'obligation_rules')::int FROM cert_counts), 36, '36 obligation rules');
SELECT is((SELECT (c ->> 'entity_obligations')::int FROM cert_counts), 56, '56 entity obligations');
SELECT is((SELECT (c ->> 'reporting_periods')::int FROM cert_counts), 233, '233 reporting periods');
SELECT is((SELECT (c ->> 'return_filings')::int FROM cert_counts), 112, '112 return filings');
SELECT is((SELECT (c ->> 'filing_versions')::int FROM cert_counts), 128, '128 filing versions');
SELECT is((SELECT (c ->> 'regulatory_metrics')::int FROM cert_counts), 25, '25 regulatory metrics');
SELECT is((SELECT (c ->> 'metric_values')::int FROM cert_counts), 240, '240 metric values');

-- filing status spread: every workflow state present
SELECT is(
  (SELECT count(*)::int FROM jsonb_object_keys((SELECT c -> 'filing_status_distribution' FROM cert_counts))),
  6, 'all six filing statuses represented');

SELECT * FROM finish();
ROLLBACK;
