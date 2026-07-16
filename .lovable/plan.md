## Complaints list shows no data for super_admin

### Root cause

`list_complaints` decides "internal viewer" via `has_complaint_perm(uid, 'view_all' | 'triage')`. That function only bypasses for the legacy `admin` role:

```sql
public.has_role(_user_id, 'admin') OR EXISTS ( ...role_permissions... )
```

The current signed-in user (`6d4f5483-…`) has role `super_admin`, which is not `admin` and has no `role_permissions` mapping. `has_complaint_perm` returns `false`, so `list_complaints` falls through to the "own complaints only" filter (`c.complainant_id = v_uid`) and returns 0 rows even though 28 complaints exist. Every other complaint RPC that uses `has_complaint_perm` has the same blind spot for `super_admin`.

Verified in DB:
- `SELECT count(*) FROM complaints` → 28
- `user_roles` row for the current user → `super_admin`
- `has_complaint_perm('…','view_all')` → `false`

### Fix

One migration: update `public.has_complaint_perm(uuid, text)` so `super_admin` is also treated as a full-access bypass, matching the intent of the "Legacy admins / super admins bypass" comment already in the function.

```sql
CREATE OR REPLACE FUNCTION public.has_complaint_perm(_user_id uuid, _action text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR public.has_role(_user_id, 'super_admin')
    OR EXISTS (
      SELECT 1
      FROM public.role_permissions rp
      JOIN public.permissions p         ON p.id = rp.permission_id
      JOIN public.permission_actions pa ON pa.id = p.action_id
      JOIN public.permission_modules pm ON pm.id = pa.module_id
      JOIN public.user_dynamic_roles udr ON udr.role_id = rp.role_id
      WHERE udr.user_id = _user_id
        AND pm.key = 'complaint_management'
        AND pa.key = _action
    );
$$;
```

No frontend changes. No schema changes. No policy changes. This restores admin visibility across every complaint RPC that gates on `has_complaint_perm` (list, get, analytics, mutations).

### Verification

1. `SELECT public.has_complaint_perm('6d4f5483-b81b-47bb-9e4d-265f9c1b0f25','view_all');` → `true`.
2. Reload `/complaints` in the admin panel → the 28 existing complaints render with filters/pagination intact.
3. No regression for `admin`-role users or users granted access through `role_permissions` (both branches still short-circuit to `true`).

### Out of scope

The larger complaints hardening plan in `.lovable/plan.md` (RPC concurrency, test suite, etc.) is untouched — this is a targeted visibility fix only.