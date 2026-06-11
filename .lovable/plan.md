# Workflow Versioning, Registration Review UI & Notification Seeders

This is a large, multi-part change. I'll verify the existing workflow-builder gap-fill first, then deliver versioning (DB + backend + frontend), the registration review UI on top of the pinned-version runtime, and idempotent notification seeders.

## Part 0 — Verify existing workflow-builder work (no rewrite)

Quick verification only — fix only if broken:
- `StepCard` step-order numeric input + duplicate validation in `src/pages/workflows/WorkflowList.tsx`
- `src/lib/workflowTemplateSnapshot.ts` v2 round-trip (step_order, approver_type/config, sla_hours, auto_approve_on_timeout, step actions, step entry notifications, action notifications, next_step remap)
- `src/test/workflowTemplateSnapshot.test.ts`, `workflowStepCardViewMode.test.tsx`, `workflowValidation.test.ts` still green

## Part 1 — Database: workflow versions (migration)

New table `approval_workflow_versions`:
- `id`, `workflow_id` (FK), `version_number` (int, unique per workflow), `status` (`draft|published|archived`), `snapshot` JSONB (v2 snapshot shape from `workflowTemplateSnapshot.ts`), `notes`, `created_by`, `created_at`, `published_at`
- GRANTs: `authenticated` read, `service_role` all; RLS via existing admin role check; published versions readable by anyone with workflow read access.

Extend `approval_workflows`:
- `current_published_version_id uuid NULL`, `draft_version_id uuid NULL`

Extend `workflow_instances`:
- `workflow_version_id uuid NULL` (FK), `version_snapshot JSONB NULL`, `current_step_key text NULL` (snapshot step local_id; `current_step_id` retained for back-compat)

Extend `approval_actions`:
- `workflow_version_id uuid NULL` for audit

Backfill migration:
- For every existing `approval_workflows` row, snapshot current steps/actions/notifications via the same shape `workflowTemplateSnapshot.buildSnapshot` produces, insert as version 1 `published`, point `current_published_version_id` at it.
- For every existing `workflow_instances` row, set `workflow_version_id` = that v1, populate `version_snapshot`, and derive `current_step_key` from current `current_step_id`.

## Part 2 — Backend runtime (edge functions + RPCs)

Update execution paths to read from the pinned snapshot, not live `approval_steps`:
- `supabase/functions/perform-workflow-action/index.ts`
- `supabase/functions/perform-registration-workflow-action/index.ts`
- `supabase/functions/perform-return-workflow-action/index.ts` (only the version-resolution wiring; no behavior change otherwise)
- `start_*_workflow` / `resolve_*_workflow` SQL functions: select `current_published_version_id`, refuse drafts, write `workflow_version_id` + `version_snapshot` + initial `current_step_key` on the instance.
- Action runtime: resolve current step, allowed actions, mandatory comments, status override, next-step routing, end-state, approver config, step-entry notifications, and action notifications **from `version_snapshot`** (keyed by `local_id`).
- Notification dispatch reads the snapshot's `approval_action_notifications` / `approval_step_entry_notifications` blocks; falls back to live tables only when `workflow_version_id IS NULL` (legacy safety, should not occur after backfill).
- `user_can_act_on_workflow_step` extended to accept a snapshot step (role_based_user / specific_users) so approver resolution matches snapshot.

## Part 3 — Frontend: workflow builder version lifecycle

`src/pages/workflows/WorkflowList.tsx` + new `src/components/workflows/WorkflowVersionPanel.tsx`:
- Show current published version #, draft indicator, last published date.
- Buttons: Edit Draft, Save Draft, Publish Version, View Published, Duplicate Published → Draft, Archive.
- Editing a published workflow auto-creates a draft (front-end opens the draft; back-end enforces).
- Inline warning: “Changes create a new version. Existing in-progress submissions stay on their original version.”
- New hook `src/hooks/useWorkflowVersions.ts` (list/create draft/publish/archive).

## Part 4 — Frontend: registration review uses pinned version

Reuse application workflow patterns; do not fork a second engine.
- New `src/pages/registration/RegistrationReviewList.tsx` (route `/admin/registrations/review`): pending/in-progress registrations assigned to current reviewer via snapshot approver resolution.
- New `src/pages/registration/RegistrationReviewDetail.tsx` with a `RegistrationWorkflowPanel` reusing the application `WorkflowPanel` patterns: workflow name + version badge, current step, step order, approver summary, SLA, auto-approve indicator, pinned-version actions, action history.
- Actions are rendered from the pinned snapshot's step actions (no hardcoded approve/reject), invoke `invokePerformRegistrationWorkflowAction`, enforce mandatory comments per snapshot config, reload state on success.
- Admin sidebar gets a "Registration Reviews" entry; routes wired in `src/routes/adminRoutes.tsx`.

## Part 5 — Registration access gate (mostly already in place)

Verify `/register` canonical (already done in earlier task) and that `RegistrationApprovalGate` in `src/routes/routeHelpers.tsx` covers pending / in_review / correction / rejected / unverified / missing. Add an RFI/more-info category to `src/lib/registrationStatus.ts` only if backend emits one; otherwise reuse `correction`. No behavior change for internal users.

## Part 6 — Registration notification seeders (idempotent)

New migration seeds `notification_templates` + `notification_event_configs` for the keys in the brief (registration.workflow_started, step_assigned, pending_review, approved_step, rejected, send_back, resubmission_requested, more_info_requested, escalated, final_approved, final_rejected, submitted, approved, correction_required, resubmitted, new_submission, action_taken, workflow_completed).
- Upsert by `event_key` / template `code` (existing unique keys) so reruns are no-ops.
- Email channel always; in-app where supported. Subjects/bodies use the placeholder set listed in the brief plus `{{workflow_version}}`.
- Dispatcher (`dispatch-notification-event`) extended to resolve `{{workflow_version}}` from the pinned instance.

## Part 7 — Tests

New / updated test files:
- `src/test/workflowVersioning.test.ts` — publish increments version; new instance picks latest published; in-progress instance stays pinned; draft never used for new instance; backfill creates v1.
- `src/test/workflowInstancePinnedRuntime.test.ts` — action set / routing / mandatory comments / notifications come from snapshot even after admin republishes.
- `src/test/registrationReviewActions.test.tsx` — review detail renders pinned-version actions, calls `invokePerformRegistrationWorkflowAction`, enforces mandatory comments.
- `src/test/registrationNotificationSeeder.test.ts` — required event keys exist; reseed is idempotent; templates appear in workflow notification selector list.
- `src/test/registrationAccessGate.test.tsx` extended for RFI / rejected / missing copy.
- Keep all existing workflow-builder tests green.

## Out of scope
- No new builder UI features beyond version lifecycle controls.
- No changes to existing return workflow behavior (only version-id wiring).
- No new action types beyond the runtime-supported allowlist.

## Files (high level)
- Migrations: `…_workflow_versions.sql`, `…_workflow_instances_pinning.sql`, `…_registration_notification_seed.sql`
- Backend: `perform-workflow-action`, `perform-registration-workflow-action`, `dispatch-notification-event`, RPCs `start_*`/`resolve_*`/`user_can_act_on_workflow_step`
- Frontend hooks: `useWorkflowVersions.ts`, extend `useWorkflowEngine.ts`
- Frontend components: `WorkflowVersionPanel.tsx`, `RegistrationReviewList.tsx`, `RegistrationReviewDetail.tsx`, `RegistrationWorkflowPanel.tsx`
- Routes: `src/routes/adminRoutes.tsx`, sidebar config
- Tests as listed above
