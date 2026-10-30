## Technical details

### Evidence (read-only)
- Enforcement: `has_permission` → `sec_has_permission`, which reads only `sec_*` tables. `enforce_action(_module,_action,_meta)` writes `audit_logs(action='rbac_action.<m>.<a>', entity_id NULL, metadata=_meta)` in its own request, before the save RPC.
- `assert_role_management_action(_action)`: super admin or `has_permission(role_management,_action)`, otherwise `42501 role_management_action_denied: missing role_management.<action>`. Fired by `trg_roles_mutation_guard`: INSERT → `create`, UPDATE → `edit`. `role_permissions` writes → `assign_permissions`.
- `roles`: NOT NULL `name, system_role, is_system, role_type, dashboard_tier, status, access_summary, scope_config` (the last two default `{}`). CHECK: `role_type ∈ {internal, external}`, `dashboard_tier ∈ {operational, executive}`, `status ∈ {active, inactive}`. UNIQUE `name`. Triggers: mutation guard, scope validation, activation check.
- `sec_roles`: UNIQUE `key`. `dashboard_tier` and `system_role` nullable. Trigger `updated_at`. `sec_role_permissions`: no triggers. `audit_logs` has `old_value`, `new_value` and `metadata`, and is append-only.
- Of the 42 `sec_roles`-only roles: 21 have a tier in {admin, supervisory, oversight}, and 2 clash by name with a different `roles` row (Prudential Analyst, Applicant). Complaints Officer and Returns Officer are `internal/operational/active`, with `system_role` NULL and no clash.
- Mapping: 0 duplicate keys on either side. Complaints Officer has 15 grants (11 mapped, 4 unmapped) and 1 user.

### Changed files
- `src/hooks/useRoles.ts`: permission reads come from `sec_role_permissions`, mapped to legacy `permissions.id`, with a per-role `unmapped` list. `authorizedAction` meta becomes `{ phase: 'attempt', role_id, is_new, permission_count }`.
- `src/pages/admin/RoleManagement.tsx`: read-only "Also held (managed elsewhere)" list. `explainSaveFailure` maps `role_management_action_denied: missing role_management.create` and `legacy_twin_blocked:*` to the plain messages.
- `src/test/rolePermissionMapping.test.ts` (new): mapping, unmapped ids never sent, error-message mapping.
- Staged migration: `CREATE OR REPLACE FUNCTION public.sec_save_role(jsonb)` only.

### SQL changes versus the previous plan
The twin block in the previous SQL is replaced by:
```sql
IF v_target IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_target) THEN
  SELECT * INTO v_sec FROM public.sec_roles WHERE id = v_target;
  IF v_sec.id IS NULL THEN RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002'; END IF;
  IF COALESCE(v_sec.dashboard_tier, 'operational') NOT IN ('operational','executive') THEN
    RAISE EXCEPTION 'legacy_twin_blocked: dashboard_tier=%', v_sec.dashboard_tier USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.roles WHERE name = v_sec.name) THEN
    RAISE EXCEPTION 'legacy_twin_blocked: name_clash' USING ERRCODE = '23505';
  END IF;
  -- INSERT fires trg_roles_mutation_guard -> requires role_management.create (not bypassed)
  INSERT INTO public.roles (id, name, description, system_role, is_system, role_type,
         dashboard_tier, role_category, status, created_at, updated_at)
  VALUES (v_sec.id, v_sec.name, v_sec.description, COALESCE(v_sec.system_role, 'custom'),
          v_sec.is_system, v_sec.role_type, COALESCE(v_sec.dashboard_tier, 'operational'),
          v_sec.role_category, v_sec.status, v_sec.created_at, now());
  v_twin_created := true;
END IF;
```
- In the post-save `sec_roles` upsert, `system_role` and `dashboard_tier` keep the canonical value when `v_twin_created`, so a defaulted value never leaks back. `key` is never updated, so `sec_roles_key_key` is safe.
- The rest is as in the previous plan: mapped-only delete, insert of mapped selections, and one `security.save_role` row with `old_value` / `new_value` holding added, removed and kept lists plus `legacy_twin_created`. Everything runs in one transaction, so any exception rolls it all back.

### Static verification done
- Every column in the SQL exists with a compatible type and nullability.
- Each NOT NULL column is filled. The `roles` CHECK constraints are pre-checked, `roles_name_key` is pre-checked, and `sec_roles_key_key` is never changed.
- All five triggers on `roles` and `role_permissions` are accounted for, and none are bypassed.
- `audit_logs` writes are insert-only.
- The `support_management` actions (view, assign, respond, update, resolve, close) exist in both catalogues, so all 6 map.

Not done yet, pending your approval: compiling and running the tests and the regression SQL.

### Rollback
- Re-create the current `sec_save_role` body. It goes in the migration file as a verbatim comment.
- Revert `useRoles.ts` and `RoleManagement.tsx`, and delete the new test.
- Twins created by successful saves are exact copies. They can stay, or be removed by id with your approval.
- Audit rows are append-only and stay.
