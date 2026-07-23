## Root cause (confirmed)

`public.publish_workflow_version(uuid, text)` (in `supabase/migrations/20260611134401_...sql`, lines 126–160) gates publish with:

```sql
IF NOT public.has_role(auth.uid(), 'admin') THEN
  RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
END IF;
```

This is the legacy static-role check against `user_roles.role = 'admin'`. The rest of the RBAC system was migrated to the canonical pair `is_super_admin(uid)` + `has_permission(uid, module, action)` driven by dynamic roles. Any user who does not hold the literal static `admin` app_role — including super_admins provisioned only through dynamic roles and any workflow admin persona — gets `Forbidden` on publish. This matches the toast the user is seeing on Pre-License Approval Workflow.

The catalog (`src/lib/rbac/catalog.json`) only registers `workflow_management.view / create / edit` — there is no `publish` action, so the RPC has no canonical action to check today.

## Fix

Backend migration:

1. Add a new permission `workflow_management.publish` to `public.permissions` (idempotent insert), and grant it to the same role templates that already receive `workflow_management.edit` (Legacy Admin + any workflow-owner templates). No new RLS or table changes.
2. Redefine `public.publish_workflow_version(_workflow_id uuid, _notes text)` so the gate becomes:
   ```sql
   IF NOT (public.is_super_admin(auth.uid())
           OR public.has_permission(auth.uid(), 'workflow_management', 'publish')) THEN
     RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
   END IF;
   ```
   Keep `SECURITY DEFINER`, `SET search_path = public`, and the existing snapshot/publish body unchanged. Re-`GRANT EXECUTE ... TO authenticated`.
3. Same treatment for any sibling workflow RPC that still uses `has_role(..., 'admin')` if the migration search turns one up (only publish is in scope for this fix — audit noted but not modified).

Frontend:

4. Register the new action in `src/lib/rbac/catalog.json` (`workflow_management.publish`, `enforced: true`) so the parity script and audit reports stay green.
5. Gate the "Publish new version" button in `src/components/workflows/WorkflowVersionPanel.tsx` with `useCan('workflow_management', 'publish')` / `GuardedButton` so the UI matches the backend and no non-permitted user can click it.

Tests:

6. Extend `supabase/tests/rbac/290_workflow_guard.sql` (or add a new pgTAP file under `supabase/tests/rbac/`) with:
   - super_admin can publish,
   - user with `workflow_management.publish` can publish,
   - user with only `workflow_management.edit` cannot publish (still Forbidden),
   - anonymous / no-permission user is Forbidden.
7. Update `src/test/workflowVersioningMigration.test.ts` expectation to match the new gate string.

## Out of scope

- No changes to snapshot logic, instance pinning, `approval_workflows` schema, or the workflow builder UI.
- Not touching other `has_role`-based RPCs beyond publish in this pass.

## Verification

- Run pgTAP suite (`supabase/tests/rbac/*`) — new publish assertions must be green.
- Run `bunx vitest run` for the workflow versioning migration test.
- Manually: as the current super_admin, click "Publish new version" on Pre-License Approval Workflow — expect success and a new row in `approval_workflow_versions`.
