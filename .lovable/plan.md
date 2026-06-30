## Problem

`workflow_templates.name` allows duplicates. There are already 2 rows named "Commercial Bank Pre Licensee template". User wants duplicate names blocked on save with a clear error.

## Fix

Two layers, both narrowly scoped:

1. **DB migration** — add a case-insensitive unique index on `workflow_templates(lower(name))`. Pre-step: dedupe the existing two duplicate rows by renaming the older one to `<name> (duplicate)` so the unique index can be created without dropping data. No other schema changes.

2. **UI guard in `WorkflowList.tsx` `handleSaveAsTemplate`** — before insert, query `workflow_templates` for a case-insensitive name match and `toast.error('A template with this name already exists')` if found. Also catch the Postgres `23505` unique-violation from the insert and show the same friendly message instead of the raw error.

Out of scope: no changes to template snapshot shape, template list UI, workflow CRUD, or any other duplicate-check logic.

## Acceptance

- Saving "As Template" with a name that already exists (any casing, trimmed) shows "A template with this name already exists" and does not insert.
- New unique names still save.
- Existing duplicate row is renamed once so the unique index can be created.
- Deleting and re-saving with the same name works.
