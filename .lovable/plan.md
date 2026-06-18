## Why this is happening

The app is using two permission models at the same time:

1. **Old static role checks** on menu items, like `admin` / `super_admin`.
2. **New dynamic role permissions** from Role Management, like `registration_management`, `form_management`, `fee_management`, etc.

Because many sidebar menu entries still declare only `admin` / `super_admin`, an employee can be granted the correct dynamic permission but still be hidden or blocked by leftover static-role logic.

I also checked the live backend data and found a data consistency issue: current users with dynamic roles are not consistently stored as employee/internal profiles. Some internal-looking users still have `user_type = primary`, and at least one custom internal role has a missing `system_role`. That means even if the UI grant looks correct, the app may not classify the user as internal everywhere.

## Plan

1. **Centralize internal user detection**
   - Create one shared helper for “is this user internal?” based on:
     - app/system role: `super_admin`, `admin`, `supervisor`, `licensing_officer`, `analyst`, `developer`
     - dynamic role type: `internal`
     - employee profile type where available
   - Use this helper in sidebar and route guards so all menus follow the same rule.

2. **Make sidebar module permissions the source of truth**
   - For menu items with a `module`, show the menu when the user has that module permission.
   - Keep admin/internal pages protected from external users, but do not require the user to be statically `admin` just to see an admin-panel menu.
   - Apply this to every sidebar item, including children, so we stop fixing menus one by one.

3. **Align route guards with sidebar visibility**
   - Ensure `ModuleRoute` uses the same internal/dynamic permission logic as the sidebar.
   - If a menu is visible because a dynamic module is granted, the route should also be accessible.
   - If the route is internal-only, external portal users remain blocked even if a similarly named module exists.

4. **Fix employee role assignment consistency**
   - Update employee creation/editing so internal dynamic roles always store a valid internal baseline system role, defaulting safely to `analyst` when needed.
   - Prevent roles with missing `system_role` from breaking employee classification.

5. **Normalize existing affected data**
   - Add a backend migration to repair existing internal dynamic roles/users:
     - set missing internal `system_role` values to `analyst`
     - ensure users assigned internal dynamic roles have an internal baseline role in `user_roles`
     - normalize misclassified internal employee profiles where safe

6. **Verify globally**
   - Test at least these modules as an employee with grants:
     - Registration Review
     - Form Management
     - Fee Management
     - Returns Management
     - Workflows
     - Role/User Management if granted
   - Confirm hidden items stay hidden when not granted.

## Expected result

After this, granting a module permission in Role Management should consistently make the corresponding menu and page available for employees across the whole system, without needing separate fixes for each menu.