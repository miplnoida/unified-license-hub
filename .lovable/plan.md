# Fix: "Signatory signature image could not be loaded"

## What's actually happening

- `site_settings.license_certificate_signatory` is correctly set with `signature_image_path = signature/signature-1782819577809.png`.
- That object exists in the `certificate-assets` bucket (23,705 bytes, mimetype `image/png`).
- The edge function downloads it via service role (works) and then runs the new `validateEmbeddable` probe added in the previous turn. The probe is throwing — `pdf-lib.embedPng` rejects this particular PNG (typical causes: interlaced PNG, 16-bit depth, or a JPG that was renamed to `.png`). That's why the friendly "could not be loaded" message appears even though the file itself downloads fine.

## Fix (single file: `supabase/functions/generate-license-certificate/index.ts`)

1. **Detect format by magic bytes, not by filename / storage mime.** In `fetchAsset`:
   - `89 50 4E 47` → treat as `image/png`
   - `FF D8 FF` → treat as `image/jpeg`
   - otherwise reject with "unsupported image type (only PNG/JPG)".
   This catches files mis-uploaded with the wrong extension.

2. **Try both embed methods before giving up.** In `validateEmbeddable` and at draw time:
   - First try the method matching the detected mime.
   - On failure, try the other (`embedJpg` ↔ `embedPng`). If that succeeds, use it and update the stored `signatureMime` for the draw step.
   - Only if both fail, return the pdf-lib error message verbatim.

3. **Surface the actual pdf-lib reason to the client.** When `SIGNATURE_IMAGE_UNAVAILABLE` / `SIGNATURE_IMAGE_EMBED_FAILED` fires, include the underlying decode error in `details` (already wired) and extend the friendly `error` text to: "Configured signature image could not be embedded (<reason>). Please re-upload a standard non-interlaced PNG or a JPG."

4. **Same treatment for the seal image path.**

No UI changes, no schema changes, no workflow/signing/versioning/download changes. After deploy, regenerating the certificate should either embed the signature successfully or return a precise reason the user can act on.

## Acceptance

- Valid standard PNG/JPG signatures embed and render on the regenerated PDF.
- A renamed/mis-typed file still embeds (because we detect by magic bytes).
- An interlaced/16-bit/corrupt image returns a clear message naming the pdf-lib reason, instead of a generic "could not be loaded".
