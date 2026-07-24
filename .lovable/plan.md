## Root cause (verified against the DB)

For APP-2026-000129 the taxonomy is set correctly everywhere upstream:

- `applications.data`: `sector_id=87ecc596-…`, `sub_sector_id=0334a897-…`, `category_id=0be646b8-…` (Merchant Bank)
- `licenses` row `9376aa9e-…`: same three IDs populated
- `licensees` row `3c4a539a-…` (linked via `license_id`): `sector_id / sub_sector_id / category_id = NULL`

The provisioning RPC in migration `20260630080930_…` inserts the licensee with only three columns and never copies the taxonomy:

```sql
INSERT INTO public.licensees (license_id, name, applicant_id)
VALUES (v_license.id, v_entity_name, v_app.applicant_id);
```

Because the row lacks `sector_id`, `can_read_licensee` → `has_scoped_permission(_user, 'licensee_management', 'view', licensee_id, NULL, NULL)` fails for sector-scoped regulators (super-admins and `view_all_entities` holders still see it, which is why the record exists but was invisible to the reporting user). It's a systemic bug — every licensee provisioned via this RPC has NULL taxonomy.

## Fix

### 1. Schema-level RPC patch (migration tool)

Replace the licensee INSERT inside `create_license_and_licensee_from_application` (both the renewal and non-renewal branches, if the renewal branch ever creates a licensee) to copy taxonomy from the license the RPC just created / found, falling back to `applications.data`:

```sql
INSERT INTO public.licensees (
  license_id, name, applicant_id,
  sector_id, sub_sector_id, category_id
)
VALUES (
  v_license.id, v_entity_name, v_app.applicant_id,
  COALESCE(v_license.sector_id,     NULLIF(v_app_data->>'sector_id','')::uuid),
  COALESCE(v_license.sub_sector_id, NULLIF(v_app_data->>'sub_sector_id','')::uuid),
  COALESCE(v_license.category_id,   NULLIF(v_app_data->>'category_id','')::uuid)
)
RETURNING id INTO v_licensee_id;
```

(Requires selecting `sector_id, sub_sector_id, category_id` into `v_license` where the row is fetched / created.)

### 2. One-off backfill (insert tool — data change)

Fill NULL taxonomy on every existing licensee from the linked license, then application data as a fallback:

```sql
UPDATE public.licensees lc
SET sector_id     = COALESCE(lc.sector_id,     li.sector_id,     NULLIF(a.data->>'sector_id','')::uuid),
    sub_sector_id = COALESCE(lc.sub_sector_id, li.sub_sector_id, NULLIF(a.data->>'sub_sector_id','')::uuid),
    category_id   = COALESCE(lc.category_id,   li.category_id,   NULLIF(a.data->>'category_id','')::uuid),
    updated_at    = now()
FROM public.licenses li
LEFT JOIN public.applications a ON a.id = li.application_id
WHERE lc.license_id = li.id
  AND (lc.sector_id IS NULL OR lc.sub_sector_id IS NULL OR lc.category_id IS NULL);
```

This immediately populates APP-2026-000129's licensee (`3c4a539a-…`) with Merchant Bank / Merchant Bank / Merchant Bank and makes it visible to the current sector-scoped user.

### 3. Verify

- Re-query `licensees` for `license_id=9376aa9e-…` → taxonomy columns non-null.
- Reload `/admin/licensees` as the reporting user — "New FinCorp Commercial Bank Limited" row appears with the correct Sector / Sub-sector / Category.
- Approve a fresh test application end-to-end → new licensee row shows taxonomy populated on first insert (no backfill needed).

## Not touched

- `ManageLicensees.tsx` — the frontend is correct once the DB row has the values.
- RLS policy `can_read_licensee` — behavior is intentional; we feed it correct data instead of loosening the gate.
- Approval edge functions, workflow logic, notification templates.
