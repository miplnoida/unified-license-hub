# Audit Logging and Notifications — Corrected Remediation Plan

This is an independent task covering only audit logging and notifications. The cancelled security plan is not resumed. Nothing changes in the database: no migrations, access rules, grants, triggers, stored procedures or data. Anything that needs one of those is marked **Blocked** and described in the Database Requirements section.

Execution: after approval, **Phase 1 only** is implemented and tested, and its results are reported. Phase 2 starts only after a separate approval.

## 1. Classification — every finding exactly once (33 findings)
These are the 30 findings the workbook tags Audit or Notification, plus 3 tagged Security that concern audit or notification behaviour (RISK-045, 056, 059).

| Status | # | Findings |
|---|---|---|
| Resolved, retest only | 2 | 035, 036 |
| Partially resolved | 4 | 008, 009, 027, 049 |
| Code fix planned | 3 | 024, 025, 056 (056 only if baseline proves safe) |
| Blocked: needs a database change | 21 | 005, 006, 007, 011, 021, 022, 023, 026, 028, 029, 031, 032, 033, 034, 037, 039, 045, 050, 051, 052, 059 |
| Blocked: decision or requirement | 2 | 010 (SMS provider decision), 030 (requirement 6 forbids changing audit-failure behaviour) |
| Unverified | 1 | 038 (scheduled-job settings cannot be read with current access) |
| **Total** | **33** | |

## 2. Verified evidence and reasons, per finding

**Audit**
- **005**: the audit-log read rule uses the general staff check. Blocked (access rule).
- **006, 021, 022, 028, 029, 031–034, 051**: the generic audit trigger is attached to a limited set of tables. Blocked (trigger).
- **007**: a failed sign-in is logged from the browser while the user is signed out. The logging function only accepts signed-in callers, so these events are lost.
  - A secure fix needs trusted attribution and lasting rate limits, which need a database table or function.
  - A server-memory limiter alone is not strong enough.
  - Blocked; no new public endpoint will be added.
- **023**: whether audit failures should block the action is decided inside database functions. Blocked.
- **024**, verified in the database: the export filters on `table_name`, which does not exist in two of the three logs. Correct columns:
  - `audit_logs.entity_type`
  - `compliance_audit_logs.object_type`
  - `security_event_logs.module`
  - all three have `created_at`
- **025**, verified: the export caps at 20,000 rows. The logs already hold more: audit log 25,516, compliance log 74,366, security log 792. So today's exports of the two larger logs are silently incomplete.
  - The CSV writer does not neutralise cells starting with `= + - @`.
  - The export job record already has a `filters` field that can hold a "truncated" note, so no database change is needed.
- **026**: config tables can be written outside the logged path. Blocked (access rule).
- **027**: versioned documents write a "download" entry when a signed link is created. That proves the link was **issued**, not that the file was viewed or downloaded.
  - Today the log holds 0 download rows; only upload and version-created rows exist. The insert may be blocked by access rules.
  - Other file paths (attachments, payments, correspondence, F&P evidence, registration files) issue links without logging.
  - Real view or download evidence needs storage access logs or a server proxy. That part is Blocked.
  - Phase 1 only verifies why the existing insert yields 0 rows and reports it. Labels and behaviour are not changed.
- **030**: edge audit writes stay best-effort. Requirement 6 rules out a change, so this is Blocked and documented.
- **049**: browser security events already capture IP address and browser; browser compliance-audit rows do not. Code fix: add the same IP and browser values to browser compliance rows (metadata only). System-actor labelling inside triggers stays Blocked.
- **050**: full row copies in audit records may include personal data. Blocked (trigger).
- **059**: any signed-in user can call the security-event logging function. Blocked (grant).

**Notifications**
- **008**: 5 enforcement events are now configured and active, so the configuration side is resolved. Delivery needs a retest.
- **009**: of the 31 events the workbook flagged, 20 are now configured and active; 11 are still not configured.
  - When an event has no configuration, the dispatcher returns "skipped" without writing to the delivery log.
  - The delivery log already accepts the `skipped` status, and the dispatcher already writes "skipped – no recipient" rows through the same service access. So a "skipped – no active configuration" row is supported with no database change.
- **010**: no SMS provider exists; the app honestly records "provider not configured". Needs a decision.
- **011**: `payment.failed` is configured and active, but nothing sends it. The browser cannot call the dispatcher, which accepts only background jobs.
  - The only browser-reachable path is the database queueing function, and that is the access RISK-045 says should be removed.
  - Blocked; payment code is not touched.
- **035, 036**: the configurations exist and are active. Retest only.
- **037**: notification queueing failures are swallowed inside a database function, so nothing is recorded for the app to show. Blocked.
- **038**: scheduled-job settings are not readable with current access. Unverified.
- **039, 052**: alerts for critical security events and support-ticket notifications need new triggers. Blocked.
- **045**: signed-in users can call the notification-queue function directly. Blocked (grant).
- **056**: placeholder values are inserted into HTML email bodies unescaped. There are 202 email templates.
  - Escaping changes output only for values containing `& < > " '`.
  - It is applied only if the baseline shows no variable is meant to carry HTML; otherwise it stays Blocked.

## 3. Phase 1 — Audit Logging (implemented after approval)

**Baseline first**
- Record row counts and a sample export for each log type with no filter, with a module filter and with a date range. These capture today's behaviour, including the silent 20,000-row cap.
- Record what one browser compliance-audit row and one security-event row contain today.
- Read-only check of why `document_action_logs` has no download rows (RISK-027).

**Exact file changes**
- `supabase/functions/audit-export/index.ts` (024, 025):
  - Use the correct filter column per log.
  - Page through rows in batches of 1,000, ordered by `created_at` then id, up to a stated safety limit.
  - If the limit is reached, write `truncated: true`, the total available and the exported count into the job's `filters`.
  - Neutralise formula-leading cells.
  - The download path and access check are unchanged.
- `src/pages/admin/AuditExport.tsx` (025): show a "Truncated — X of Y rows" badge when the job says so. No other screen changes.
- `src/lib/complianceAudit.ts` (049): add IP address and browser to compliance-audit metadata, using the existing resolver. The call signature and failure handling are unchanged.
- New tests:
  - `src/test/auditExportMapping.test.ts`: column map, CSV neutralisation, pagination and truncation.
  - `src/test/complianceAuditMetadata.test.ts`: the metadata contains IP and browser and never a password or token.

**Phase 1 tests and evidence**
- **Unit tests** above, plus the full unit test suite and typecheck.
- **Edge function tests** for `audit-export`:
  - A module filter on each log type returns only matching rows.
  - An export larger than 20,000 rows of the compliance log returns everything up to the limit, or reports truncation.
  - An unauthorised caller is still refused.
- **Browser checks:**
  - The Audit Export screen shows correct counts.
  - The downloaded file opens with formulas neutralised.
  - The Audit Logs, Compliance Audit Logs, Case Audit Trail and Security Events screens are unchanged.
  - Sign-in, a sample application save and a document upload behave exactly as in the baseline.
- **Report:** before and after for each item, with findings marked Fixed only where tests reproduce the evidence.

## 4. Phase 2 — Notifications (requires separate approval)

**Baseline first**
- Render all 202 email templates with their stored sample data and save the output.
- Record the delivery-log rows for one configured test event and one unconfigured event key.

**Exact file changes**
- `supabase/functions/dispatch-notification-event/index.ts`:
  - **009:** when no active configuration exists, insert one `skipped / no_active_configuration` row, mirroring the existing no-recipient insert, with a unique dedupe key. The response is unchanged.
  - **056:** escape placeholder values in HTML email bodies only, and only if the baseline shows no variable carries intended HTML.
- New tests:
  - `supabase/functions/dispatch-notification-event/render_test.ts`: escaping cases, plus identical output for every baseline template with normal values.
  - `src/test/notificationSkipRecord.test.ts`: the shape of the skip record.

**Phase 2 tests**
- The configured test event still delivers in-app and email notifications, and they appear in Notification History.
- An unconfigured event leaves exactly one skipped row.
- All 202 templates render byte-identical for normal values.
- Retest RISK-008, 035 and 036 with TEST events.

## 5. Phase 3 — Final regression
- Full unit suite, typecheck and build.
- Existing browser suites for sign-in, applications, payments, complaints, returns and AML.
- Compare against the baselines from Phases 1 and 2.
- Update the workbook as a new version. Each of the 33 findings gets a status (Fixed with evidence, Partially fixed, Blocked or Unverified) and a reason.

## 6. Database requirements (documented only; not executed or staged)

| Finding | Object | Required change | Dependencies and impact |
|---|---|---|---|
| 005 | Read rule on `audit_logs` | Allow reads only with an audit permission | Audit Logs screen and audit export; staff without the permission lose access |
| 006, 021, 022, 028, 029, 031–034, 051 | Generic audit trigger | Attach it to the listed tables | Larger audit volume; check bulk-job speed |
| 007 | New rate-limit table plus a logging function for failed sign-ins (anonymous, rate-limited, IP-attributed) | Create and grant to anonymous callers safely | Sign-in screen calls it; abuse limits required |
| 011 | Payments trigger or function | Emit `payment.failed` when a payment fails | Payment flow; must not affect payment status |
| 023, 030 | Audit write functions | A defined required versus best-effort policy per action | Could block business actions; needs a business decision |
| 026 | Config tables | Writes only through logged functions | Admin config screens |
| 037 | `notification_enqueue_event` | Record failures instead of swallowing them | Every notification-emitting trigger |
| 039 | `security_event_logs` | Notification trigger for critical events | Needs a notification configuration |
| 045, 059 | Function grants | Remove signed-in users' direct access | App code paths that call them must move to server-side |
| 050 | Audit trigger | Mask personal-data columns | Audit readability |
| 052 | Support tickets | Notification events and triggers | Support module |

Also recorded: `notification_dispatch_log` currently grants anonymous and signed-in users full table rights. Its access rules limit what they can actually do, but these grants should be reduced. Not changed here.
