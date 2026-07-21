# Backend Authorization Contract

Frontend guards are cosmetic. Every backend access path — RLS, storage,
RPCs, edge functions, views, materialized views, dashboards, reports, and
exports — resolves authorization through a single helper family in the
`public` schema.

## The helper family (Phase 1)

| Helper | Purpose |
| --- | --- |
| `public.is_super_admin(uid)` | Boolean: user carries the `super_admin` static role. Only bypass. |
| `public.has_permission(uid, module, action)` | Single authoritative check. `super_admin` short-circuits `true`; otherwise resolves through `user_dynamic_roles → role_permissions → permissions`. Case- and whitespace-insensitive on `module`. |
| `public.has_any_permission(uid, text[])` | Convenience for OR-style policies. Accepts `{"module.action", ...}`. |
| `public.user_has_entity_assignment(uid, licensee_id)` | True when the user is mapped as Lead, Officer, or Alternate regulator on the licensee. |
| `public.is_assignment_only_regulator(uid)` | True when a user is mapped as a regulator on at least one licensee **and** carries zero dynamic-role permissions. Super admins are explicitly excluded. |
| `public.return_status_is_submitted_lifecycle(status)` | True for `submitted / under_review / reviewed / approved / rejected / accepted / archived / closed / completed / final`. |
| `public.can_view_entity_returns(uid, licensee_id [, workflow_status, status])` | Composition of the above; the four-arg overload preserves backward compatibility for callers created before Phase 1. |

All helpers are `SECURITY DEFINER`, `STABLE`, `SET search_path = public`,
and their execute privilege is revoked from `PUBLIC` and granted only to
`authenticated` and `service_role`.

## Canonical policy pattern

```sql
-- SELECT
USING (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), '<module>', 'view')
  OR (<narrow assignment branch, only where explicitly allowed>)
)

-- INSERT / UPDATE / DELETE
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR public.has_permission(auth.uid(), '<module>', '<action>')
)
```

The assignment branch is permitted **only** on the fixed allow-list in
[`assignment-only-matrix.md`](./assignment-only-matrix.md). Every other
table denies assignment-only regulators outright because
`has_permission` returns `false` for them.

## Assignment-only regulator — global rules

- Read-only.
- Only their mapped `licensees` (Lead / Officer / Alternate).
- Only returns whose `status` satisfies `return_status_is_submitted_lifecycle(status)`.
- Never drafts, WIP, TEMP, or due-soon rows.
- Never admin/configuration data.
- Never exports, downloads, PDF/CSV/Excel, AI analysis, consolidated reports.

## RPC / edge-function contract

Every mutating RPC or edge function:

1. Re-derives `auth.uid()` inside the function; ignores any `user_id` argument.
2. Calls `public.has_permission(auth.uid(), '<module>', '<action>')` for the exact operation being performed.
3. On failure raises `not_authorized` (`SQLSTATE 42501`) — never a silent no-op.

Service-role code paths that skip the check (cron sweeps, storage
cleanup) are confined to internal queue / log tables that are locked
down from every non-service role.

## Rollout tracker

| Phase | Scope | Migration | pgTAP |
| --- | --- | --- | --- |
| 1 | Helpers | `20260721060418_*` | `supabase/tests/rbac/00_helpers.sql` |
| 2 | Returns core RLS | pending | `01_returns_rls.sql` |
| 3 | Return storage | pending | `02_returns_storage.sql` |
| 4 | Admin/config lockdown | pending | `03_admin_config_rls.sql` |
| 5 | Reports / AI / consolidated | pending | `04_reports_and_exports.sql`, `05_ai_and_consolidated.sql` |
| 6 | RPCs + edge functions | pending | `06_rpc_authorization.sql` |
| 7 | Remaining modules | pending | `09_module_matrix.sql` |
| 8 | Views / MVs | pending | (folded into per-module suites) |
| 9 | Cleanup & linter | pending | — |

Each phase must have its pgTAP suite green and the `supabase--linter`
clean for touched tables before the next phase begins.
