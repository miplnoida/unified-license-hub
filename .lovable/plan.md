## Goal

Fix the AI Analyst Assessment so it:
- Reliably persists a pending row at submission time.
- Generates exactly one assessment per submission (no duplicate rows on every call).
- Loads documents from both `documents` and `file_uploads` defensively.
- Stays advisory-only, internal-only, and never blocks applicant submission.

The panel placement, RLS, and migration are already correct. The bugs are concentrated in the two Edge Functions.

## Changes

### 1. `supabase/functions/verify-and-submit/index.ts`
- After `submit_application` succeeds, `INSERT ... .select('id').single()` the pending row to capture `assessmentId`. Keep failures non-blocking (try/catch, log only).
- Invoke `generate-application-ai-assessment` with `{ application_id, assessment_id }` (so the generator updates this row instead of creating a new one).
- Keep `EdgeRuntime.waitUntil` for reliability after HTTP response returns; keep all errors swallowed.
- Add safe log: `[ai-assessment] pending row created id=...`.

### 2. `supabase/functions/generate-application-ai-assessment/index.ts`
Make idempotent:
- Accept `{ application_id, assessment_id? }`.
- Row resolution order:
  1. If `assessment_id` provided → load that row; if not `pending`, reset it to `pending` and clear prior fields.
  2. Else find the latest `pending` row for this `application_id` and use it.
  3. Else insert a fresh `pending` row (manual-retry path from the UI when nothing pending exists).
- Update (never insert another row) for completed/failed transitions.
- Persist `rule_check_snapshot` on the row at the start of generation.
- Document loading: query `documents` with `entity_type='application' AND entity_id=application_id` and (separately, wrapped in try/catch so a missing column doesn't crash) try `application_id = :id`; query `file_uploads` the same way as `DocumentList`. Merge, de-duplicate by `(source,id)`, and use the merged count for `document_count` / `has_required_documents`.
- AI context includes only safe metadata fields: `source, id, file_name, document_type?, file_size, mime_type, created_at`. No file bytes, no secrets.
- Missing `LOVABLE_API_KEY` → mark row `failed` with `error_message='LOVABLE_API_KEY is not configured'`, return controlled 500. Submission is unaffected (already swallowed by `verify-and-submit`).
- Safe logs only: pending row id, document counts (legacy / secure / merged), start/complete/fail. No keys, no prompt, no raw form payload.
- Confirm: function never touches `applications`, `workflow_instances`, `approval_*`, or any workflow RPC.

### 3. UI / RLS — already correct, just verify
- `ApplicationDetail.tsx` already renders the panel only when `isInternal && app.status !== 'draft'` and places it above `WorkflowPanel`. No change needed.
- `ApplicationAiAssessmentPanel.tsx` already shows the four states (none / pending / failed / completed) and the "AI-assisted and advisory only" alert. No change.
- Migration RLS already grants SELECT only to internal roles. Applicants cannot read rows. No change.
- `secureFileUpload.ts` and `DocumentList.tsx` — no changes needed; the AI function will mirror `DocumentList`'s read strategy.

### 4. Verification
- Build/typecheck via the harness build.
- Manual UI verification path:
  - Login as admin/supervisor/analyst → Applications → Application Queue → open a submitted application → the "AI Analyst Assessment" panel appears above the Workflow panel; click "Generate assessment" or wait for the pending row to complete.
  - Login as applicant → open own application → AI panel is not visible.
- Confirm: submitting an application still succeeds when `LOVABLE_API_KEY` is unset (row ends up `failed`, applicant sees nothing about it).
- Confirm: repeatedly invoking generate for the same submission updates the same row (no row count explosion).

## Acceptance check list
1. New commit will be created with the two Edge Function fixes.
2. `verify-and-submit` persists a pending row and passes its id to the generator.
3. Application submission unaffected by AI errors / missing key.
4. Generator reads from both `documents` and `file_uploads` and merges.
5. Panel internal-only above `WorkflowPanel` (already in place).
6. Applicants cannot read assessment rows (RLS already enforced).
7. Generator never mutates application/workflow state.
8. `WorkflowPanel` untouched.
9. Build/typecheck reported after edits.
10. Final reply will list commit SHA, files changed, checks run, and the exact UI path above.
