# Audit Log Coverage

This document maps every recorded platform action to the place it is written
from. **Server-side (DB triggers / RPCs / edge functions) are the canonical
source of truth.** Frontend writes via `logAudit` are reserved for low-risk
UI events only.

All audit rows go into `public.audit_logs` via `public.write_audit(...)`,
which deduplicates the same `(entity_id, action)` pair within a 10-second
window so concurrent server + frontend writes do not produce duplicates.

## Coverage table

| Flow                          | Action name                             | Source                                                            | Metadata highlights                                  |
| ----------------------------- | --------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| Create draft application      | `application.created`                   | Trigger `tg_applications_audit` (INSERT)                          | application_number, applicant_id/email, license_type |
| Update draft                  | `application.draft_updated`             | Trigger `tg_applications_audit` (UPDATE, status unchanged, draft) | changed_fields, from_status, to_status               |
| Save form draft               | `application.form_saved`                | Frontend `NewApplication.handleFormSaveDraft`                     | template_id, template_name, version_id               |
| Complete form                 | `application.form_submitted`            | Frontend `NewApplication.handleFormSubmit`                        | template_id, status=completed                        |
| Documents step completed      | `application.documents_step_completed`  | Frontend                                                          | completed_form_count                                 |
| Payment step started          | `application.payment_step_started`      | Frontend                                                          | amount, fee_breakdown                                |
| Submit application            | `application.submitted`                 | Trigger on `applications` (status → submitted)                    | from_status, to_status                               |
| Cancel application            | `application.cancelled`                 | Trigger on `applications` (RPC `cancel_application`)              | reason                                               |
| Approve application           | `application.approved`                  | Trigger on `applications`                                         | approved_by                                          |
| Reject application            | `application.rejected`                  | Trigger on `applications`                                         | rejected_by, comments                                |
| Request resubmission          | `application.resubmission_requested`    | Trigger on `applications` + `approval_actions`                    | requested_by, comments                               |
| Resubmit                      | `application.resubmitted`               | Trigger on `applications` + `approval_actions`                    | comments                                             |
| Edit requested                | `application.edit_requested`            | Trigger on `approval_actions` (action=edit_requested)             | actor_id, comments                                   |
| Edit approved                 | `application.edit_approved`             | Trigger on `approval_actions`                                     | actor_id                                             |
| Edit denied                   | `application.edit_denied`               | Trigger on `approval_actions`                                     | actor_id, comments                                   |
| Payment initiated             | `payment.initiated`                     | Trigger `tg_payments_audit` (INSERT)                              | payment_id, amount, currency, application_number     |
| Payment completed             | `payment.completed`                     | Trigger `tg_payments_audit` (status → success/paid/completed)     | transaction_ref, paid_at                             |
| Payment failed                | `payment.failed`                        | Trigger (status=failed) **or** frontend fallback when no DB row   | error, application_id                                |
| Payment receipt generated     | `payment.receipt_generated`             | Trigger `tg_payment_receipts_audit` (INSERT)                      | receipt_number, issued_to_email                      |
| Document uploaded             | `document.uploaded`                     | Trigger `tg_documents_audit` (INSERT)                             | file_name, mime_type, file_size                      |
| Document replaced             | `document.replaced`                     | Trigger `tg_documents_audit` (UPDATE on file_path/file_name)      | previous_file_name, file_name                        |
| Document deleted              | `document.deleted`                      | Trigger `tg_documents_audit` (DELETE)                             | file_name                                            |
| Document verified / rejected  | `document.verified` / `document.rejected` | Not emitted — schema has no verification status column yet. Labels exist in UI registry for forward compatibility. |  |
| Workflow action taken         | `workflow.action_taken`                 | Trigger `tg_approval_actions_audit` (forward/return/review/etc.)  | action, step_id, workflow_instance_id, comments      |
| Workflow step completed       | `workflow.step_completed`               | Trigger `tg_approval_actions_audit` (approve_final)               | step_id, application_number                          |
| Workflow assigned             | `workflow.assigned` / `workflow.reassigned` | Trigger `tg_approval_actions_audit`                           | delegated_to, delegated_from                         |

## Deduplication

`public.write_audit(_action, _entity_type, _entity_id, _user_id, _old, _new, _metadata, _dedupe_seconds=10)`
checks for an existing row in the last `_dedupe_seconds` with the same
`entity_id` and an equivalent action (dot/underscore normalised). If found,
it returns the existing id without inserting.

## SQL verification snippets

```sql
-- Last 50 audit rows for an application (entity or metadata match)
SELECT created_at, action, user_id, metadata
FROM   public.audit_logs
WHERE  (entity_type = 'application' AND entity_id = '<APP_UUID>')
   OR  metadata->>'application_id' = '<APP_UUID>'
ORDER  BY created_at DESC
LIMIT  50;

-- All payment events in last 24h
SELECT created_at, action, metadata->>'application_number' AS app_no, metadata->>'amount' AS amount
FROM   public.audit_logs
WHERE  entity_type = 'payment'
  AND  created_at >= now() - interval '24 hours'
ORDER  BY created_at DESC;

-- Count by action (last 7 days)
SELECT action, COUNT(*) AS n
FROM   public.audit_logs
WHERE  created_at >= now() - interval '7 days'
GROUP  BY action
ORDER  BY n DESC;

-- Detect duplicate same-action rows within 10s
SELECT entity_id, action, COUNT(*) AS n
FROM   public.audit_logs
WHERE  created_at >= now() - interval '7 days'
GROUP  BY entity_id, action, date_trunc('second', created_at)
HAVING COUNT(*) > 1;
```

## Manual test checklist

1. Create a new application draft → `application.created`
2. Save a form draft → `application.form_saved`
3. Complete a form → `application.form_submitted`
4. Move to Documents step → `application.documents_step_completed`
5. Upload a document → `document.uploaded`
6. Delete a document → `document.deleted`
7. Proceed to payment → `application.payment_step_started` + `payment.initiated`
8. Complete payment → `payment.completed` + `payment.receipt_generated`
9. Submit application → `application.submitted`
10. Cancel application (applicant) → `application.cancelled`
11. Approve (admin) → `application.approved` + `workflow.step_completed`
12. Reject (admin) → `application.rejected` + `workflow.action_taken`
13. Request resubmission → `application.resubmission_requested`
14. Resubmit → `application.resubmitted`
15. Request edit → `application.edit_requested`
16. Approve edit → `application.edit_approved`
17. Deny edit → `application.edit_denied`
18. Forward / return / review workflow → `workflow.action_taken`

Inspect each event via **Admin → Audit Logs** and in the per-application
**Activity** tab.
