## Findings
- The prudential routes are registered in `dashboardRoutes` and the component files exist.
- In the local running preview, the prudential URLs open for the injected super-admin session and the left sidebar shows the Prudential Supervision section.
- If another user still sees 404 or no sidebar links, the likely cause is stale published frontend assets or that the current role/dynamic-role permission set does not include `prudential_supervision`.

## Plan
1. **Verify route wiring is loaded consistently**
   - Confirm the prudential route block remains in the app route tree.
   - Keep route paths unchanged:
     - `/prudential/dashboard`
     - `/prudential/entities`
     - `/prudential/assessments`
     - `/prudential/actions`
     - `/prudential/escalations`
     - `/prudential/stress-indicators`
     - `/admin/prudential-taxonomy`

2. **Fix sidebar visibility if needed only in navigation/permission wiring**
   - Ensure all Prudential Supervision sidebar items are mapped to the `prudential_supervision` module.
   - Ensure `/prudential/*` and `/admin/prudential-taxonomy` resolve to the same module in the route-permission map.
   - Do not change prudential page logic, queries, forms, or backend behavior.

3. **Check dynamic role permissions**
   - Inspect whether the current non-super-admin role has permissions under `prudential_supervision`.
   - If the catalog/seed is missing that module or its permission actions, add a minimal migration to create the missing permission module/actions only.
   - Do not alter unrelated roles or permissions.

4. **Validate locally**
   - Run typecheck/build.
   - Manually open each prudential URL in the preview.
   - Confirm the left sidebar displays Prudential Supervision links for a role that has the `prudential_supervision` module.

5. **Report exact cause if still failing**
   - Classify the failure as one of:
     - stale deployment
     - missing component file
     - failed lazy import
     - route file not loaded
     - permission guard issue
     - module permission missing for current role

6. **Publishing note**
   - Publishing is still blocked by unresolved critical security scan findings unless you explicitly choose to address or acknowledge them first.