# Fix: Workflow Step Actions — View/Edit mismatch and "permission denied"

## Root cause (verified against the live database and code)

Two independent defects, both confirmed:

1. **Write grants were revoked, no governed write path was added for this editor.**
   `public.approval_step_actions` currently grants only `SELECT` to `authenticated`
   (`INSERT/UPDATE/DELETE` were revoked by the governed-operations migration
   `20260820161537`). The same is true for `approval_action_notifications` and
   `approval_step_entry_notifications`. The Workflow Builder still writes
   **directly** to those tables from the browser (`src/hooks/useStepActions.ts`),
   so every add/edit/delete fails with `permission denied for table
   approval_step_actions`. RLS policies are fine (`can_read_approval_config` for
   read, `can_mutate_approval_config` for write) — the block is the missing table
   grant, which is intentional: writes are supposed to go through a governed
   SECURITY DEFINER RPC. One such RPC exists (`approval_step_config_write`) but it
   is insert-only and used solely for template snapshot cloning.

2. **View Mode and Edit Mode read two different sources.**
   View Mode renders `approval_steps.allowed_actions` (a JSONB array — for the
   Registration Workflow step 1 it holds `send_back, approve, reject,
   request_resubmission`). Edit Mode renders rows from `approval_step_actions`.
   Across the whole database there are **35 steps, 20 with a non-empty
   `allowed_actions`, and 0 rows in `approval_step_actions`** — so Edit Mode
   correctly reports "No actions configured" while View Mode shows the legacy
   array. Runtime (`perform_workflow_transition` and its registration/returns
   siblings) gates on `allowed_actions` and only uses `approval_step_actions` for
   per-action routing when a row exists, falling back to built-in progression
   otherwise. That is why approvals still work today.

## What will be built

### 1. Governed write RPC (no RLS weakening, no new grants to the table)
Add `public.approval_step_action_save(_payload jsonb)` and
`public.approval_step_action_delete(_id uuid)` — SECURITY DEFINER, pinned
`search_path`, `EXECUTE` granted to `authenticated` only (revoked from `anon`
and `PUBLIC`), authorised with the platform's existing check used by
`approval_step_config_write`:
`has_permission(uid,'workflow_management','edit'|'manage_config'|'publish') OR is_super_admin(uid)`.

Each RPC:
- upserts **on the natural key `(step_id, action_type)`** so reopening and saving
  can never create `Approve / Approve` duplicates;
- validates `next_step_mode`/`next_step_id`/`end_state` combinations server-side;
- re-syncs `approval_steps.allowed_actions` to the union of enabled action types
  for that step (keeps the runtime gate in lock-step);
- seeds the default action notification row (this is why the notification insert
  must move inside the RPC too — that table is equally revoked);
- writes an audit row using the existing audit facade;
- touches **only the step passed in**.

A reorder path (`sort_order` update) is included in the same save RPC.

### 2. Idempotent backfill so both modes show the same four actions
A migration inserts one `approval_step_actions` row per entry already present in
`approval_steps.allowed_actions`, with routing that **exactly mirrors the current
legacy runtime behaviour** so no in-flight application changes course:

| action | next_step_mode | end_state |
|---|---|---|
| approve | next | — |
| reject | end_workflow | rejected |
| send_back | previous | — |
| escalate | next | — |
| request_resubmission / return_for_correction / request_more_info | return_to_applicant | — |
| save_comment | keep | — |

`ON CONFLICT (step_id, action_type) DO NOTHING`, so it is safe to re-run and
cannot duplicate. `allowed_actions` values are left byte-identical — the backfill
only adds the missing config rows. No workflow instance, approval action, audit
row or application status is touched.

### 3. One source of truth in the UI
- View Mode stops reading `allowed_actions` directly and renders the same
  `useStepActions(step.id)` rows Edit Mode uses (enabled rows, ordered by
  `sort_order`), so the two modes are provably identical.
- `allowed_actions` remains as the server-side runtime gate, maintained only by
  the RPC — never edited from the browser again.
- If a step genuinely has zero configured actions, both modes say so, and the
  runtime panel already renders the existing "no actions configured" warning.

### 4. Frontend rewiring
`src/hooks/useStepActions.ts` switches its upsert/delete/sync/notification-seed
mutations to the two new RPCs and surfaces `42501` as a clear
"You do not have permission to configure workflows" message instead of a raw
Postgres error. `StepActionsEditor.tsx` keeps its current UI; only the mutation
calls change.

## Verification before this is called fixed

Database-level: privilege check on the table (still no direct DML for
`authenticated`), row counts before/after backfill, per-step action list vs
`allowed_actions` equality, duplicate check on `(step_id, action_type)`.

Browser (Playwright, signed in as an authorised admin) on the Registration
Workflow:
1. View Mode — record the four actions.
2. Edit Mode — confirm the same four load as existing rows.
3. Add an action → saves with no permission error.
4. Reload → new action persists; edit an existing action; delete one.
5. Re-save repeatedly → assert no duplicate rows.
6. Runtime approver screen — actions offered exactly match the saved config
   (remove `send_back` in config, confirm the approver no longer sees it), then
   restore.
7. Unauthorised (non-workflow-admin) session — save is rejected by the RPC.
8. Existing in-progress registrations: confirm current step, status, workflow
   history and audit rows unchanged (snapshot compared before/after).

The final report will state root cause, files/policies changed, what was tested,
anything left unverified, and regression risk. Known limitation to be reported
rather than hidden: an unauthorised-user check requires a second signed-in
session; if one cannot be established, that step will be verified at the RPC
level via a direct permission-denied assertion instead of through the UI.
