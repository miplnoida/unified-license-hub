## Diagnosis (verified)

The reject call fails at the edge function's authorization gate, before any workflow logic runs.

`supabase/functions/perform-registration-workflow-action/index.ts:45` calls:

```ts
requireUserPermission(req, "registration_management", "workflow_action")
```

But the permission catalog has no such entry:

- `permissions` for `registration_management` contains only: `view, create, edit, approve, reject` — **no `workflow_action`**.
- Every other workflow module *does* have it: `application_management`, `returns_management`, `license_management`, `compliance_management`, `enforcement_management`, `inspection_management`, `fit_and_proper`, `prudential_supervision`.
- `public.has_permission()` matches on module + action name only, so a non-existent action always returns false → 403 `Forbidden` for everyone except super_admin.

So this affects **all** registration workflow actions (approve, reject, send back, escalate, save comment) for non-super-admin reviewers — not just reject.

## Fix

One migration, no code changes:

1. Insert the `workflow_action` entry into `permission_actions` for the `registration_management` module (label "Perform workflow action"), matching how the other workflow modules are catalogued.
2. Insert the matching row into `permissions` (`module = 'registration_management'`, `name = 'workflow_action'`).
3. Grant it via `role_permissions` to every role that already holds `registration_management.approve` or `registration_management.reject`, so existing reviewer roles keep working without manual re-configuration.
4. Register the dependency in `src/lib/rbac/permissionDependencies.ts` if the other workflow modules declare one there (so Role Management doesn't flag a dependency violation), mirroring `application_management.workflow_action`.

## Verification

- Re-query `permissions` / `role_permissions` to confirm the new grant lands on the reviewer roles.
- Call the edge function with the same payload (registration `1a347080…`, action `reject`) as the signed-in reviewer and confirm it returns the workflow result instead of `Forbidden`.
- Confirm approve on the same step still works.

No changes to the workflow RPC, notification bindings, or any other module.
