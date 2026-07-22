-- 260_no_alias_namespaces.sql
-- Guards against reintroducing legacy permission namespace aliases in the
-- database. Batch 1 of the final RBAC closure canonicalized these
-- namespaces (see docs/rbac/completion-report.md).
BEGIN;
SELECT plan(1);

WITH offenders AS (
  SELECT module, name
  FROM public.permissions
  WHERE module IN (
    'admin','applications','complaints','inspections','licenses',
    'notifications','prudential','reporting','supervision','audit_logs'
  )
)
SELECT is(
  (SELECT COUNT(*)::int FROM offenders),
  0,
  'no permissions row uses a legacy alias namespace'
);

SELECT * FROM finish();
ROLLBACK;
