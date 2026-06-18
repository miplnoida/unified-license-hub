## Root causes

1. **RLS insert blocked** — Policy `external_applications_insert_capability_gate` requires the user to have the dynamic "Applicant" role mapped through `user_dynamic_roles → role_permissions(module='licensing', name='submit')`. User `817…` (Anisha) has the static `pre_licensee` role but no row in `user_dynamic_roles`. `seed_external_portal_defaults` was supposed to grant the dynamic role at signup but didn't run/succeed for this user, so `has_portal_capability(..., 'can_submit')` returns false and the insert is rejected.

2. **Draft / registration data not visible in new application** — `NewApplication.tsx` only hydrates an existing draft when the URL contains `?draft=<id>` or `/continue`. Clicking "New Application" always starts blank with no sector/sub-sector/category. There is no logic that pre-fills these from the user's approved registration, so the wizard appears empty even though the registration already has them.

## Plan

### 1. Make the RLS gate resilient (database migration)
Update `external_can_access_application_values` so a user inserting their own application passes the gate when **either**:
- they already have the dynamic capability (current check), **or**
- they hold a relevant static role (`applicant`, `pre_licensee`, `licensee_primary`, `licensee_secondary`) — these built-in roles inherently imply "can submit my own application".

This keeps the dynamic-RBAC system in place but stops it from silently locking out external users when their dynamic role row is missing.

### 2. Self-heal dynamic role on first use (same migration)
- Backfill: for every user in `user_roles` with role in (`applicant`, `pre_licensee`, `licensee_primary`, `licensee_secondary`) that has no `user_dynamic_roles` row, insert the matching dynamic role (Applicant / Regulated Entity User).
- Add a trigger on `user_roles` that calls `seed_external_portal_defaults` after insert, so any future user can't end up in this broken state.

### 3. Pre-fill sector / sub-sector / category from the approved registration
In `src/pages/NewApplication.tsx`, after the user is loaded and only when no draft is being hydrated and the wizard is on the `selection` step with empty values:
- Look up the latest `registrations` row for `user_id = user.id` with `status = 'approved'` (fallback to `in_progress` if none approved).
- Pre-populate `selectedSector`, `selectedSubSector`, `selectedCategory` (and surface a small "from your registration" hint).
- Do not silently create a draft — the user still clicks "Proceed to Forms" to confirm, matching today's behaviour.

### 4. Verify
- Re-test insert as user 817… → should succeed.
- Visit `/applications/new` with an approved registration → sector / sub-sector / category should already be selected.
- Existing draft listed on Pre-Licensee Dashboard remains continuable via its own "Continue" button (unchanged).

No other workflow or notification logic is touched.