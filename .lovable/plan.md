# Replace the "not authorized" banner with a pending-status message

## What happens today

Verified in the code: `src/components/applications/WorkflowPanel.tsx` (used by Application Detail and Registration Review) and `src/components/returns/ReturnWorkflowPanel.tsx` both render a warning-styled block reading "You are not authorized to act on this step" plus "Required role: …", where the role text falls back to `canActResult.required_role_name || required_system_role` — the authorization oracle's single system-role value, which is why users see "Super Admin" instead of the step's configured roles. Both files already have the pieces needed to do better: `dynamicRolesMap` (dynamic role id → name), `approverNamesMap` (resolved specific-user names), and `stepRoleLabel(step)` reading `approver_role_id`, `approver_config.role_ids`, `approver_config.user_ids` and legacy `approver_role`.

## What changes

A single shared display helper, used by both panels, that builds the pending sentence purely from the current step's own configuration — never from the authorization result.

Resolution order per step:
1. `approver_type = specific_users` (or `approver_config.user_ids` present) → names from the resolved user map → "This step is pending with John Smith / Maria Thomas."
2. Dynamic roles: union of `approver_role_id` and `approver_config.role_ids`, mapped through the dynamic-roles map, all of them listed → "This step is pending at Analyst / Licensing Officer level."
3. Legacy only (`approver_role`, no modern ids) → resolved legacy role label → "This step is pending at Licensing Officer level."

Names are joined with " / " with no truncation. Any single unresolved id falls back to a safe word ("Assigned Reviewer" for a role, "Assigned Approver" for a user) — never a UUID, and never a crash if the map is still loading. If nothing at all is configured, the message degrades to "This step is pending review." with no names.

Presentation: the block becomes a neutral informational panel (muted/primary border, Clock or Info icon) titled "Pending Review" with the sentence underneath. All security wording is removed — no "not authorized", no reason codes such as `WRONG_APPROVER`, no required system role or role ids. The same wording replaces the "you are not authorized to advance this workflow" sentence under the remarks box (kept as a plain "You can add a remark for the audit trail." note alongside the pending sentence).

Unchanged: when and whether the block renders (still only when the step has configured actions and the oracle says the viewer cannot act), which action buttons appear, all transition calls, and every backend authorization function.

## Technical notes

- New `src/lib/workflowPendingLabel.ts` exporting `pendingApproverNames(step, { dynamicRolesMap, userNamesMap, legacyRoleLabels })` and `pendingStepMessage(...)` returning `{ names: string[], mode: 'users' | 'roles', text: string }`.
- `WorkflowPanel.tsx`: call the helper at the banner (around line 1281) and in the remarks hint (around line 1005). Keep `stepRoleLabel` as-is for the timeline "Assigned to …" / "Pending: …" labels so existing history rendering is untouched.
- `ReturnWorkflowPanel.tsx`: mirror the banner change (around line 992) using its existing `dynamicRolesMap` / approver-name map.
- Unit tests for the helper in `src/test/` covering: one role, two roles, three-plus roles, single specific user, multiple specific users, sector-specific dynamic role names preserved verbatim, legacy-only fallback, unresolved id fallback, empty config.

## Verification

- Build green plus the new helper tests.
- Browser check on the registration review currently open in the preview and on an application workflow: confirm the panel reads "Pending Review / This step is pending at …" naming the step's configured roles, that no action buttons appear for a non-assigned viewer, and that an assigned approver still sees the action buttons with no pending banner.
- Confirm no "Super Admin" text appears unless Super Admin is genuinely the configured approver on that step.
