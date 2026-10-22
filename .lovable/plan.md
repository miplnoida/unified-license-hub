## Goal
Applicants always see the applications they personally own, whatever organisation is selected. Organisation applications keep appearing under today's membership rules.

## Confirmed cause
In the database list rule `get_application_list_page`, the "own applications" part only applies when no organisation is selected, or when the selected organisation is the user's own profile organisation:

```sql
WHERE a.applicant_id = v_uid
  AND (_licensee_id IS NULL OR v_self_licensee_id = _licensee_id)
```

`rodneybay.registration@yopmail.com` owns `APP-2026-002011` (draft). The account has no profile organisation and no active organisation mappings. So when the page sends any selected organisation, that condition is false and the application disappears.

## Fix (needs your approval, exact SQL below)
Recreate the function with the same body and change only that one branch:

```sql
-- before
SELECT DISTINCT a.id AS application_id
FROM public.applications a
WHERE a.applicant_id = v_uid
  AND (_licensee_id IS NULL OR v_self_licensee_id = _licensee_id)
-- after
SELECT DISTINCT a.id AS application_id
FROM public.applications a
WHERE a.applicant_id = v_uid
```

The change is applied as a `CREATE OR REPLACE FUNCTION` with an identical signature, return type, ordering, filters, sector, SLA and status logic, and the remaining three organisation branches unchanged.

### Security impact
- The only rows added are ones where `applicant_id = auth.uid()`, meaning the caller's own applications. Users can already read these through the `applications_read` / `can_read_application` RLS rule.
- The function stays SECURITY INVOKER (no definer), so RLS still applies on top.
- Organisation scope (`access_scope`) is unchanged, so no other user's or organisation's rows become visible.
- No grants, policies, tables or records change. `UNION` keeps rows unique.

## Tests
- SQL regression (pgTAP, rolled-back transaction, TEST fixtures) in `supabase/tests/rbac/`:
  1. Owner sees own app with an unrelated organisation selected.
  2. Owner sees own app with their own organisation selected.
  3. Active organisation mapping user still sees that organisation's apps.
  4. An unrelated user does not see the owner's app, with or without an organisation selected.
  5. Each application appears exactly once.
- Run the existing Vitest suite for the application list.
- Read-only check: run the function as `rodneybay.registration@yopmail.com` with no organisation, and then with another organisation selected, and confirm `APP-2026-002011` is returned both times. Then open My Applications in the browser as that user.

## Not touched
Frontend code, application/payment records, workflows, RLS policies, and AML items under the certification freeze.
