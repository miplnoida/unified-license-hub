## Root cause

The earlier policy only permits `super_admin`, `admin`, and `supervisor`. The internal complaint form is also used by other internal roles in this project (`licensing_officer`, `analyst`, `legal_compliance`, `developer`). Those users are still rejected by RLS when `complainant_id` is blank.

There is a second issue for users who have both internal and external roles: the restrictive external gate treats any external role as external and can still block an internal staff insert.

## Plan

1. **Update complaint INSERT policy**
   - Replace the narrow staff INSERT policy with one that permits all internal roles:
     - `super_admin`
     - `admin`
     - `supervisor`
     - `licensing_officer`
     - `analyst`
     - `legal_compliance`
     - `developer`

2. **Fix mixed-role users**
   - Update the restrictive external complaint insert gate so users with any internal role are treated as internal for complaint intake, even if they also have an external role.
   - Keep external-only users governed by the existing complaint capability checks.

3. **Keep existing external behavior**
   - Do not weaken external complaint permissions.
   - Existing self-complaint policy remains unchanged for regular authenticated/external users.

4. **Verify**
   - Inspect final complaint policies after migration.
   - Run a read-only DB check confirming internal-role users can satisfy the new policy logic and external-only users remain gated.