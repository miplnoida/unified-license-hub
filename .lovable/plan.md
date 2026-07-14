# Collaborative Review & Markup

Extends the existing workflow engine with an opt-in review layer for narrative fields across Applications, Registrations, Returns, and Complaints. No existing workflow, approval, remark, permission, RLS, audit, or notification behaviour changes when the feature is disabled (the default).

## Database (single migration)

Four new `public` tables, each with GRANTs, RLS enabled, `updated_at` triggers, and policies keyed off existing dynamic roles / workflow instances. No changes to existing tables.

1. `review_comments` — entity_type, entity_id, workflow_instance_id, workflow_step_id, author_user_id, author_role_id, field_key, selection_start/end/text, body, parent_comment_id, status (`open|resolved`), is_blocking, resolved_by/at, timestamps.
2. `review_suggestions` — entity_type, entity_id, workflow_instance_id, workflow_step_id, author_user_id, author_role_id, field_key, type (`insert|delete|replace`), original_text, suggested_text, selection_start/end, status (`pending|accepted|rejected`), decided_by/at, timestamps.
3. `review_step_permissions` — workflow_id, step_id, role_id, enabled, can_view / can_comment / can_reply / can_suggest / can_accept / can_reject / can_resolve / can_mark_blocking, block_approval_on_unresolved_blocking.
4. `review_role_display_settings` — role_id (PK), regulator_id (nullable, global fallback), color, show_reviewer_name, show_role_name.

Security-definer helpers (no role names hard-coded — all keyed on `user_dynamic_roles.role_id`):

- `can_review_action(_user_id, _workflow_id, _step_id, _action text) returns boolean` — resolves current user's dynamic roles and checks `review_step_permissions`.
- `is_collab_admin(_user_id) returns boolean` — reuses existing admin role check.
- `check_approval_blocked(_entity_type, _entity_id) returns table(blocked bool, count int)` — counts unresolved blocking comments when the current step's config sets `block_approval_on_unresolved_blocking`.
- `accept_review_suggestion(_suggestion_id)` / `reject_review_suggestion(_suggestion_id)` — enforce `can_review_action`, write decision, and audit.

RLS: SELECT scoped to users who can access the parent entity (reuses existing entity-access predicates and regulator scoping); INSERT/UPDATE gated by `can_review_action`. Config tables writable only by collab admins.

## Shared frontend

- `src/hooks/useCollabReview.ts` — loads comments, suggestions, role-display map, current step permissions for the caller's dynamic roles; exposes `addComment`, `reply`, `resolveComment`, `setBlocking`, `addSuggestion`, `decideSuggestion`, and `blockingOpenCount`. All mutations go through the RPCs / RLS-protected inserts and call `logAction` for audit.
- `src/components/collab-review/CollaborativeReview.tsx` — one reusable component: props `{ entityType, entityId, fields: [{ key, label, value }] }`. Left pane: narrative with selection capture and inline suggestion rendering (insert = highlight, delete = strikethrough, replace = old→new). Right pane: sidebar with filters (All / Open / Resolved / Suggestions / Mine), threaded replies, per-role color chip, reviewer name + dynamic role + timestamp. Sidebar becomes a Drawer under `md`. Buttons: Add Comment, Suggest Change, Reply, Resolve, Reopen, Accept, Reject, Blocking toggle. Empty states as specified.
- `src/components/collab-review/CollabReviewConfigTab.tsx` — admin matrix (workflow → step → dynamic role) for the eight permissions plus `block_approval_on_unresolved_blocking`, and a role display panel (color + show name + show role). Roles list is pulled from existing `roles` table; nothing hard-coded.

## Wiring

- `src/pages/admin/WorkflowConfig.tsx` — add "Collaborative Review" tab hosting `CollabReviewConfigTab`. State diagram tab preserved.
- Embed `<CollaborativeReview />` on narrative sections only in:
  - `src/pages/applications/ApplicationDetail.tsx` (assessment notes / recommendations)
  - `src/pages/admin/RegistrationReviewDetail.tsx` (review notes)
  - `src/pages/returns-mgmt/ReturnDetail.tsx` (return explanations / reviewer notes)
  - `src/pages/complaints/ComplaintDetail.tsx` (investigation & resolution notes)

Approval buttons in each of these pages read `blockingOpenCount` from the hook and, when the step config enables blocking, disable the approval action and show "Approval cannot continue because N blocking comments are unresolved." The server-side approval RPCs additionally call `check_approval_blocked` before transitioning — enforcement is not UI-only.

Numeric fields, dates, dropdowns, and calculated cells are excluded.

## Notifications & audit

- Audit events (via existing `logAction`): `collab_review.comment_added`, `.reply_added`, `.comment_resolved`, `.comment_reopened`, `.blocking_toggled`, `.suggestion_created`, `.suggestion_accepted`, `.suggestion_rejected`, `.approval_blocked`.
- Notifications reuse the existing dispatcher for: mention, reply on your comment, suggestion accepted/rejected (author), new blocking comment (current step assignees).

## Backward compatibility

- All `review_step_permissions` rows default absent → feature off → existing approval / remark / audit flows unchanged.
- No migration of legacy workflow remarks. Legacy comment components remain in place.
- `check_approval_blocked` returns `blocked=false` when no config row exists.

## Tests

- `src/test/collabReviewPermissions.test.ts` — permission matrix resolution across multiple dynamic roles.
- `src/test/collabReviewBlocking.test.ts` — `check_approval_blocked` on/off and count behaviour.
- `src/test/collabReviewSuggestions.test.ts` — accept/reject state machine and audit hooks.
- Regression: run existing workflow suites (`workflowApprovalResolver`, `workflowActionFilter`, `registrationApprovalGate`, `returnWorkflowNotificationBindings`, `marketConduct`) unchanged.

## Deliverables at completion

Files changed, migration SQL, new tables, shared components, workflow config tab, permission helper functions, audit events, test results, and a regression note confirming the four existing workflow suites still pass.
