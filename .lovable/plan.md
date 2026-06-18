# Why "Applicant" shows in the header

The user `superadmin@yopmail.com` is correctly set up in the backend:

- `user_roles` → `super_admin` ✅
- `profiles.role` → `applicant` (legacy column, no longer authoritative)
- `user_dynamic_roles` → mapped to a dynamic role named **"Applicant"** ❌

The header label is rendered in `src/components/layout/Header.tsx` as:

```ts
user.dynamicRoleName || effectiveRoleLabel
```

`fetchPlatformUser` (in `src/lib/authHelpers.ts`) joins `user_dynamic_roles → roles.name` and puts the result into `dynamicRoleName`. Because that mapping points at a role literally called "Applicant", it wins over the correct effective label ("Super Admin"), even though every permission check that uses `user.role` already resolves to `super_admin`.

So this is purely a **stale data row**, not a code bug. Major actions are not blocked by the label — but if they appear to be, that's a separate dynamic-permissions issue we can look at after cleaning this up.

## Fix

Delete the incorrect dynamic-role assignment so the header falls back to the effective role label:

```sql
DELETE FROM public.user_dynamic_roles
WHERE user_id = '6d4f5483-b81b-47bb-9e4d-265f9c1b0f25'
  AND role_id = 'b9b48b7d-8ace-4257-b62e-06b58b3c6442'; -- "Applicant" dynamic role
```

After this, on next login (or after the 5-minute auto re-hydrate) the header will display **"Super Admin"**.

## Out of scope (ask if you want them)

- Cleaning up the legacy `profiles.role = 'applicant'` value for this user.
- Hardening `Header.tsx` to ignore `dynamicRoleName` when it duplicates / contradicts an internal `user.role` like `super_admin` (prevents this class of mislabeling in future).
