# Fix: no workflow action available at "Under Investigation"

## What is actually wrong (verified)

The complaint sits on the configured step **Investigation** (`step_key = investigation`, order 3) of an active workflow instance. That step has three enabled, correctly configured actions:

```text
resolve_investigation      allowed roles: admin, super_admin, regulator
escalate_to_enforcement    allowed roles: admin, super_admin, regulator
close_no_action            allowed roles: admin, super_admin, regulator
```

So the configuration is fine. The problem is how the two complaint RPCs evaluate the viewer's role:

- `get_complaint_available_actions` and `execute_complaint_workflow_action` both do
  `SELECT role::text INTO v_user_role FROM user_roles WHERE user_id = v_user LIMIT 1;`
  — a single arbitrary legacy role, then compare it to `allowed_role_slugs`.
- Real staff accounts in this database hold legacy roles such as `supervisor`, `licensing_officer`, `analyst`, `legal_compliance` — none of which is `admin` or `regulator`. And `regulator` is not even a value of the `app_role` enum, so nothing can ever match it.
- The dynamic RBAC roles (`user_dynamic_roles` → `roles`, 48 assignments, including Investigator, Market Conduct Supervisor, Licensing Supervisor, System Administrator) are ignored completely by both functions.

Result: everyone except a `super_admin` gets zero actions at every step, and the UI honestly reports "There is nothing for you to do on this step right now / Waiting for … to act". A user who does manage to click through would get `ROLE_NOT_PERMITTED`.

## The fix (one migration, no workflow config changes)

Replace the single-role lookup in both RPCs with a **role-set** evaluation, keeping `allowed_role_slugs` as the authoritative gate:

1. Add a security-definer helper `public.user_workflow_role_slugs(_user uuid) returns text[]` that returns:
   - every legacy `user_roles.role` of the user, plus
   - a slug for each dynamic role in `user_dynamic_roles` (role name lowercased, non-alphanumerics → `_`, e.g. `Market Conduct Supervisor` → `market_conduct_supervisor`), plus
   - two compatibility slugs so existing step configuration keeps working:
     - `admin` when the user is `super_admin`/`admin` or holds System Administrator / Legacy Admin
     - `regulator` when the user is an internal (non-external) staff user — i.e. any legacy staff role or any dynamic role that is not the external ones (Applicant, Regulated Entity User, Consumer / Complainant)
2. `get_complaint_available_actions`: match `allowed_role_slugs && user_workflow_role_slugs(v_user)` instead of `v_user_role = ANY(...)`. Keep the existing `has_complaint_perm(v_user,'view')` gate and the empty-`allowed_role_slugs` = open behaviour.
3. `execute_complaint_workflow_action`: same replacement for its `ROLE_NOT_PERMITTED` check. Everything else in that function — the `has_complaint_perm(v_user,'edit')` gate, required-field validation, mutation kinds, stale-state check, audit writes — stays byte-for-byte the same.

This does not weaken RBAC: an external/applicant user still fails the `edit`/`view` complaint permission gate and never receives the `regulator` compatibility slug, and step-level `allowed_role_slugs` remains the deciding list.

## Frontend (small, presentational)

- In `src/lib/complaintWorkflow.ts`, when no action is available and the step is not terminal, say who it is waiting for by **role** where the assignee is unknown, instead of a bare "nothing for you to do".
- On the Current step panel, when a user has the complaint `edit` permission but the step's configured roles exclude them, show: "This step is restricted to <configured roles>." so the reason is visible rather than looking like a dead end.

## Verification

- Query the two RPCs' definitions after the migration to confirm the new helper is used and the `LIMIT 1` role lookup is gone.
- For a `supervisor`-role staff user, confirm `get_complaint_available_actions` on this complaint returns the three Investigation actions.
- Confirm an applicant user still gets zero actions.
- Run the existing complaint guardrail tests and a typecheck.

## Out of scope

Admin Approval Workflow screens, workflow/step/action definitions, `allowed_role_slugs` values, approval matrices, RLS policies, RFI logic, notifications.
