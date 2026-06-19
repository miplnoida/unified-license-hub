# Fix "Entity Name" on License Management list

## Why it changed

On `/licenses` the **Entity Name** column comes from `licensees.name`. That value is written by the approval RPC `provision_license_for_application` using this fallback chain:

```
data.entity_name → data.applicant_name → applications.license_type
```

For applications submitted through the newer registration flow, `data.entity_name` and `data.applicant_name` are **not stored**, so the RPC falls all the way through to `license_type`. Since `license_type` is now persisted as the concatenated taxonomy label ("Commercial Bank - Commercial Bank - Commercial Bank"), that string ends up in `licensees.name` and shows in the Entity Name column.

Confirmed in DB: licensee `8e3ffcec…` (created 2026-06-19) has `name = "Commercial Bank - Commercial Bank - Commercial Bank"` because its application's `data->>'entity_name'` and `data->>'applicant_name'` are both NULL.

Older records (e.g. "Test Insurance Corporation") still look correct because they were created when `entity_name` was captured.

## Fix

### 1. New migration — better fallback + backfill

Replace `provision_license_for_application` so the entity name resolution order becomes:

```
data.entity_name
  → data.applicant_name
  → data.organization_name / data.company_name / data.business_name (common form keys)
  → registrations.applicant_name (joined by applicant_id)
  → pre_license_users.entity_name
  → pre_license_users.full_name
  → profiles.entity_name
  → profiles.full_name
  → license_type   (last resort, unchanged)
```

Then backfill existing bad rows in the same migration:

```sql
UPDATE public.licensees lic
SET name = COALESCE(
    NULLIF(a.data->>'entity_name',''),
    NULLIF(a.data->>'applicant_name',''),
    r.applicant_name,
    plu.entity_name, plu.full_name,
    p.entity_name,   p.full_name,
    lic.name
)
FROM public.licenses l
JOIN public.applications a ON a.id = l.application_id
LEFT JOIN public.registrations r   ON r.user_id = a.applicant_id
LEFT JOIN public.pre_license_users plu ON plu.id = a.applicant_id
LEFT JOIN public.profiles p        ON p.id  = a.applicant_id
WHERE lic.license_id = l.id
  AND lic.name = a.license_type;   -- only the rows that fell through to license_type
```

### 2. UI safety net — `src/pages/licenses/LicensesList.tsx`

When enriching rows, if `licensees.name` equals the license's `license_type` (i.e. the bad fallback fired), look up a better name from `registrations` / `pre_license_users` / `profiles` by the license's `holder_id` and use that instead. This makes the column self-heal even for rows the backfill misses.

Falls back to `licensees.name` if no better source is found.

## Out of scope

- The registration form not capturing `entity_name` in `application.data` — separate issue, will keep working through fallbacks above.
- LicenseeDetail, ApprovedLicensees, LicensesTab — they already resolve entity name from multiple sources and aren't affected.

## Verification

1. Reload `/licenses` → row for `LIC-…` linked to APP-2026-000079 shows the applicant/entity name, not "Commercial Bank - Commercial Bank - Commercial Bank".
2. `select name from licensees where id = '8e3ffcec-8270-478d-861e-da60f025e3b3';` returns the resolved name.
3. Provision a brand-new approval where `data.entity_name` is missing → resulting `licensees.name` matches the registered applicant/entity, not the taxonomy string.
