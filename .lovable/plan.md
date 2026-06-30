# Authorized Signatory for License Certificates

Add a single admin-managed authorized signatory (name, title, signature image, optional seal) that appears visibly on generated license certificates. Workflow approval signatures stay untouched and remain internal audit only.

## 1. Storage

- Create private Supabase Storage bucket `certificate-assets`.
- RLS on `storage.objects`:
  - SELECT/INSERT/UPDATE/DELETE restricted to admins/regulators (via `has_role`) for `bucket_id = 'certificate-assets'`.
  - Edge function reads via service role.
- Allowed types enforced client-side: PNG, JPG, JPEG, WebP. Max 2 MB.

## 2. Configuration storage

Use existing `site_settings` table with key `license_certificate_signatory`. Value JSON:

```json
{
  "name": "Authorized Officer",
  "title": "Director, Licensing",
  "signature_image_path": "signatory/signature.png",
  "seal_image_path": "signatory/seal.png",
  "is_active": true
}
```

Global scope (not per-regulator) for this iteration.

## 3. Admin UI

New page: `src/pages/settings/CertificateSignatorySettings.tsx`, route `/settings/certificate-signatory`, add a card on `SettingsHub.tsx` ("Certificate Signatory").

Fields:
- Name (text, required)
- Title (text, required)
- Signature image upload (preview, replace, remove) → uploads to `certificate-assets`
- Seal/stamp image upload (optional, same flow)
- Active toggle
- Save button

Validation: image type + size; show inline friendly errors; do not auto-close.

On save: upsert `site_settings` row and write audit log entry (`action: certificate_signatory_updated`, old/new value, actor).

Add a "Regenerate latest certificate" hint near license certificate UI (no logic change — existing regenerate button already creates a new version).

## 4. Edge function changes — `generate-license-certificate/index.ts`

- Load `site_settings` row for `license_certificate_signatory`.
- If `is_active` and `name`/`title` present:
  - Use configured name/title in place of env vars `LICENSE_SIGNATORY_NAME` / `LICENSE_SIGNATORY_TITLE` (env vars become fallback).
  - If `signature_image_path` present: download from `certificate-assets` via service-role storage client, embed as PNG/JPG above the signature line using `pdf-lib` `embedPng`/`embedJpg`.
  - If `seal_image_path` present: embed near signatory block, offset so it does not overlap text.
- If no active config: render plain text `Authorized signatory not configured` in subtle gray near the signature line. No mention of signing keys.
- Cryptographic signing path unchanged: if `LICENSE_SIGNING_KEY_PEM` + `LICENSE_SIGNING_CERT_PEM` set, still compute fingerprint and store `is_signed=true`; render small `Digitally signed` label. Remove the existing `Signature pending — signing key not configured` watermark entirely.
- WebP: convert by re-encoding via canvas not available in Deno; restrict embedded images to PNG/JPG at admin upload time (reject WebP for signature/seal, or accept WebP in storage but require PNG/JPG for embedding — simpler: restrict signatory/seal upload to PNG or JPG only).

## 5. Audit

- On signatory settings save/update: insert into `audit_logs` with `action='certificate_signatory_updated'`, `old_value`, `new_value`, `actor_id`.
- Certificate generation versioning unchanged.

## 6. Out of scope (do not touch)

- Workflow approval signatures, `WorkflowActionPreviewDialog`, `perform-workflow-action`, approval rules, notifications, AI assessments, reports, renewals, license/entity creation.

## Technical notes

- Files to add:
  - `supabase/migrations/<ts>_certificate_signatory.sql` — bucket + storage policies (bucket created via `supabase--storage_create_bucket` tool, policies via migration).
  - `src/pages/settings/CertificateSignatorySettings.tsx`
  - Route entry in `src/routes/settingsRoutes.tsx`
  - Card entry in `src/pages/settings/SettingsHub.tsx`
- Files to modify:
  - `supabase/functions/generate-license-certificate/index.ts` — load signatory config, embed images, drop "Signature pending" watermark.
- Image embed uses `pdf-lib` `embedPng` / `embedJpg`. Signature drawn at ~180×60 pt; seal ~80×80 pt offset right.
- Upload validation: max 2 MB, PNG/JPG only for signatory & seal (matches PDF embed support).
- Settings hook: small `useCertificateSignatory` hook for read/write of `site_settings` row.

## Acceptance verification

- Admin uploads signature → saved, preview shows.
- Generate certificate → PDF shows signature image above name + title + "Authorized Signatory".
- No "Signature pending" text anywhere.
- Without config → certificate generates with "Authorized signatory not configured" message, no crash.
- With signing keys → `Digitally signed` label appears, `is_signed=true`.
- Workflow approvals unchanged.
