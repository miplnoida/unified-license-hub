## Problem

Two issues:

1. **Data doesn't display on `/admin/audit-logs`** — the `audit_logs` table has 551 rows but no `SELECT` grant to the `authenticated` role. PostgREST silently returns empty results even for admins, because Data API grants are required in addition to RLS policies.
2. **Coverage gaps** — many user actions (create/edit/delete, approve/reject, override, export, access-denied) are not consistently logged, and existing entries don't record the actor's role.

## Fix

### 1. Database migration

- `GRANT SELECT, INSERT ON public.audit_logs TO authenticated` (+ `GRANT ALL … TO service_role`). Same for `compliance_audit_logs` and `security_event_logs` where missing.
- Add `user_role text` column to `audit_logs` (nullable, back-fill NULL).
- Make entries **immutable**: `REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated, anon, service_role` + BEFORE UPDATE/DELETE trigger that raises an exception (so even service_role cannot mutate rows).
- Update `log_self_audit` RPC to resolve the caller's highest role via `user_roles` and store it in the new `user_role` column, so every insert carries: timestamp, user_id, role, action, entity_type, entity_id, old_value, new_value, metadata.

### 2. Central logging helper

- Extend `src/hooks/useAuditLog.ts` (`logAudit`) to always populate `entityType`, `entityId`, `oldValue`, `newValue`, and a `metadata` block with route + user-agent. No signature change for callers.
- Add a thin wrapper `logAction(action, entity, {before, after, meta})` re-exported from the same module so new call sites are one-liners.

### 3. Add missing call sites (mutations + approve/deny/override/export)

Audit each of these to ensure a `logAudit` call fires on success (before-value captured from the row being modified, after-value from the update payload):

- **Applications** — create, edit draft, submit, cancel, resubmit, approve, reject, request-edit, override (already partial; fill gaps).
- **Licenses** — suspend/revoke/cancel/reinstate/status-change (edge function already logs; add client-side download-certificate + edit).
- **Payments** — initiate, complete, verify, refund.
- **Documents** — upload, replace, delete, download.
- **Complaints** — create, assign, status change, close.
- **Compliance returns** — submit, resubmit, approve, reject, extend due-date.
- **Workflow / approvals** — approve, reject, override (with justification), reassign.
- **Users & roles** — create, edit, activate/deactivate, role assign/revoke.
- **Master data & settings** — create/edit/delete, publish/archive form template, publish/archive workflow.
- **Exports** — every CSV/PDF/XLSX export routes through `logExport` in `src/lib/complianceAudit.ts`; wire it into `applicationsExport.ts`, reports downloads, and any other export button.
- **Access denied** — `AccessDenied` component and route guards call `logSecurityEvent('ACCESS_DENIED', …)`.

Views/list-page opens are **not** logged (per user's choice).

### 4. UI fix on `/admin/audit-logs`

- After the grant migration, existing page will load rows.
- Add a `Role` column to the table and detail sheet, sourced from the new `user_role` column (fallback to on-the-fly lookup for legacy rows).

## Verification

- After migration: reload `/admin/audit-logs` as an admin → 551+ rows visible.
- Trigger one mutation of each covered type in the preview → new row appears with correct `user_role`, before/after values.
- Attempt `UPDATE audit_logs …` via SQL → raises `audit_logs are immutable`.

## Out of scope

- Logging every view / list open (explicitly declined).
- Re-writing existing 551 legacy rows to add roles (kept NULL; UI shows "—").
