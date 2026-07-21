## Scope & reality check

The audit in `docs/rbac/audit-2026-07-21/` covers **249 tables, 294 SECURITY DEFINER functions, 8 storage buckets, dozens of edge functions, ~2,000+ action buttons, and 99 orphan permissions**. Implementing all of Phases A–I to the "completion criteria" (95% action coverage, every RPC guarded, every RLS policy migrated, every bucket policy rewritten, full pgTAP + frontend + edge-function test suites, CI thresholds) is a multi-sprint program — the audit itself estimates **3 sprints just for Critical + High** and defers the rest.

I can't credibly land all of it in a single turn without cutting corners that would produce exactly the "reports without real fixes" outcome you told me not to deliver. So this plan proposes a **sequenced execution across multiple turns**, with the first turn attacking the highest-severity, highest-leverage items end-to-end (code + migration + tests), and each subsequent turn taking the next slice with the same standard.

Please confirm the sequencing (or tell me to reorder / compress / expand a slice) before I start building.

---

## Execution slices

### Slice 1 — Critical backend lockdown (Phase A, Findings 3, 11, 21; parts of 4/5)
Highest blast-radius, smallest surface. Fully shippable in one turn.

1. **A1 — `search_path` fix** for the 6 flagged SECURITY DEFINER functions.
   - Migration: `ALTER FUNCTION … SET search_path = public` for each.
   - pgTAP guard test that fails CI when any `public` SECURITY DEFINER function lacks `search_path=` in `proconfig` (extends the existing complaints `13_security.sql` pattern to all schemas).
2. **A3 — Edge-function JWT + permission guard** on every Lovable-managed function under `supabase/functions/*` that currently uses the service-role client without validation.
   - Shared helper `supabase/functions/_shared/authz.ts` exporting `requireUserPermission(req, module, action)` that: rejects missing/invalid JWT (401), calls `has_permission` via anon client with the caller's JWT, returns 403 on deny, returns `{ userId, claims }` on allow.
   - Wire it into export/report/PDF/AI/dispatch/document/return-processing/application-decision/complaint-action/regulatory-analysis functions (concrete list assembled from `supabase/functions/` at build time).
   - Per-function Deno tests: 401 missing, 401 invalid, 403 unauthorized, 200 authorized, 403 out-of-scope entity (for the ones that take an entity id).
3. **Breakglass log** (Finding 21): trigger on `is_super_admin_by_email` hits into `security_event_logs`.
4. **Storage bucket audit-exports** (Finding 5): add explicit SELECT policy requiring `audit_management.export` + service_role write; document the dispatch path in `docs/rbac/audit-2026-07-21/07_storage_policies.md`.

Exit criteria for Slice 1: linter clean on `search_path`, all edge-function tests green, `10_findings.md` items 3, 5, 11, 21 flipped to `DONE` with commit refs.

---

### Slice 2 — RPC permission guards, top 5 modules (Phase A2, Finding 2)
Applications, Complaints, Returns, Licensees, Licenses.

- Introspect `pg_proc` for every SECURITY DEFINER function whose name matches those domains.
- For each, classify `(module, action)` from a checked-in mapping table `docs/rbac/rpc-permission-map.tsv` (source-controlled, reviewable).
- Add the standard guard block at top; preserve existing ownership/entity/workflow checks below it.
- `REVOKE EXECUTE … FROM PUBLIC; GRANT EXECUTE … TO authenticated;` per function.
- pgTAP: for each guarded RPC, 3 assertions (unauth → 42501, wrong-permission → 42501, correct-permission → success). Batched via a helper.
- Coverage test that fails CI when a `SECURITY DEFINER` function in `public` for those 5 modules lacks a `has_permission(` call in its body.

---

### Slice 3 — RPC guards, remaining modules (Phase A2 finish)
Fit & Proper, Prudential, Market Conduct, Coordination, Users, Roles, Forms, Workflows, Fees, Settings, Reports, Audit, Notifications. Same mechanics as Slice 2. Raises RPC/catalog coverage from 4/294 toward ≥ 90%.

---

### Slice 4 — RLS catalog migration, top 5 modules (Phase B, Finding 1)
- Build the checked-in mapping `docs/rbac/table-permission-map.tsv` (table, module, read/create/edit/delete/special actions).
- Rewrite policies for `applications`, `complaints`, `returns_filed`, `licensees`, `licenses` and their tightly-coupled children (rfis, evidence, remarks, attachments, etc.) so `USING`/`WITH CHECK` compose `has_permission()` **AND** existing ownership/assignment/entity scope. No policy weakened.
- pgTAP persona matrix per module (super_admin, legacy admin dynamic role, module-view-only, module-edit-only, approver, assignment-only regulator, external applicant, PPOC, unrelated user) × (SELECT/INSERT/UPDATE/DELETE).

---

### Slice 5 — RLS catalog migration, remaining modules + sensitive tables (Phase B, B3, Finding 12)
- Same mechanics for the rest.
- Explicitly harden `audit_logs`, `security_event_logs`, `notification_outbox` (service-only writes, `audit_management.view`/`security_management.view` reads), user/session data, evidence, prudential/conduct/twin-peaks findings.
- Register any new permissions (`audit_management.view`, `security_management.view`) in the catalog first.

---

### Slice 6 — Storage policy rewrite (Phase C, Finding 4)
- Rewrite policies on `documents`, `secure-documents`, `fp-evidence`, `return-uploads`, `payment-documents`, `license-certificates`, `certificate-assets` so each `SELECT/INSERT/UPDATE/DELETE` requires the correct `(module, action)` **AND** record scope.
- Return-uploads specifically enforces `is_assignment_only_regulator` → mapped entity + submitted lifecycle only.
- Storage pgTAP + Deno integration tests for each bucket × each op × each persona.

---

### Slice 7 — Route enforcement completion (Phase E, Findings 6, 7)
- Add `admin_dashboard.view` permission to the catalog.
- Wrap `/admin`, `/preview/:versionId`, `/notifications`, and every entry in `routes-unguarded.txt` with `<M module="…">` (or a documented public-route allow-list).
- AdminHub: gate every tile and KPI with `<PermissionGate>`; KPI fetches short-circuit when permission denied.
- Extend `src/test/routeCoverage.test.ts` to fail when a route file adds a new `<Route path=` that isn't in the public allow-list or wrapped in `<M>/<S>/<A>/<PortalRoute>`.

---

### Slice 8 — Action-button coverage push (Phase D)
Goal: raise coverage from 4.7% → ≥ 95% on **business** actions (audit script already excludes cosmetic buttons; refine its exclusion list as needed).
- Sweep by module in order: Returns, Applications, Complaints, Licensees/Licenses, Registration, Fit & Proper, Prudential, Market Conduct, Coordination, Reports, Forms, Workflows, Fees, Settings, Users, Roles, Audit, Notifications.
- Wrap each action with `<PermissionGate>` or convert to `<GuardedButton>`; add `data-rbac="module.action"` for the scanner.
- Return Queue lockdown for assignment-only regulators (export/download/upload/edit/approve/reject/reopen/status/workflow/config/bulk/analytics/global counts/draft/WIP/due-soon filters hidden and RPC-denied).
- Raise `MIN_PROTECTED_RATIO` in `actionCoverage.test.ts` incrementally (25 → 60 → 95) as each module lands, so CI never goes red mid-slice.

---

### Slice 9 — Reports, exports, indirect reads (Phase F, Finding 14)
- Add `report_management.view`, `report_management.export`, `ai_management.execute`, `notification_management.dispatch`, `audit_management.view` to the catalog (if not already).
- Add `required_permission_module` / `required_permission_action` columns to `report_sources` (and `report_source_columns` where needed).
- Report runner (edge function + client) validates permission for every underlying source before returning rows; export endpoints require `.export`.
- pgTAP + Deno tests: user with view-of-restricted-table denied can't read it via a report either.

---

### Slice 10 — Role Management completion (Phase G) + orphan resolution (Phase H, Finding 20)
- Role Management: dependency triggers already exist; add server-side re-validation on save, and UI: auto-enable view when dependent action toggled; block disabling view while dependents selected; explicit banner listing dependencies.
- Permission Coverage panel in Role Management row detail: shows Menu/Route/Button/RLS/RPC/Storage/EdgeFn status per permission, sourced from the coverage matrix JSON.
- Walk all 99 orphans: wire, deprecate (soft-delete + hide from assignment UI), or register in the catalog + external-portal capabilities (Finding 20).
- Emit before/after orphan count in `docs/rbac/permission-coverage.md`.

---

### Slice 11 — CI thresholds + final verification (Phase I completion + Findings 8, 9, 10, 13, 15, 16, 17)
- Fold in remaining High/Medium button-level gaps (Approve/Reject/Reopen RPC guards for Returns/Applications/Complaints — already covered by Slice 2/3; UI-side gates from Slice 8; Export/Download/Print gates from Slice 8/9; Bulk toolbars; master-data writes; settings save buttons; correspondence dispatch; AI/consolidated triggers).
- Enable strict CI thresholds:
  - `actionCoverage.test.ts` MIN_PROTECTED_RATIO = 0.95
  - `routeCoverage.test.ts` = zero unguarded internal routes
  - permission-coverage report = zero unexplained orphans
  - pgTAP search_path guard, RPC guard coverage, RLS coverage, storage coverage — all failing on regression
- Final report per your "Required final report" template: commits, files, migrations, functions, policies, buckets, edge functions, routes, buttons, roles, orphan count Δ, coverage Δs (action/route/RLS/RPC/storage), test commands and outputs, CI status, remaining limitations.

---

## What I need from you before I start

1. **Confirm the sequencing** above, or reorder (e.g. do you want the frontend button push and RPC guards interleaved per module instead of horizontal-by-layer? Horizontal-by-layer is safer for CI stability; vertical-by-module gives visible module-complete milestones sooner.).
2. **Confirm scope of "business action"** for the 95% target — the current audit script's exclusion list (icon-only toggles, close-dialog, cancel, tab switches, sort headers, pagination, help, copy-to-clipboard, theme toggle, etc.) is what I'll use; say if you want a stricter or looser definition.
3. **Confirm you accept multi-turn delivery.** Each slice will be a self-contained turn with green CI, tests, and a slice-completion report. I will not claim overall completion until Slice 11 lands.
4. **New permissions to register in the catalog** (`admin_dashboard.view`, `audit_management.view`, `security_management.view`, `report_management.export`, `ai_management.execute`, `notification_management.dispatch`) — OK to add, or do you want to review names first?

Once you confirm, I'll begin with **Slice 1** in the next turn.

## Technical notes

- Edge-function shared authz helper will live in `supabase/functions/_shared/authz.ts` and be imported via relative path (Deno-friendly, no import map changes).
- All migrations will be single files per slice, following the standard GRANT → RLS → POLICY order and never touching `auth`/`storage`/`realtime`/`supabase_functions`/`vault` schemas.
- pgTAP files added under `supabase/tests/rbac/` and `supabase/tests/<module>/`, wired into existing CI runner.
- Frontend tests added under `src/test/rbac/` alongside existing persona tests.
- The Node-only scanner in `src/lib/rbac/coverageScanner.ts` remains the single source of truth for the coverage matrix; UI reads the pre-generated JSON artifact.
