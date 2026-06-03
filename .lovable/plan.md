# Audit Logging Overhaul

## Goal
Make `audit_logs` the single, trustworthy source of truth for major platform actions, with standardized dot-style action names, server-side writes for critical events, useful metadata, and a usable Admin UI + per-application Activity tab.

## Approach

### 1. Server-side audit writes (trusted source)
Add a SQL helper `public.write_audit(_action, _entity_type, _entity_id, _user_id, _old, _new, _metadata)` (SECURITY DEFINER) that inserts into `audit_logs` bypassing RLS, used by every RPC/trigger/edge function below. Source tag goes in `metadata.source`.

Update / add audit writes inside these trusted units (only if function exists — verify first):
- RPC `submit_application` → `application.submitted`
- RPC `cancel_application` → `application.cancelled`
- RPC `reject_application_action` → `application.rejected`
- RPC `request_resubmission_for_application` → `application.resubmission_requested`
- RPC `approve_application*` / approval workflow RPCs → `application.approved`, `workflow.action_taken`, `workflow.step_completed`
- Payment RPCs (`create_or_get_application_payment`, `complete_or_get_application_payment`) → `payment.initiated`, `payment.completed`, `payment.receipt_generated`
- Edge functions: `verify-and-submit` (only logs if RPC did not), `approve-pre-licensee`, `perform-workflow-action` → workflow + status events
- Trigger on `applications` for status changes → `application.status_changed` (skip when `workflow_mutation_context='trusted'` already emitted a more specific row; dedupe by checking last 5s audit rows for same entity+to_status)
- Trigger on `payments` insert/update → `payment.initiated` / `payment.completed` / `payment.failed`
- Trigger on `documents` insert/update/delete → `document.uploaded` / `document.replaced` / `document.deleted` / `document.verified` / `document.rejected`

All trigger writes include rich metadata (application_number, applicant_id, applicant_email, license_type, sector/sub_sector/category names via lookup CTE, from_status, to_status, payment fields, file_name, etc.).

### 2. Frontend audit writes (non-critical UI events only)
Standardize names via existing `logAudit`:
- `src/pages/NewApplication.tsx`: keep `application.created` (rename from any underscore), add `application.draft_updated`, `application.form_saved`, `application.documents_step_completed`, `application.payment_step_started`, `payment.failed`. Drop frontend `application.submitted` and `payment.completed` (server-side covers them).
- `src/pages/applications/ApplicationDetail.tsx`: rename existing logs to dot-style for edit_requested/edit_approved/edit_denied/resubmitted. Remove duplicates already covered server-side (submit/cancel/approve/reject) — keep only the UI-context ones with `metadata.source='frontend'`.
- `src/components/applications/LicenseePaymentPanel.tsx`: add `payment.failed` on error; remove client-side `payment.completed` (server triggers it).

### 3. Dedupe strategy
- Each server write uses a deterministic suppression: helper checks for an existing row with same `(entity_id, action)` in the past 10 seconds and skips if found.
- Frontend writes always tag `metadata.source='frontend'`; server writes tag their source. UI mapper treats them equivalently.

### 4. Admin Audit Logs UI (`src/pages/admin/AuditLogs.tsx`)
Rewrite with:
- Label mapper (`src/lib/auditLabels.ts`) for both dot-style and legacy underscore names, plus action category grouping (Application / Payment / Document / Workflow / Auth / Other) and color/icon per category.
- Filters: search, action category (select), entity type (select), date range (from/to), user (select populated from visible rows).
- Pagination: 50/page with "Load more" pulling next page via `range()`; show total count from `head:true` query.
- Detail drawer (`Sheet`): readable action, timestamp, actor (name+email), entity link, old/new JSON, metadata pretty-print. Application rows link to `/applications/:id` with application_number; payment rows show amount/currency/receipt + link.
- Updated subtitle copy.

### 5. Application Activity tab
- New component `src/components/applications/ActivityTab.tsx` querying `audit_logs` where `entity_type='application' AND entity_id=app.id` OR `metadata->>application_id = app.id`, ordered desc, rendered as timeline with the same label mapper.
- Wire into `src/pages/applications/ApplicationDetail.tsx` as a new "Activity" tab (visible to admins + applicant).

## Technical Notes
- Migration adds: `write_audit` function, triggers on `applications` (status change), `payments` (insert/update), `documents` (insert/update/delete), and updates to existing RPCs (`cancel_application`, `submit_application`, `reject_application_action`, `request_resubmission_for_application` if present) to emit standardized rows.
- Before editing any RPC, the migration uses `CREATE OR REPLACE FUNCTION` only where the function signature is known; otherwise relies on triggers.
- All new/updated functions: `SET search_path = public`, `SECURITY DEFINER` where they need to bypass RLS.
- No changes to `audit_logs` table schema, only inserts.
- Backward compatibility: UI mapper accepts both `application_created` and `application.created`; old rows render correctly.

## Files
- New: `supabase/migrations/<ts>_audit_overhaul.sql`, `src/lib/auditLabels.ts`, `src/components/applications/ActivityTab.tsx`
- Edited: `src/pages/admin/AuditLogs.tsx`, `src/pages/NewApplication.tsx`, `src/pages/applications/ApplicationDetail.tsx`, `src/components/applications/LicenseePaymentPanel.tsx`, `supabase/functions/verify-and-submit/index.ts` (only to drop duplicate writes if any), `supabase/functions/approve-pre-licensee/index.ts`, `supabase/functions/perform-workflow-action/index.ts`
- Verify-then-edit: relevant SQL RPCs via migration

## Out of scope
- Backfilling historical events
- Renaming old audit rows in place (handled by UI mapper)
- New retention/archival policies
