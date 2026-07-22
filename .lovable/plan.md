# Continue RBAC Implementation — Batch 1: Namespace Canonicalization

Since the remaining work spans many surfaces, I'll implement it in coherent batches. This plan covers **Batch 1**, which unblocks every subsequent batch by eliminating duplicate permission namespaces. Batches 2–N will follow immediately after approval, each as its own implementation pass.

## Batch sequence (for context)

1. **Namespace canonicalization** ← this batch
2. Centralized authorization service (single `authorize()` entry; remove `role.name`/`role.system_role`/permission-array checks)
3. Backend enforcement completion — RLS + RPC for Applications, Registration, Licensing, Licensees
4. Backend enforcement completion — Returns, Prudential, Enforcement, Inspections
5. Backend enforcement completion — Reports, Forms, Notifications, Dashboard, Bulk actions
6. Workflow authorization consolidation (single `workflow_authorize` covering permission + scope + assignment + state + SoD + override + audit)
7. Export/Download shared helpers + endpoint migration
8. Storage bucket audit + policy rewrite; signed-URL parity
9. Edge Function authorization sweep (JWT + active role + permission + scope + selector)
10. Test expansion + CI hard gates; final completion-report update

## Batch 1 scope: Namespace canonicalization

### Canonical names (chosen)

| Legacy alias | Canonical |
|---|---|
| `applications` | `application_management` |
| `licenses` | `license_management` |
| `prudential` | `prudential_supervision` |
| `reporting` | `report_management` |
| `notifications` | `notification_management` |
| `complaints` | `complaint_management` |
| `admin` | `settings` |

Rationale: `*_management` / `*_supervision` are already the dominant form in `permission_modules`, `has_permission` callers, and `edge-function-permission-map.tsv`.

### Steps

1. **Audit**: enumerate every reference to each alias across `src/`, `supabase/functions/`, `supabase/migrations/`, `supabase/tests/`, `docs/`, `scripts/`, and `catalog.json`. Produce `docs/rbac/namespace-migration.md` listing exact file:line hits (evidence, not planning).
2. **DB migration** (`rbac_canonicalize_namespaces`):
   - `UPDATE public.permissions SET module = <canonical> WHERE module IN (<aliases>)` with a de-dupe pre-check against `(module, action)` uniqueness.
   - `UPDATE public.role_permissions` follows via FK (or explicit update if stored denormalized — confirmed at audit step).
   - `UPDATE public.permission_modules SET name = <canonical>` and update any `permission_module_routes.module` references.
   - Add a temporary `public.permission_alias(alias text primary key, canonical text not null)` table + trigger on `permissions` INSERT that rejects legacy aliases going forward.
   - Backfill audit row into `role_migration_log`.
3. **Backend code**: rewrite every `has_permission(_, '<alias>', _)`, `requireUserPermission(req, '<alias>', …)`, and RLS policy USING/WITH CHECK clause to the canonical name. Grep-driven, file-by-file.
4. **Frontend code**: replace alias literals in `useCan`, `GuardedButton`, route guards (`ROUTE_MODULE_MAP`), sidebar visibility map, `catalog.json`, and RBAC test fixtures.
5. **Tests**: update pgTAP fixtures (`supabase/tests/rbac/*.sql`) and Vitest suites; add a new pgTAP test `supabase/tests/rbac/260_no_alias_namespaces.sql` asserting `SELECT count(*) FROM permissions WHERE module IN (<aliases>) = 0` and a Vitest guard scanning source for alias literals.
6. **CI**: add `scripts/verify-no-alias-namespaces.mjs` invoked from `.github/workflows/ci.yml` as a hard gate (no ratchet).
7. **Docs**: update `docs/rbac/completion-report.md` with the factual outcome of this batch only (which aliases removed, which files changed, test evidence). No forward-looking claims.

### Out of scope for this batch

Enforcement gaps (`enforced: false` in catalog), workflow centralization, storage/export helpers, edge-function sweeps, and persona expansion — all handled in subsequent batches per the sequence above.

### Verification

- `psql -c "SELECT DISTINCT module FROM public.permissions ORDER BY 1"` shows zero aliases.
- `rg -n "'(applications|licenses|prudential|reporting|notifications|complaints)'\s*[,)]" src supabase` returns zero permission-context hits.
- `bunx vitest run` + `pgtap` green.
- New CI script exits 0.

On approval I'll execute Batch 1 end-to-end, then continue directly into Batch 2 without re-planning.