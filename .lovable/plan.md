## Goal
1. **Admin → Licensee Entities list**: show each licensee's license **expiry date** and add a **blinking badge** for expired or expiring-within-7-days records.
2. **Licensee panel renew flow**: clicking **Renew** opens a **renewal form** in-place, with new validity date pre-filled from the **sector-based license expiry config** (current sector-resolved rule) and writable by the user.

No other functionality changes.

---

## Changes

### 1. `src/pages/admin/ManageLicensees.tsx`
- Extend the `licenses` fetch to also select `valid_until`.
- Add `valid_until: string | null` to `LicenseeRow` and populate it from the matched license.
- Add a new **"Expiry"** column between "Registered At" and "Status" showing `fmtDate(valid_until)`.
- Compute `daysToExpiry` per row. Render a small badge next to the date:
  - `< 0` (or status === expired): red **"Expired"** badge, blinking.
  - `0–7` days: amber **"Expires in N day(s)"** badge, blinking.
  - otherwise: no extra badge.
- Use a Tailwind `animate-pulse` class on the badge for the blink effect (already in project, no CSS additions needed).
- No filter/sort/status logic changes.

### 2. Licensee panel renewal form — `src/components/dashboard/LicenseeDashboard.tsx` + reuse existing dialog
- The existing **Renew** button on `LicenseeDashboard` already links to `/licenses/:id?action=renew`, which auto-opens the renewal dialog in `LicenseDetail.tsx`. That dialog **already uses the sector-resolved policy** (`useLicenseExpiryConfig().resolveFor({ sector_id, sub_sector_id, category_id })`) to compute `periodDays` and pre-fill the new validity date.
- Verify and tighten the dialog so the user clearly sees it is a "Renewal form":
  - Rename dialog title to **"Renew license"** and add a short helper line: *"New validity is suggested from your sector's renewal policy. You can adjust it before submitting."*
  - Keep existing fields (new validity date, notes) and existing submit logic (creates `license_renewals` row + audit + notification).
  - No backend changes; renewal config resolution stays on the frontend via `useLicenseExpiryConfig`.

That's it — no schema, RLS, or edge-function changes.

---

## Files touched
- `src/pages/admin/ManageLicensees.tsx` — add expiry column + blinking badge, include `valid_until` in license fetch.
- `src/pages/licenses/LicenseDetail.tsx` — minor copy tweak on the renewal dialog (title + helper text). Logic unchanged.
