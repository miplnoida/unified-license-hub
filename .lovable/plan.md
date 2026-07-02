## Problem

The "Download Certificate" action on the license detail page (reached from Admin → License Entities → detail) always shows **Status: Active** on the PDF, even when the license is Suspended, Revoked, Cancelled or Expired. The certificate is generated once and cached, so status changes are never reflected. It also doesn't show the date the status changed.

## Fix

Two small, surgical changes. No other functionality is touched (renewals, license actions, signatory config, signing, storage layout, workflow, etc. all stay as-is).

### 1. `supabase/functions/generate-license-certificate/index.ts`

- Also select `status` from `licenses` (currently we only pull number/type/dates/holder/application).
- When status is not `active`, load the most recent matching row from `license_actions` to determine the "effective" date:
  - `suspended` → latest `suspension` action's `created_at`
  - `revoked` → latest `revocation` action
  - `cancelled` → latest `cancellation` action
  - `expired` → license's `valid_until`
- Pass `status` and `statusEffectiveDate` into `buildCertificatePdf`.
- In the details grid, replace the hardcoded `"Active"` value with a title-cased status label. When status is not `active`, render it in red and add a second line "Effective: <date>" directly under it.
- For non-active statuses, also draw a large, diagonal, semi-transparent watermark of the status word (e.g. `SUSPENDED` / `REVOKED` / `CANCELLED` / `EXPIRED`) across the page so the certificate cannot be mistaken for a valid one.
- Persist `status` and `status_effective_date` inside the existing `metadata` JSON when inserting the `license_certificates` row (no schema change).

### 2. `src/pages/licenses/LicenseDetail.tsx` — `downloadCertificate`

Currently it calls `download` first and only calls `generate` when no certificate exists. That's why stale PDFs keep coming back. Change the flow to:

1. Always call `generate` first (produces a new version reflecting current status).
2. Then call `download` and stream the signed URL as today.
3. Preserve the existing `NOT_FOUND` fallback path and all error toasts.

Everything else in that file (renewal flow, action dialogs, alerts, badges, layout, permissions) is untouched.

### Out of scope

- No DB migration.
- No changes to `LicenseeDetail.tsx`, `LicensesTab.tsx`, license actions, workflow, or any other page.
- No change to who can click Download — internal admins can still download regardless of status; the PDF just tells the truth now.

## Technical notes

- `license_actions` already exposes `action_type`, `new_status`, `created_at` — used by the alert block on the same page, so we know the shape is stable.
- pdf-lib supports rotated text via `page.drawText({ rotate: degrees(-30), opacity: 0.15 })` — used for the watermark; no new dependency.
- Regenerating on every download creates a new `license_certificates` version row per download. This mirrors the existing versioning contract (versions already increment on every `generate` call) and keeps an audit trail of what was handed out and when.
