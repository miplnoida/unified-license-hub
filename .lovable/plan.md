## Goal
Deliver a legal-grade, append-only audit system covering every business mutation, authentication event, security event, and export across DB, RPCs, edge functions, frontend helpers, admin UI, and tests — with zero signature mismatches or partial coverage.

## Phase 1 — Audit inventory (read-only)
Enumerate and document in `docs/audit-log-coverage.md`:
- Tables: `audit_logs`, `compliance_audit_logs`, `security_event_logs`, plus `return_audit_log`, `document_action_logs`, `notification_dispatch_log` (bridge only, not replace).
- All existing RPCs: `log_compliance_audit`, `log_security_event`, `log_self_audit`, `has_role`, `resolve_actor_role`, plus any `write_audit_*` triggers.
- Every edge function under `supabase/functions/*` that mutates state.
- Every frontend mutation site (applications, licenses, payments, complaints, returns, documents, users/roles, master data, forms, workflows, exports, auth).
- Gap list mapping each Phase-3 event → current status (covered / partial / missing).

## Phase 2 — Database hardening
Single migration `audit_full_coverage.sql`:

**Schema**
- `compliance_audit_logs`: add missing columns `user_agent text`, ensure `metadata jsonb`, `ip_address inet/text`, `ai_model_version text`, `justification text`, `user_role text`. Add `entry_id uuid` alias if absent (keep `id`).
- `security_event_logs`: add `actor_role text`, `user_agent text`, `metadata jsonb`, `detail jsonb`, `target_resource text`, `event_time timestamptz default now()`.
- Backfill NULL for legacy rows.

**RPCs (SECURITY DEFINER, search_path=public)**
- `log_compliance_audit(_action_type, _object_type, _object_id, _before_value, _after_value, _justification, _ai_model_version, _ip_address, _user_agent, _metadata)` — server resolves `auth.uid()`, role via `resolve_actor_role`, timestamps. Enforces OVERRIDE justification ≥10 chars. Ignores any client-supplied user_id/role/timestamp.
- `log_security_event(_event_type, _target_resource, _ip_address, _user_agent, _detail, _metadata)` — same server-side resolution.
- Keep `log_self_audit` as shim forwarding to `log_compliance_audit` (BC).

**Immutability**
- `REVOKE UPDATE, DELETE` on all three audit tables from `PUBLIC, anon, authenticated, service_role`.
- `tg_prevent_audit_mutation()` BEFORE UPDATE/DELETE triggers on all three tables (raise exception).

**RLS**
- SELECT: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'super_admin')` only.
- INSERT: blocked for clients; only SECURITY DEFINER RPCs write.
- Revoke direct INSERT from `authenticated`, keep only `service_role` (used by RPC owner).

**Auto-audit triggers**
Generic `tg_auto_compliance_audit()` AFTER INSERT/UPDATE/DELETE attached to: `applications`, `licenses`, `license_renewals`, `license_actions`, `payments`, `payment_receipts`, `refunds`, `complaints`, `inspections`, `enforcement_actions`, `compliance_returns`, `returns_filed`, `documents`, `document_versions`, `file_uploads`, `approval_actions`, `workflow_instances`, `user_roles`, `profiles` (role/status columns), `master_data_items`, `master_data_types`, `forms`, `form_versions`, `approval_workflows`, `approval_workflow_versions`, `pre_license_users`, `notification_dispatch_log`.

**Unified view**
- `audit_timeline` UNION of `compliance_audit_logs` + `security_event_logs` + legacy `audit_logs`, normalized columns. Admin-only RLS via `security_invoker`.

**Indexes**
- `(created_at desc)`, `(user_id, created_at desc)`, `(action_type)`, `(object_type, object_id)` on `compliance_audit_logs`.
- `(event_time desc)`, `(event_type)`, `(user_id, event_time desc)`, `(ip_address)` on `security_event_logs`.

## Phase 3 — Frontend helpers (`src/lib/complianceAudit.ts`)
- Extend `logComplianceAudit` to send `_user_agent` matching new RPC signature.
- All helpers auto-attach `route`, `user_agent`, `logged_at` in metadata; resolve `ip_address` via ipify (cached, fail-open).
- Keep existing wrappers: `logExport`, `logLogin`, `logLogout`, `logNotificationDispatch`, `logIntegrationFailure`. Add `logAccessDenied`, `logPermissionEscalation`.
- `useAuditLog` hook: keep BC exports; re-route to `logComplianceAudit`.
- Wire missing frontend sites only where triggers cannot cover (pure UI events): every export button (Applications, Licenses, Payments, Complaints, Returns, Reports), `OverrideJustificationDialog`, `PermissionGate` denial, `RouteGuards` denials, print/download certificate.

## Phase 4 — Edge functions (server-side logging)
Add `logComplianceAudit`/`logSecurityEvent` helper in `supabase/functions/_shared/audit.ts` (calls RPCs with service role, forwards caller JWT for actor resolution). Wire into:
- `perform-workflow-action`, `perform-license-action`, `perform-registration-workflow-action`, `perform-return-workflow-action`
- `approve-pre-licensee`, `register-pre-licensee`, `verify-and-submit`, `resubmit-return`
- `create-web-user`, `manage-web-user`, `toggle-user-status`
- `generate-license-certificate` (EXPORT/print)
- `generate-report`, `run-scheduled-reports` (EXPORT)
- `dispatch-notification-event` (NOTIFICATION_SENT + INTEGRATION_FAILURE on error)
- `notification-failure-sweep`, `notification-retry`
- `send-registration-otp`, `verify-registration-otp` (LOGIN/AUTH_FAILED)

Each function logs after successful mutation with before/after captured from DB reads.

## Phase 5 — Auth logging
`src/contexts/AuthContext.tsx`: already logs LOGIN/LOGOUT/AUTH_FAILED — extend with `PERMISSION_ESCALATION` on role change detection and `ACCESS_DENIED` from route guards.

## Phase 6 — Admin UI
- `src/pages/admin/AuditLogs.tsx`: keep legacy view; add unified `audit_timeline` mode with tabs (Business / Security / Legacy). Filters: date range, action, object type, object id, actor, IP. Export CSV. Timeline drawer with before/after diff and metadata viewer (IP, UA, route).
- `src/pages/admin/ComplianceAuditLogs.tsx`: add IP/UA columns, metadata viewer, object-id quick filter, export.
- New `src/pages/admin/SecurityEventLogs.tsx` (or tab): event/user/IP filter + export.

## Phase 7 — Tests (`src/test/`)
- `auditRpc.test.ts` (extend): user_agent forwarding, IP capture, metadata shape, OVERRIDE guard, actor resolution can't be spoofed.
- `auditImmutability.test.ts`: UPDATE/DELETE against all 3 tables must fail.
- `auditRls.test.ts`: admin reads, non-admin blocked.
- `auditCoverage.test.ts`: insert row into `applications`/`payments`/`complaints`/`user_roles` → assert audit row created by trigger with before/after.
- `auditExport.test.ts`: calling `logExport` produces row with format/criteria/count.
- `auditSecurity.test.ts`: `logSecurityEvent` for AUTH_FAILED / ACCESS_DENIED / INTEGRATION_FAILURE.
- Edge function tests updated where present (`perform-workflow-action/index_test.ts`, `approve-pre-licensee/index_test.ts`).

## Phase 8 — Validation
- `tsgo` typecheck, `bunx vitest run`, `supabase--linter`.
- Grep sweep for direct `.from('audit_logs').insert` / `.update` / `.delete` — must be zero.
- Grep for missing `logExport` on every export path.
- Produce final report in chat with coverage % and Production Ready verdict.

## Technical notes
- All new triggers use `SECURITY DEFINER` functions owned by `postgres` so they can INSERT into locked-down audit tables despite revoked client grants.
- RPCs use `SET search_path = public, pg_temp` to satisfy linter.
- `resolve_actor_role` picks highest of `super_admin > admin > regulator > officer > licensee > applicant`.
- View uses `security_invoker=true` so RLS on base tables applies.
- No breaking changes to existing `useAuditLog` / `logComplianceAudit` call sites; new params are optional with server-side defaults.

## Out of scope
- Rewriting historical rows.
- Archival/retention policies.
- Logging read-only list/detail views (per prior decision: mutations + approve/deny/override/export only).
