## Technical details

### Read-only evidence (this turn)
- Mapping key: legacy `permissions` (lower(module with spaces→_), lower(name)) ↔ `sec_permissions.key` + `sec_modules.key`. Duplicate keys: legacy 0, canonical 0, so the mapping is one-to-one. Canonical without a legacy twin: 146/423. Legacy without a canonical twin: 7. `sec_role_permissions` grants without a twin: 178 across 41 roles.
- Enforcement: `has_permission` → `sec_has_permission`, which reads only `sec_*` tables.
- Complaints Officer `3d01da28-…`: 15 grants. Unmapped: `complaint_management:{assign,investigate,resolve}` and `correspondence_management:dispatch`. All active. 1 user, `system_role` NULL, no `roles` row, no name clash on `roles_name_key`. Returns Officer: 7 grants, 1 user, no `roles` row. Approver/Decision-Maker: 30 grants, has a `roles` row.
- `roles` triggers: `trg_roles_mutation_guard` (INSERT → `assert_role_management_action('create')`), scope validation, activation check. `role_permissions` triggers: action guard (`assign_permissions`), view dependency and view retention. `sec_role_permissions`: no triggers.
- Audit: the client calls `authorizedAction('role_management','assign_permissions')` before the RPC, as a separate request with no `entity_id`. Two rows were written at 08:05:02 and 08:05:04 today for the failed saves. The RPC writes `security.save_role` with only `permission_count`.
- Static: `useAllRolePermissions` / `useRolePermissions` and `fetchStoredPermissionIds` read legacy `role_permissions`.

### Changed files
- `src/hooks/useRoles.ts`: both permission read hooks select `sec_role_permissions(role_id, sec_permissions(key, sec_modules(key)))` and map to legacy `permissions.id` by the key above. They also return an `unmapped` list per role. `authorizedAction` metadata gains `phase: 'attempt'` and `role_id`.
- `src/pages/admin/RoleManagement.tsx`: read-only "Also held (managed elsewhere)" list in the role editor. The readback check stays on legacy `role_permissions`, which after the save equals the submitted set.
- `src/test/rolePermissionMapping.test.ts` (new): mapping, unmapped handling, and that the payload never includes unmapped ids.
- Staged migration `…_sec_save_role_safe_twin.sql`: `CREATE OR REPLACE FUNCTION public.sec_save_role(jsonb)` only.

### Complete SQL (staged; runs only on accept)
```sql
CREATE OR REPLACE FUNCTION public.sec_save_role(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_target uuid := NULLIF(_payload ->> 'id', '')::uuid;
  v_twin_created boolean := false;
  v_result jsonb; v_role_id uuid; v_key text;
  v_perm_ids uuid[]; v_before uuid[]; v_after uuid[];
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid, 'role_management', 'edit')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF v_target IS NOT NULL THEN
    SELECT COALESCE(array_agg(permission_id), '{}') INTO v_before
      FROM public.sec_role_permissions WHERE role_id = v_target;
    IF NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_target) THEN
      IF NOT EXISTS (SELECT 1 FROM public.sec_roles WHERE id = v_target) THEN
        RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002';
      END IF;
      INSERT INTO public.roles (id, name, description, system_role, is_system,
             role_type, dashboard_tier, role_category, status, created_at, updated_at)
      SELECT s.id, s.name, s.description, COALESCE(s.system_role, 'custom'),
             COALESCE(s.is_system, false), s.role_type, s.dashboard_tier,
             s.role_category, s.status, s.created_at, now()
        FROM public.sec_roles s WHERE s.id = v_target;
      v_twin_created := true;
    END IF;
  ELSE
    v_before := '{}';
  END IF;

  v_result := public.rbac_save_role(_payload);
  v_role_id := (v_result ->> 'id')::uuid;

  v_key := lower(regexp_replace(trim(COALESCE(_payload ->> 'name', '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_key := NULLIF(trim(both '_' from v_key), '');

  INSERT INTO public.sec_roles (id, key, name, description, role_type, role_category,
                                dashboard_tier, status, system_role, is_system, created_by)
  SELECT r.id, COALESCE(v_key, 'role_' || replace(r.id::text, '-', '')), r.name, r.description,
         COALESCE(r.role_type, 'internal'), r.role_category, r.dashboard_tier,
         COALESCE(r.status, 'active'), r.system_role, COALESCE(r.is_system, false), uid
    FROM public.roles r WHERE r.id = v_role_id
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    role_type = EXCLUDED.role_type, role_category = EXCLUDED.role_category,
    dashboard_tier = EXCLUDED.dashboard_tier, status = EXCLUDED.status,
    -- keep canonical system_role when the twin had to default it
    system_role = CASE WHEN v_twin_created THEN public.sec_roles.system_role
                       ELSE EXCLUDED.system_role END,
    updated_at = now();

  SELECT ARRAY(
    SELECT DISTINCT sp.id FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.key = lower(regexp_replace(p.module, '\s+', '_', 'g'))
    JOIN public.sec_permissions sp ON sp.module_id = m.id AND sp.key = lower(p.name)
    WHERE rp.role_id = v_role_id) INTO v_perm_ids;

  -- Remove only mapped grants that were deselected; unmapped grants are kept.
  DELETE FROM public.sec_role_permissions srp
  USING public.sec_permissions sp, public.sec_modules m
  WHERE srp.role_id = v_role_id AND sp.id = srp.permission_id AND m.id = sp.module_id
    AND NOT (srp.permission_id = ANY(v_perm_ids))
    AND EXISTS (SELECT 1 FROM public.permissions p
                WHERE lower(regexp_replace(p.module, '\s+', '_', 'g')) = m.key
                  AND lower(p.name) = sp.key);

  INSERT INTO public.sec_role_permissions (role_id, permission_id)
  SELECT v_role_id, x FROM unnest(v_perm_ids) AS t(x) ON CONFLICT DO NOTHING;

  SELECT COALESCE(array_agg(permission_id), '{}') INTO v_after
    FROM public.sec_role_permissions WHERE role_id = v_role_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_value, new_value)
  VALUES (uid, 'security.save_role', 'sec_role', v_role_id::text,
    jsonb_build_object('permission_count', cardinality(v_before)),
    jsonb_build_object(
      'permission_count', cardinality(v_after),
      'legacy_twin_created', v_twin_created,
      'added',   (SELECT COALESCE(jsonb_agg(m.key||':'||sp.key ORDER BY 1), '[]')
                    FROM unnest(v_after) a(id) JOIN public.sec_permissions sp ON sp.id = a.id
                    JOIN public.sec_modules m ON m.id = sp.module_id WHERE NOT a.id = ANY(v_before)),
      'removed', (SELECT COALESCE(jsonb_agg(m.key||':'||sp.key ORDER BY 1), '[]')
                    FROM unnest(v_before) b(id) JOIN public.sec_permissions sp ON sp.id = b.id
                    JOIN public.sec_modules m ON m.id = sp.module_id WHERE NOT b.id = ANY(v_after))));

  RETURN jsonb_build_object('id', v_role_id, 'legacy_twin_created', v_twin_created);
END;
$function$;
```
- The function is one transaction. Any exception (authorisation, `create` guard, scope or dependency trigger, name clash) rolls back the twin, both permission sets and the audit row together.
- If `old_value` is not a column of `audit_logs`, both snapshots go into `new_value` instead. This is checked before staging.

### Security impact
No new privilege. The edit check is unchanged, and the twin insert still requires `role_management.create` through the existing trigger. The deletion scope is narrower than today. There are no RLS, grant, assignment or other-role changes.

### Regression plan (after accept; rolled-back transactions as the TEST super admin, plus negative cases)
1. Complaints Officer + Support Management → the 15 grants are kept and 6 added (21 total), the 4 unmapped are kept, 1 user unchanged, the twin attributes equal `sec_roles`, `sec_has_permission(user,'support_management','view')` is true, and there is one audit row with `added`=6 and `removed`=0.
2. Complaints Officer with `complaint_management:edit` unticked → only that grant is removed, and the audit row shows `removed`=[that one].
3. Returns Officer: case 1 for that role.
4. Approver/Decision-Maker: no twin, mapped grants behave as today, unmapped grants kept.
5. Invalid scope → no `roles` row, `sec_role_permissions` identical to before, no audit row.
6. A caller without `role_management.edit` → `not_authorized`, nothing changes.
7. Vitest mapping test, then a browser save as an admin session with the readback check.

### Rollback
Re-create the current `sec_save_role` body (copied verbatim as a comment in the migration) and revert the two front-end files. Twins created by saves are exact copies. They can stay, or be removed by id with your approval.
