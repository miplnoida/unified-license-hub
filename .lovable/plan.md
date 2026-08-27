# Complainant notifications — fix the broken recipient path and complete the lifecycle events

## Verified current state (queried this turn)

- SMTP is configured and enabled in site settings; recent conduct emails reached the provider (`SENT_TO_PROVIDER`). Older `DEAD_LETTER` rows carry `authentication`/`bounce` categories from before the current credentials.
- Complainant-facing events already exist and are active: `complaint.acknowledged`, `complaint.complainant_update`, `complaint.outcome_released` (module `conduct`), plus `complaint.closed`, `complaint.resolved`, `complaint.investigation_started`, `complaint.escalated_to_enforcement` (module `complaint`), and internal ones (`conduct_complaint_created`, `complaint.assigned`, RFI events).
- Events are being emitted and processed: 20 `complaint.acknowledged`, 11 `complaint.outcome_released`, 2 `complaint.complainant_update` queue rows, all `status = dispatched`, no queue errors, and every payload contains both `complainant_email` and `complainant_id`.
- `notification_dispatch_log` contains **zero** rows for those three event keys (internal keys do have rows), and `notifications` has zero rows for them.
- In sampled payloads `complainant_id` is null and no matching profile exists — these are public, email-only complainants.
- Their configured recipient rules are `{"type":"payload_user","key":"complainant_id"}` and `{"type":"custom_email","key":"complainant_email"}`. In `dispatch-notification-event` the runtime `custom_email` branch reads only `rule.email`; it ignores `key`. So both rules resolve to nothing.

**Root cause: the complainant recipient never resolves.** `payload_user` finds no user (public complainant) and the `custom_email` rule shape used by the seeded configs (`key`) is not understood by the dispatcher, which only supports a literal `email`. No recipient → no dispatch, no log, no email. Not an SMTP, template or preference fault.

## Implementation

### 1. One reusable complainant resolver in the dispatcher

In `dispatch-notification-event`:

- Add a `complainant` recipient rule type. It resolves, in order: a registered complainant user id from the authoritative complaint record/payload, otherwise the stored complainant email emitted as a `email:<address>` direct recipient (the mechanism already used for registration emails).
- Extend the existing `custom_email` branch to accept `key` (payload lookup) in addition to a literal `email`, so the already-seeded configs work and nothing else regresses.
- Record an explicit no-recipient outcome (skipped reason) when neither a user nor an email is available, so silent nothing-happened cannot recur.

No email resolution logic is added to complaint hooks, components, RPCs or triggers.

### 2. Point complainant configs at the resolver (migration)

Update recipient rules of the complainant-facing configs to `[{"type":"complainant"}]`, keeping internal events (`conduct_complaint_created`, `complaint.assigned`, RFI approval/response) untouched so audiences stay separated. In-app stays configured but only materialises when the complainant is a registered user; email always applies.

### 3. Complete the lifecycle event catalogue (migration, seed-based)

Reuse the existing seeding helper so everything stays source-controlled and admin-editable. Confirm-then-add for each of: received/acknowledged, information requested (complainant RFI dispatch), jurisdiction accepted / partially accepted, referred / outside jurisdiction, investigation opened (optional, inactive by default), outcome issued, redress communicated, closed, reopened. Existing keys are reused rather than duplicated; only genuinely missing ones are seeded, with `module = conduct`, severity/category, `system_required` for receipt, information request, outcome and closure.

### 4. Emit from governed domain operations only

Add `notification_enqueue_event` calls (post-commit, failure-safe, never rolling back the complaint transaction) at the governed operations that currently have no complainant emission — jurisdiction decision, complainant RFI dispatch, closure, reopen — passing only `event_key`, `entity_type`, `entity_id` and a complainant-safe payload. Idempotency suffixes: RFI id, outcome version, closure review id, reopen count. Internal actions (assignment, triage notes, QA approval, task completion, evidence review, AI analysis, workflow forwarding) emit nothing to the complainant.

### 5. Privacy of payloads

Payloads carry only complainant-safe fields: complaint number, complainant name, date, entity name where appropriate, public decision/outcome/redress summary, due date, portal/response link, regulator name and contact. No investigator notes, internal step names, staff comments or other-party addresses. Recipient addresses stay masked in logs per the existing redaction policy.

### 6. Tests

Extend the notification test suites (pgTAP under `supabase/tests/notifications/` plus Vitest contract tests over the dispatcher source) covering the 14 required cases: public complainant, registered complainant, missing email, RFI single-send with retry, jurisdiction accepted, referred, internal-only actions producing no complainant email, outcome issued, QA-approved producing none, single closure email, SMTP disabled recording `smtp_not_configured`, inactive template behaviour, unresolved token failure, and duplicate event replay.

### 7. Verification report

After implementation, report: confirmed root cause, event catalogue, registered vs public resolution, event → config → channels table, PASS/FAIL per test, and one end-to-end trace (domain event → queue → template → recipient → dispatch log → provider result) with masked addresses, plus remaining limitations.

## Technical notes

- Touched: `supabase/functions/dispatch-notification-event/index.ts`, one migration for configs/seeds, migrations for the domain emission points, notification tests.
- Not touched: SMTP architecture, delivery-state semantics (`SENT_TO_PROVIDER` is never upgraded to `DELIVERED`), preference subsystem, Market Conduct workflow/UI behaviour, licensing/prudential/F&P/correspondence notifications.
- Historic `DEAD_LETTER` rows are left as-is; they are pre-credential-fix legacy.
