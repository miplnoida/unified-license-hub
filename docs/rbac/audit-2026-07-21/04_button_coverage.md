# 04 · Button / Action Coverage

Source: existing RBAC audit tool `src/lib/rbac/audit.ts` +
`src/test/rbac/actionCoverage.test.ts` (baseline gate).

## Numbers

| Metric | Value |
|--------|-------|
| Interactive surfaces detected by `audit.ts` | 1310 |
| Protected surfaces (PermissionGate / GuardedButton / `data-rbac`) | 62 |
| Coverage | **4.7 %** |
| Raw `<Button>` occurrences (any) | 1434 |
| Raw guard signals | 16 (many surfaces protected by *page-level* `<M>` wrapper — not counted here) |

## What the audit tool counts as "protected"

- `<PermissionGate module="…" action="…">` wrapping the surface
- `<GuardedButton module="…" action="…">`
- The surface — or an ancestor within N lines — carrying `data-rbac="module.action"`

## Findings

| Severity | Area | Issue | Recommendation |
|----------|------|-------|----------------|
| **Critical** | Approve / Reject / Reopen | Return / Application / Complaint workflow buttons are visible to any user who can view the record. Server-side RLS on the state transition table is legacy-role based, not `has_permission`. | Wrap every state-change surface in `<PermissionGate>` **and** add an `EXECUTE has_permission(auth.uid(), '<module>', 'approve')` guard inside the RPC that persists the transition. |
| **Critical** | Export / Download / Print | Report pages expose CSV/Excel/PDF exports without a per-permission check; they only require `report_management.view`. | Introduce `report_management.export` and gate every export button + the edge function `/reports/export` behind it. |
| **High** | Assign / Bulk update | Bulk-selection toolbars in `ViewReturns`, `ApplicationsList`, `ComplaintsList` fire multi-row RPCs. | Gate the toolbar button *and* the RPC (`bulk_assign_*`) via `has_permission(_, 'assign')`. |
| **High** | Archive / Restore / Delete | Master-data tables (`sectors`, `categories`, `return_types`, etc.) allow soft-delete via UI. UI hides for non-admins but RLS only checks legacy `is_admin`. | Migrate to `has_permission(_, '<module>', 'delete')`. |
| **High** | Configure | Settings pages have no per-page `<PermissionGate>` for save buttons. | Wrap `Save` in `<GuardedButton module="settings" action="configure">`. |
| **Medium** | Notifications / Email dispatch | Manual "Send email" buttons in correspondence panels are ungated. | Add `notification_management.dispatch`. |
| **Medium** | AI Analysis / Consolidated Report | Internal buttons in FPA / Prudential fire heavy edge functions without permission checks. | Add `ai_management.execute`. |

## Path to 100 %

1. Extend the catalog with the missing action rows (per module: `export`, `dispatch`, `execute`, `assign`, `bulk_update`).
2. Wrap each surface in `<PermissionGate>` or `<GuardedButton>`, or add `data-rbac`.
3. Raise `MIN_PROTECTED_RATIO` in `actionCoverage.test.ts` incrementally (5 % → 25 % → 50 % → 90 %).
4. **Never** rely on button hiding alone — pair every UI protection with a matching RLS or RPC guard.

Full JSON output: `bunx tsx scripts/generate-rbac-audit.ts > docs/rbac/audit-2026-07-21/rbac-audit.json`
(script exists in the repo).
