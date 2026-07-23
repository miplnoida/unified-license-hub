## Diagnosis

The `applications_insert` RLS policy is:

```sql
is_super_admin(auth.uid())
OR has_permission(auth.uid(),'application_management','create')
OR (applicant_id = auth.uid()
    AND (NOT has_external_role(auth.uid())
         OR has_role(auth.uid(),'applicant')
         OR has_role(auth.uid(),'pre_licensee')
         OR has_role(auth.uid(),'licensee_primary')
         OR has_role(auth.uid(),'licensee_secondary')))
```

For the reported user `fincorp@yopmail.com` (id `e540758e-…`), I verified via psql that:

- `has_external_role` = **true**
- `has_role(applicant)` = **true**, `has_role(pre_licensee)` = **true**
- `has_permission(application_management, create)` = false, `is_super_admin` = false

So the policy **does** permit the insert on paper as long as `applicant_id = auth.uid()`. That points the finger at the client side, not the RLS: the row is being sent with an `applicant_id` that does **not** equal the JWT's `sub`. Two overlapping ways this happens in `src/pages/NewApplication.tsx`:

1. **Stale `user.id` from AuthContext.** `upsertDraftApplication` sends `applicant_id: user.id`. `user` is only re-hydrated every 5 min or on auth events; after a Supabase silent token refresh, or after a licensee switch / PPOC switch, `user.id` in memory can diverge from the current `auth.uid()` on the server. Result: RLS denies with the exact error the user pasted.
2. **Missing session.** If the token has expired/logged out in another tab and no refresh has fired yet, `auth.uid()` is NULL and every branch of the policy is false.

## Fix (client only — no RLS / DB changes)

Edit only `src/pages/NewApplication.tsx → upsertDraftApplication`:

1. Immediately before the INSERT, resolve the *live* auth user:
   ```ts
   const { data: authData, error: authErr } = await supabase.auth.getUser();
   const authUserId = authData?.user?.id;
   if (authErr || !authUserId) {
     toast.error('Your session has expired. Please sign in again.');
     navigate('/login');
     return null;
   }
   ```
2. Use `authUserId` (not `user.id`) as the `applicant_id` on the INSERT. This guarantees `applicant_id === auth.uid()` regardless of any stale `AuthContext` state.
3. On the UPDATE branch, keep it unchanged (RLS already checks `can_mutate_application`).
4. Improve the toast when Postgres returns code `42501` / `new row violates row-level security policy`: append "Please sign out and back in." so users have a clear next action if it recurs from another cause.

## Verification

- Reproduce the flow as `fincorp@yopmail.com` → "Proceed to Forms" → application row inserts, no RLS error, navigation to forms proceeds.
- Force a stale user object (e.g. hot-reload the AuthContext while keeping the Supabase session) → insert still succeeds because we now trust the live JWT.
- Simulate expired session (delete the Supabase key from localStorage) → user is toasted and redirected to `/login`, no cryptic RLS error.
- No changes to RLS, triggers, other pages, or admin/internal flows.