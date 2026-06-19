## Problem

License `LIC-2026-000005` has `valid_until = 2026-06-03` (past), but `status` is still `active`, so the UI shows it as Active everywhere (license detail, licensee Licenses tab, dashboards, status gate).

The expiry-reminder edge function only dispatches notifications — nothing actually flips `licenses.status` from `active` to `expired` when the date passes. Today's status is computed from the stored column only.

## Fix

Two coordinated changes so an expired license always reads as Expired, immediately and durably.

### 1. Database — auto-expire stale licenses

New migration:

- Add SQL function `public.mark_expired_licenses()` that runs:
  ```
  UPDATE public.licenses
     SET status = 'expired', updated_at = now()
   WHERE status = 'active'
     AND valid_until IS NOT NULL
     AND valid_until < now();
  ```
  Returns count of rows updated. `SECURITY DEFINER`, `search_path = public`.
- Run it once in the same migration to backfill (LIC-2026-000005 and any siblings flip to `expired`).
- Schedule it daily at 00:05 UTC via `pg_cron` (extension already used by the project for other schedulers) so future licenses self-expire without waiting for a UI hit.

### 2. UI — derive "expired" at render time as a safety net

So the user never sees a stale Active badge between cron runs:

- `src/lib/licenseStatusBadge.tsx` — extend `LicenseStatusBadge` to accept an optional `validUntil` prop. If `status === 'active'` and `validUntil` is in the past, render as `expired` (label + red style).
- Update the small set of call sites that already have `valid_until` in scope to pass it:
  - `src/components/entity-detail/LicensesTab.tsx` (Type/Status row)
  - `src/pages/licenses/LicenseDetail.tsx` (header badge)
  - `src/pages/admin/ApprovedLicensees.tsx` (if it renders license status)
  - `src/components/dashboard/LicenseExpiryBanner.tsx` already treats past `valid_until` as expired — no change.
- `src/hooks/useLicenseStatusGate.ts` — after fetching the license, if `valid_until < now()` treat status as `expired` so the gate blocks new submissions even before cron runs.

### Out of scope

- No change to how `valid_until` is calculated at issuance (already fixed in prior migration).
- No change to renewal flow, reminder windows, or notification dispatch.
- No rename of `LIC-2026-000005`; only its `status` flips to `expired`.

## Verification

1. Reload `/licenses/01f80962-…` → badge reads **Expired** (red).
2. Reload licensee detail → Licenses tab Status column reads **Expired**.
3. Run `select status from licenses where id='01f80962-…'` → `expired`.
4. Licensee dashboard expiry banner still surfaces the renew CTA.
5. Attempting a new application as that licensee shows the blocked-license banner.
