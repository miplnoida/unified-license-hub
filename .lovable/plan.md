## Diagnosis

The failing request sends `application_management.view` together with dependent permissions like `create`, `edit`, `approve`, `reject`, `manage_config`, and `workflow_action`, but the backend save function currently deletes all existing role permissions before reinserting the submitted set. During that full delete, the database trigger sees `application_management.view` being removed while existing dependent actions are still present, so it rejects the transaction with:

`dependency_still_referenced: cannot remove application_management.view while dependent actions remain on the role`

This is not a missing checkbox in the UI payload; the payload includes View. The backend save order is the unsafe part.

## Implementation plan

1. **Patch the backend role-save function**
   - Replace the current “delete all permissions then insert all permissions” logic in `rbac_save_role` with a dependency-safe diff update:
     - Delete permissions that are no longer in the submitted set.
     - For deletions, remove non-view permissions first.
     - Remove `view` permissions only after their dependents have already been removed.
     - Insert missing permissions after deletions, with `view` inserted before non-view actions.
   - Keep all existing validations, scope handling, role metadata updates, authorization, and audit behavior unchanged.

2. **Preserve DB invariants**
   - Keep the database triggers authoritative.
   - Do not loosen the dependency rule.
   - Do not change unrelated role, permission, RLS, workflow, portal, or business logic.

3. **Add regression coverage**
   - Extend the role-management backend regression test so a no-op save and reordered save of a role containing `view + dependents` succeeds.
   - Add a case where removing only `view` while keeping dependents is still rejected or normalized before save, so the invariant remains protected.

4. **Verify the urgent path**
   - Confirm the specific `Licensing Officer` save path no longer fails when `application_management.view` remains selected.
   - Run the focused permission-dependency/role-management tests relevant to this change.