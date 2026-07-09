# Return Edit Versioning, Highlighting & Compare

Mirror the pre/post application edit experience for returns: when an admin/reviewer requests an edit and the licensee re-submits, keep a version history, highlight edited fields in yellow in the return detail view, allow side-by-side compare of any two revisions, and record every step in the return audit log.

## 1. New table: `return_data_revisions`

Stores an immutable snapshot of a return's form data each time a "notable" event happens (initial submit, edit request, resubmit, admin override).

Columns:
- `return_id` (FK returns_filed, cascade)
- `revision_number` int (1-based, per return)
- `snapshot_reason` text — one of `submitted`, `edit_requested`, `resubmitted`, `admin_edit`
- `previous_status` / `new_status` text (nullable)
- `snapshot` jsonb — shape `{ [form_id]: { [field_name]: value } }` covering all forms currently in `return_form_data` at snapshot time
- `form_version_ids` jsonb — `{ [form_id]: version_id }` at snapshot time
- `created_by` uuid, `created_at` timestamptz
- unique(`return_id`, `revision_number`)

Migration also adds:
- GRANTs (`authenticated` select+insert, `service_role` all)
- RLS: select for the return's licensee (PPOC/primary/secondary via existing helpers) and internal roles (super_admin/admin/supervisor/analyst/licensing_officer). Insert restricted to authenticated with the same access check (or via SECURITY DEFINER RPC — see below).
- SECURITY DEFINER RPC `snapshot_return_revision(_return_id uuid, _reason text, _previous_status text, _new_status text)` that reads current `return_form_data` rows, computes next revision number, and inserts one row. Returns the new revision id.
- Trigger on `returns_filed`: after `workflow_status` transition to `SUB` (submit or resubmit), call `snapshot_return_revision` with reason `submitted`/`resubmitted` based on previous status.

## 2. Snapshot on edit request

`src/pages/returns-mgmt/ReturnDetail.tsx` (admin request-edit path, ~line 446): before opening the edit window, call the new `snapshot_return_revision` RPC with reason `edit_requested`. This preserves the "pre-edit" state so we can diff it against the resubmitted values.

Also write a `return_audit_log` row (`action='edit_requested'`, `event_key='return.edit_requested'`) — currently only `return_requests` is written; the audit trail is missing this event.

## 3. Snapshot on resubmit

`supabase/functions/resubmit-return/index.ts`: after the `resubmit_return` RPC succeeds, call `snapshot_return_revision` with reason `resubmitted`. The trigger already handles the status-change snapshot, but we call it explicitly with the richer reason to attribute it to the licensee. Idempotency handled by revision numbering.

`return_audit_log` already gets `return_resubmitted` — no change needed there beyond adding `revision_id` to metadata.

## 4. Yellow-highlight in return detail view

`src/pages/returns-mgmt/ReturnDetail.tsx` — `ReturnDataTable`:
- Fetch the two latest revisions for this return via a new `useReturnRevisions(id)` hook.
- If the latest revision reason is `resubmitted` and there is a prior `edit_requested` revision, treat the prior one as the baseline. Otherwise no highlighting.
- Pass `baselineValues?: Record<string, any>` into `ReturnDataTable`. For every field row, compare `data?.[f.fieldName]` against `baselineValues?.[f.fieldName]` with a deep-equal that tolerates numeric/string normalization (same helper used in `ApplicationReviewBuilder`). If changed:
  - Wrap the Value cell in `bg-yellow-100 dark:bg-yellow-950/40 border-l-2 border-yellow-500` and show a small `Edited` badge.
  - Above the tabs render the same banner used in ApplicationDetail: "Yellow fields indicate changes made after the edit request."

Highlighting is view-only. No changes to save/submit logic.

## 5. Version compare dialog

New component `src/components/returns/ReturnRevisionCompareDialog.tsx` modelled on `SubmissionCompareDialog.tsx`:
- Two `Select`s listing all revisions (`Revision N — reason — timestamp — actor`).
- Auto-default: left = latest `edit_requested` (or previous submitted), right = latest revision.
- For each form tab, iterate over section fields from the pinned form version and render a 3-column table (Line, Label, Left value, Right value) with per-row change/added/removed badges and change counts. "Show only changes" toggle.
- Reuse `formatCellValue` from ReturnDetail so numeric formatting is consistent.

Trigger button placed next to the existing `HistoryButton` in the ReturnDetail header ("Compare Versions", disabled when revisions < 2).

## 6. Audit log additions

Ensure a `return_audit_log` row exists for each of:
- `edit_requested` (client-side in ReturnDetail request-edit handler)
- `revision_snapshot_created` (written by `snapshot_return_revision` RPC with `metadata.revision_id`, `metadata.reason`)
- `revision_compared` — best-effort client log when a user opens the compare dialog (action `return.revisions.compared`, metadata `{left, right}`), via existing `logReturnActivity`.

`return_resubmitted` and `status_changed` audits already exist and are untouched.

## 7. What is intentionally NOT changed

- Form save / submit / workflow / RLS on `return_form_data` — untouched.
- Existing `return_requests` and `resubmit_return` RPC behaviour — untouched (we only add snapshot + audit calls around them).
- Licensee `FillReturnPage` editing UI — untouched (still edits current values in place).
- Prudential evaluation, notifications, workflow panel — untouched.

## Technical notes

- Deep-equal helper: reuse pattern from `ApplicationReviewBuilder.tsx` (`deepEqualField`) — extract to `src/lib/formDiff.ts` if not already exported.
- The trigger uses `SECURITY DEFINER` so it works regardless of caller role; RPC path used by client operations goes through the same function to guarantee identical revision numbering.
- `snapshot` JSONB is capped implicitly by return size; no artificial limit added.
- Compare dialog uses the same `pinnedVersionId` resolution as `ReturnDataTable` (from `return_form_versions` active row), so historical revisions render against the schema that was in effect.

## Files touched

Migration (new)
- `return_data_revisions` table + GRANTs + RLS + RPC + trigger

Frontend
- `src/pages/returns-mgmt/ReturnDetail.tsx` — snapshot call on request-edit, missing audit row, pass baseline to table, banner, compare button
- `src/components/returns/ReturnRevisionCompareDialog.tsx` — new
- `src/hooks/useReturnsManagement.ts` — add `useReturnRevisions(returnId)` query
- `src/lib/formDiff.ts` — export `deepEqualField` if needed

Edge function
- `supabase/functions/resubmit-return/index.ts` — call `snapshot_return_revision` on success
