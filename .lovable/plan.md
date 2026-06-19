## Change user role to `applicant`

**Target user:** `anisha@yopmail.com` — Entity "Anisha" (id: `53b18f0d-89e0-44dc-bd23-32104e6565b8`)
**Current role:** `licensee_primary`
**New role:** `applicant`

### SQL to run
```sql
UPDATE public.user_roles
SET role = 'applicant'
WHERE user_id = '53b18f0d-89e0-44dc-bd23-32104e6565b8';
```

### Scope
- Only `user_roles.role` for this single user is changed.
- No edits to `profiles`, `licensees`, `licenses`, `registrations`, or any other data.
- No code/file changes.

Note: after this change the user will lose licensee portal access (sidebar, license dashboard, etc.) and will be routed as a standard applicant on next sign-in. Confirm to proceed.