
# Unified License Hub — Architecture Analysis Report (Phase 1 Pre-Read)

Read-only survey. No files changed, no migrations proposed. Everything below is intended as input for scoping Phase 1.

---

## 1. Current Architecture Overview

**Stack:** React 18 + Vite + TypeScript, TailwindCSS + shadcn/ui, TanStack Query, React Router, Lovable Cloud (Supabase) backend with Postgres, RLS, Edge Functions (Deno), Storage, pg_cron.

**High-level shape**

```text
Browser (React SPA)
  ├── Providers: QueryClient → SiteSettings → Auth → Regulator → Ppoc → ActiveSector
  ├── Router: public / dashboard / admin / settings / returns route groups
  ├── Guards: ProtectedRoute → RegistrationApprovalGate → ModuleRoute/PortalRoute/AdminRoute
  ├── Data: TanStack Query hooks over supabase-js (RLS-enforced)
  └── Realtime: Supabase channels for in-app notifications
        │
        ▼
Supabase
  ├── ~140 tables, RLS on all, has_role() SECURITY DEFINER pattern
  ├── 30+ Edge Functions (workflow engines, notifications, reports, sweeps)
  ├── pg_cron for license reminders + notification failure sweep
  └── Storage buckets: secure-documents, license-certificates, payment-documents, branding-assets, avatars
```

**Domain surfaces:** applications, registrations, licenses, returns/compliance, forms, workflows/approvals, payments/fees, documents, notifications, reports, audit, RBAC, master data, complaints, supervisory/enforcement.

**Portal audiences** (resolved by `useEffectivePortalContext` from Auth + Ppoc): internal (super_admin/admin/officer/analyst/viewer), licensee (primary + PPOC), applicant, pre-licensee — each with a different dashboard and permission surface.

---

## 2. Existing Reusable Modules (High Value — Reuse First)

### Frontend contexts / hooks
- **AuthContext** — session, 2FA, forcePasswordChange, periodic re-hydrate.
- **RegulatorContext / PpocContext / ActiveSectorContext / SiteSettingsContext** — multi-tenant scoping.
- **useEffectivePortalContext + `lib/effectiveRole.ts`** — canonical audience resolver.
- **useUserDynamicPermissions (`hooks/usePermissions.ts`)** — dynamic RBAC (hasPermission / hasModuleAccess / canAccessPath).
- **useApiQueries** — generic paginated Supabase queries + `useTableMutation`.
- **useWorkflowEngine, useWorkflowVersions, useWorkflowSLA, useStepActions, useActionNotifications, useStepEntryNotifications** — full workflow toolkit.
- **useAuditLog** — client-side audit writes via `log_self_audit` RPC.
- **useNotifications** — realtime in-app inbox.
- **useFormTemplates / useForms / useMasterData** — form + master-data infrastructure.

### Frontend libs / services
- **`lib/workflowService`, `workflowApprovalResolver`, `workflowActionFilter`, `workflowValidation`, `workflowTemplateSnapshot`, `workflowSlaResolver`, `returnWorkflowResolver`, `registrationWorkflowClient`** — full workflow client stack.
- **`lib/secureFileUpload` + `lib/documentVersioning`** — MIME/size validation, signed URLs (5 min), versioned upload with `document_groups` / `document_versions` / `document_action_logs`.
- **`lib/notificationEvents` (`dispatchNotificationEvent`)** — thin client for the unified dispatcher; only correct way to fire notifications.
- **`lib/permissionModules` + `permissionRegistry`** — route↔module map, module→actions/menus registry.
- **`lib/portalAccess`, `registrationAccess`, `authHelpers`, `complianceAudit`** — access gates and audit primitives.
- **`lib/safeEval`, `booleanExpression`, `formDiff`, `formRows`, `formStorage`, `formFileUpload`, `fieldTypeChange`** — form-engine primitives.

### Frontend UI
- **Layout:** `DashboardLayout`, `Sidebar` (permission-filtered), `Header`, `RegulatorSwitcher`, `LicenseeSwitcher`, `ActingOnBehalfOfBanner`.
- **Auth/access:** `PermissionGate`, `ModuleGate`, `ProtectedRoute`, `PortalRoute`, `ModuleRoute`, `AdminRoute`, `SettingsRoute`, `AccessDenied`, `AuthLoadingScreen`, `ErrorBoundary`.
- **Shared primitives:** `RowActionsMenu`, `DataTableShell`, `PageHeader`, `AttachmentList`, `LicenseStatusBanner`, `RichLabel`.
- **Form engine:** `FormRenderer` (dynamic renderer — conditionals, calc fields, versioned document uploads, multi-step) + full `form-builder/*` designer + `registration-builder/*`.
- **Workflow UI:** `WorkflowPanel` (application), `WorkflowVersionPanel`, `ActionNotificationsEditor`, `StepEntryNotificationsEditor`, `ApproverConfigEditor`, `StepActionsEditor`, `SlaIndicator`, `WorkflowActionPreviewDialog`.
- **Documents:** `VersionedDocumentUploader`, `DocumentGroupList`, `DocumentVersionHistoryDialog`.

### Backend edge modules (`supabase/functions/_shared/*`)
- **`audit.ts`** — `logComplianceAudit` / `logSecurityEvent` via SECURITY DEFINER RPCs. Use in every new edge function.
- **`cors.ts`** — `handleCorsPreflight` / `buildCorsHeaders`.
- **`email-layout.ts`** — `renderBrandedEmail` + `stripUnresolvedTemplateTokens`.
- **`report-generator.ts`** — shared between `generate-report` and `run-scheduled-reports`.
- **`return-notification-payload.ts`** — reusable return payload assembler.

### Backend engines
- **Workflow engines** (`perform-workflow-action`, `perform-return-workflow-action`, `perform-registration-workflow-action`, `perform-license-action`) — all identical shape: JWT auth → RPC (`perform_*_workflow_transition`) → sig persistence → `dispatch-notification-event`.
- **`dispatch-notification-event`** — sole authorized path to fan out notifications (in-app + email, dedupe, template render).
- **`send-notification`** — SMTP transport (Nodemailer + site_settings config).
- **`process-queue`** — generic job queue for email/report/file jobs.
- **`generate-license-certificate`, `generate-report`, `run-scheduled-reports`, `notification-retry`, `notification-failure-sweep`, `license-expiry-reminders`, `overdue-returns-sweep`**.

### Polymorphic schema (entity_type / entity_id) — reuse for any new entity
`workflow_instances`, `approval_actions`, `approval_workflows`, `document_groups`, `document_versions`, `file_uploads`, `form_responses`, `payments`, `notifications`, `notification_dispatch_log`, `compliance_audit_logs`.

---

## 3. Components / Modules That MUST NOT Be Duplicated

Adding a parallel version of any of these has caused (or will cause) drift, RLS bypass, or audit gaps. Extend in place.

- **`supabase/integrations/supabase/client.ts`** — auto-generated, never edited.
- **`AuthContext`** — do not create a second session source; hydrate via `authHelpers.fetchPlatformUser`.
- **Route guards** (`ProtectedRoute`, `RegistrationApprovalGate`, `PortalRoute`, `ModuleRoute`, `AdminRoute`, `SettingsRoute`) — new protected routes must compose these, not reimplement session/permission checks.
- **`usePermissions` / `PermissionGate` / `ModuleGate`** — the only correct RBAC gate. Do not re-check via `user.role === 'admin'`.
- **`FormRenderer` + `form-builder`** — the only dynamic form engine; new form UIs must render through it, not through bespoke JSX.
- **`WorkflowPanel` (applications), `ReturnWorkflowPanel`** — canonical workflow UX (Accordion + SLA + history + signature dialog). New entity workflows must mirror this UI, not build a new one.
- **Workflow edge engines** — never write approval transitions from the client. All state changes go through the `perform-*-workflow-action` edge fn → RPC.
- **`dispatchNotificationEvent` / `dispatch-notification-event`** — do not send notifications by direct insert into `notifications` or by calling `send-notification` from the client. Register a new `notification_event_configs` row instead.
- **`secureFileUpload` + `documentVersioning`** — do not upload to Storage directly; both AV metadata and versioning depend on this path.
- **`_shared/audit.ts` + `log_compliance_audit_as_actor` RPC** — do not insert into `compliance_audit_logs` directly from an edge function.
- **`has_role()` SECURITY DEFINER** — do not put role checks directly in RLS `USING` clauses (recursion risk).
- **`user_roles` / `user_dynamic_roles`** — never store roles on `profiles`.
- **`site_settings` (SMTP, branding, license expiry, certificate signatory)** — single source of truth; do not fork configuration into new tables.

---

## 4. Missing Reusable Platform Services

Genuine platform-level gaps identified across frontend and backend.

### Frontend
1. **Unified Timeline / Activity Feed component** — three inconsistent implementations (`StatusTimeline`, `ApplicationTimeline`, `ActivityTab`) each hard-coded to applications. No `<EntityTimeline entityType entityId />` primitive; every new entity re-implements.
2. **Cross-entity comments/thread primitive** — `PaymentRemarksThread` exists only for payments; return/application/complaint comments are bespoke.
3. **`useEntityAuditLog` read-hook** — writes are unified (`useAuditLog`), reads are not; each detail page queries `audit_logs` itself.
4. **Generic Entity Detail shell** — `entity-detail/*` panels are LicenseeDetail-only; no reusable tabbed detail scaffold.
5. **Generic paginated DataTable** — `DataTableShell` is thin; ~15 pages duplicate column/filter/export code.
6. **In-app document/PDF viewer** — signed URLs open in a new tab; no inline preview.
7. **Global search / command palette** — none.
8. **Confirmation-dialog bus** — `SweetAlert2` used ad hoc; no shared destructive-confirm primitive.
9. **`FormRenderer` decomposition** — 1601 lines; not a "missing service" but a refactor lever before adding new field types.

### Backend
1. **No active SLA escalation sweep** — `sla_escalation_tiers` configured, no scheduled function consumes it.
2. **`process-queue` email handler is a stub** — real delivery bypasses the queue; queue offers no delivery guarantee.
3. **`run-scheduled-reports` has no pg_cron entry** — schedules never trigger automatically.
4. **`overdue-returns-sweep` pg_cron entry is commented out** — must be triggered externally.
5. **Fragmented audit** — `audit_logs`, `compliance_audit_logs`, `security_event_logs`, `return_audit_log`, `document_action_logs` never joined; no unified DB view.
6. **Legacy notification tables** — `return_notification_templates` / `return_notifications_log` are dead weight parallel to the unified pipeline.
7. **Two document models** — legacy flat `documents` vs versioned `document_groups`/`document_versions` coexist without a migration path.
8. **AV scan is simulated** — `file_uploads.scan_status` set to `clean` without real scanning.
9. **Open master-data policies** — `forms`, `sectors`, `sub_sectors`, `categories`, `services` have `FOR ALL USING (true)`; any authenticated user can mutate.
10. **`audit_logs` INSERT is open** — integrity relies solely on a UPDATE/DELETE-blocking trigger.
11. **`workflow_instances` SELECT is open** — instance status leaks across entities.

---

## 5. Recommended Extension Points

For any Phase-1 feature adding a new domain entity (e.g. inspection cycle, permit, enforcement dossier) with workflow + audit + notifications + documents:

1. **Workflow:** insert `approval_workflows(entity_type='<new>')`, `approval_steps`, `approval_step_actions`. Add one new edge function `perform-<new>-workflow-action` cloning the existing three; add RPC `perform_<new>_workflow_transition`. `workflow_instances` + `approval_actions` accept the new entity_type unchanged.
2. **Audit:** call `logComplianceAudit()` from `_shared/audit.ts` in the new edge function; add a DB trigger writing `compliance_audit_logs` for data-layer changes; use `useAuditLog.logAction` in the client.
3. **Notifications:** insert rows in `notification_event_configs` for `<new>.*` event keys; call `dispatchNotificationEvent(...)` from the client and `dispatch-notification-event` from edges.
4. **Documents:** use `document_groups` with `entity_type='<new>'`; UI uses `VersionedDocumentUploader` + `DocumentVersionHistoryDialog` — no bespoke storage code.
5. **Forms:** create a `form_templates` row; render via `FormRenderer`; persist via `form_responses(entity_type='<new>')`.
6. **Payments:** insert `payments` with the same polymorphic keys.
7. **RBAC:** add a permission module row + register actions in `permission_actions`; use `PermissionGate` / `ModuleGate` in UI and route via `ModuleRoute`.
8. **SLA:** insert `sla_configurations(process_type='<new>')`; wire escalation tiers (note the missing sweep — see Risks).
9. **Timeline UX:** build (or reuse when created) a unified `<EntityTimeline>` fed by `useEntityAuditLog` — this is the highest-leverage new primitive.
10. **Detail page:** use `DashboardLayout` + `PageHeader`; assemble tabs following the LicenseeDetail pattern until a generic shell exists.

---

## 6. Database Impact

Without knowing Phase-1's specific feature, the shape of typical impact is:

- **Reused as-is (no schema change):** `workflow_instances`, `approval_actions`, `document_groups`, `document_versions`, `file_uploads`, `form_responses`, `payments`, `notifications`, `notification_dispatch_log`, `compliance_audit_logs`, `sla_configurations` — extend by adding a new `entity_type` value.
- **Extended (config rows, no DDL):** `approval_workflows`, `approval_steps`, `approval_step_actions`, `approval_action_notifications`, `notification_event_configs`, `notification_templates`, `permission_modules`, `permission_actions`, `sla_configurations`, `sla_escalation_tiers`.
- **Likely new tables** for a substantive new domain entity: one core entity table (`<new>s`), optionally `<new>_versions` if versioning is required. Both must ship with `GRANT` statements and RLS policies per project convention.
- **Watch-outs:** any new external portal capability requires rows in `external_portal_role_capabilities` and a new `external_can_access_<new>()` SECURITY DEFINER function referenced by Storage RLS.

Every migration touching `public.*` must follow the mandated order — `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY`.

---

## 7. Migration Estimate (per typical Phase-1 feature)

Estimate for adding one net-new entity type with workflow + audit + notifications + documents + one form + one payment surface. Refine once Phase-1 scope is known.

| Area | Effort | Notes |
|------|--------|-------|
| Schema (1 core table + optional versioning) + RLS + GRANTs | 0.5–1 day | Follows public-schema-grants rule. |
| Workflow RPC + `perform-<new>-workflow-action` edge fn | 1–2 days | Clone of existing engines. |
| Notification event configs + templates | 0.5 day | Config-only. |
| Permission module + gates + routes | 0.5 day | Register in `permission_modules` / `permission_actions`; wire `ModuleRoute`. |
| Form template + FormRenderer wiring | 0.5–1 day | No new engine work. |
| List page + detail page (tabs, workflow panel, documents, audit) | 2–3 days | If reusable `<EntityTimeline>` and `<EntityDetailShell>` don't exist yet, +1–2 days to build them. |
| SLA config + (optional) escalation sweep | 0.5–1 day | Escalation sweep is currently missing platform-wide. |
| Tests (Vitest for guards/hooks, edge fn Deno tests) | 1 day | Existing patterns under `src/test/` and `supabase/functions/*/index_test.ts`. |
| **Total** | **~7–10 dev-days** | Excludes discovery, design, and QA. |

If Phase-1 instead builds a missing platform primitive (unified timeline, generic detail shell, generic data-table, SLA escalation sweep, unified audit view), each is a separate 2–4 day slice.

---

## 8. Risks

**Architectural**
- Fragmented audit surfaces make cross-entity reporting hard; if Phase-1 needs a "single audit trail" UX, expect scope creep to unify.
- Two document models (`documents` vs `document_groups`) — using the wrong one silently breaks version history and download audit.
- Notification event resolution is centralized but the *event key* space is a loose `string` type — misspelled keys silently fail.
- `FormRenderer` size (1601 lines) — any Phase-1 requirement for a new field type or new conditional operator risks regression across every form in the system.

**Security / RLS**
- Master-data tables with `FOR ALL USING (true)` and open `audit_logs` INSERT — a Phase-1 admin UI accidentally trusting the client is a real exposure. Tighten as part of any related work.
- Open SELECT on `workflow_instances` leaks status across entities; if Phase-1 introduces new sensitive entity types, this becomes disclosure risk.
- Simulated AV scanning — any new user-facing upload path inherits an unscanned file. Do not present `scan_status = 'clean'` as a guarantee to users.

**Operational**
- No SLA escalation sweep, no cron for scheduled reports, commented-out cron for overdue returns — anything Phase-1 promises to fire "automatically" will not fire without new pg_cron wiring.
- `process-queue` email path is a stub; if a Phase-1 feature enqueues emails through the queue it will silently no-op.
- `run-scheduled-reports` needs an external trigger today.

**Portal / RBAC**
- `PpocContext` is complex (multi-source resolution, ~500 lines, no full unit coverage). Any Phase-1 feature touching "acting on behalf of" behaviour needs careful test coverage.
- Not every action button uses `PermissionGate` — partial adoption means Phase-1 must audit newly touched pages for lingering `user.role === 'admin'` checks.
- Registration approval gate (`RegistrationApprovalGate`) intercepts pre-licensee traffic — any new pre-licensee-visible route must be added to `REGISTRATION_GATE_ALLOWLIST` or it will redirect.

**Delivery**
- Edge functions must return HTTP 200 with error body per project convention; a Phase-1 addition returning non-200 breaks existing client error UX.
- Migrations are the only path to schema changes and must include GRANTs — a missed GRANT will surface as a runtime permission error, not a build failure.

---

### Next step
Share the Phase-1 feature scope. I will refine the migration estimate, identify which of the missing platform services are prerequisites vs. deferrable, and produce a build-ready plan.
