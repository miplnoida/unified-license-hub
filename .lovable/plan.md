# Complete Collaborative Review & Markup

Finish the partially-built collaborative review feature. Keep every existing behaviour untouched when a step has no `review_step_permissions` row.

## 1. Database migration (single file)

### 1a. Replace insecure RLS on the four review tables

Drop the current `USING (true)` policies on `review_comments`, `review_suggestions`, `review_role_display_settings`, `review_step_permissions`. Replace with security-definer helper-driven policies.

New helpers (all `SECURITY DEFINER`, `search_path = public`, `STABLE`):

- `can_access_review_entity(_user_id, _entity_type, _entity_id) returns boolean` — dispatches to per-entity checks reusing existing predicates:
  - `application` → user is applicant, entity user, workflow assignee, or has admin/regulator scope for the application's regulator
  - `registration` → same pattern via `registrations` + `entity_user_access` / regulator scope
  - `return` → `returns_filed` + licensee membership / regulator scope / workflow assignee
  - `complaint` → complainant, assignee, regulator scope
- `current_user_regulator_id() returns uuid` (or reuse existing) for regulator-specific display settings
- `can_review_action(_user_id, _step_id, _action text) returns boolean` — reads `review_step_permissions` for the user's dynamic roles at that step
- `can_manage_review_config(_user_id) returns boolean` — reuses existing admin role check

New policies:

- `review_comments` / `review_suggestions` SELECT: `can_access_review_entity(auth.uid(), entity_type, entity_id)`
- INSERT/UPDATE/DELETE: revoked from clients — writes go through RPCs only (grants stay for service_role; drop client `INSERT/UPDATE/DELETE` on these two tables)
- `review_step_permissions` / `review_role_display_settings` SELECT: `authenticated`; WRITE: `can_manage_review_config`

### 1b. New/updated RPCs (SECURITY DEFINER, transactional)

All validate: authenticated, `can_access_review_entity`, active workflow instance/step for the entity, `can_review_action` for the specific action, role_id (if supplied) is in `user_dynamic_roles` for the caller AND permitted at that step, regulator scope.

- `add_review_comment(_entity_type, _entity_id, _field_key, _body, _selection jsonb, _is_blocking, _role_id)` — action `comment` (or `mark_blocking` when `_is_blocking`)
- `reply_review_comment(_parent_id, _body, _role_id)` — action `reply`; derives entity/step from parent
- `resolve_review_comment(_comment_id)` / `reopen_review_comment(_comment_id)` — action `resolve` / `reopen`
- `set_review_comment_blocking(_comment_id, _blocking bool)` — action `mark_blocking`
- `create_review_suggestion(_entity_type, _entity_id, _field_key, _type, _original, _suggested, _selection, _role_id)` — action `suggest`; validates `_field_key` against `narrative_field_registry`
- `accept_review_suggestion(_suggestion_id)` — rewritten (see 1c)
- `reject_review_suggestion(_suggestion_id)` — action `reject`; only updates the suggestion row

### 1c. Narrative field registry + safe apply

New table `review_narrative_fields (entity_type text, field_key text, table_name text, column_name text, PRIMARY KEY (entity_type, field_key))` — server-controlled mapping. Seed with the real columns after inspecting the schema for each entity (examples: `applications.assessment_notes`, `applications.recommendation`, `registrations.review_notes`, `returns_filed.reviewer_notes`/`explanation`, `complaints.investigation_findings`, `complaints.resolution_notes`; final names taken from live schema during build).

`accept_review_suggestion` becomes:

1. `SELECT ... FOR UPDATE` the suggestion; must be `pending`.
2. Enforce `can_access_review_entity` + `can_review_action(..., 'accept')`.
3. Look up `(table_name, column_name)` from the registry — reject if unknown.
4. `EXECUTE format('SELECT %I FROM public.%I WHERE id = $1 FOR UPDATE', column_name, table_name)` — parameterised, identifiers only from registry (never from client).
5. Compute new value:
   - `insert`: splice `suggested_text` at `selection_start` (require original slice to equal the recorded prefix/anchor).
   - `delete`: remove `[selection_start, selection_end)`; require current slice equals `original_text`.
   - `replace`: same match check, then swap in `suggested_text`.
6. If current slice ≠ recorded `original_text`, raise `EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REVIEW_SUGGESTION_STALE'` — hook maps to friendly conflict toast.
7. Update the narrative column; mark suggestion `accepted`, set `decided_by`, `decided_at`.
8. Insert an `audit_logs` row (via `log_self_audit` equivalent, without full narrative body).

### 1d. Workflow approval gate

- Add `enforce_review_block(_entity_type, _entity_id)` returning `(blocked bool, count int)` reusing `check_approval_blocked` scoped to the entity's current step.
- Update existing approval / forward server paths (`workflow_action_execute` RPC or equivalent — identify during build in `src/lib/workflowService.ts` and backing SQL) to call `enforce_review_block` before status transition. On block: return structured error `{ code: 'REVIEW_BLOCKED', count }`, no status change, no approval action row. Only triggers when a `review_step_permissions` row exists with `block_approval_on_unresolved_blocking = true`.

### 1e. Regulator-scoped display settings

- Alter PK on `review_role_display_settings` to `(role_id, regulator_id)` (nullable regulator_id acts as global fallback). Migrate existing rows to `regulator_id = NULL`.
- Reader helper `get_review_role_display(_regulator_id)` returns per-role rows preferring regulator-specific over global.

## 2. Frontend

### 2a. `src/hooks/useCollabReview.ts`

- Replace all direct `.from('review_comments'|'review_suggestions').insert/update` with the new RPCs.
- Add `selectedRoleId` state + `availableRolesForStep` (intersection of `myRoleIds` and `review_step_permissions` rows enabled for the step). If exactly one, auto-select; otherwise expose selector.
- Read role display via new RPC keyed on active regulator (from `RegulatorContext`).
- Map RPC error codes → friendly toasts: `REVIEW_SUGGESTION_STALE` → "This suggestion is based on an older version of the narrative. Refresh and review it again."; `REVIEW_BLOCKED` → structured object surfaced to caller.
- On successful accept: invalidate the entity's primary query key (add per-entity invalidation map keyed by `entityType`) plus `review-suggestions`.

### 2b. `src/components/collab-review/CollaborativeReview.tsx`

- Add inline markup layer over each narrative field: highlight ranges from open comments; render insert/delete/replace suggestions with underline / strike-through / old→new pill. Clicking a highlight scrolls sidebar to the item and vice-versa (shared `activeItemId` state).
- Show role selector when >1 role is valid for the step.
- Gate every action button by the corresponding `perms.can_*`.
- Hide the whole panel when `!perms.enabled || !perms.can_view || !stepId`.
- Loading, empty, and error states (feature disabled, no step, no permissions, load failure, stale-suggestion conflict, RLS denial).

### 2c. `src/components/collab-review/CollabReviewConfigTab.tsx`

- Save `regulator_id` from active regulator when writing role display settings (not `null` by default).
- No other structural changes.

### 2d. Approval buttons

In `ApplicationDetail`, `RegistrationReviewDetail`, `ReturnDetail`, `ComplaintDetail`:

- Read `blockingOpenCount` + `perms.block_on_unresolved`.
- On approve click, if server returns `REVIEW_BLOCKED`, show `Approval cannot continue because {count} blocking comments are unresolved.` — no local state mutation. UI disable remains as pre-emptive hint only; server is authoritative.

### 2e. Notifications

Use existing `dispatchNotificationEvent`:

- `collab_review.reply` → parent comment author
- `collab_review.suggestion_accepted` / `.suggestion_rejected` → suggestion author
- `collab_review.blocking_created` → current step assignees (resolved via existing workflow assignee helper)
- `collab_review.mention_user` / `.mention_role` — parse `@user:<uuid>` / `@role:<uuid>` tokens from comment body server-side (RPC extracts + dedupes); role mentions fan out to users in that role within the entity's regulator scope.

Add corresponding `notification_event_configs` seeds (disabled by default? — configurable; default enabled for reply / accepted / rejected / blocking, disabled for mentions until admins wire templates).

### 2f. Audit

Extend RPC bodies to write `audit_logs` entries for every action listed in the spec, including `collab_review.narrative_updated` and `collab_review.approval_blocked` (from the workflow gate). Metadata carries IDs only — never full narrative text.

## 3. Module integration verification

Confirm the shared component receives the correct `entityType`, `entityId`, real narrative fields, and that each detail page's TanStack query key is added to the invalidation map so accepted suggestions refresh the visible narrative:

- `ApplicationDetail.tsx`
- `RegistrationReviewDetail.tsx`
- `ReturnDetail.tsx`
- `ComplaintDetail.tsx`

No page redesign — only field wiring and query-key registration.

## 4. Tests (`src/test/`)

- `collabReviewRls.test.ts` — cross-entity / cross-regulator SELECT denial (mocked supabase client + policy simulation via helper stubs).
- `collabReviewPermissions.test.ts` — action gating per role.
- `collabReviewSuggestions.test.ts` — insert / delete / replace apply correctness, stale conflict, duplicate accept blocked, reject leaves narrative unchanged.
- `collabReviewBlocking.test.ts` — approve blocked when configured + unresolved blockers; passes after resolve; unchanged when feature off.
- `collabReviewMultiRole.test.ts` — role selector logic + backend rejection of unassigned role.
- `collabReviewRegulatorDisplay.test.ts` — regulator override vs global fallback.
- Regression re-run: `workflowApprovalResolver`, `workflowActionFilter`, `registrationApprovalGate`, `returnWorkflowNotificationBindings`, `marketConduct`.

## 5. Backward-compatibility guarantees

- No step config row → `perms.enabled = false` → component hidden, approval gate no-op, notifications not dispatched, audit unaffected.
- Existing tables, policies, RPCs, workflows, dynamic roles, remarks, approvals, rejections, send-backs, status transitions, and audit/notification pipelines are untouched.

## Technical details (for engineers)

- Narrative apply uses `format('%I', ...)` with identifiers pulled only from `review_narrative_fields`; values passed as `USING` parameters — no string concatenation of user input into SQL.
- Client `INSERT/UPDATE/DELETE` grants on `review_comments`/`review_suggestions` are revoked; `SELECT` remains, gated by `can_access_review_entity`.
- `accept_review_suggestion` runs as a single plpgsql function → implicit transaction; explicit `LOCK`/`FOR UPDATE` on both suggestion and entity row.
- Error mapping table lives in the hook so no raw Postgres errors reach users.
- Notifications dispatched via existing `dispatch-notification-event` edge function; new event keys registered in `src/lib/notificationEvents.ts`.

## Deliverables at completion

Files changed list, migration SQL, new/replaced RLS policies, new RPCs, updated workflow approval path, updated hook + component + config tab, module wiring notes, notification events added, audit events added, tests added, `tsgo` + vitest results, and confirmation that the four existing workflow test suites still pass.
