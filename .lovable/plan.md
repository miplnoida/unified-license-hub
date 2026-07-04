# Fix: applicant name shows as UUID in Activity Trail

## Root cause

`useEntityAuditLog` resolves actor names only from `public.profiles`. But applicants (pre-licensees) live in `public.pre_license_users`, not `profiles`. When the audit trail includes an action taken by a pre-licensee (e.g. "Application submitted" by Arya Deepti, `bbbbf700-…`), the profile lookup misses and the row falls back to showing the raw user UUID. Internal staff (Super Admin, Vidya Rani) resolve fine because they exist in `profiles`.

Confirmed on `/applications/b9acc94b-…`: Super Admin and Vidya Rani show names; `bbbbf700-…` shows as UUID for every action taken by the applicant.

RLS is already permissive enough — internal staff can read all `pre_license_users`, and pre-licensees can read their own row — so a client-side query works without extra migrations.

## Fix

Update `src/hooks/useEntityAuditLog.ts` so name resolution also queries `pre_license_users` and merges results into the actor name map. Profile match wins if both exist; otherwise use pre_license_users; otherwise fall back to `'System'` (when `user_id` is null) or the UUID.

Pseudocode inside the hook, after the current `profiles` fetch:

```ts
const [{ data: profiles }, { data: preUsers }] = await Promise.all([
  supabase.from('profiles').select('id, email, full_name').in('id', userIds),
  supabase.from('pre_license_users').select('id, email, full_name').in('id', userIds),
]);
preUsers?.forEach((u) => {
  if (!nameMap[u.id]) nameMap[u.id] = u.full_name || u.email || u.id;
});
profiles?.forEach((p) => {
  nameMap[p.id] = p.full_name || p.email || nameMap[p.id] || p.id;
});
```

Also change the final fallback so an unresolved UUID renders as a friendlier `'Unknown user'` label instead of the raw UUID.

## Scope

- One file edited: `src/hooks/useEntityAuditLog.ts`.
- No DB migration, no RLS change, no component change (all timelines built on `EntityTimeline` inherit the fix — application, return, license, licensee, fit-and-proper, etc.).

## Verification

Reload `/applications/b9acc94b-9c28-486e-a48a-93bbc7b30c1a`, open the Activity tab, confirm rows previously labeled `bbbbf700-0a8b-…` now read `by Arya Deepti`.
