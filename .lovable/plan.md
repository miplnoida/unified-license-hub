## Goal

Move renewal-fee configuration out of **Settings → License Expiry & Renewal** into **Fee Management**, and make the expiry/renewal policy itself (cycle, reminders, grace) configurable per **Sector → Sub-Sector → Category**. Renewal fees are tagged so they only apply when a licensee selects the **Renew** service for their sector — never on normal applications.

## 1. Fee Management — renewal identifier

- Seed a `fee_types` row named **"Renewal"** (slug `renewal`) if it doesn't already exist. This is the identifier admins pick when creating a renewal fee.
- No UI changes required: `FeeManagement.tsx` already lets admins pick sector / sub-sector / category / service / form when creating a fee row. To configure a renewal fee they:
  1. Pick sector + sub-sector + category
  2. Pick the **Renew** service (already exists, one per sub-sector)
  3. Pick fee_type = **Renewal**
- Fee resolution (`src/lib/applicationFeeBreakdown.ts`) already enforces *"fees with a `service_id` apply ONLY when that same service is selected; fees without a `service_id` apply ONLY when no service is selected."* So a Renewal fee scoped to the Renew service is automatically excluded from new-licence applications and only charged when the user runs the renewal flow. No code change needed there.

## 2. Settings → License Expiry & Renewal — taxonomy-aware

Rework `site_settings.license_expiry` from a single global object into a list of rules:

```jsonc
{
  "default": { cycle_type, period_days, reminder_days, grace_period_days, auto_notify_officer },
  "rules": [
    { sector_id, sub_sector_id?, category_id?, cycle_type, period_days,
      reminder_days, grace_period_days, auto_notify_officer }
  ]
}
```

- **Remove** the *Renewal Fee* card (mode / amount / currency) from `LicenseExpirySettings.tsx` and replace it with a short callout: *"Renewal fees are now managed in Fee Management. Create a fee with type 'Renewal' scoped to the Renew service for the relevant sector."* with a link to `/admin/fees`.
- **Rebuild the page** as a list of rules:
  - One "Default policy" card (applies when no rule matches).
  - "Add rule" → cascading Sector / Sub-Sector / Category selects (sub-sector and category optional, in line with existing taxonomy pattern), plus the same cycle/reminder/grace fields per rule.
  - Edit / delete per rule.
- Saved payload stored back into `site_settings.license_expiry` (existing key — backward-compatible read: if old shape is detected, treat it as the `default`).

## 3. Resolver hook

Update `useLicenseExpiryConfig`:
- Return `{ default, rules }` plus a helper `resolveFor({ sector_id, sub_sector_id, category_id })` that picks the most specific matching rule (category > sub-sector > sector > default), same precedence model already used for fees.
- Keep `DEFAULT_LICENSE_EXPIRY_CONFIG` (without the `renewal_fee_*` fields) for fallback.
- Remove `renewal_fee_mode / renewal_fee_amount / renewal_fee_currency` from the `LicenseExpiryConfig` type.

## 4. Consumers

- `useLicenseExpiryStatus.ts` — load the license's `sector_id / sub_sector_id / category_id` (already on `licenses` or resolvable via the licensee) and call `resolveFor(...)` per license to pick `reminder_days` + `grace_period_days`. Existing reminder-window logic unchanged.
- `supabase/functions/license-expiry-reminders/index.ts` — same change server-side: read the new shape, resolve per license, fall back to `default`.
- `src/pages/licenses/LicenseDetail.tsx` — stop reading `renewal_fee_mode / renewal_fee_amount / renewal_fee_currency` from the config. Instead, query `fee_configurations` for the matching Renewal fee (sector/sub-sector/category + Renew service + fee_type 'renewal') via the existing resolver and display that amount in the renewal banner / confirmation copy. If no Renewal fee row is configured → treat renewal as free (same UX as today's "free" mode).

## 5. Migration / data

- Seed `fee_types` with `{ name: 'Renewal', slug: 'renewal' }` if missing (data insert, not schema).
- One-shot transform of any existing `site_settings.license_expiry` row into the new `{ default: {...}, rules: [] }` shape, dropping the three `renewal_fee_*` fields. Done as a `supabase--insert` UPDATE; no schema change.

## Out of scope

- No changes to fee resolution logic, payment flow, workflow, or any other settings page.
- No changes to existing renewal forms / services created previously.

## Technical details

| Area | File |
| --- | --- |
| Settings UI rewrite | `src/pages/settings/LicenseExpirySettings.tsx` |
| Hook + resolver | `src/hooks/useLicenseExpiryConfig.ts`, `src/hooks/useLicenseExpiryStatus.ts` |
| License detail copy | `src/pages/licenses/LicenseDetail.tsx` |
| Edge function | `supabase/functions/license-expiry-reminders/index.ts` |
| Data only | seed `fee_types.Renewal`; reshape `site_settings.license_expiry` row |
