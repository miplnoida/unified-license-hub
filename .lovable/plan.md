
# Production-Ready Audit & Security Logging

Two stores kept and clearly bridged:
- `compliance_audit_logs` — canonical business/compliance trail (via `log_compliance_audit` RPC).
- `security_event_logs` — security-sensitive events (via `log_security_event` RPC).
- `audit_logs` — legacy Activity Logs, kept read-only and merged into a unified view for the existing admin page.

## 1. Database migration

Single new migration `.../audit_hardening.sql`.

**Immutability (all three tables)**
- `REVOKE UPDATE, DELETE ON public.{audit_logs, compliance_audit_logs, security_event_logs} FROM PUBLIC, anon, authenticated, service_role`.
- BEFORE UPDATE OR DELETE trigger `prevent_audit_mutation()` raising an exception on every row (defense-in-depth; even service_role blocked at the SQL layer).
- Confirm existing `audit_logs_prevent_mutation` trigger; add matching ones on the other two tables.

**Schema fill-ins (nullable, additive only)**
- `compliance_audit_logs`: ensure columns `actor_role text`, `ip_address text`, `user_agent text`, `metadata jsonb` exist; back-fill defaults `NULL`.
- `security_event_logs`: ensure `actor_role text`, `metadata jsonb`.

**RPC hardening**
- Rewrite `public.log_compliance_audit(...)` (SECURITY DEFINER, `search_path=public`) so it:
  - Resolves `auth.uid()` server-side — client cannot forge actor.
  - Resolves highest role from `user_roles` into `actor_role`.
  - Stamps `created_at = now()` (client cannot set timestamp).
  - Enforces: `action_type='OVERRIDE'` requires `_justification` length ≥ 10 → `RAISE EXCEPTION`.
  - Accepts `_metadata jsonb` (route, user_agent, extra) and stores it.
- Rewrite `public.log_security_event(...)` similarly; adds `actor_role`, always server-stamped timestamp.
- Keep existing `log_self_audit` as a thin shim that forwards to `log_compliance_audit` so the legacy `audit_logs` page still receives writes for anything not migrated yet (backward compatibility) — no direct INSERTs from clients.
- `REVOKE INSERT ON` all three tables from `authenticated, anon`; `GRANT EXECUTE` on the three RPCs to `authenticated`.

**Read access (admin/super_admin only)**
- Drop broad SELECT policies; replace with:
  ```sql
  CREATE POLICY audit_admin_read ON public.compliance_audit_logs FOR SELECT TO authenticated
    USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin'));
  ```
  Same for `security_event_logs` and `audit_logs`.
- `GRANT SELECT` on all three to `authenticated` (RLS still filters); `GRANT ALL` to `service_role` (but UPDATE/DELETE blocked by trigger).

**Indexes**
- `compliance_audit_logs (created_at desc)`, `(user_id, created_at desc)`, `(action_type)`, `(object_type, object_id)`.
- `security_event_logs (created_at desc)`, `(event_type)`, `(user_id, created_at desc)`.
- `audit_logs (entity_type, entity_id)` if missing.

**Unified case-timeline view**
- `CREATE VIEW public.audit_timeline WITH (security_invoker=on) AS`
  UNION of the three tables normalized to columns: `source, id, occurred_at, user_id, actor_role, action, object_type, object_id, before_value, after_value, justification, ip_address, metadata`.
- Admin-only via RLS on the underlying tables.

**Trigger coverage (server-side, cannot be bypassed)**
Add/verify AFTER INSERT/UPDATE/DELETE triggers that call `log_compliance_audit` for:
- `applications`, `licenses`, `license_renewals`, `license_actions`, `enforcement_actions`
- `complaints`, `inspections`, `compliance_returns`, `returns_filed`
- `payments`, `refunds`
- `approval_actions` (approve/reject/override/workflow transitions)
- `user_roles`, `profiles.role_changes`, `pre_license_users` status changes
- `file_uploads` deletions
Each trigger records before/after (`to_jsonb(OLD)`, `to_jsonb(NEW)` with sensitive columns stripped), maps DB op → action_type (`CREATE|UPDATE|DELETE|APPROVE|REJECT|WORKFLOW_TRANSITION`), sets `object_type` = table name, `object_id` = row PK. Reuses existing `write_audit` helper where present; new triggers write to `compliance_audit_logs` directly.

## 2. Frontend / edge helpers

- `src/lib/complianceAudit.ts` — extend:
  - Auto-attach `metadata: { route, user_agent }` on every call.
  - `logExport(...)` already exists; extend to require `object_type`, `format`, `criteria`, `record_ids[]|record_count`.
  - New `logLogin()` / `logLogout()` helpers called from `AuthContext`.
  - New `logNotificationDispatch(...)`, `logIntegrationFailure(...)` helpers.
- Wire missing frontend call sites (mutations covered by triggers stay untouched to avoid duplicates; only add for pure-frontend events):
  - `AuthContext` sign-in success / sign-out → `LOGIN` / `LOGOUT`.
  - `AccessDenied.tsx` — already logs; keep.
  - Every export button in Applications / Licenses / Payments / Complaints / Returns / Reports / AuditLogs pages → `logExport`.
  - `OverrideJustificationDialog` submissions → pass justification into the mutation RPC (server will validate ≥10 chars).
- `dispatch-notification-event` edge fn → call `log_compliance_audit` with `NOTIFICATION_SENT` on success and `log_security_event` with `INTEGRATION_FAILURE` on provider failure.
- Other edge fns performing state changes (`perform-workflow-action`, `perform-license-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`, `approve-pre-licensee`, `verify-and-submit`, `toggle-user-status`) — ensure each writes a `WORKFLOW_TRANSITION` / `APPROVE` / `REJECT` / `OVERRIDE` row via the RPC with before/after and justification when provided.

## 3. Admin UI

Keep existing routes; no removal.
- `src/pages/admin/AuditLogs.tsx` — switch data source to `audit_timeline` view; add tabs: **Business** (compliance), **Security**, **Legacy**. Add filters: date range, actor, action_type, object_type, object_id (case-centric). Add "View timeline for this object" quick link from every row.
- `src/pages/admin/ComplianceAuditLogs.tsx` — keep; add object_type + object_id filter and metadata/IP columns.
- New tab "Security Events" already exists in ComplianceAuditLogs page — verify it filters `security_event_logs`.
- Route guard: both pages already behind admin/super_admin — reconfirm with `PermissionGate`.

## 4. Tests

New Vitest specs under `src/test/`:
- `auditRpc.test.ts` — mocked supabase client asserts `logComplianceAudit`, `logSecurityEvent`, `logExport` shape + metadata auto-attach.
- `auditOverrideValidation.test.ts` — override without justification throws client-side; ≥10 char passes.
- `auditImmutability.test.ts` — integration-style: attempt UPDATE/DELETE via supabase client, expect error (skipped if no service creds, run in CI with anon).
- `auditAdminReadAccess.test.ts` — non-admin session gets empty result; admin sees rows (uses mocked has_role).
- `auditExportLogging.test.ts` — clicking CSV export in ApplicationsList calls `logExport` with correct payload (RTL).
- `auditAccessDeniedLogging.test.ts` — rendering `AccessDenied` fires `logSecurityEvent('ACCESS_DENIED', …)`.
- `auditTriggerCoverage.test.sql` — pgTAP-style checklist doc listing every trigger required (executable via `psql` in CI where available; otherwise informational).

Update `docs/audit-log-coverage.md` with the new canonical helper, trigger list, and the timeline view.

## Technical details

- Order: apply migration → regenerate types → edit `complianceAudit.ts` and call sites → update UI → add tests.
- Backward compatibility: `log_self_audit` remains callable and now writes to both `audit_logs` (as today) and `compliance_audit_logs` via forward call, so nothing regresses.
- No table drops, no column drops, no policy loosening.
- `service_role` retains INSERT so edge fns keep working; UPDATE/DELETE blocked by trigger for everyone (immutability).

## Out of scope

- Rewriting historical rows to add `actor_role`/metadata.
- Purging or archiving policy (separate ticket).
- Logging every list/detail view (per prior decision: mutations + approve/deny/override/export only).
