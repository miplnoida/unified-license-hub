# Complete Collaborative Review End-to-End

Finish the partially built Collaborative Review feature so backend config fully drives frontend behavior, dynamic roles stay backend-driven, blocking comments really block workflow approvals, RLS is safe, and the same shared component works across Applications, Registrations, Returns, and Complaints — without touching any existing behavior when the feature is disabled.

The previous turn already:
- Added the narrative-field registry, secured RPCs (`add_review_comment`, `resolve_review_comment`, `set_review_comment_blocking`, `create_review_suggestion`, `accept_review_suggestion`, `reject_review_suggestion`), and stale-conflict handling.
- Refactored `useCollabReview` to use RPCs, invalidate parent entity queries, and expose `availableRoles`, `humanError`, `blockingOpenCount`.
- Added the `regulator_id` column to role display settings and updated the config tab.

This plan covers only what's still missing to meet the acceptance criteria.

## 1. Backend: harden RLS and workflow blocking

Single migration.

### 1a. Replace open RLS on review tables
- Drop `USING (true)` policies on `review_comments`, `review_suggestions`, `review_role_display_settings`, `review_step_permissions`.
- Add helper `can_access_review_entity(_user_id, _entity_type, _entity_id)` (SECURITY DEFINER, STABLE, `search_path=public`) dispatching per entity:
  - application → applicant / `entity_user_access` / workflow assignee / regulator scope
  - registration → same pattern via `registrations`
  - return → `returns_filed` licensee membership / regulator scope / workflow assignee
  - complaint → complainant / assignee / regulator scope
- New SELECT policies on `review_comments` / `review_suggestions` using this helper.
- Revoke client `INSERT/UPDATE/DELETE` on those two tables (writes only via RPC). Keep `service_role` grants.
- `review_step_permissions` and `review_role_display_settings`: SELECT for `authenticated`; write only when `has_role(auth.uid(),'admin')` (or existing admin helper).

### 1b. Server-side approval blocking
- Add `enforce_review_block(_entity_type, _entity_id)` returning `(blocked bool, count int)`. Reads the entity's active workflow step, checks `review_step_permissions.block_approval_on_unresolved_blocking = true` for any enabled role, counts `review_comments` with `is_blocking=true AND status='open'`.
- Add a `BEFORE INSERT` trigger on `approval_actions` that, for action types corresponding to approve / final-approve / forward, calls `enforce_review_block` for the target entity and raises `EXCEPTION USING ERRCODE='P0001', MESSAGE='REVIEW_BLOCKED:<count>'` when blocked. Trigger is a no-op when no step config row exists → existing workflows unaffected.

### 1c. Regulator-scoped role display reader
- RPC `get_review_role_display(_regulator_id uuid)` returns per role_id the regulator-specific row when present, else the global (`regulator_id IS NULL`) row. Frontend already stores `regulator_id`; this RPC formalizes the read.

### 1d. Notification event seeds
- Insert rows into `notification_event_configs` for: `collab_review.reply`, `collab_review.suggestion_accepted`, `collab_review.suggestion_rejected`, `collab_review.blocking_created`, `collab_review.mention_user`, `collab_review.mention_role` (mentions disabled by default; others enabled). Only insert when the key doesn't already exist.

## 2. Frontend: enforce config-driven UI

### 2a. `src/components/collab-review/CollaborativeReview.tsx`
- Hide the entire panel when `!perms.enabled || !perms.can_view || !stepId`.
- Gate each action button by its `can_*` flag (hide, not just disable).
- Role selector: show only when `availableRoles.length > 1`; auto-select when exactly one; disable Add Comment / Suggest Change until a role is selected; label "Post as".
- Apply reviewer display: color, `show_reviewer_name`, `show_role_name`, regulator-specific → global → neutral fallback. Use across comment cards, replies, suggestion cards, reviewer badge/initials, legend, filters, mobile drawer.
- Inline markup layer over each registered narrative field:
  - Highlights for open comment ranges.
  - Insert → underline; delete → strike-through; replace → old→new pill.
  - Role color drives highlight, plus icon/underline style so it isn't color-only.
  - Click highlight → scroll sidebar to item; click sidebar → scroll narrative and mark active. Shared `activeItemId`.
- Loading / empty / error / disabled-feature / no-permission / stale-suggestion / blocked-approval states with plain-language copy.

### 2b. `src/components/collab-review/CollabReviewConfigTab.tsx`
- Show "Configuring for regulator: <name>" banner with fallback note.
- When editing role display, save the active `regulator_id` (already applied in prior turn — verify and add the inherited-value indicator + explicit "Set as global default" affordance).
- Show loading / saving / success / error feedback; prevent duplicate submits; refresh after save.

### 2c. Detail pages
Wire `blockingOpenCount` + `perms.block_on_unresolved` into approve buttons in:
- `src/pages/applications/ApplicationDetail.tsx`
- `src/pages/admin/RegistrationReviewDetail.tsx`
- `src/pages/returns-mgmt/ReturnDetail.tsx`
- `src/pages/complaints/ComplaintDetail.tsx`

On approve, catch `REVIEW_BLOCKED:<n>` from the trigger and show `Approval cannot continue because <n> blocking comments are unresolved.` No local status mutation. Disabled state on the button is a hint only; the server is authoritative.

Confirm each page passes the correct `entityType`, `entityId`, and narrative field keys, and that the parent-entity query key is in the invalidation map in `useCollabReview` (already added: `application`, `registration`, `return`, `complaint`).

## 3. Notifications
- Fire `collab_review.reply` (to parent comment author), `collab_review.suggestion_accepted` / `.suggestion_rejected` (to suggestion author), `collab_review.blocking_created` (to current step assignees) from inside the RPCs via `pg_notify` → existing `dispatch-notification-event` handler, OR from the client hook using `dispatchNotificationEvent` after a successful RPC (prefer client dispatch to match existing pattern; RPC returns needed IDs).
- Parse `@user:<uuid>` and `@role:<uuid>` tokens server-side inside `add_review_comment` and enqueue mention events; role mentions fan out to users with that role in the entity's regulator scope.
- Register the new event keys in `src/lib/notificationEvents.ts` (`NotificationEventKey` union).

## 4. Audit
Extend RPCs and hook to record:
- `collab_review.comment_added`, `.reply_added`, `.comment_resolved`, `.comment_reopened`, `.blocking_toggled`, `.suggestion_created`, `.suggestion_accepted`, `.suggestion_rejected`, `.narrative_updated`, `.approval_blocked`, `.permission_updated`, `.role_display_updated`.
- IDs and status only — never full narrative text.
- `.approval_blocked` written from inside the `enforce_review_block` path.

## 5. Tests (`src/test/`)
- `collabReviewRls.test.ts` — cross-entity / cross-regulator SELECT denial simulated via mocked client.
- `collabReviewPermissions.test.ts` — per-action gating; unauthorized action denied by RPC.
- `collabReviewSuggestions.test.ts` (extend existing) — insert/delete/replace correctness, stale conflict, duplicate accept blocked, reject leaves narrative unchanged.
- `collabReviewBlocking.test.ts` — approve blocked when configured + unresolved blockers; passes after resolve; unchanged when feature off.
- `collabReviewMultiRole.test.ts` — auto-select single role; require choice when >1; backend rejects unassigned role.
- `collabReviewRegulatorDisplay.test.ts` — regulator override wins over global.
- `collabReviewConfigVisibility.test.tsx` — panel hidden when disabled / no view; buttons hidden per flag.
- Re-run: `workflowApprovalResolver`, `workflowActionFilter`, `registrationApprovalGate`, `returnWorkflowNotificationBindings`, `marketConduct`, `RouteGuards`.

## 6. Backward compatibility
- No `review_step_permissions` row for a step → `perms.enabled=false` → panel hidden, trigger no-op, notifications skipped, audit unaffected.
- Existing tables, policies (outside these four), RPCs, workflows, dynamic roles, remarks, approvals, send-backs, status transitions, and existing notifications/audits untouched.

## Technical details (for engineers)

- Narrative apply already uses `format('%I', ...)` with identifiers from `review_narrative_fields` and `USING` params — no user input in SQL.
- `enforce_review_block` runs in a `BEFORE INSERT` trigger on `approval_actions`; entity resolution uses `related_entity_type` / `related_entity_id` columns; trigger short-circuits when no config row → zero cost when feature unused.
- Client `INSERT/UPDATE/DELETE` grants on `review_comments`/`review_suggestions` are revoked; `SELECT` remains, gated by `can_access_review_entity`.
- Error mapping (`REVIEW_BLOCKED`, `REVIEW_SUGGESTION_STALE`, `REVIEW_FORBIDDEN_*`, `REVIEW_INVALID_ROLE`, `REVIEW_UNKNOWN_FIELD`, `REVIEW_ALREADY_DECIDED`) lives in `useCollabReview.humanError`; no raw Postgres errors reach users.
- Regulator display resolution order in the hook: regulator-specific row → global row (`regulator_id IS NULL`) → neutral fallback `#6366F1`.
- Notification dispatch uses existing `dispatch-notification-event` edge function; new keys added to `NotificationEventKey`.

## Deliverables at completion
Files changed list, migration SQL, replaced RLS policies, new/updated RPCs, workflow approval trigger, updated hook + panel + config tab, detail-page approve wiring, notification event registrations, audit events, tests added, `tsgo` + vitest results, and confirmation that Applications, Registrations, Returns, and Complaints regression suites still pass.
