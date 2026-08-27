# Consumer Complaint — Complainant Notification Integration

Date: 2026-08-27. Scope: complainant-facing in-app + email notifications across the
Market Conduct / Consumer Complaint lifecycle, using the existing centralized
notification architecture (`notification_event_configs`, `notification_enqueue_event`,
`notification-event-queue-worker`, `dispatch-notification-event`).

## 1. Confirmed failure points (before the fix)

| # | Failure | Evidence |
|---|---------|----------|
| 1 | Complainant-facing events resolved **zero recipients**. Configs used `{payload_user: complainant_id}` + `{custom_email: complainant_email}`; every complaint in the system has `complainant_id IS NULL` (public intake), and the dispatcher's `custom_email` rule only read a literal `rule.email`, ignoring the seeded `rule.key`. | `complaint.acknowledged` / `complaint.outcome_released` queue rows marked `dispatched` with **no** `notification_dispatch_log` rows. |
| 2 | No `complainant` recipient concept existed, so public (email-only) complainants were unaddressable by any rule. | `resolveRecipients` had no complainant branch. |
| 3 | Events emitted by the governed jurisdiction RPC (`complaint_jurisdiction_accepted`, `_partially_accepted`, `_referred`, `_out_of_scope`) had **no configuration row**, so they died as `no_template`. | `notification_event_configs` held no jurisdiction keys. |
| 4 | No emission at all for: information requested from the complainant, redress completion, complaint reopened. | No enqueue call or trigger for those transitions. |
| 5 | A zero-recipient dispatch produced no record, so the failure was invisible. | No `skipped` rows for the affected events. |
| 6 | SMTP itself was healthy — internal events were `SENT_TO_PROVIDER`. The defect was recipient resolution only. | Dispatch log for internal events. |

## 2. Changes

**Dispatcher (`dispatch-notification-event`)**

- New canonical `complainant` recipient rule backed by `complainantRecipients()`:
  registered complainant user id (payload, then `complaints.complainant_id`) →
  `complaints.email` → `complaint_parties.email` where `party_role = 'complainant'`.
  Public complainants are emitted as `email:<address>` (the existing direct-email
  mechanism). No placeholder profiles are ever created.
- `custom_email` now supports both a literal address and a payload key
  (`{"type":"custom_email","key":"complainant_email"}`).
- Zero-recipient events now write an explicit `notification_dispatch_log` row with
  `status = skipped`, `error = no_recipient_resolved`, so a silent drop is impossible.

**Configuration (migration)**

- `complaint.acknowledged`, `complaint.complainant_update`, `complaint.outcome_released`
  → `[{"type":"complainant"}]`.
- `complaint.closed`, `complaint.resolved`, `complaint.investigation_started`,
  `complaint.escalated_to_enforcement` → the legacy complainant `payload_user` rule is
  replaced by `complainant`; regulator/licensee rules are untouched.
- New complainant-facing configs (in-app + email, consumer-safe wording):
  `complaint_jurisdiction_accepted`, `complaint_jurisdiction_partially_accepted`,
  `complaint_jurisdiction_referred`, `complaint_jurisdiction_out_of_scope`,
  `complaint.information_requested`, `complaint.redress_communicated`,
  `complaint.reopened`.

**Emission (migration, idempotent `notification_enqueue_event` suffixes)**

- `trg_complaint_info_request_notify` on `complaint_jurisdiction_info_requests` (insert,
  complainant-directed only) → `complaint.information_requested`.
- `trg_complaint_redress_notify` on `complaint_redress` (status → `COMPLETED`/`VERIFIED`)
  → `complaint.redress_communicated`.
- `trg_complaint_reopen_notify` on `complaints` (closed/resolved → open)
  → `complaint.reopened`.
- Received, assigned, outcome, closed/resolved and jurisdiction decisions already emit
  from the existing complaint trigger and the governed jurisdiction RPC — reused as-is.

## 3. Lifecycle coverage

| Lifecycle point | Event key | Emitter |
|---|---|---|
| Received / acknowledged | `complaint.acknowledged` | complaints insert trigger |
| Jurisdiction accepted / partial / referred / out of scope | `complaint_jurisdiction_*` | `complaint_jurisdiction_decide` |
| Information requested from complainant | `complaint.information_requested` | info-request trigger (new) |
| Investigation opened | `complaint.investigation_started` | status transition |
| Progress update | `complaint.complainant_update` | existing update path |
| Outcome released | `complaint.outcome_released` | complaints status trigger |
| Redress completed | `complaint.redress_communicated` | redress trigger (new) |
| Closed / resolved | `complaint.closed`, `complaint.resolved` | complaints status trigger |
| Reopened | `complaint.reopened` | reopen trigger (new) |

## 4. Privacy

Complainant templates carry only case reference, lifecycle state and a public
tracking CTA (`/complaints/track`). No investigator notes, staff comments, evidence,
triage scores or internal rationale are rendered. RFIs directed at the licensee
(`complaint.rfi_issued`, `complaint.rfi_response_submitted`) remain
regulator/licensee-only and were not repointed at complainants. Internal-only actions
(triage, assignment, priority change, RFI approvals) still resolve staff recipients only.

## 5. Verification (live)

Enqueued `complaint.acknowledged` for CMP-2026-000121 (public, email-only complainant,
`complainant_id IS NULL`) with suffix `verify-complainant-resolver-2`.

- Queue row `f2041a25-…`: `status = dispatched`, `attempts = 0`, no error.
- `notification_dispatch_log`: email row to `rohit@mishainfotech.com`,
  `status = sent`, `communication_state = SENT_TO_PROVIDER`.
- In-app row for the same event: `SUPPRESSED / direct_email_in_app_unsupported` —
  correct and truthful, a public complainant has no portal inbox.

Regression guard: `src/test/complaintComplainantNotifications.test.ts`.
