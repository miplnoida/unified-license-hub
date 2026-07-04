# Fix: Legal/Compliance Reviewer sees "Workflow is not active" on submitted applications

## Root cause

The pre-license workflow *is* configured and active. The reviewer sees the manual "Review Actions" fallback because `resolveWorkflowApproval()` returns `no_matched_workflow` for them: RLS on the workflow-family tables hard-codes the same five internal roles (`super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst`) in every SELECT policy and omits `legal_compliance`. The reviewer's Supabase reads for `approval_workflows`, `approval_steps`, and `workflow_instances` come back empty, so the resolver falls back to manual actions and shows Configurable Decision Actions using default options.

Same enumeration mistake we just fixed on `public.applications`, repeated across the workflow subsystem:

| Table | Policy | Currently hard-codes five roles |
|---|---|---|
| `approval_workflows` | `Internal users read workflows` | yes |
| `approval_steps` | `Internal users read steps` | yes |
| `workflow_instances` | `Internal users read workflow instances`, `Admins full access workflow instances` | yes |
| `approval_actions` | `Read actions` | yes (also gated on `actor_id`) |
| `approval_workflow_types` | `Internal users read workflow type config` | yes |

Once these SELECT policies use the enum-derived `public.has_any_internal_role(auth.uid())` helper (already deployed), the resolver matches the pre-license workflow for the reviewer and `WorkflowPanel` renders instead of the manual banner.

## Behaviour after the fix

- Legal/Compliance Reviewer viewing a submitted application → the same `WorkflowPanel` that Analyst/Supervisor see, driven by the pre-license workflow.
- Which buttons/decisions are actually clickable is still governed inside `WorkflowPanel` by per-step role permissions (`approval_steps.assigned_roles` + step-action permissions). A step that is not assigned to Legal/Compliance renders as read-only for them — they see the timeline and can add remarks via the existing comment/action flow, without seeing approve/reject buttons that aren't theirs.
- No change to who can *act* on a step. This migration only fixes *visibility* of workflow metadata so the correct panel renders. If the pre-license workflow doesn't currently assign Legal/Compliance to any step, they simply see the read-only workflow view — which matches the user's expectation ("not authorised to take actions on form", just comment for review).
- No changes to write policies, no changes to the frontend, no changes to the resolver.

## Fix (single migration)

1. **`approval_workflows`** — replace the five hard-coded `has_role(...)` clauses in `Internal users read workflows` with `public.has_any_internal_role(auth.uid())`.
2. **`approval_steps`** — same treatment for `Internal users read steps`.
3. **`workflow_instances`** — same treatment for both `Internal users read workflow instances` (keeping the applicant own-app EXISTS branch untouched) and `Admins full access workflow instances`.
4. **`approval_actions`** — same treatment for `Read actions` (keep `auth.uid() = actor_id` branch intact so users always see their own posts).
5. **`approval_workflow_types`** — same treatment for `Internal users read workflow type config`.

The existing restrictive `external_users_denied_*` policies stay unchanged — they call `has_external_role`, which correctly returns false for pure internal reviewers. Admin-only write policies are also untouched.

No frontend changes. No new tables, columns, or helpers — `public.has_any_internal_role(uuid)` already exists from the previous migration.

## Verification

1. Sign in as `ratnpriyaemp@yopmail.com` (Legal/Compliance Reviewer) → open the same submitted application → the "Approval workflow is not active" banner is gone; `WorkflowPanel` renders with the pre-license workflow steps.
2. Buttons Legal/Compliance is not assigned to remain unavailable; comment/remark entry works.
3. Analyst, Supervisor, Licensing Officer, and Admin views are unchanged (regression check).
4. Pure applicant / licensee views are unchanged — external denial policies still apply.
