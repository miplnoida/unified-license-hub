## Technical details

### Evidence
- `has_permission` → `sec_has_permission`, which reads only `sec_user_roles` / `sec_roles` / `sec_role_permissions` / `sec_permissions` / `sec_modules`. The legacy `roles` / `role_permissions` tables are not used for enforcement.
- `sec_save_role` → `rbac_save_role`, which validates scopes and view dependencies, stores `roles.scope_config`, and runs `UPDATE roles … IF NOT FOUND RAISE 'role_not_found'`. `sec_save_role` then rebuilds `sec_role_permissions` from legacy `role_permissions` mapped by (module, action), deleting everything else.
- Complaints Officer `3d01da28-6741-4f3b-b775-d96e05c106c0`: no `roles` row, 15 `sec_role_permissions`, 1 `sec_user_roles`. Only 11 of the 15 map to legacy `permissions`. Unmapped: `complaint_management:assign|investigate|resolve`, `correspondence_management:dispatch`. No legacy role has the same name, so `roles_name_key` does not conflict.
- `useAllRolePermissions` / `useRolePermissions` (`src/hooks/useRoles.ts`) read legacy `role_permissions`, so a `sec_roles`-only role opens with no ticks.
- Both catalogues define `support_management` view/assign/respond/update/resolve/close, so every Support Management action maps.
- `sec_role_permissions` SELECT policy: `has_permission(auth.uid(),'role_management','view')`. Authenticated users have the grant, so the page can read it.

### Affected
- `public.sec_role_permissions` read path in `src/hooks/useRoles.ts` (both hooks): select `role_id, sec_permissions(key, sec_modules(key))` and map to the legacy `permissions.id` by normalised (module, name). Unmapped grants are not shown and are not sent.
- Staged migration: `CREATE OR REPLACE FUNCTION public.sec_save_role(jsonb)` only. `rbac_save_role`, RLS, grants, tables and data are unchanged.

### Complete SQL (staged; runs only on accept)
```sql
-- Rollback: re-run the previous sec_save_role definition (copied verbatim
-- into the migration file as a comment block).
CREATE OR REPLACE FUNCTION public.sec_save_role(_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  v_result jsonb; v_role_id uuid; v_key text; v_perm_ids uuid[];
  v_target uuid := NULLIF(_payload ->> 'id', '')::uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;
  IF NOT (public.is_super_admin(uid) OR public.has_permission(uid, 'role_management', 'edit')) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- On-demand legacy twin for THIS role only (same id and attributes).
  IF v_target IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.roles WHERE id = v_target) THEN
    IF NOT EXISTS (SELECT 1 FROM public.sec_roles WHERE id = v_target) THEN
      RAISE EXCEPTION 'role_not_found' USING ERRCODE = 'P0002';
    END IF;
    INSERT INTO public.roles (id, name, description, system_role, is_system,
                              role_type, dashboard_tier, role_category, status,
                              created_at, updated_at)
    SELECT s.id, s.name, s.description,
           COALESCE(s.system_role, 'custom'), COALESCE(s.is_system, false),
           s.role_type, s.dashboard_tier, s.role_category, s.status,
           s.created_at, now()
    FROM public.sec_roles s WHERE s.id = v_target;
  END IF;

  v_result := public.rbac_save_role(_payload);
  v_role_id := (v_result ->> 'id')::uuid;

  v_key := lower(regexp_replace(trim(COALESCE(_payload ->> 'name', '')), '[^a-zA-Z0-9]+', '_', 'g'));
  v_key := NULLIF(trim(both '_' from v_key), '');

  INSERT INTO public.sec_roles (id, key, name, description, role_type, role_category,
                                dashboard_tier, status, system_role, is_system, created_by)
  SELECT r.id, COALESCE(v_key, 'role_' || replace(r.id::text, '-', '')),
         r.name, r.description, COALESCE(r.role_type, 'internal'), r.role_category,
         r.dashboard_tier, COALESCE(r.status, 'active'), r.system_role,
         COALESCE(r.is_system, false), uid
  FROM public.roles r WHERE r.id = v_role_id
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    role_type = EXCLUDED.role_type, role_category = EXCLUDED.role_category,
    dashboard_tier = EXCLUDED.dashboard_tier, status = EXCLUDED.status,
    system_role = EXCLUDED.system_role, updated_at = now();

  SELECT ARRAY(
    SELECT DISTINCT sp.id
    FROM public.role_permissions rp
    JOIN public.permissions p ON p.id = rp.permission_id
    JOIN public.sec_modules m ON m.key = lower(regexp_replace(p.module, '\s+', '_', 'g'))
    JOIN public.sec_permissions sp ON sp.module_id = m.id AND sp.key = lower(p.name)
    WHERE rp.role_id = v_role_id
  ) INTO v_perm_ids;

  -- Remove only grants the page can represent; keep unmapped canonical grants.
  DELETE FROM public.sec_role_permissions srp
  USING public.sec_permissions sp, public.sec_modules m
  WHERE srp.role_id = v_role_id
    AND sp.id = srp.permission_id AND m.id = sp.module_id
    AND NOT (srp.permission_id = ANY(v_perm_ids))
    AND EXISTS (SELECT 1 FROM public.permissions p
                WHERE lower(regexp_replace(p.module, '\s+', '_', 'g')) = m.key
                  AND lower(p.name) = sp.key);

  INSERT INTO public.sec_role_permissions (role_id, permission_id)
  SELECT v_role_id, x FROM unnest(v_perm_ids) AS t(x)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, new_value)
  VALUES (uid, 'security.save_role', 'sec_role', v_role_id::text,
          jsonb_build_object('permission_count', COALESCE(array_length(v_perm_ids, 1), 0)));

  RETURN jsonb_build_object('id', v_role_id);
END;
$function$;
```
- `system_role` is NOT NULL on `roles`, so `'custom'` is used only when the canonical value is null. This is the only place an attribute can differ, and the test will report it if it happens.
- The authorisation check runs before any write. The function is a single transaction, so a failure in validation, a constraint or the mirror rolls back the twin too.

### Security impact
No new privilege and no change to who can call the save. The deletion scope gets narrower, so the save can only remove grants the page can show. The page's read path still goes through the existing `role_management.view` policy.

### Regression tests (after accept; each in a rolled-back transaction as TEST super admin)
1. Complaints Officer: loaded ticks equal the 11 mapped grants. Save with Support Management added → `roles` twin has the same id/attributes, `sec_role_permissions` = previous 15 + Support Management, the 4 unmapped are kept, `sec_user_roles` unchanged, and `sec_has_permission` is true for `support_management:view` for the assigned user.
2. Returns Officer: the same checks for an affected role.
3. Approver/Decision-Maker (has a legacy row): no twin insert, and behaviour is identical to today.
4. A caller without `role_management.edit` → `not_authorized`, and no rows change.
5. Forced failure (invalid scope) → no twin row, no permission change.
6. Vitest for the mapping in `useRoles`. Then the browser save on Complaints Officer as an admin session, with the readback check.

### Rollback
Restore the previous `sec_save_role` body and revert the `useRoles.ts` read path. Twins already created are identical copies and can stay, or be removed by id after you approve.
