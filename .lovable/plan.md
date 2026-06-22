## Goal

Make the grace period truly extend the license, and only allow renewal once the grace period is over (renewal stays open indefinitely after that).

## Behavior summary

| Phase | License usable? | Renew button? | Banner |
|---|---|---|---|
| Active (before expiry) | Yes | No | Reminder window only (countdown) |
| Expired, within grace | Yes (treated as active) | No | "In grace period until <date>. License remains valid." |
| Grace ended | No | Yes | "Grace period ended on <date>. Renew now." |
| Renewed | Yes | No | — |

## Changes

### 1. `src/hooks/useLicenseExpiryStatus.ts`
- Add a derived `grace_ends_on` (= `valid_until + grace_period_days`) and `effective_valid_until` (same value).
- `is_expired` becomes true only when **past grace end** (today > `grace_ends_on`). While in grace, treat as not expired.
- Keep `in_grace_period` flag so banners can show the grace messaging.
- Still surface rows during grace and after grace; reminder-window logic unchanged.

### 2. `src/components/dashboard/LicenseExpiryBanner.tsx`
- Three branches:
  - **In grace**: info/warning variant — "License <num> is in grace period until <grace_ends_on>. It remains valid until then." No Renew button.
  - **Past grace (is_expired true)**: destructive — "Expired on <valid_until>. Grace ended <grace_ends_on>. Please renew." Renew button shown.
  - **Reminder window**: unchanged.

### 3. `src/components/dashboard/LicenseeDashboard.tsx`
- `canRenew` = past grace only (`isExpired && !inGrace`). Hide Renew during grace.

### 4. `src/pages/licenses/LicenseDetail.tsx`
- New helper `isPastGrace` using `license.valid_until + resolved grace_period_days` from `useLicenseExpiryConfig().resolveFor({sector,sub_sector,category})`.
- `?action=renew` auto-trigger: only fires when `isPastGrace`. During grace, show toast "License is in grace period until <date>. Renewal opens after that."
- Renewal panel visibility: `!isInternal && license.valid_until && isPastGrace`.
- `startRenewal` guard: block (with same toast) unless internal or `isPastGrace`.
- Keep the licensee-link + access-guard logic from the previous fix intact (RLS insert stays correct).

### 5. License status treatment elsewhere (display-only)
- `src/lib/licenseStatusBadge.tsx` / `src/components/shared/LicenseStatusBanner.tsx`: if `status === 'expired'` but within grace, render as "Active (Grace)" badge/banner instead of "Expired". No DB writes — purely presentational, driven by the resolved grace policy.

## Out of scope

- No DB schema changes. `licenses.status` stays as-is; the "grace = still valid" treatment is computed in the UI/hook layer.
- No changes to the expiry-reminder edge function or late-fee logic.
- No new submit controls on the license detail page — renewal continues to flow into `/post-licensee/applications/{id}/forms?service=Renew`.

## Files to change

- `src/hooks/useLicenseExpiryStatus.ts`
- `src/components/dashboard/LicenseExpiryBanner.tsx`
- `src/components/dashboard/LicenseeDashboard.tsx`
- `src/pages/licenses/LicenseDetail.tsx`
- `src/lib/licenseStatusBadge.tsx`
- `src/components/shared/LicenseStatusBanner.tsx`
