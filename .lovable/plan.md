## What I found
The workflow data exists and the Super Admin role mapping exists, but these workflow tables have **no Data API table grants** for `authenticated` or `service_role`:

- `approval_workflows`
- `approval_steps`
- `approval_workflow_types`
- `user_roles`
- `profiles`

That means the browser client can receive empty/blocked results even though the backend rows and RLS policies are present.

## Fix plan
1. **Add explicit Data API grants for workflow access tables**
   - Grant `SELECT, INSERT, UPDATE, DELETE` to signed-in users on workflow tables that already have RLS policies.
   - Grant `ALL` to backend service role for the same tables.
   - Do not add anonymous access.

2. **Keep existing RLS policies unchanged**
   - Super Admin/internal access will still be controlled by the current role policies.
   - This only restores table reachability through the app API.

3. **Verify from the app path**
   - Re-check that the workflow tables are reachable through the signed-in Super Admin context.
   - Confirm `/workflows` shows the 8 existing records.

4. **Republish after the migration**
   - Publish the current build again so the BOJ domain gets both the latest frontend fix and backend permission fix.

## Expected result
Super Admin on the BOJ domain will see the existing approval workflows instead of `0` records.