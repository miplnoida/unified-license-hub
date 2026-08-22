# Workflow Runtime, Permissions & Notification Certification

## What the current state actually is (verified now, not assumed)

Queried against the live database and the current code:

- **6 active workflows**: Complaint Management (12 steps), Post Application (3), Pre License Approval (3), Pre Licensee Approval (3), Registration (2), Return (2). Plus 5 inactive (3 named `VRF-EMPTY-ACTIONS`).
- **Zero notification bindings exist anywhere**: `approval_action_notifications` = 0 rows and `approval_step_entry_notifications` = 0 rows across every workflow, active or not. So no configured workflow email exists today to certify — it has to be configurable first, then fixture-certified.
- **The reported Super Admin failure is a missing grant, and it is still present**: `authenticated` has only `SELECT` on `approval_action_notifications`, `approval_step_entry_notifications` and `approval_step_actions` (no INSERT/UPDATE/DELETE). `useActionNotifications.ts` and `useStepEntryNotifications.ts` still write **directly** to those tables from the browser, so every save fails with `permission denied` regardless of role. RLS is not the cause.
- **Action-source convergence is only half done**: `approval_step_action_save` / `approval_step_action_delete` exist and `useStepActions.ts` uses them, but `authenticated` still holds full `INSERT/UPDATE/DELETE` on `approval_steps` itself — so `allowed_actions` remains browser-writable and can still drift.
- **Real action-source drift exists**: the 12-step Complaint Management workflow has **no** `approval_step_actions` rows and **no** `allowed_actions` — it was not covered by the backfill. Pre License Approval step 1 has only `save_comment` as its sole action.
- **Duplicate email dispatch is structural, in code**: `perform-workflow-action` fires an action event, then `regulator.action_taken_on_application`, then per-action bindings — three independent waves per committed action. `perform-return-workflow-action` fires the action event, then `return.workflow_action_taken`, then bindings. Registration fires the action event plus bindings.
- **Preview is synthetic**: `WorkflowActionPreviewDialog` fabricates a `synthetic:<step>:<action>` applicant binding and falls back to event-level templates when no binding exists, so preview cannot equal runtime.
- 426 active notification templates, 248 event configs, 363 notifications, **0 rows in the email outbox** — the delivery path has no production evidence yet.
- August 21–22 commits in scope: workflow action-source convergence (`03e1c06d7`), authorization hardening (`b451de8cc`, migration `20260822081053`), pending-review UX (`ff05aeb77`), navigation/RBAC convergence (`e7764631a`, migrations `20260822014526`/`20260822021619`), registration/email-field work, plus ~60 Aug-21 migrations. A full commit-by-commit impact map is produced as step 1 of the work.

## Scope reality

The request is a 56-section certification programme. It cannot be honestly delivered in one pass, and claiming otherwise would produce exactly the "build green" answer you asked me not to give. I propose executing it as five sequential phases, each ending in executable evidence, with a certification verdict issued only at the end of Phase 5. Phase 1 unblocks the live Super Admin defect; the rest builds the governed notification engine and its proof.

## Phase 1 — Unblock configuration and close the write surface

1. Governed RPCs `approval_action_notification_save` / `_delete` and `approval_step_entry_notification_save` / `_delete`: SECURITY DEFINER, pinned `search_path`, EXECUTE to `authenticated` only, authorised with the same gate as `approval_step_action_save` (`has_permission(uid,'workflow_management',...) OR is_super_admin`). Server-side validation of event key, recipient type/config, template existence and channel. Audit row per write.
2. Rewire `useActionNotifications.ts` and `useStepEntryNotifications.ts` to those RPCs; map `42501` to a clear permission message.
3. Revoke browser `INSERT/UPDATE/DELETE` on `approval_steps` and route the remaining step writes in `WorkflowList.tsx` through the existing governed step-config RPC, so `allowed_actions` becomes server-maintained only.
4. Repair the drifted active configuration: backfill `approval_step_actions` for the 12 Complaint steps and any step where the two sources disagree, then a DB contract test asserting enabled `approval_step_actions` == `allowed_actions` for every active step, plus no duplicate `(step_id, action_type)`, plus valid `next_step_mode`/`next_step_id`/terminal actions.

## Phase 2 — One authorization oracle, per-action

5. Extend `user_can_act_on_workflow_step` into the single oracle: RBAC module permission **AND** step assignment both required, per-action enablement, sector/entity scope, maker-checker and self-approval bars, paused/stale-step/completed-instance checks, deterministic denial codes.
6. Every transition function (`perform_workflow_transition`, `perform_registration_workflow_transition`, `perform_return_workflow_transition`, `perform_final_workflow_approval`) re-validates the *specific requested action* through the oracle — no step-level-only checks.
7. Fix `save_comment` semantics: comment/audit only, no step advance, no status change, no next-reviewer notification, in all three runtimes. If completing a review without approving is required, that becomes an explicitly configured action, not overloaded `save_comment`.
8. Edge Functions map business failures to real HTTP codes (403 wrong approver / action not allowed, 409 stale or paused, 422 missing config or invalid transition); 500 only for genuine faults.

## Phase 3 — Server-governed notification plan (single source)

9. New `workflow_action_notification_plan(entity_type, entity_id, instance_id, step_id, action_type, actor_id, new_step_id)` returning event key, binding, template, recipient type, fully resolved recipient users/emails, channel, rendered subject/body, and warnings.
10. Deterministic precedence: enabled bindings for step+action are authoritative; the governed server-side fallback applies only when no binding exists. The generic `*.workflow_action_taken` and `regulator.action_taken_on_application` blanket dispatches are removed from all three runtimes.
11. Notification plan is resolved **after** the transition commits, using the returned `new_step_id`, so next-step recipients are never guessed. Step-entry notifications fire on entry to the destination step, exactly once, separate from action notifications.
12. Correct recipient resolution for every supported type (applicant, current approver, next-step role, previous actor, named user, role, supervisor, assigned officer, custom email, entity primary/secondary users, regulator team), sector-aware and deduplicated, using stable `role_id` with a non-ambiguous migration of existing role names.
13. Idempotency keyed on `approval_action_id` + binding + recipient + channel; retry cannot duplicate, a later action still notifies. `NO_RECIPIENT` and enqueue failures persist visibly and return `notification_warning` without failing the committed workflow.
14. `WorkflowActionPreviewDialog` consumes the same plan RPC — the synthetic binding and client-side inference are deleted. Reviewer overrides are validated server-side against the binding's step/action; recipients cannot be changed by payload tampering.

## Phase 4 — Validation, observability, links

15. Server-driven `Validate Workflow` gate: activation blocked on unresolvable approvers, dead target steps, inactive roles/templates, invalid recipient config, next-step recipient on a terminal action, unreachable steps. Per-binding PASS / WARNING / BLOCKED shown in the admin UI.
16. Notification diagnostics view for authorised admins over the existing delivery tables: workflow, entity, action, event, binding, recipient, template, channel, queue status, attempts, last error, timestamps. Retry action reuses the existing worker.
17. Deep-link audit so every notification URL resolves to a current canonical route with the entity ID and RBAC enforced at the destination.
18. Reconcile workflow/notification references against the Aug 21–22 role changes by repairing exact references — no broadening of access.
19. Frontend hardening of the workflow panels and editors against loading, stale, missing-step, missing-template, permission-denied, completed-workflow and plan-failure states — no white screens.

## Phase 5 — Certification evidence

20. Deterministic fixtures with known test identities for Application (Applicant → Analyst → Licensing Officer → Licensing Supervisor), Registration, Return, and Entity Resolution maker-checker, on real RBAC roles and sector scopes.
21. Test suites: DB contract (pgTAP), RPC integration exercising every UI-called function, Edge Function success + expected-failure tests, frontend unit/integration, persona permission matrix, per-transition **exact recipient identity** assertions, exact email-count assertions (zero unintended duplicates), zero-recipient and template-token checks.
22. Final report in the requested A–K structure, including the certification matrix and separate CERTIFIED / NOT CERTIFIED verdicts for runtime, permissions, notifications and recipient routing — issued only where executable evidence supports it.

## Stated limitations up front

- Real SMTP delivery cannot be proven from this environment; evidence will distinguish QUEUED / DISPATCHED / FAILED / RETRIED and will not call queued mail "delivered". Provider health will be surfaced as `EMAIL_PROVIDER_NOT_CONFIGURED` where applicable.
- Multi-user UI checks use minted sessions where possible; where a second session cannot be established, the assertion is made at the RPC level and reported as such.
