# RBAC Audit — 2026-07-21

**Scope.** Full enterprise RBAC review across menus, routes, buttons, `PermissionGate`, `usePermissions`, RLS,
RPCs, storage, reports, dashboards, search, and exports.

**Method.** Static scans (`ripgrep`) + database introspection (`pg_class`, `pg_policies`, `pg_proc`,
`storage.buckets`) + the existing coverage scanner (`src/lib/rbac/coverageScanner.ts`) + `supabase--linter`.
Every claim below is backed by a raw TSV/TXT artifact in this folder or by a query re-runnable via
`supabase--read_query`.

**No functional changes have been made.** Findings are recorded here for prioritisation; a follow-up
migration turn will convert the Critical / High items into code.

## Final Security Score

| Layer                     | Coverage vs. `has_permission()` catalog | Grade |
|---------------------------|-----------------------------------------|-------|
| Menu (sidebar)            | 100% of items carry a `module`          | A     |
| Routes                    | 189 / 231 wrapped in `<M>` (module) or capability guard | B |
| Buttons / actions         | 62 / 1310 protected surfaces (4.7%)     | F     |
| RLS on public tables      | 249 / 249 tables have RLS **enabled**   | A     |
| RLS composed with `has_permission` | 1 / 249 tables               | F     |
| RPC (`SECURITY DEFINER`)  | 4 / 294 call `has_permission`, 6 miss `search_path` | F |
| Storage policies          | 1 / 30 policies reference `has_permission` | F |
| Reports / Exports         | Route-level only; no export-action gate  | D    |
| **Overall RBAC posture**  | **Frontend visibility strong, backend authorization weak** | **D+** |

The application blocks *navigation* to protected areas well, but a determined actor with a valid session
and any dynamic role can still reach most write-paths through direct RPC / table / storage calls because
those layers rely on ownership and legacy role hard-codes rather than the `has_permission()` catalog.
Closing that gap is the single highest-leverage security investment left.

## Reports in this folder

| # | File | Purpose |
|---|------|---------|
| 1 | [01_permission_coverage.md](./01_permission_coverage.md)  | Permission catalog vs. enforcement surfaces |
| 2 | [02_route_coverage.md](./02_route_coverage.md)            | Route → guard mapping and unguarded routes |
| 3 | [03_menu_coverage.md](./03_menu_coverage.md)              | Sidebar entries and their `module` keys |
| 4 | [04_button_coverage.md](./04_button_coverage.md)          | Buttons / actions and their protection |
| 5 | [05_backend_authorization.md](./05_backend_authorization.md) | Backend authorization architecture review |
| 6 | [06_rls_coverage.md](./06_rls_coverage.md)                | Per-table RLS posture (evidence: `rls-tables.tsv`) |
| 7 | [07_storage_policies.md](./07_storage_policies.md)        | Storage bucket policies (evidence: `storage-policies.tsv`) |
| 8 | [08_rpc_security.md](./08_rpc_security.md)                | RPC / function security (evidence: `rpc-functions.tsv`) |
| 9 | [09_orphan_permissions.md](./09_orphan_permissions.md)    | Catalog rows with zero enforcement surface |
| 10| [10_findings.md](./10_findings.md)                        | Severity-scored findings & recommendations |

## Raw evidence

- `rls-tables.tsv` — 249 rows: `table_name`, `rls_enabled`, `policy_count`, `uses_has_permission`, `permissive_using`
- `rpc-functions.tsv` — 381 rows: `proname`, `prosecdef`, `pins_search_path`, `uses_has_permission`, `acl`
- `storage-policies.tsv` — 30 rows: `policyname`, `cmd`, `roles`, `uses_has_permission`
- `routes-unguarded.txt` — 42 route declarations without `<M>` (mostly `<EP>` external-portal or public routes)

## Headline numbers

- **249** public tables — **100%** have RLS enabled, **0** have zero policies.
- **1** RLS policy composes with `has_permission()` (target: every non-reference table that maps to a module).
- **148** tables carry at least one policy whose `USING` clause is `true` or `NULL` — mostly INSERT-only
  policies with `WITH CHECK`, but every row must be reviewed against its module.
- **294** `SECURITY DEFINER` functions in `public`; only **4** compose with `has_permission()`;
  **6** are missing `SET search_path` (linter warns on hundreds more that pin an *empty* search_path — see
  `supabase--linter` output).
- **10** storage buckets; **8** are private; only **1** policy references `has_permission()`.
- **123** catalog permissions; **99** currently orphaned (from the existing permission-coverage report).

## What is *not* in scope for this turn

Per the user's instruction, no functional changes have been made. This is the audit; the
[10_findings.md](./10_findings.md) report gives an ordered remediation queue.
