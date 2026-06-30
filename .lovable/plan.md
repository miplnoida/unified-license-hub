## Problem

When an admin selects **Legal/Compliance Reviewer** as the approver of a workflow step, the database trigger `validate_approval_step_role` rejects it with:

```
INVALID_ROLE_MAPPING: role "Legal / Compliance Reviewer" has system_role=analyst but is not the built-in Analyst role
```

Cause: the role was seeded with `system_role='analyst'` (because `app_role` had no legal/compliance value), but the validator only allows `system_role='analyst'` for the built-in Analyst role. There are also two duplicate seed rows (`Legal/Compliance Reviewer` and `Legal / Compliance Reviewer`).

## Fix — single migration, no UI/business-logic changes

1. **Extend the `app_role` enum** with a new value `legal_compliance` (additive; safe for every existing check — `has_role`, `user_can_act_on_workflow_step`, RLS, etc. ignore unknown roles).
2. **Re-seed the canonical role**:
   - Keep one row: `name = 'Legal/Compliance Reviewer'`, `system_role = 'legal_compliance'`, `is_system = true`, `role_type = 'internal'`.
   - Delete the duplicate `'Legal / Compliance Reviewer'` row after re-pointing any `user_dynamic_roles` / `approval_steps.approver_role_id` references to the canonical id (guarded so it's a no-op if none exist).
3. **Update `is_legal_compliance_user`** to match by `system_role = 'legal_compliance'` instead of by name string, so future renames don't break it. Names matched today still work because the canonical row is renamed/kept.
4. Re-run any backfill of `approver_role` on existing legal/compliance approval_steps so the derived `app_role` column matches the new `system_role`.

## Out of scope (unchanged)

- No edits to the workflow engine, `perform-workflow-action`, RLS for `application_legal_notes`, the workflow builder UI, or the legal notes UI.
- No change to how non-legal steps validate.

## Acceptance

- Saving a workflow step with approver = Legal/Compliance Reviewer succeeds.
- Existing Legal/Compliance step rows continue to load and gate actions to legal users.
- All other approver roles still validate exactly as before.
- Only one Legal/Compliance Reviewer row exists in `roles`.
