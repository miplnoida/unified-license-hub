## Why it shows "Commercial Bank - Commercial Bank - Commercial Bank"

Application creation builds `license_type` by concatenating sector + sub-sector + category names:

```ts
// src/pages/NewApplication.tsx:996
const licenseType = [sectorObj?.name, subSectorObj?.name, categoryObj?.name]
  .filter(Boolean).join(' - ');
```

That value is then stored verbatim on `applications.license_type`, copied onto `licenses.license_type`, and also used as the fallback `licensees.name`. For this licensee all three taxonomy levels are literally named "Commercial Bank", so the stored string is `"Commercial Bank - Commercial Bank - Commercial Bank"` — and that's what the Licenses tab and the entity header render.

DB confirms it:

```
licenses.license_type = "Commercial Bank - Commercial Bank - Commercial Bank"
licensees.name        = "Commercial Bank - Commercial Bank - Commercial Bank"
sector / sub_sector / category names = "Commercial Bank" each
```

This isn't a workflow/approval bug — it's the slug format being too literal when neighbouring taxonomy levels share a name.

## Fix (frontend display only)

Add a tiny helper that collapses consecutive duplicate segments in a `" - "`-joined label, then use it everywhere the slug is rendered.

1. New helper `src/lib/formatTaxonomyLabel.ts`:
   ```ts
   export function formatTaxonomyLabel(value?: string | null): string {
     if (!value) return '';
     const parts = value.split(' - ').map(p => p.trim()).filter(Boolean);
     const deduped: string[] = [];
     for (const p of parts) {
       if (deduped[deduped.length - 1]?.toLowerCase() !== p.toLowerCase()) deduped.push(p);
     }
     return deduped.join(' - ');
   }
   ```
   So `"Commercial Bank - Commercial Bank - Commercial Bank"` → `"Commercial Bank"`, while `"Banking - Commercial Bank - Foreign"` is left intact.

2. Apply it at the render sites where the slug surfaces today:
   - `src/components/entity-detail/LicensesTab.tsx` — wrap `{l.license_type}` (line 66).
   - `src/pages/admin/LicenseeDetail.tsx` — wrap the header title so `displayName || licensee.name` is cleaned (line 198).
   - `src/pages/admin/ApprovedLicensees.tsx` and `src/pages/licenses/LicensesList.tsx` / `LicenseDetail.tsx` — any column that prints `license_type` or licensee `name` directly.
   - `src/pages/applications/ApplicationsList.tsx` and `ApplicationDetail.tsx` — same treatment for the application `license_type` cell/header.

No change to data, edge functions, RPCs, or the creation flow. Existing rows keep their stored values; we only clean up the presentation.

## Out of scope

- Not changing how `license_type` is constructed at application creation (that would affect search, filters, reports, and historical rows).
- Not renaming taxonomy entries or merging duplicate names — that's a data decision for the admin.
- No DB migration.

## Verification

- Open `/admin/licensees/8e3ffcec-…` → header and Licenses tab Type column both read `Commercial Bank`.
- Open a license whose levels differ (e.g. `"Banking - Commercial Bank - Foreign"`) → label stays `Banking - Commercial Bank - Foreign`.
- Applications list / detail show the same cleaned label without losing information.
