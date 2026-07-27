## Plan: Fix Complaints module access

### Confirmed current issue
- The `/complaints` route uses `ExternalPortalOrModule`, but its internal branch passes a hardcoded `allowedRoles` list that excludes several internal static roles such as `analyst`, `legal_compliance`, `licensing_officer`, and `developer`.
- `ModuleRoute` still enforces internal-only static audience checks before allowing dynamic permissions, so users with `complaint_management.view` can still be blocked by the route wrapper.
- The sidebar Complaints item has the same static-role allow-list gap, so the menu can stay hidden even when the role has the permission.
- Database checks show several internal users do have `complaint_management.view`; the blocker is therefore at the frontend route/menu layer for those users.

### Changes to implement
1. **Route access**
   - Change the `/complaints` route internal branch so all internal roles are accepted at the static audience layer.
   - Keep the existing module permission gate: internal users still need `complaint_management.view`.
   - Keep external portal access unchanged for applicants, pre-licensees, and licensee users.

2. **Sidebar visibility**
   - Update the main `Complaints` navigation item to include all internal roles while preserving external portal roles.
   - Keep `module: 'complaint_management'`, so internal visibility remains permission-driven.

3. **Backend sanity patch if needed**
   - If UI verification still shows an RPC denial, update `has_complaint_perm` so it relies on the canonical `has_permission(..., 'complaint_management', ...)` helper instead of mixing catalog tables.
   - Preserve existing aliases: `view_all → view`, `triage → assign/edit/investigate`.

4. **Verification**
   - Verify `/complaints` as an internal user with `complaint_management.view` renders the list instead of Access Denied.
   - Verify users without complaint permission remain denied.
   - Verify external users still use portal capability access and are not granted internal complaint admin features.