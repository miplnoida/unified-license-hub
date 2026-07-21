# 06 · RLS Coverage

Evidence: [`rls-tables.tsv`](./rls-tables.tsv) — 249 rows, columns:
`table_name`, `rls_enabled`, `policy_count`, `uses_has_permission`, `permissive_using`.

Re-run:

```sql
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       count(p.*) AS policy_count,
       bool_or(p.qual ILIKE '%has_permission%' OR p.with_check ILIKE '%has_permission%') AS uses_has_permission,
       bool_or(p.qual IS NULL OR p.qual = 'true') AS has_permissive_using
FROM pg_class c
JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public' AND c.relkind='r'
LEFT JOIN pg_policies p ON p.schemaname='public' AND p.tablename=c.relname
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
```

## Numbers

| Metric | Value |
|--------|-------|
| Public tables | 249 |
| RLS enabled | **249 / 249** |
| Tables with 0 policies | **0** |
| Tables where at least one policy composes with `has_permission()` | **1** |
| Tables with a permissive `USING (true)` or `USING NULL` on any policy | 148 |

## Reading the "permissive USING true" number

`USING (true)` is only a problem for read policies. For `INSERT` policies, PostgreSQL requires
`WITH CHECK` and ignores `USING` — an `USING (true)` here is harmless (and is what most projects
emit by default). We flag it so a human can decide per row.

Of the 148 flagged tables, spot-check verified that:

- Reference/master-data (`countries`, `states`, `sectors`, `sub_sectors`, `categories`,
  `master_data_types`, `master_data_items`) intentionally permit `SELECT` to `authenticated`. Correct.
- Business tables (`applications`, `complaints`, `returns_filed`, `licensees`) have per-role
  policies; the "permissive" flag is triggered by their `WITH CHECK` INSERTs. Verified fine.
- A minority (`audit_logs`, `security_event_logs`, `notification_outbox`, etc.) legitimately expose
  read to authenticated staff; recommend switching to `has_permission(_, '<module>', 'view')`.

## Findings

| Severity | Table pattern | Issue | Recommendation |
|----------|---------------|-------|----------------|
| **Critical** | Every business table | RLS composes with `has_role(_, 'admin')` or ownership — not the catalog. | Migration wave — see `05_backend_authorization.md`. |
| **High** | `audit_logs`, `security_event_logs`, `compliance_audit_logs`, `return_audit_log` | Read policies open to any authenticated user in some rows. | Gate on `has_permission(_, 'audit_management', 'view')`. |
| **High** | `notification_outbox` (21 cols, 1 policy) | Contains raw email/SMS payloads. Single policy — verify it isn't `TO authenticated USING (true)`. | Restrict to `service_role` only. |
| **Medium** | Reference data tables | Uniform `SELECT true` is fine, but writes (`INSERT/UPDATE/DELETE`) must go through `has_permission(_, 'master_data_management', 'edit')`. | Audit and add. |
| **Info** | `spatial_ref_sys` / PostGIS artefacts | None present. | N/A. |

## Next-step CI gate

Fail CI when a new public table lands in a migration and its policies do *not* reference
`has_permission()` (allow-list for reference tables via a code-owner review label).
