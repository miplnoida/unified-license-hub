# Audit Logging and Notifications — Remediation Plan

A new, independent task. It covers only the audit-log and notification findings in the workbook, at every severity. Other security items and the cancelled plan are out of scope.

## Ground rules
- No database changes: no migrations, access rules, triggers, database functions, grants or seed rows. Anything that needs one is written up in the "Database requirements" list and left undone.
- Workflows, permissions, payments, registration, licensing and returns behave as they do today.
- Reuse the existing audit helpers (`src/lib/complianceAudit.ts`, `supabase/functions/_shared/audit.ts`) and the existing notification dispatcher. No new logging or notification system.
- Work proceeds one phase at a time, with tests after each phase. An item is marked Fixed only with evidence.

## Status of the 31 audit and notification findings (checked against current code and live setup)

| Status | Count | Findings |
|---|---|---|
| Already resolved (needs retest only) | 2 | RISK-035, RISK-036: correspondence reply and thematic-review closure events now have active configurations |
| Partly resolved | 2 | RISK-008/009: 20 of the 31 "unconfigured" events are now configured and active; 11 remain unconfigured |
| Code fix planned | 8 | RISK-007, 011, 024, 025, 030, 037 (app side), 049 (partial), 056 |
| Needs database change (documented only) | 14 | RISK-005, 006, 021, 022, 023, 026, 028, 029, 031, 032, 033, 034, 045, 050, 051 |
| Needs a decision or setup | 4 | RISK-010 (SMS provider), 038 (job schedules), 039 (alerting), 052 (support tickets) |
| To verify first | 1 | RISK-027 (document view/download logging) |

```text
Phase 1: Audit (code fixes) --> tests --> Phase 2: Notifications (code fixes) --> tests --> Phase 3: Full regression and report
```

## Phase 1 — Audit logging

**Verified issues and code-only fixes**

| ID | Finding (verified) | Fix |
|---|---|---|
| RISK-007 | A failed sign-in is logged from the browser while the user is still signed out. The logging function only accepts signed-in callers, so these events are silently lost. | Send failed sign-ins to a small server function that records them with the existing security-event helper. It records the email, a reason code, the time, IP address and browser, but never the password. The login screen and messages are unchanged. |
| RISK-024 | The audit export filters the compliance and security logs on a `table_name` column that does not exist. | Use the real columns: `entity_type` (audit log), `object_type` (compliance log), `module` (security log). The date filter is set per log type. |
| RISK-025 | The export stops silently at 20,000 rows. Cells starting with `=`, `+`, `-` or `@` can run as formulas in Excel. | Fetch in pages of 1,000 up to a safety limit. Mark the job "truncated" if the limit is reached, and show that in the export screen. Prefix risky cells with an apostrophe. |
| RISK-030 | In server functions, audit write failures are only printed to the log. | Keep this best-effort by default (so no business action breaks). Add an optional "required" mode that returns an error. It is switched on only for export, which is audit-only by nature. |
| RISK-049 (partial) | Audit rows written from the browser lack IP address and browser details. Edge rows do not say which function wrote them. | Browser rows already resolve IP and browser for security events; do the same for compliance audit rows. Edge rows add `source_function`. |
| RISK-027 | Logging of document views and downloads was not found yet. | Verify the signed-link and download paths first. If none log, call the existing export/access audit helper when a signed link is issued. |

**Database-dependent blockers (documented, not done):** RISK-005 (who can read the audit log), 006/021/022/028/029/031–034/051 (wider trigger coverage), 023 (audit failures should block the action), 026 (config changes outside the logged path), 050 (personal data in full row copies).

**Phase 1 tests**
- Unit tests:
  - Export column mapping for each log type.
  - CSV formula escaping.
  - Pagination and the truncated flag.
  - Failed-login payload never includes a password.
- Browser checks:
  - A wrong-password attempt creates one AUTH_FAILED entry visible under Security Events.
  - Export with a module filter returns rows for each log type.
  - Normal sign-in, the Audit Logs, Compliance Audit Logs and Case Audit Trail screens, and export download still work.

## Phase 2 — Notifications

**Verified issues and code-only fixes**

| ID | Finding (verified) | Fix |
|---|---|---|
| RISK-009 | Events with no active configuration are skipped, with only a server log line as evidence. | Record each skip in the existing dispatch log as `skipped / no_active_configuration`. Show a "Events without configuration" list on the Notification Channel Health page. No event is configured automatically. |
| RISK-011 | `payment.failed` is defined, but only an audit row is written on failure. No notification is sent. | When a payment attempt fails, call the existing dispatcher with `payment.failed`. It runs only if an admin has configured that event, so existing payment behaviour is unchanged. |
| RISK-056 | Placeholder values are inserted into HTML emails without escaping. | Escape values in the HTML body only. Subjects, plain text and in-app bodies stay as they are. Regression test: existing templates render identically for normal values. |
| RISK-037 (app side) | Failures when queueing a notification are not visible. | Surface the existing failed and dead-letter records on the Channel Health page. The sweep job is unchanged. |

**Configuration or decision blockers (no code fix):**
- **RISK-008/009, setup gap:** these 11 events have no configuration. An admin can create each one in the Notification Events screen.
  - `application.remark_added`, `complaint.triage.overridden`, `complaint_jurisdiction_more_information_required`, `complaint_triage_completed`
  - `entity.resolution.escalated`, `entity.resolution.evidence_requested`, `entity.resolution.returned`
  - `prudential.early_warning`, `registration.withdrawn`, `return.workflow_step_escalated`, `workflow.sla_breached`
- **RISK-010:** no SMS provider is set up. The app already records SMS as "provider not configured", which is honest. This needs a choice of provider or a formal decision not to support SMS.
- **RISK-038:** reminder and SLA sweeps depend on scheduled jobs. Their schedules could not be read with current access, so this is marked To verify. A list of the sweep functions that need a schedule will be provided.
- **RISK-039** (alerts for critical security events) and **RISK-052** (support-ticket notifications) both need new database triggers.
- **RISK-045:** a signed-in user can directly call the function that queues notifications. Revoking that right is a database change.

**Phase 2 tests**
- Unit tests:
  - Placeholder escaping.
  - The skip is recorded.
  - `payment.failed` is sent only on the failure path.
- Server function tests for the dispatcher using a test event.
- Browser checks:
  - The Channel Health page lists unconfigured events.
  - A configured test event still sends an in-app notification, and its email appears in Notification History.
  - The payment success path sends exactly the notifications it sends today.

## Phase 3 — Final regression and report
- Full unit test suite, typecheck and build. Existing browser suites for sign-in, applications, payments, complaints and returns.
- Confirm that no workflow, permission or payment outcome changed. Compare before and after on the same test actions.
- Update the workbook's "Missing Impl & Risks" sheet:
  - Mark each item Fixed (with evidence), Pending, Blocked (database or decision) or Unverified.
  - Add a "Database requirements" sheet.
  - Save it as a new version of the workbook.

## Database requirements (documented only, not implemented)
For each item: exact objects affected, the change needed, dependencies and impact.
- `audit_logs` read access limited to an audit permission (RISK-005).
- The generic audit trigger attached to the listed tables (RISK-006, 021, 022, 028, 029, 031–034, 051).
- Required versus best-effort audit write mode (RISK-023).
- Config tables writable only through the logged path (RISK-026).
- Masking personal data in audit row copies (RISK-050).
- Revoking direct access to the notification-queue function (RISK-045).
- A trigger that sends alerts for critical security events (RISK-039).
- Support-ticket notification events (RISK-052).

## Technical notes
- Server function changes:
  - `audit-export`
  - `dispatch-notification-event`
  - `_shared/audit.ts`
  - one new small function for failed sign-ins: it uses service access and never accepts or logs passwords
- Browser changes:
  - `AuthContext` (failed sign-in call only)
  - `complianceAudit.ts`
  - `NewApplication.tsx` (payment-failure branch only)
  - Notification Channel Health page
  - Audit Export page (truncated badge)
- No files under `supabase/migrations`. No changes to grants or access rules.
