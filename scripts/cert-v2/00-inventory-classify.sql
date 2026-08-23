-- Certification V2 — Wave 0 test-data inventory and classification (READ ONLY).
-- Classifies existing business populations by provenance, never by display name.
-- Signals used: V1 fixture manifest membership, dependency graph, creation window,
-- known certification reference prefixes, orphan detection.
\pset pager off
\timing off

WITH v1_entities AS (
  SELECT DISTINCT entity_id FROM public.certification_seed_manifest
   WHERE dataset_key = 'CERTIFICATION_DATASET_V1' AND entity_id IS NOT NULL
), v1_parties AS (
  SELECT DISTINCT party_id FROM public.certification_seed_manifest
   WHERE dataset_key = 'CERTIFICATION_DATASET_V1' AND party_id IS NOT NULL
  UNION
  SELECT DISTINCT organization_party_id FROM public.certification_seed_manifest
   WHERE dataset_key = 'CERTIFICATION_DATASET_V1' AND organization_party_id IS NOT NULL
), rows_ AS (
  -- population, classification, reason, count
  SELECT 'licensees' pop,
         CASE WHEN l.id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              ELSE 'MANUAL_REVIEW' END cls,
         CASE WHEN l.id IN (SELECT entity_id FROM v1_entities) THEN 'V1 manifest member (E01-E20)'
              ELSE 'not fixture-owned: ad-hoc record, needs human decision' END reason,
         count(*) n
    FROM public.licensees l GROUP BY 1,2,3
  UNION ALL
  SELECT 'applications',
         CASE WHEN a.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN a.entity_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         CASE WHEN a.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'dependent on V1 fixture entity'
              WHEN a.entity_id IS NULL THEN 'no canonical entity linkage'
              ELSE 'ad-hoc record, needs human decision' END,
         count(*)
    FROM public.applications a GROUP BY 1,2,3
  UNION ALL
  SELECT 'return_filings',
         CASE WHEN f.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN f.entity_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via entity linkage', count(*)
    FROM public.return_filings f GROUP BY 1,2,3
  UNION ALL
  SELECT 'return_filing_versions',
         CASE WHEN f.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              ELSE 'MANUAL_REVIEW' END,
         'cascades with parent filing', count(*)
    FROM public.return_filing_versions v
    JOIN public.return_filings f ON f.id = v.filing_id GROUP BY 1,2,3
  UNION ALL
  SELECT 'complaints',
         CASE WHEN c.licensee_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN c.licensee_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via licensee linkage', count(*)
    FROM public.complaints c GROUP BY 1,2,3
  UNION ALL
  SELECT 'correspondence_threads',
         CASE WHEN t.licensee_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN t.licensee_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via licensee linkage', count(*)
    FROM public.correspondence_threads t GROUP BY 1,2,3
  UNION ALL
  SELECT 'fp_assessments',
         CASE WHEN a.licensee_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN a.licensee_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via licensee linkage', count(*)
    FROM public.fp_assessments a GROUP BY 1,2,3
  UNION ALL
  SELECT 'examinations',
         CASE WHEN e.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN e.entity_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via entity linkage', count(*)
    FROM public.examinations e GROUP BY 1,2,3
  UNION ALL
  SELECT 'enforcement_actions',
         CASE WHEN e.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN e.entity_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via entity linkage', count(*)
    FROM public.enforcement_actions e GROUP BY 1,2,3
  UNION ALL
  SELECT 'conduct_investigations',
         CASE WHEN i.entity_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN i.entity_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via entity linkage', count(*)
    FROM public.conduct_investigations i GROUP BY 1,2,3
  UNION ALL
  SELECT 'licenses',
         CASE WHEN l.holder_id IN (SELECT entity_id FROM v1_entities) THEN 'PURGE_OLD_FIXTURE'
              WHEN l.holder_id IS NULL THEN 'PURGE_ORPHAN'
              ELSE 'MANUAL_REVIEW' END,
         'classified via holder linkage', count(*)
    FROM public.licenses l GROUP BY 1,2,3
  UNION ALL
  SELECT 'parties',
         CASE WHEN p.id IN (SELECT party_id FROM v1_parties) THEN 'PURGE_OLD_FIXTURE'
              ELSE 'MANUAL_REVIEW' END,
         'classified via V1 manifest party linkage', count(*)
    FROM public.parties p GROUP BY 1,2,3
  UNION ALL
  SELECT 'pre_license_users', 'MANUAL_REVIEW',
         'no fixture provenance available for this population', count(*)
    FROM public.pre_license_users
  UNION ALL
  SELECT 'profiles', 'MANUAL_REVIEW',
         'auth-linked; requires explicit human decision before removal', count(*)
    FROM public.profiles
  UNION ALL
  SELECT 'audit_logs', 'KEEP_AUDIT', 'immutable audit history — never purged', count(*)
    FROM public.audit_logs
  UNION ALL
  SELECT 'compliance_audit_logs', 'KEEP_AUDIT', 'immutable audit history — never purged', count(*)
    FROM public.compliance_audit_logs
  UNION ALL
  SELECT 'notification_dispatch_log', 'KEEP_AUDIT', 'delivery evidence — never purged', count(*)
    FROM public.notification_dispatch_log
  UNION ALL
  SELECT 'certification_seed_manifest', 'KEEP_REFERENCE', 'V1 provenance ledger, read-only', count(*)
    FROM public.certification_seed_manifest
)
SELECT pop AS population, cls AS classification, n AS row_count, reason
  FROM rows_ WHERE n > 0 ORDER BY pop, cls;
