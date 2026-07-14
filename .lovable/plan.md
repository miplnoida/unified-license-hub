## Collaborative Review — Finish All Remaining Work

Complete the partially-built Collaborative Review feature end-to-end across Applications, Registrations, Returns, and Complaints. The feature is disabled-by-default and must not alter existing workflows when no review config exists.

### 1. Database (single migration)

**Regulator resolution helper**
- Rewrite `current_workflow_step_for(entity_type, entity_id)` to return `{ workflow_instance_id, workflow_id, current_step_id, regulator_id }`.
- Resolve regulator per entity: `applications.regulator_id`, `registrations.regulator_id` (fallback via sector→regulator), `returns_filed → licensees.regulator_id`, `complaints.regulator_id`.

**Access hardening — `can_access_review_entity(user, entity_type, entity_id)`**
Replace broad "role has can_view on step" logic with entity-specific paths:
- Application: applicant owner (external-visible only), `entity_user_access`, workflow assignee, regulator staff w/ role in step, admin.
- Registration: owner, `entity_user_access`, assignee, regulator staff, admin.
- Return: licensee membership, `entity_user_access`, assignee, regulator staff, admin.
- Complaint: complainant (if `visibility = external_ok`), assignee/investigator, regulator staff, admin.
- Add `is_internal` flag to `review_comments`/`review_suggestions`; hide internal from external users.

**RLS**
- `review_comments`, `review_suggestions`, `review_narrative_fields`, `review_step_permissions`, `review_role_display_settings`: SELECT via `can_access_review_entity`; INSERT/UPDATE/DELETE denied (RPC-only).

**Effective config RPC**
- `get_review_effective_config(entity_type, entity_id)` → merges step permissions × user's dynamic roles × regulator-scoped display, returns one record with all flags + `allowed_role_ids[]` + display map.

**Workflow-advancing action helper**
- `is_workflow_advancing_action(step_action_id)` — reads `approval_step_actions.advances_workflow` (or infers from `action_type in ('approve','final_approve','forward','complete','advance')`).
- Trigger on `approval_actions` BEFORE INSERT: if advancing & blocking enforcement enabled & unresolved blocking count > 0 → RAISE `REVIEW_BLOCKED:<count>`. Applied uniformly to all four entity types.

**Secured RPCs (rewrite / add)**
`add_review_comment`, `reply_review_comment`, `resolve_review_comment`, `reopen_review_comment`, `set_review_comment_blocking`, `create_review_suggestion`, `accept_review_suggestion`, `reject_review_suggestion`, `upsert_review_step_permission`, `upsert_review_role_display`.

Each RPC:
1. Verify `can_access_review_entity`.
2. Verify effective permission flag.
3. Verify role belongs to user & is in `allowed_role_ids`.
4. Lock rows (`FOR UPDATE`) for suggestion accept.
5. For accept: re-check `original_text` vs current narrative column via `review_narrative_fields` map; apply insert/delete/replace; return updated narrative.
6. Insert audit row in same tx (`compliance_audit_logs` with entity_type, entity_id, workflow_instance_id, step_id, role_id, regulator_id, before/after status — never full narrative body).
7. Enqueue notifications (event keys below); failure logged but doesn't rollback primary action.

**Notification events (seed in `notification_event_configs`)**
`collab_review.reply`, `collab_review.suggestion_accepted`, `collab_review.suggestion_rejected`, `collab_review.blocking_created`, `collab_review.user_mention`, `collab_review.role_mention`, `collab_review.approval_blocked`.

Mentions parsed server-side from `@user:<uuid>` / `@role:<uuid>`; role mentions filtered to users with that dynamic role in the entity's regulator who have `can_access_review_entity`.

### 2. Frontend

**Hook: `useCollabReview`**
- Fetch via `get_review_effective_config`; expose merged perms, `allowedRoleIds`, `display` (regulator-scoped w/ global + neutral fallback and `source: 'regulator'|'global'|'neutral'`).
- On accept-suggestion success → invalidate parent entity query + review queries.
- Error mapper handles: `REVIEW_BLOCKED:<n>`, `REVIEW_SUGGESTION_STALE`, `REVIEW_PERM_DENIED`, `REVIEW_ROLE_INVALID`, `REVIEW_NARRATIVE_UNKNOWN`, `REVIEW_ALREADY_DECIDED`.

**`CollaborativeReview.tsx`**
- Hide entire panel when `!enabled` or `!can_view`.
- Hide (not disable) actions the user cannot perform.
- Role selector: required when `allowedRoleIds.length > 1`, auto-selected when exactly 1, block posting until chosen.
- New `NarrativeMarkup` subcomponent renders each narrative field with:
  - Base text from parent entity.
  - Overlays for comment ranges (colored underline + border + role icon + tooltip w/ reviewer name/role per display flags).
  - Insert suggestions rendered inline (dashed underline).
  - Delete suggestions with strike-through.
  - Replace shows original struck + new inline.
  - Stale ranges rendered as "Original text no longer found" chip (not applied to unrelated text).
  - Click range → focus + scroll sidebar item; click sidebar item → scroll + pulse markup; active state ring.
  - Mobile (`useIsMobile`): tap opens comment drawer.
- Reviewer legend at top with color swatches (regulator scoped).

**Config UI (`CollabReviewConfigTab.tsx`)**
- Header banner: "Configuring for regulator: {activeRegulator.name}".
- Per role display row shows source badge (Regulator / Global / Neutral) + buttons: "Save for this regulator", "Set as global default", "Reset to inherited".
- Loading/saving/error/success states via toast + row-level spinners; optimistic rollback on failure; refetch after save.

**Approval block wiring**
- `ApplicationDetail`, `RegistrationReviewDetail`, `ReturnDetail`, `ComplaintDetail`: catch `REVIEW_BLOCKED:<n>` from any workflow advancing action → toast "Approval cannot continue because {n} blocking comments are unresolved." and refresh blocking count. No layout changes.

### 3. Tests (`src/test/`)

Unit / logic:
- `collabReviewSuggestions.test.ts` (extend): insert-at-start/end, unicode, multi-line, empty narrative, stale, invalid range.
- `collabReviewErrors.test.ts` (extend): all mapped codes.
- `collabReviewMarkup.test.tsx`: overlay rendering per suggestion type, stale badge, click linking sidebar↔markup, mobile drawer.
- `collabReviewConfig.test.tsx`: panel hidden/shown by flags, role selector behavior, display source resolution (regulator > global > neutral).
- `collabReviewMentions.test.ts`: parse `@user:` / `@role:` and recipient scoping.
- `collabReviewApprovalBlock.test.ts`: mock RPC returning `REVIEW_BLOCKED:2` → UI toast, no status change.
- Access-path unit tests for `can_access_review_entity` decision matrix (pure TS mirror).

Migration smoke: extend `scripts/external-portal-access-smoke.sql` with cross-regulator + unrelated-user denial checks for the four review tables and RPCs.

### 4. Verification
Run: `tsgo --noEmit`, `vitest run`, existing regression suites. Report failing/passing counts, list changed files, migration description.

### Technical notes

- Single migration file with all schema/RPC/RLS/trigger/seed changes to keep transactional consistency.
- `is_internal` defaults to `true` for comments authored by regulator staff, `false` for external — enforced server-side.
- Narrative update inside `accept_review_suggestion` uses dynamic SQL keyed by whitelisted `review_narrative_fields.table_name` + `column_name` to prevent injection.
- Approval-blocked trigger uses `PERFORM` on a fast `EXISTS` query on unresolved blocking comments scoped by workflow_instance_id.
- All RPCs `SECURITY DEFINER` with `SET search_path = public` and explicit `REVOKE ALL ... FROM public; GRANT EXECUTE ... TO authenticated;`.
- No changes to `client.ts`, `types.ts`, or `.env`.

### Out of scope (unchanged)
Existing workflow engine internals, SLA calculations, existing remarks/approval action tables, unrelated RLS, routing, layouts.
