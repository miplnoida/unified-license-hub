# Fix: "column table_name of relation audit_logs does not exist" on assign

## Root cause
The trigger function `public.log_application_triage_change()` (migration `20260702111736_...sql`, added with the Application Queue priority/assignment feature) writes to `public.audit_logs` using column names that don't exist on this project:

- Uses `table_name`, `record_id`, `old_values`, `new_values`
- Actual columns: `entity_type`, `entity_id`, `old_value`, `new_value`

Because the trigger fires `AFTER UPDATE OF priority, assigned_to`, every assignee/priority update from Application Queue (single row or bulk) fails with the reported error and no assignment is saved.

## Fix (single migration)
Redefine `public.log_application_triage_change()` to use the correct audit_logs columns and the canonical audit metadata shape used elsewhere in the app:

- Replace `table_name` → `entity_type`
- Replace `record_id` → `entity_id`
- Replace `old_values` / `new_values` → `old_value` / `new_value`
- Populate `metadata` with `{ source: 'trigger', application_id, reason }` so the entry renders on the unified EntityTimeline the same way sibling triggers do.
- Keep both branches (priority change → `application.priority_changed`, assignee change → `application.assigned`).
- Keep the trigger definition (`AFTER UPDATE OF priority, assigned_to`) unchanged — only the function body is replaced via `CREATE OR REPLACE FUNCTION`.

No schema changes to `audit_logs`, no changes to Application Queue UI, no changes to other triggers.

## Out of scope (not touched)
- The pre-existing frontend files that also use the wrong shape (`RaiseRfiDialog.tsx`, `ApplicationRfiTab.tsx`, `ApplicationAiAssessmentPanel.tsx`) — they are not part of the reported flow and would be a separate cleanup.
- Application Queue behavior, sorting, priority UI, tooltips — all preserved.

## Verification
1. Open `/applications/queue` as an admin.
2. Change a row's Assignee via the per-row Select → toast "Updated", no error.
3. Bulk-assign 2+ rows → toast success, no error.
4. Change a row's Action Priority manually → still works.
5. Confirm new rows appear in `audit_logs` with `action IN ('application.assigned','application.priority_changed')` and populated `entity_type='applications'`, `entity_id=<app id>`, `old_value`/`new_value` JSON.
