# Fix "License not found" for applicants and enable certificate download

## What is actually wrong (verified)

1. **The licence row is invisible to its own owner.** Read access to `licenses` is decided by `can_read_license`. That function takes the licence's `holder_id` and passes it to `can_read_licensee` — but in every licence in the database `holder_id` is the **user account id** of the applicant, not a licensee/entity id. The licensee check therefore always fails, and an external applicant has no supervisory permission either, so the licence read returns nothing and the page renders "License not found". Same reason the applicant dashboard's licence lookup (which queries by `holder_id`) comes back empty.

2. **The certificate is also unreachable for the applicant.** Certificates are read through the same `can_read_license` rule, and the `Download Certificate` button calls the certificate function, which requires the internal-only permission `license_management.manage_certificates`. Even after the page loads, an applicant would be refused.

## What to change

### Access
- Correct `can_read_license` so a licence is readable by the people who genuinely own it, in addition to today's supervisory paths:
  - the user recorded as the licence holder,
  - the applicant on the licence's originating application,
  - users mapped to the entity linked to that licence (profile entity mapping, PPOC mapping, entity user access) — via the linked licensee record, not by mis-reading `holder_id`.
- Keep every existing internal/supervisory path unchanged; this only widens access to the licence's own holder side. Certificate visibility follows automatically because `license_certificates` reads reuse the same rule.

### Certificate download for external users
- Give the certificate function a holder path: when the caller is not an internal user with certificate-management permission but is confirmed as the licence's holder/applicant/entity user, allow **download only** (no generate, no sign, no dispatch) of the current certificate version.
- On the licence page, external users get a `Download Certificate` action that fetches the existing certificate instead of regenerating it. Regeneration stays internal-only.
- If no certificate exists yet, external users see a clear "certificate is being prepared" message rather than a failed download.

### Notification link
- The email/notification already deep-links to the licence page, which will now resolve for the applicant. Verify that route's portal guard admits the applicant/licensee role and adjust the guard if it blocks them.

## Verification
- Query the licence as the applicant's role context to confirm the row is now readable and that an unrelated external user still gets nothing.
- Load the licence page from the notification link as an external user and download the certificate PDF.
- Re-check that internal roles retain generate/sign/dispatch and that no supervisory scoping was loosened.

## Technical notes
- Migration: replace `public.can_read_license` (SECURITY DEFINER, unchanged signature) with holder/applicant/entity-user branches; no policy rewrites needed.
- Edge function: `supabase/functions/generate-license-certificate/index.ts` — add a holder-scoped authorization branch limited to `mode: "download"`.
- Frontend: `src/pages/licenses/LicenseDetail.tsx` — skip the generate call for non-internal users; keep the internal flow as-is.
