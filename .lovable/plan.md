# RBAC Hardening — Critical & High-Risk Implementation

Scope: land the highest-priority items from `docs/rbac/audit-2026-07-21/` end-to-end in code, migrations, and tests. Explicitly out of scope this pass: rewriting all 249 tables and 294 functions — I'll list the remaining lower-priority items in the completion report rather than attempt them in one unsafe migration.

## 1. Shared Edge Function auth guard
- Extend existing `supabase/functions/_shared/authz.ts` with optional scope checks (`licenseeId`, `entityId`, `returnId`, `recordId`) resolved server-side against `licensees`, `returns_filed`, entity-assignment helpers — never trust caller-supplied user IDs.
- Wire `requireUserPermission(...)` into high-risk edge functions:
  - Exports/reports: `audit-export`, `generate-report`, `export-*`, `consolidated-*`
  - AI: `ai-*` analysis, `rfi-suggestions`, prudential/conduct analyzers
  - Email/notify: `dispatch-notification-event`, `send-*`
  - Return + application actions: return processing, approval, rejection, complaint action functions, decision generation
- Add `docs/rbac/edge-function-permission-map.tsv` with columns `function, module, action, scope, implemented`.

## 2. SECURITY DEFINER hardening
- Migration `ALTER FUNCTION … SET search_path = public` for remaining unpinned definer functions (already covered 6 in Slice 1; sweep the rest of the flagged list from audit 08).
- `REVOKE EXECUTE … FROM PUBLIC` on definer functions that shouldn't be publicly callable; `GRANT EXECUTE` to `authenticated`/`service_role` as needed.
- pgTAP test `supabase/tests/rbac/20_definer_search_path.sql` (already exists) — extend to also fail on PUBLIC-executable definers without documented exception.

## 3. Critical RPC permission guards
- Add `IF NOT public.has_permission(auth.uid(), '<module>', '<action>') THEN RAISE EXCEPTION … USING ERRCODE='42501'` to critical RPCs across returns, applications, complaints, licensees, licenses, reports, users, roles, settings, audit, notifications.
- Keep narrower scope checks (entity mapping, ownership, workflow task, status, confidentiality) — compose `permission AND scope`.
- Use precise actions (`approve`, `reject`, `export`, `assign`, `configure`, `status_change`, `workflow_action`, `dispatch`, `execute`) — not blanket `edit`.
- Deliverable: `docs/rbac/rpc-permission-map.tsv`.

## 4. Critical RLS policies
- Replace broad `USING (true)` / role-only policies on the highest-risk tables with `has_permission(...) AND scope`:
  - Returns family: `returns_filed`, `return_form_data`, `return_documents`, `return_comments`, `return_audit_log`, `return_edit_requests`, `return_upload_attempts`, `return_upload_imports`, ratios/analysis
  - Applications family: `applications`, `documents` (app-linked), review/decision/RFI/comment/attachment tables
  - Complaints family: complaints + parties/documents/comments/assignments/decisions
  - Licensing: `licensees`, `licenses`, `license_actions`, license documents, entity/regulator mappings
  - Sensitive admin: `audit_logs`, `security_event_logs`, `notification_outbox`, `roles`, `permissions`, `role_permissions`, `user_roles`, `user_dynamic_roles`
- Preserve applicant/licensee ownership carve-outs.
- Deliverable: `docs/rbac/table-permission-map.tsv`.

## 5. Return Queue assignment-only lockdown
- Canonical status allow-list in one place (`src/lib/returnLifecycle.ts`) mirrored in SQL helper `is_post_submission_status(text)`. Explicit deny for `TEMP`, `WIP`, `draft`, `incomplete`, `pending_submission`, `due_soon`, `null`.
- Update Return Queue query, filters, detail route, RLS predicates, RPCs, attachments, dashboards, reports, and exports to consult the shared list.
- Hide Due Soon filter + pre-submission counters + admin sub-menus from assignment-only regulators; sidebar already gated — extend to the page-level filter bar.

## 6. Return Queue button gates
- `src/pages/returns-mgmt/ViewReturns.tsx` and detail/action components:
  - Export → `PermissionGate module="returns_management" action="export"`
  - Download → `action="download"`
  - Approve/Reject/Reopen/Status change/Workflow/Upload/Bulk → exact actions
- Backend export/download endpoints re-check the same permission (defense in depth).

## 7. High-risk action button gates across app
- Wrap approve/reject/assign/export/finalize/RFI/decision buttons in Returns, Applications, Complaints, Users/Roles, Reports, Settings with `PermissionGate` or `GuardedButton`.
- Add `data-rbac="module.action"` markers for the scanner only — real enforcement stays in the gate + backend.
- Target: materially above the current 4.7% action-coverage floor; scanner allow-list untouched except for genuine non-business controls (cancel, close, pagination, sort).

## 8. Route gap fixes
- Add explicit guards to internal routes currently unguarded (`/admin`, `/preview/:versionId`, `/notifications`, and others in `routes-unguarded.txt`) using `ModuleRoute` with the correct module (e.g. `admin_dashboard.view` for admin hub, per-tile gates on KPIs).
- KPI queries gated by permission (don't fetch then hide).
- Public/external routes moved to an explicit reviewed allow-list; route-coverage test fails on any unclassified protected route.

## 9. Role Management dependencies + orphans
- UI (`RoleManagement.tsx`) + backend `assert_role_permission_dependencies` trigger already exist for dependent-action → view rule; extend list to cover: `create, edit, delete, approve, reject, assign, export, download, upload, bulk, configure, status_change, workflow_action, dispatch, execute`.
- Auto-select `view`, block deselecting `view` while dependents remain, block save + surface validation. Backend trigger enforces same rule so direct API cannot bypass.
- Orphan permissions: wire real enforcement where feasible in this pass; otherwise flag `enforced=false` in `permissions` and filter them out of assignable options in the UI.

## 10. Storage policy hardening
- Explicit `SELECT/INSERT/UPDATE/DELETE` policies on `documents`, `secure-documents`, `fp-evidence`, `return-uploads`, `payment-documents`, `license-certificates`, `certificate-assets`, `audit-exports`.
- Pattern: `has_permission(auth.uid(), '<module>', '<action>') AND <scope>`; return-uploads scope = mapped entity + submitted status; audit-exports = explicit export permission + owner; deny drafts.

## 11. Automated tests
- Frontend (vitest/RTL): Sidebar, ModuleRoute, Return Queue, Return detail, Export button, Role Management, AdminHub, Reports — across 11 personas listed in the request. Return Queue assertions match the spec (queue visible, config hidden, mapped submitted visible, drafts/Due Soon/export hidden, etc.).
- pgTAP: extend `supabase/tests/rbac/` with cases for `has_permission`, admin non-bypass, Legacy Admin dynamic role, definer search-path, RPC rejection, assignment scope, draft/WIP/TEMP denial, applications, complaints, audit-log/notification-outbox restriction, storage policies.
- Deno tests: for every hardened edge function — missing token 401, invalid token 401, unauthorized 403, authorized success, out-of-scope 403.

## 12. Coverage gates in CI
- Update `src/test/rbac/*` coverage tests: fail on unsafe definer search paths, unguarded high-risk edge functions, unguarded critical RPCs, assignment-only Return Queue leaks, unguarded internal routes, high-risk action regressions. Baseline ratcheted above 4.7% without loosening scanner allow-list.

## 13. Verification commands to run at the end
```text
bun run build:dev
bunx vitest run src/test/rbac
supabase test db
deno test supabase/functions
```
Plus typecheck, lint, migration validation, and the three coverage scans. Real output reported; any unavailable command stated explicitly.

## 14. Completion report
Will include: files changed, edge functions protected, migrations, RPCs/RLS/storage policies replaced, permissions added or deprecated, before/after coverage numbers, test files added and pass/fail, plus an explicit list of remaining lower-priority tables/RPCs/buttons/permissions carried into the next slice. Program will not be labelled complete while any Critical/High finding remains.

## Technical notes
- Reuse the existing `_shared/authz.ts`; do not fork.
- Single canonical lifecycle status source: `src/lib/returnLifecycle.ts` + matching SQL function; import both sides from there.
- All new RLS composes `permission AND scope`, never `OR`, except the applicant-owns-own-application persona carve-out.
- Storage policies live in migrations, not the dashboard.
- No service-role bypass in edge functions before JWT + permission checks succeed.
