# Plan: Activity Logs (rename) + new Immutable Audit Logs

## 1. Rename current "Audit Logs" → "Activity Logs"

Keep the existing `audit_logs` table, RPC `log_self_audit`, triggers, and `src/pages/admin/AuditLogs.tsx` exactly as-is (used everywhere for operational/workflow tracing). Only relabel the UI surface:

- `src/config/navigation.tsx` — change label `Audit Logs` → `Activity Logs`, route stays `/admin/audit-logs`.
- `src/pages/admin/AdminHub.tsx` — same label change on the card.
- `src/pages/admin/AuditLogs.tsx` — update page title/breadcrumb to "Activity Logs".
- No DB rename, no route rename → zero risk to existing audit triggers, audit-log-coverage doc, or workflow features.

## 2. New "Audit Logs" module (compliance / legal evidence)

### 2.1 New table `public.compliance_audit_logs`

Columns (exact spec):

| Column | Type | Notes |
|---|---|---|
| entry_id | uuid PK, default `gen_random_uuid()` | immutable |
| timestamp | timestamptz default `now()` (UTC, ms) | server-set |
| user_id | uuid | nullable for system events |
| user_role | text | role snapshot at action time |
| action_type | enum `compliance_audit_action` | CREATE, UPDATE, DELETE, APPROVE, REJECT, OVERRIDE, EXPORT, ACCESS_DENIED, WORKFLOW_TRANSITION, NOTIFICATION_SENT, INTEGRATION_EVENT, LOGIN, LOGOUT |
| object_type | text | e.g. application, return, complaint |
| object_id | text | |
| before_value | jsonb | UPDATE/OVERRIDE/DELETE only |
| after_value | jsonb | CREATE/UPDATE/APPROVE/etc. |
| justification | text | required when action_type = OVERRIDE |
| ai_model_version | text | nullable |
| ip_address | inet | from request header |
| created_at | timestamptz default `now()` | for ordering |

Tamper-proofing:
- `REVOKE UPDATE, DELETE` from authenticated/anon/service_role.
- Trigger `prevent_compliance_audit_mutation` raises on UPDATE/DELETE (even service_role inside SQL).
- Trigger `enforce_override_justification` rejects rows where `action_type='OVERRIDE'` and justification is null/empty.
- Trigger `enforce_immutable_timestamp` forces `timestamp = now()` on insert.

Grants & RLS:
```
GRANT SELECT ON public.compliance_audit_logs TO authenticated;
GRANT INSERT ON public.compliance_audit_logs TO authenticated;
GRANT ALL    ON public.compliance_audit_logs TO service_role;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
```
Policies:
- SELECT: only `super_admin`/`admin` via `public.has_role(auth.uid(), ...)`.
- INSERT: any authenticated user, but `user_id` must equal `auth.uid()` (system events go through service_role / RPC).
- No UPDATE / DELETE policies (denied).

### 2.2 New table `public.security_event_logs`

Separate stream for: access denial, failed auth, permission escalation attempts, integration failures.
Columns: `id`, `event_time` (utc), `user_id` (nullable), `event_type` (enum: ACCESS_DENIED, AUTH_FAILED, PERMISSION_ESCALATION, INTEGRATION_FAILURE), `ip_address`, `user_agent`, `target_resource`, `detail jsonb`, `created_at`. Same tamper-proof triggers and admin-only SELECT.

### 2.3 RPC helpers (SECURITY DEFINER)

- `public.log_compliance_audit(_action_type, _object_type, _object_id, _before, _after, _justification, _ai_model_version, _ip)` — resolves caller's `auth.uid()` and current top role from `user_roles`, writes the row. Enforces justification when OVERRIDE.
- `public.log_security_event(_event_type, _target_resource, _ip, _user_agent, _detail)` — admin-bypassable insert.

### 2.4 Server-side wiring (minimal, additive — does not change existing flows)

- Edge function `dispatch-notification-event`: also write `NOTIFICATION_SENT` to compliance_audit_logs after successful dispatch.
- Edge function `perform-workflow-action`: write `WORKFLOW_TRANSITION` + `APPROVE`/`REJECT`/`OVERRIDE` with before/after status snapshots.
- `RouteGuards` / `AccessDenied`: fire-and-forget call to `log_security_event('ACCESS_DENIED', route)`.
- `AuthContext` login/logout success+failure: insert LOGIN, LOGOUT, AUTH_FAILED.
- New helper `src/lib/complianceAudit.ts` exposing `logComplianceAudit(...)` and `logSecurityEvent(...)` used by override modal, export buttons, etc.

### 2.5 Override justification modal

- New `src/components/audit/OverrideJustificationDialog.tsx` (shadcn `Dialog` + textarea, min 10 chars).
- Wired into existing override touch-points (workflow override action, AI finding override): call site shows dialog, then calls `logComplianceAudit({action_type:'OVERRIDE', justification, before, after})` before persisting the override.

### 2.6 Export logging

- Central wrapper `src/lib/exportLogger.ts` → `logExport({ object_type, criteria, record_ids, format })` writes `action_type='EXPORT'`. Wire into existing CSV/PDF export buttons (`applicationsExport.ts`, reports export, etc.) — added as a call, not a refactor.

### 2.7 New page `src/pages/admin/ComplianceAuditLogs.tsx` (route `/admin/compliance-audit-logs`, label "Audit Logs")

Tabs:
1. **All Entries** — paginated table; filters: date range, user, role, action_type (multi), object_type, object_id, free-text. Row click → side drawer with full before/after JSON diff (using existing `react-diff` style component or `JsonView`).
2. **Case-Centric View** — input/select `object_id` (or `object_type + object_id`); renders single chronological timeline merging entries from compliance_audit_logs (same object) + related rows (e.g. application's related payments, returns, complaints by `metadata.application_id`). Each entry expandable to show diff and justification.
3. **Version History** — for an entity (application | pq_declaration | return | complaint), reconstructs ordered list of UPDATE entries and renders before/after per field.
4. **Security Events** — table over `security_event_logs` with filters.
5. **Exports Log** — filtered view of `action_type='EXPORT'` entries.

Each tab supports CSV export — which itself writes an EXPORT entry (dogfooded).

### 2.8 Navigation & Hub

- `src/config/navigation.tsx`: add new item `Audit Logs` → `/admin/compliance-audit-logs` (icon `ShieldCheck`), admin-only, module `settings`. Keep renamed `Activity Logs` entry above it.
- `src/pages/admin/AdminHub.tsx`: add new card "Audit Logs (Compliance)".
- `src/routes/adminRoutes.tsx`: lazy route for new page.
- `src/lib/permissionModules.ts`: add mapping `['/admin/compliance-audit-logs', 'settings']`.

### 2.9 Types

- Migration regenerates `src/integrations/supabase/types.ts`.
- New TS types in `src/types/complianceAudit.ts` for action enums.

## 3. What is NOT touched

- Existing `audit_logs` table, triggers, `log_self_audit` RPC, `useAuditLog` hook, `docs/audit-log-coverage.md` flows.
- Workflow engine, returns, complaints, payments business logic.
- All existing routes except the label rename.

## 4. Verification

- Build + lint after each migration.
- SQL: confirm UPDATE/DELETE on `compliance_audit_logs` fails as `authenticated` and `service_role`.
- Manual: trigger an override → modal forces justification → entry visible in new Audit Logs with justification populated.
- Manual: deny access to a protected admin route as non-admin → row appears in Security Events tab.
- Manual: export a CSV → row appears in Exports Log tab.
- Manual: filter case-centric view by an application id → see chronological lineage.

## 5. Out of scope (call out, do not build)

- Cryptographic hash chaining / WORM storage (can be added later as an append-only signature trigger if legally required).
- Backfilling historical events into the new compliance log.
