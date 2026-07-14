## Root cause investigation (data on record)

Active workflow instance for the affected pre-license app (`da9028ff…`):
- instance `caa254f1…`, workflow `10238551…` "Pre License Approval Workflow", current step `ba7d415f…` "Quality Assurance".

`review_step_permissions` for all 4 steps of that workflow — 44 rows total, every row already has `enabled=true, can_view=true, can_comment=true, can_reply=true, can_suggest=true`. However the coverage is uneven — several dynamic roles that real users actually have are **not** present in any row, e.g.:
- `0b89f760…` Executive Supervisor (assigned to super admin `johndoe`)
- `cf425653…` Insurance Regulator (assigned to super admin `ishani`)
- `5279b982…` Consumer/Complainant, `545ae930…` Cooperative Regulator, `37f867b4…` Market Conduct Supervisor, `52417228…` Prudential Supervisor, `b4651ccd…` Payment Systems Supervisor, `7a75da5e…` F&P Assessor, `0f4e0251…` Investigator, `3bb336da…` Regulated Entity User, `b9b48b7d…` Applicant.

Client gate in `CollaborativeReview.tsx` renders the **Add comment** panel only when `collab.perms.can_comment === true`. `perms.can_comment` in `useCollabReview.ts` is OR-ed over rows where `role_id ∈ myRoleIds` OR the auth user is `super_admin` / `admin`.

Therefore Add Comment is missing for any signed-in reviewer whose dynamic role has no row on the current step — the config UI never created a row for that role. This matches the symptom: user can view (falls through admin bypass path in some code paths, but not the comment button), can't comment.

Contributing bugs in the admin config UI (`CollabReviewConfigTab.tsx`) that make it hard to fix the missing row:
1. First toggling **Enabled** for a role inserts a row with all `can_*` implicitly `false`. Admin then has to flip each column one-by-one; each flip fires an independent upsert, which races and easily leaves rows with `enabled=true, can_view=false, can_comment=false`.
2. All `can_*` switches are disabled until `enabled` is true, so admin can't set them in one action.
3. There is no "grant standard reviewer defaults" affordance, so silent partial rows are the norm.
4. The workflow picker lists every workflow regardless of `entity_type`; when the affected step belongs to a different workflow admin often edits the wrong one.

Server side `add_review_comment` → `_assert_review_action` correctly requires `can_review_action(step, role, 'comment')` and, separately for a blocking comment, `'mark_blocking'`. That contract is already right; no server behaviour change needed beyond one small hardening (see step 4).

## Fix plan

### 1. `CollabReviewConfigTab.tsx` — make granting real permissions a single, safe action
- When a row does not yet exist for a role and admin turns **Enabled** on, upsert a row with a sensible reviewer default: `enabled=true, can_view=true, can_comment=true, can_reply=true, can_suggest=true, can_accept=false, can_reject=false, can_resolve=false, can_mark_blocking=false, block_approval_on_unresolved_blocking=false`. Admin can then narrow it. Turning **Enabled** off leaves the row but sets `enabled=false` (audit-friendly).
- Stop disabling the individual `can_*` switches when `enabled` is false — allow admins to pre-configure a row and flip it on afterwards.
- Coalesce the per-column toggles with `queryClient.setQueryData` optimistic updates so successive toggles operate on the latest row and don't overwrite each other.
- Add a "Grant reviewer defaults" and "Revoke" quick action per row.
- Filter the workflow picker to workflows whose `entity_type` matches the module we care about, and show `entity_type` in the label (already partly there).
- Show, per row, whether the role is currently assigned to any user (small count badge from `user_dynamic_roles`) so admins can see which rows actually matter.
- Persist changes are picked up live by the CollaborativeReview panel because `review-step-perms` is invalidated on upsert; also add a light `staleTime: 0` on that query and refetchOnWindowFocus so a second tab reflects config immediately.

### 2. `useCollabReview.ts` — surface the exact gap to admins, keep enforcement strict
- Expose `myMatchingRows` (the intersection between my dynamic roles and the step rows) and `configuredRoleIds` so the UI can tell the difference between "feature off" and "your role isn't listed".
- Keep the server as the source of truth: no change to who can comment; only diagnostics.

### 3. `CollaborativeReview.tsx` — clearer UI, no behaviour drift
- Keep the current gate: Add Comment renders only if `enabled && can_view && can_comment` and, if multiple dynamic roles, a role is selected.
- Keep Blocking checkbox rendering gated on `can_mark_blocking` (already correct — normal comment does not require it, blocking does).
- When `can_view=true` but `can_comment=false`, show a small muted note: "Your current role can view but not comment on this step. Ask an administrator to enable commenting for your role."
- For platform admins only, add a "Configure this step" link that deep-links to `/settings/*` collab review tab with the current `workflow_id` and `step_id` pre-selected (query params consumed by `CollabReviewConfigTab`).

### 4. Server hardening (small)
- Add a database CHECK/trigger on `review_step_permissions` so a row with `enabled=false` cannot have `can_*` all true silently mislead admins — normalise: when `enabled=false`, force `can_*` to false at write time. This is a one-line trigger; keeps the matrix honest.
- No change to `add_review_comment` logic. Confirmed it already:
  - requires `can_review_action(step, role, 'comment')` for normal comments,
  - requires `can_review_action(step, role, 'mark_blocking')` only when `_is_blocking=true`,
  - validates the passed `_role_id` is actually held by the user.

### 5. Data repair (targeted, no broad grants)
- No migration adds rows for arbitrary roles.
- Provide a one-off SQL that an admin can run from the config UI ("Copy permissions from step X to step Y") — implemented as a client action calling a new `copy_review_step_permissions(from_step, to_step)` RPC (SECURITY DEFINER, admin-only). This lets an admin who set up step 2 in a workflow replicate it to step 1 in a single click, instead of hand-toggling 20+ switches. Optional; not part of the automatic fix.

### 6. Tests
- Extend `src/test/collabReviewSuggestions.test.ts` (or a new `collabReviewPermissions.test.ts`) with:
  - `perms.can_comment=false` when the user's dynamic roles are not in `stepPerms` and they are not platform admin.
  - `perms.can_comment=true` when a matching row has `enabled=true, can_comment=true`.
  - Blocking-only path: `can_comment=true, can_mark_blocking=false` allows a normal comment, rejects a blocking comment client-side (via `is_blocking` disabled state).
  - CollabReviewConfigTab: toggling **Enabled** on a fresh role inserts a row with reviewer defaults (mock supabase upsert asserted).

### 7. Verification steps
- Reproduce with a user whose only dynamic role is `0b89f760…` on step `ba7d415f…`: confirm Add comment is missing before the fix, and the diagnostic note is shown; after admin toggles the role's Enabled in the config tab, `review-step-perms` refetches and Add comment appears with `can_comment=true`, `can_mark_blocking=false`.
- Submit a general comment (no selection) → row appears in `review_comments` with `is_blocking=false`.
- Submit an inline comment with selected text → row has `selection_start/end/text` populated.
- Both appear in the sidebar without a full page reload (existing `invalidate()` path already covers this).
- Attempt a blocking comment with `can_mark_blocking=false` role → server raises `REVIEW_FORBIDDEN_ACTION`; UI shows the humanised message.

### Files to change
- `src/components/collab-review/CollabReviewConfigTab.tsx` — default-grant behaviour, quick actions, optimistic upsert, workflow filter.
- `src/hooks/useCollabReview.ts` — expose `myMatchingRows`, `configuredRoleIds`.
- `src/components/collab-review/CollaborativeReview.tsx` — clearer "view-only" hint, deep-link to config.
- New migration:
  - trigger `review_step_permissions_normalize` to zero-out `can_*` when `enabled=false`.
  - RPC `copy_review_step_permissions(uuid, uuid)` (SECURITY DEFINER, admin-only) — optional, wired to a button.
- Tests: `src/test/collabReviewPermissions.test.ts` (new) + additions to existing suites.

### Not doing (explicit exclusions)
- No `admin_status` column anywhere.
- No `licensee_subsector_request` / `post_licensing_requests` schema work.
- No MySQL syntax; all SQL is Postgres/Supabase.
- No hardcoding of role IDs; every rule reads from `roles` / `user_dynamic_roles` / `review_step_permissions`.
- No blanket grant of comment permission to all users; each row is admin-approved per (workflow, step, role).
