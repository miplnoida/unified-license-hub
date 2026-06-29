## Problem

Previous fix only treated `status = 'draft'` as an in-progress renewal. The actual rows in the database for a started renewal are stored with `status = 'in_progress'` (also a pre-submission status), so the guard misses them and a brand-new renewal application is inserted on every click.

DB evidence — two renewal rows exist for the same `renewal_of_license_id`:

```
status=in_progress  is_renewal=true  service=Renew
status=draft        is_renewal=true  service=Renew  (newly created on the retry click)
```

Additionally, the Renew button label never changes when an in-progress renewal already exists, so the user has no UI cue that clicking it will resume rather than start fresh.

## Fix (scope: renewal UI only — no fee / workflow / AI changes)

### 1. Treat draft AND in_progress as "in-progress renewal"

Introduce a single shared constant for pre-submission renewal statuses:

```ts
const IN_PROGRESS_RENEWAL_STATUSES = ['draft', 'in_progress'];
```

Use it in three places that currently only check `'draft'` (or only check the submitted list):

- `src/pages/licenses/LicenseDetail.tsx` — `startRenewal` duplicate-guard (replace the existing draft-only lookup with `.in('status', IN_PROGRESS_RENEWAL_STATUSES)`), and resolve the row id into a new `inProgressRenewalAppId` state.
- `src/components/dashboard/cards/LicenseStatusList.tsx` — the `pendingRenewalByLicense` lookup currently uses `PENDING_RENEWAL_STATUSES` (submitted/under_review/...). Add a second lookup for in-progress rows and merge into a new `inProgressRenewalByLicense` map.
- `src/components/dashboard/LicenseeDashboard.tsx` — same treatment as `LicenseStatusList`.

### 2. Update button label and navigation when an in-progress renewal exists

Priority shown on the Renew control becomes:

1. Submitted/under-review renewal exists → "Renewal in progress" badge linking to read-only application view (unchanged).
2. **Draft/in_progress renewal exists → "Continue Renewal" button linking to the form route** `/post-licensee/applications/<id>/forms?service=Renew` (new behavior + new label).
3. Otherwise → "Renew" button calling `startRenewal` (unchanged).

Files touched for the label/route change:

- `src/pages/licenses/LicenseDetail.tsx` — both Renew button sites (around lines 786-815 and 835-845) and the renewal panel.
- `src/components/dashboard/cards/LicenseStatusList.tsx` — Renew button block (around line 151).
- `src/components/dashboard/LicenseeDashboard.tsx` — Renew button block (around line 171).

### 3. Auto-trigger path (`?action=renew`)

`startRenewal` already runs the guard, so once step 1 is applied the auto-trigger automatically reopens the existing in-progress form instead of inserting a duplicate. No separate change needed beyond passing `inProgressRenewalAppId` through the same short-circuit used for submitted renewals.

## Out of scope

- No DB migration, no RLS changes, no status enum changes.
- No changes to fee resolution, payment panel, workflow engine, approvals, documents, or AI assessment.
- Non-renewal applications: untouched.
- Existing duplicate `in_progress` row in the DB is data, not code — left as-is. Going forward the guard prevents new duplicates.

## Verification (must be done in UI before claiming fixed)

1. License with an existing `in_progress` renewal → dashboard / license card shows **"Continue Renewal"** (not "Renew"). Click it → opens the same `/post-licensee/applications/<existing-id>/forms?service=Renew`. No new row inserted (verify by row count for that `renewal_of_license_id`).
2. License with an existing `draft` renewal → same behavior as case 1.
3. License with a submitted renewal → still shows "Renewal in progress" badge → opens read-only view. Unchanged.
4. License with no renewal → "Renew" button → creates a new draft → status becomes `in_progress` after user begins editing → returning to dashboard now shows "Continue Renewal".
5. Deep link `/licenses/:id?action=renew` with an existing in-progress renewal → navigates to that same renewal form, no duplicate created.
6. Non-renewal applications unaffected.

