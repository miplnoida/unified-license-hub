# Fix: Signature image silently missing from certificate

Only file changed: `supabase/functions/generate-license-certificate/index.ts`. No UI, workflow, signing, versioning, or download changes.

## 1. Embed signature with hard failure

In `buildCertificatePdf`, replace the current try/catch-and-ignore block for the signature image with logic that throws a typed error when embedding or drawing fails:

- If `signatory.configured && signatureBytes && signatureMime`:
  - Attempt `embedPng` / `embedJpg` based on mime.
  - Attempt `drawImage`.
  - On any thrown error, throw `new Error("SIGNATURE_IMAGE_EMBED_FAILED:<original message>")`.
- If the bytes/mime are missing while `configured === true` and a `signature_image_path` was set in config, that is already handled upstream by `SIGNATURE_IMAGE_UNAVAILABLE`.

## 2. Surface the error from the handler

In the `generate` branch, wrap `buildCertificatePdf` in try/catch. When the error message starts with `SIGNATURE_IMAGE_EMBED_FAILED:`, return:

```json
{
  "error": "Configured signature image was loaded but could not be embedded in the PDF. Please upload a valid PNG or JPG signature image.",
  "code": "SIGNATURE_IMAGE_EMBED_FAILED",
  "details": "<original embed error>"
}
```

Status stays HTTP 200 (existing convention). No certificate row, no storage upload happens on this path.

Apply the same pattern for the seal image: throw `SEAL_IMAGE_EMBED_FAILED` and return code `SEAL_IMAGE_EMBED_FAILED` with a parallel friendly message.

## 3. Tighten upload-time validation in `loadSignatoryConfig`

`fetchAsset` already rejects non-PNG/JPG. Additionally, after a successful download, do a structural sanity check by attempting `PDFDocument.create()` + `embedPng/embedJpg` against the bytes inside `loadSignatoryConfig`. If it fails, return `{ error: "image cannot be decoded as PNG/JPG" }` so the existing `SIGNATURE_IMAGE_UNAVAILABLE` / `SEAL_IMAGE_UNAVAILABLE` path fires before generation proceeds. This catches corrupt files early with a clear message instead of relying on the embed step.

(Admin-side `CertificateSignatorySettings.tsx` already restricts to PNG/JPG and <2MB; no change requested there.)

## Acceptance

- Regenerated PDF shows signature image above the signatory line when a valid PNG/JPG is configured.
- Corrupt or unembeddable image → generation fails with `SIGNATURE_IMAGE_EMBED_FAILED` (or `SIGNATURE_IMAGE_UNAVAILABLE` if caught earlier) and a friendly message; no PDF is written.
- Signatory name/title still render in the success path.
- Workflow signatures, signing keys, versioning, download, renewals untouched.
