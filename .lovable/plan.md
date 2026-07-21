## Objective

Achieve 100% action-level RBAC coverage across the entire app. Every business action button/menu/handler must be gated by `PermissionGate` or a `hasPermission(module, action)` check. Assignment-only regulators must be restricted to viewing submitted mapped returns only — every other action on the Return Queue must be hidden for them.

## Approach

Treat this as an audit-first, fix-second sprint with automated enforcement so the coverage cannot regress.

### Phase 1 — Discovery & Inventory (read-only)

1. Enumerate every page under `src/pages/**` and every feature component under `src/components/**` that renders an action.
2. For each file, extract candidate action elements:
   - `<Button>`, `<DropdownMenuItem>`, `<ContextMenuItem>`, `<MenuItem>`, icon buttons, and `onClick` handlers on links/rows.
   - Form `onSubmit` handlers that call Supabase RPCs, edge functions, or `.insert/.update/.delete/.upsert`.
   - Export/print/download utilities (`jsPDF`, `xlsx`, `papaparse`, `window.print`, `saveAs`, storage `createSignedUrl` on download paths).
   - Email/notification triggers (`resend`, `send-email` edge fn, `notifications.insert`).
3. Classify each action into the canonical taxonomy (Create, Edit, Delete, Approve, Reject, Assign, Export, Download, Upload, Import, Bulk Update, Bulk Delete, Workflow, Status Change, Archive, Restore, Escalate, Issue, Publish, Close, Reopen, Resubmit, Configure, Generate Report, AI Analysis, Consolidated Report, PDF, Excel, CSV, Print, Email, Notification).
4. Map each action to `(module, action)` using `src/lib/permissionModules.ts`. Extend the module/action registry where the current taxonomy is missing an entry (e.g. `returns_management.export`, `returns_management.download`, `returns_management.bulk_update`, `complaints.escalate`, `licenses.issue`, `reports.ai_analysis`, `reports.consolidated`, `*.print`, `*.email`).
5. Emit the audit inventory to `docs/rbac/action-audit.csv` and a human-readable `docs/rbac/action-audit.md` with columns: Page, Button, Module, Action, Protected (Yes/No), File, Line.

### Phase 2 — Canonical Guarding Primitives

1. Confirm `PermissionGate` supports:
   - `module`, `action`, optional `fallback`, optional `disableInsteadOfHide`.
2. Add small helpers if missing:
   - `useCan(module, action)` thin wrapper over `hasPermission`.
   - `<GuardedButton module action ...>` convenience wrapper that returns `null` when not permitted (used for action buttons in tables/toolbars).
3. Ensure server-side `has_permission(uid, module, action)` exists for every action key used on the client (extend the SQL function/enum data as needed). No new business logic — only authorization.

### Phase 3 — Systematic Wrapping (per module)

For every page identified in Phase 1, wrap each action in `PermissionGate`/`GuardedButton` and guard the handler entry point with an early `hasPermission` check (defense in depth). Modules to sweep, in order:

1. Returns (list, detail, queue, config, types, attachments, reviews, edit-requests, imports, exports, reconciliation, workflow).
2. Registrations & Applications (new, review, approve/reject, resubmit, export, print).
3. Licenses (issue, renew, revoke, print certificate, export).
4. Complaints (create, assign, escalate, close, reopen, attachments, bulk actions, reports).
5. Inspections & FPA (if present in module map).
6. Correspondence (inbox, records, routing config, send/email).
7. Entities / Licensee Detail (web users create/edit/delete, PPOC map/unmap, background info edit, regulator assignment).
8. Admin utilities (Employee Management, Role & Permissions, Regulator Management, Master Data, Form Builder incl. publish/archive/restore, Fee & Payment config, Site Settings, Branding, Notifications templates).
9. Reports & Analytics (generate, export CSV/Excel/PDF, AI Analysis, Consolidated Report, Print, Email).
10. Storage-touching flows (Upload, Download, Signed URL fetches, bulk import).

For each: no visual change beyond hiding disallowed controls; handlers unchanged in behavior.

### Phase 4 — Return Queue Hard-Lockdown for Assignment-Only Regulators

1. In `src/hooks/usePermissions.ts`, add an explicit `isAssignmentOnly` boolean (true when the user has no dynamic-role permissions but has `hasAnyEntityAssignment`).
2. Return Queue list & detail: when `isAssignmentOnly` is true, force-hide every action control regardless of module.action grants:
   - Export, Download (file & attachments), Approve, Reject, Edit, Workflow panel, Status change, Delete, Configuration, Bulk selection UI, Reports, Analytics tabs.
   - Only "View" and read-only tabs remain visible.
3. Enforce the same rule server-side: extend `has_permission` so that assignment-only users resolve `false` for every action except an implicit `returns_management.view` scoped through `can_view_entity_returns`.
4. Storage policies: block download signed URLs for assignment-only regulators (already partially enforced — verify by test).

### Phase 5 — Automated Coverage Enforcement

1. New Vitest suite `src/test/actionCoverage.test.ts`:
   - Static scan of `src/pages/**` and `src/components/**` for `<Button`, `onClick`, `<DropdownMenuItem`, `onSubmit`.
   - Fail if an action element is not inside a `PermissionGate` / `GuardedButton` / marked with an `data-rbac="view-only"` allow-list token.
   - Maintain a small explicit allow-list for genuinely public actions (login, logout, theme toggle, close-dialog).
2. New Vitest suite `src/test/returnQueueAssignmentOnly.test.tsx`:
   - Render Return Queue list & detail as an assignment-only persona and assert none of the forbidden controls are in the DOM.
3. Extend `src/test/permissionsRbac.test.tsx` with per-action matrix cases for each new `(module, action)` key introduced.
4. pgTAP additions under `supabase/tests/rbac/` verifying `has_permission` returns false for assignment-only users on every non-view action, and that RLS blocks their writes to `returns_filed`, `return_form_data`, attachments, workflow tables.

### Phase 6 — Report Deliverable

Produce `docs/rbac/action-audit.md` (and `.csv`) covering every action found, with columns exactly:

```text
Page | Button | Permission (module.action) | Protected (Yes/No) | File | Line
```

Include a summary section with total actions, protected count, and a per-module breakdown. Target: 100% Protected=Yes at completion. Any exceptions (e.g. Logout) listed explicitly in an "Intentional public actions" table.

## Technical Details

- No business logic changes — only authorization wrappers, permission registry additions, and tests.
- New/updated files (high level):
  - `src/lib/permissionModules.ts` — extend action taxonomy.
  - `src/components/auth/PermissionGate.tsx` + new `GuardedButton.tsx`.
  - `src/hooks/usePermissions.ts` — add `isAssignmentOnly`.
  - Every page/component in inventory — wrap actions.
  - `supabase/migrations/*_rbac_action_coverage.sql` — extend `has_permission`, tighten policies where write actions leak.
  - `src/test/actionCoverage.test.ts`, `src/test/returnQueueAssignmentOnly.test.tsx`, extended `permissionsRbac.test.tsx`.
  - `supabase/tests/rbac/*.sql` — pgTAP action-level assertions.
  - `docs/rbac/action-audit.md`, `docs/rbac/action-audit.csv`.

## Acceptance Criteria

1. Every action element in `src/pages/**` and `src/components/**` is either inside a `PermissionGate`/`GuardedButton` or on the documented public allow-list.
2. `docs/rbac/action-audit.md` shows 100% coverage.
3. Assignment-only regulator persona test finds zero forbidden controls in Return Queue.
4. All Vitest suites pass, including the new static coverage scan.
5. pgTAP RBAC suites pass, confirming server-side parity.
6. No changes to existing business flows or UI beyond hiding/disabling unauthorized actions.

## Clarifying Question

Given the sheer surface area (likely 300–600 action sites), do you want this delivered as:

- **(A) One massive PR** covering all modules in a single build turn, or
- **(B) Phased by module** (Returns → Registrations → Licenses → Complaints → Correspondence → Entities → Admin → Reports), each phase committing with its slice of the audit report and tests?

I recommend **(B)** to keep review tractable and let the audit report grow module by module with green tests at each step. Confirm A or B before I begin implementation.
