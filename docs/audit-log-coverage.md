# Audit Log Coverage

Canonical audit helper: `public.write_audit(...)` in
`supabase/migrations/20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql`.

Latest audit coverage migration: `supabase/migrations/20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql`.

## Coverage table

| Audit action | Where it is logged | Source type | File / migration / function | Required metadata | Manual test step |
| --- | --- | --- | --- | --- | --- |
| `application.created` | Application insert trigger | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, license_type, sector_id, sub_sector_id, category_id, to_status | Start a new draft application |
| `application.draft_updated` | Application update trigger when draft/in_progress editable fields change | trigger | `public.tg_applications_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, application_id, application_number, applicant_id, applicant_email, license_type, from_status, to_status, changed_fields, sector_id, sub_sector_id, category_id | Change sector/category/license type or draft data on an existing draft |
| `application.form_saved` | Form draft save in wizard | frontend | `src/pages/NewApplication.tsx` → `handleFormSaveDraft()` | source, application_id, template_id, template_name, version_id, status | Save a form as draft |
| `application.form_submitted` | Form completion in wizard | frontend | `src/pages/NewApplication.tsx` → `handleFormSubmit()` | source, application_id, template_id, template_name, version_id, status | Complete one form |
| `application.documents_step_completed` | Wizard proceeds from forms to documents | frontend | `src/pages/NewApplication.tsx` → `handleProceedFromForms()` | source, application_id, completed_form_count, total_form_count | Finish all forms and continue |
| `application.payment_step_started` | Wizard proceeds to payment | frontend | `src/pages/NewApplication.tsx` → `handleProceedToPayment()` | source, application_id, amount, fee_breakdown | Continue from documents to payment |
| `application.submitted` | Application status trigger | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, license_type, from_status, to_status, sector_id, sub_sector_id, category_id | Submit a paid draft |
| `application.resubmitted` | Application status trigger and approval action trigger | trigger | `public.tg_applications_audit()` in `20260603072912_...sql`, `public.tg_approval_actions_audit()` in `20260603073938_...sql` / `20260603082929_...sql` | source, application_id, application_number, workflow_id, step_id, step_name, actor_id, comments, from_status, to_status | Resubmit after resubmission request |
| `application.cancelled` | Application status trigger after cancel RPC | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, from_status, to_status | Cancel an editable application |
| `application.approved` | Application status trigger on approval | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, from_status, to_status | Final approve an application |
| `application.rejected` | Application status trigger on rejection | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, from_status, to_status | Reject an application |
| `application.resubmission_requested` | Application status trigger | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, applicant_id, applicant_email, from_status, to_status | Request resubmission |
| `application.status_changed` | Fallback application status trigger | trigger | `public.tg_applications_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, application_id, application_number, from_status, to_status | Trigger any non-mapped status change |
| `payment.initiated` | Payment insert trigger | trigger | `public.tg_payments_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, payment_id, application_id, application_number, amount, currency, status, transaction_ref, receipt_number, user_id | Start a payment |
| `payment.completed` | Payment status trigger | trigger | `public.tg_payments_audit()` in `20260603072912_14423a6b-9e11-4f78-b03e-110e4d75e4f5.sql` | source, payment_id, application_id, application_number, amount, currency, status, transaction_ref | Complete a payment |
| `payment.failed` | Payment status trigger or frontend fallback | trigger / frontend | `public.tg_payments_audit()` in `20260603072912_...sql`; fallback in `src/components/applications/LicenseePaymentPanel.tsx` → `handlePay()` | source, payment_id/application_id, status or error | Force a failed payment path |
| `payment.receipt_generated` | Payment receipt insert trigger | trigger | `public.tg_payment_receipts_audit()` in `20260603073938_dd0aea02-cafd-4ebc-bf52-fb3eb09c0b72.sql` | source, receipt_id, receipt_number, payment_id, application_id, application_number, amount, currency, issued_to_email, issued_to_name | Generate receipt after payment |
| `document.uploaded` | Legacy documents trigger and secure file uploads trigger | trigger | `public.tg_documents_audit()` in `20260603072912_...sql`; `public.tg_file_uploads_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, document_id, application_id, entity_type, entity_id, file_name, file_size, document_type, mime_type | Upload a document |
| `document.deleted` | Legacy documents trigger and secure file uploads trigger | trigger | `public.tg_documents_audit()` in `20260603072912_...sql`; `public.tg_file_uploads_audit()` in `20260603082929_...sql` | source, document_id, application_id, entity_type, entity_id, file_name, document_type | Delete a document |
| `document.replaced` | Legacy documents update trigger and secure file uploads update trigger | trigger | `public.tg_documents_audit()` in `20260603074558_50b3b090-0814-40c0-83fb-1220b2012f92.sql`; `public.tg_file_uploads_audit()` in `20260603082929_...sql`; replacement UI in `src/pages/documents/DocumentStore.tsx` → `handleReplaceSelected()` and `src/lib/secureFileUpload.ts` → `replaceSecureUpload()` | source, document_id, application_id, entity_type, entity_id, old_file_name, new_file_name, old_file_size, new_file_size, document_type | Replace a secure document in Document Store |
| `document.verified` | Secure file uploads review trigger | trigger | `public.tg_file_uploads_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql`; review UI in `src/pages/documents/DocumentStore.tsx` → `handleReviewAction()` | source, document_id, application_id, entity_type, entity_id, file_name, previous_status, new_status, comments/reason, actor_id, document_type | Verify a secure document in Document Store |
| `document.rejected` | Secure file uploads review trigger | trigger | `public.tg_file_uploads_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql`; review UI in `src/pages/documents/DocumentStore.tsx` → `handleReviewAction()` | source, document_id, application_id, entity_type, entity_id, file_name, previous_status, new_status, comments/reason, actor_id, document_type | Reject a secure document in Document Store |
| `workflow.action_taken` | Approval action insert trigger | trigger | `public.tg_approval_actions_audit()` in `20260603073938_dd0aea02-cafd-4ebc-bf52-fb3eb09c0b72.sql`, enriched in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, application_id, application_number, workflow_id, workflow_instance_id, step_id, step_name, action, action_type, actor_id, comments, from_assignee, to_assignee, from_status, to_status | Take any workflow action (approve/send back/escalate/reject/etc.) |
| `workflow.step_completed` | Approval action trigger for final approval and workflow instance trigger for step movement | trigger | `public.tg_approval_actions_audit()` and `public.tg_workflow_instances_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, application_id, application_number, workflow_id, step_id, step_name, actor_id, from_assignee, to_assignee, from_status, to_status | Move from one workflow step to the next |
| `workflow.assigned` | Workflow instance insert/resume trigger | trigger | `public.tg_workflow_instances_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, application_id, application_number, workflow_id, step_id, step_name, actor_id, from_assignee, to_assignee, from_status, to_status | Submit an application into workflow or resume a paused workflow |
| `workflow.reassigned` | Workflow instance step-change trigger | trigger | `public.tg_workflow_instances_audit()` in `20260603082929_9a137faf-1039-4e23-98cf-01730de20a98.sql` | source, application_id, application_number, workflow_id, step_id, step_name, actor_id, from_assignee, to_assignee, from_status, to_status | Advance or send back a workflow so assignee changes |

## Notes about duplicate prevention

- Canonical server-side rows are written through `public.write_audit(...)`.
- Frontend audit writes remain only for wizard-only UX actions that do not have a backend mutation of their own.
- Duplicate frontend audit calls were removed from `src/pages/applications/ApplicationDetail.tsx` for `application.edit_requested`, `application.edit_approved`, and `application.edit_denied` because those actions now write canonically through `approval_actions` trigger paths.

## SQL verification queries

```sql
-- Recent audit rows for one application

select *
from public.audit_logs
where entity_id = '<APPLICATION_ID>'
   or metadata->>'application_id' = '<APPLICATION_ID>'
order by created_at desc;

-- Count by action

select action, count(*)
from public.audit_logs
group by action
order by action;

-- Duplicate detector

select action, entity_type, entity_id, date_trunc('minute', created_at) as minute_bucket, count(*)
from public.audit_logs
where created_at > now() - interval '1 day'
group by action, entity_type, entity_id, date_trunc('minute', created_at)
having count(*) > 1
order by minute_bucket desc;
```

## Manual checklist

1. Create a draft application and confirm `application.created`.
2. Edit the same draft selection/details and confirm `application.draft_updated`.
3. Save a form draft and confirm `application.form_saved`.
4. Complete a form and confirm `application.form_submitted`.
5. Continue to documents and confirm `application.documents_step_completed`.
6. Continue to payment and confirm `application.payment_step_started`.
7. Start and complete payment, then confirm `payment.initiated`, `payment.completed`, and `payment.receipt_generated`.
8. Upload, replace, verify, reject, and delete a secure document from **Document Store**, confirming `document.uploaded`, `document.replaced`, `document.verified`, `document.rejected`, and `document.deleted`.
9. Submit application and confirm `application.submitted` plus `workflow.assigned` when a workflow instance is created.
10. Take workflow actions (approve/send back/escalate/reject/request resubmission) and confirm `workflow.action_taken`, `workflow.step_completed`, and `workflow.reassigned` as applicable.
11. Request resubmission, resubmit, request edit, approve edit, and deny edit; confirm the matching `application.*` events.
