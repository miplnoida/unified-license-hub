## Problem
Mapped regulators (Lead/Officer/Alternate) currently only see returns whose `status`/`workflow_status` is in the submitted lifecycle. The user wants them to see **all statuses** (drafts, in-progress, submitted, accepted, rejected, resubmission-requested) for their mapped entities.

This gate lives in the 4-arg `public.can_view_entity_returns(_user_id, _licensee_id, _workflow_status, _status)` — the assignment branch returns `false` unless the status is in the "submitted lifecycle" allow-list. The 2-arg overload already permits without a status check.

## Fix

Single migration that redefines the 4-arg function so the assigned-regulator branch returns `true` regardless of `_workflow_status`/`_status`. Behaviour for other personas is unchanged:

- `NULL` user or licensee → `false`
- `super_admin` → `true`
- `returns_management.view_all_entities` → `true`
- Assigned as `lead_regulator_id` / `regulator_officer_id` / `alternate_regulator_id` → `true` (any status)
- Otherwise → `false`

The status parameters remain in the signature (RLS policies and other callers pass them) but are ignored. This keeps every existing policy on `returns_filed`, `return_form_data`, `return_documents`, and storage intact — no policy rewrites needed.

## Ripple updates

1. **pgTAP suite** `supabase/tests/regulator_access/01_can_view_entity_returns.sql` — assertion #5 currently expects mapped user + `WIP/draft` → `false`. Flip it to expect `true` and refresh the test description.
2. **Vitest** `src/test/regulatorAssignment.test.tsx` — if it asserts the draft-hidden behavior for mapped regulators, update those expectations to match the new rule. (Verify during build; adjust only affected cases.)
3. **Admin visibility filters** (`src/lib/adminReturnFilters.ts`, `EntityReturnsDashboard`, list pages) — no changes. They already hide `draft/pending/not_submitted/in_progress` from admin views; that's an admin-view-only filter and unrelated to the RLS gate the user is complaining about. If we discover the licensee/regulator "Returns" list applies the admin filter to mapped regulators, we'll revisit — but scope this plan to the DB gate first.

## Out of scope
- No change to `usePermissions.ts` assignment bypass (already correct).
- No change to `view_all_entities` semantics.
- No storage-policy edits (they call the same helper, so they inherit the fix).

## Verification
- Run vitest + pgTAP.
- Manually: as the mapped `license_analyst`, open Returns list — drafts/WIP/TBR rows for mapped entity should now appear; other entities should stay hidden.
