## Fix login email typo for user `35da4b65-baa5-426c-be83-3991b03132f0`

### Current state
- `auth.users.email` = `vidyarani@yopamil.com` (typo — blocks login)
- `public.profiles.email` = `vidyarani@yopmail.com` (already correct)

### Change
Run a one-off migration that updates the auth record only:

```sql
UPDATE auth.users
SET email = 'vidyarani@yopmail.com',
    email_change = NULL,
    email_change_token_new = '',
    email_change_token_current = '',
    email_confirmed_at = COALESCE(email_confirmed_at, now()),
    updated_at = now()
WHERE id = '35da4b65-baa5-426c-be83-3991b03132f0'
  AND email = 'vidyarani@yopamil.com';
```

Also mirror to `auth.identities` so the email-provider identity stays in sync:

```sql
UPDATE auth.identities
SET identity_data = jsonb_set(identity_data, '{email}', '"vidyarani@yopmail.com"'),
    email = 'vidyarani@yopmail.com',
    updated_at = now()
WHERE user_id = '35da4b65-baa5-426c-be83-3991b03132f0'
  AND provider = 'email';
```

No application code changes. `public.profiles` already holds the correct address, so no further updates are required.

### Verification
- `SELECT email FROM auth.users WHERE id = '35da4b65-…'` returns `vidyarani@yopmail.com`.
- User can sign in at `/login` with the corrected address.
