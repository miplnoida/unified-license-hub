# Fix: two approved applications never got a licensee row

## What I found

- `LIC-2026-000019` (APP-2026-000106, approved just now) IS visible on `/admin/licensees` — verified via the API response and a fresh screenshot of the page as super_admin. It renders as the 2nd row with status "Active". The user probably just needs a refresh for that one.
- But two other approved + paid applications never got provisioned because they hit the earlier `context` / `applicant_id` failures inside `perform_final_workflow_approval` → `provision_application_entity`:

| Application | Approved | Payment | License | Licensee |
|---|---|---|---|---|
| APP-2026-000100 | 2026-06-30 | completed | ❌ missing | ❌ missing |
| APP-2026-000099 | 2026-06-30 | completed | ❌ missing | ❌ missing |

They stay invisible on the Licensee Entities page because the licensee (and license) rows were never created. That matches "all approved licensees not showing" — anything approved before the two DB fixes we shipped today.

## Fix (one-shot backfill)

Now that `provision_application_entity` works (both column bugs are fixed), just re-run it for each orphaned application:

```sql
SELECT public.provision_application_entity('2bd454a7-89d9-4667-a44e-561cab63d9ca'::uuid); -- APP-2026-000100
SELECT public.provision_application_entity('e4213a8a-c344-4c45-8511-07b79c5576ad'::uuid); -- APP-2026-000099
```

The function is idempotent — it creates the license (if missing) and the licensee row, then returns the created ids. No schema change.

After the backfill I'll verify each application now has a `licenses` row and a `licensees` row, and both will appear on `/admin/licensees`.

## No frontend or RLS changes

- The page code and licensees RLS are correct — super_admin already sees every row.
- The listing sort/pagination is fine; LIC-2026-000019 sits on page 1.
- If the user later logs in as a non-admin internal role and still needs to see the Licensee Entities admin page, that's a separate RBAC change and would need a follow-up plan (currently the policy is admin/super_admin only, matching the module's admin-only route). Not in scope here.

## Verification

1. `SELECT count(*) FROM public.applications WHERE status='approved' AND NOT EXISTS (SELECT 1 FROM public.licensees lc JOIN public.licenses l ON l.id=lc.license_id WHERE l.application_id=applications.id)` returns 0.
2. Reload `/admin/licensees` — total count goes 13 → 15, and LIC numbers for the two backfilled applications appear.
