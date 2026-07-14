## Collaborative Review & Markup — Implementation Plan

Add a lightweight, shared "comments + tracked suggestions" layer to narrative fields in Application, Registration, Return, and Complaint reviews. Reuse the existing workflow engine, dynamic roles, permission catalog, audit log, and notification system. Nothing existing changes behaviour unless collaborative review is explicitly enabled on a workflow step.

### 1. Data model (new migration)

Four new tables in `public`, all with GRANTs + RLS + `updated_at` trigger:

- `review_comments`
  - `entity_type` (`application` | `registration` | `return` | `complaint`)
  - `entity_id`, `regulator_id`
  - `workflow_instance_id`, `workflow_step_id` (nullable — general comments allowed pre-step)
  - `field_key` (e.g. `assessment_notes`, `findings`, `rationale`, `resolution_notes`, `investigation_notes`, `explanation`)
  - `selection_start`, `selection_end`, `selection_text` (nullable for general comments)
  - `author_user_id`, `author_role_id`
  - `body` text, `parent_comment_id` (for replies)
  - `status` (`open` | `resolved`)
  - `is_blocking` boolean
  - `resolved_by`, `resolved_at`
- `review_suggestions`
  - Same entity/workflow/field columns as above
  - `author_user_id`, `author_role_id`
  - `type` (`insert` | `delete` | `replace`)
  - `original_text`, `suggested_text`, `selection_start`, `selection_end`
  - `status` (`pending` | `accepted` | `rejected`)
  - `decided_by`, `decided_at`
- `review_role_display_settings`
  - `regulator_id`, `role_id` (unique together)
  - `color` (hex), `show_reviewer_name`, `show_role_name`
- `review_step_permissions`
  - `workflow_id`, `step_id`, `role_id` (unique together)
  - Boolean flags: `can_view`, `can_comment`, `can_reply`, `can_suggest`, `can_accept`, `can_reject`, `can_resolve`, `can_mark_blocking`
  - `block_approval_on_unresolved_blocking` (per-step toggle)
  - `enabled` (per-step master switch — default `false` so existing workflows are unaffected)

RLS: reader must have entity access (delegated to existing per-entity RLS via join or a `has_entity_access(entity_type, entity_id)` SECURITY DEFINER helper); writer's `author_role_id` must be in `public.user_dynamic_roles` for `auth.uid()`; regulator scoping via `regulator_id`. All action rights checked against `review_step_permissions` via a `can_review_action(step_id, role_id, action)` SECURITY DEFINER.

### 2. Secured RPCs
- `add_review_comment`, `reply_review_comment`, `resolve_review_comment`, `reopen_review_comment`, `set_comment_blocking`
- `create_review_suggestion`, `accept_review_suggestion` (updates target narrative column atomically), `reject_review_suggestion`
- `check_approval_blocked(entity_type, entity_id, step_id)` — used by both UI and existing approval RPCs to gate approvals when blocking rule is enabled

Each RPC validates: entity access, role assignment, step permission flag, regulator scoping. Each writes to `audit_logs` via existing `log_self_audit`.

### 3. Approval gate (backward compatible)
- In the existing approval action handler (server side, `execute-workflow-action` / `approval_actions` path), call `check_approval_blocked`. If the step has `block_approval_on_unresolved_blocking = true` AND unresolved blocking comments exist → return HTTP 200 with `{ blocked: true, count }`.
- Default is `false` for all existing steps → no behaviour change.

### 4. Shared frontend component

`src/components/collab-review/CollaborativeReview.tsx`
Props: `entityType`, `entityId`, `workflowInstanceId`, `stepId`, `fields: { key, label, value, onSave? }[]`.

Sub-parts:
- `NarrativePane` — renders text with highlight ranges for comments/suggestions; selection → floating "Add comment / Suggest change" menu (only actions the current user is permitted for).
- `CommentsSidebar` — desktop right column; mobile Drawer trigger.
- `CommentCard` / `SuggestionCard` — shows author, dynamic role chip (colour + label + initials from `review_role_display_settings`), timestamp, replies, permitted action buttons.
- Filters: All / Open / Resolved / Suggestions / Mine.
- Clicking a card scrolls & highlights range; clicking a range opens the card.
- Diff rendering: inserts = underlined highlight, deletes = strikethrough, replace = old strike + new highlight.

Hook `useCollabReview(entityType, entityId, stepId)` fetches comments, suggestions, role display settings, and effective step permissions in one batch via a new `get_review_bundle` RPC; TanStack Query with realtime invalidation on mutation.

Permission helpers use both `useUserDynamicPermissions` (module-level `collab_review`) and per-step `review_step_permissions` returned in the bundle.

### 5. Narrative field wiring (minimal, opt-in)

Add the `<CollaborativeReview />` panel — hidden until step's `enabled=true` — to existing review screens, targeting narrative-only fields:

- Application review (`ApplicationDetail` / decision rationale, assessment notes)
- Registration review (`RegistrationReviewDetail` / review notes)
- Return review (`ReturnDetail` / explanations, reviewer notes)
- Complaint review (`ComplaintDetail` / investigation notes, resolution notes, findings)

No change to numeric fields, dropdowns, or calculated values. The panel renders below existing content on mobile, right-side sidebar on desktop.

### 6. Admin configuration (single section)

Extend `src/pages/admin/WorkflowConfig.tsx` with one new tab: **Collaborative Review**. Reuses existing workflow + step selectors:
- Master toggle per step: "Enable collaborative review".
- Matrix: dynamic role rows × permission columns (view / comment / reply / suggest / accept / reject / resolve / mark blocking).
- "Block approval on unresolved blocking comments" per-step toggle.
- Role display panel: colour picker + "show name" / "show role" toggles per role (scoped to active regulator).

Roles are loaded from `useRoles()` — never hard-coded. Colours default to a neutral palette until admin sets them.

### 7. New permission module

Add `collab_review` module to `permission_modules` / `permissions` with actions: `view`, `comment`, `suggest`, `accept`, `reject`, `resolve`, `configure`. Route guard for the admin config tab uses `configure`. Runtime action checks combine module permission AND per-step matrix.

### 8. Audit & notifications

- Audit events (via `log_self_audit`): `collab_review.comment_added`, `.reply_added`, `.comment_resolved`, `.comment_reopened`, `.suggestion_created`, `.suggestion_accepted`, `.suggestion_rejected`, `.blocking_toggled`, `.role_color_updated`, `.approval_blocked`.
- Notifications (reuse `notifications` table + existing dispatcher):
  - mention (parses `@user` in body)
  - reply on your comment
  - your suggestion accepted/rejected
  - blocking comment created → workflow step assignees

### 9. Tests
- `collabReviewPermissions.test.ts` — matrix enforcement.
- `reviewSuggestionApply.test.ts` — accept updates narrative atomically; reject leaves untouched.
- `approvalBlockedByBlockingComments.test.ts` — approval gate honoured when enabled, ignored when disabled.
- `collabReviewRegression.test.tsx` — legacy step (no config row) still approves normally, existing remarks untouched.

### 10. Files (planned)

**New**
- `supabase/migrations/<ts>_collab_review.sql`
- `supabase/functions/collab-review/index.ts` (thin wrapper if needed for notifications; otherwise RPC-only)
- `src/components/collab-review/{CollaborativeReview,NarrativePane,CommentsSidebar,CommentCard,SuggestionCard,SuggestionDiff,RoleChip}.tsx`
- `src/hooks/useCollabReview.ts`, `useReviewStepPermissions.ts`, `useReviewRoleDisplay.ts`
- `src/lib/collabReview/{diff.ts,permissions.ts,audit.ts}`
- `src/pages/admin/WorkflowConfig` — new tab component `CollabReviewConfigTab.tsx`
- Tests listed in §9.

**Modified (minimal)**
- `src/pages/admin/WorkflowConfig.tsx` — add tab.
- Four review screens listed in §5 — insert `<CollaborativeReview />` block only.
- Server approval handler — add `check_approval_blocked` guard.
- `permissionRegistry.ts` — register new module.

### 11. Backward compatibility guarantees
- All new tables default to disabled state; no existing workflow step is auto-enabled.
- No changes to `approval_actions`, `approval_steps`, existing remarks tables, or existing approval logic beyond the additive guard that is a no-op when `enabled=false`.
- No conversion of legacy workflow remarks.
- If admin never configures anything, users see zero UI change.

### 12. Deliverables on completion
Files changed · DB migrations · new permissions · shared components · audit events · tests · regression confirmation of existing approvals/comments across all four modules.
