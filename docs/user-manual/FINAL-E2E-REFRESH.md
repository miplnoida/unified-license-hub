# FINAL E2E REFRESH CONTRACT — User Manual

> **INTERIM — TO BE RE-VERIFIED AFTER FINAL E2E**
>
> Version 1.0.0 · generated 2026-08-30 · documented HEAD `a24f6286782683ed414584405cce4e8b7e8a589e`
> E2E verification: PENDING — not yet E2E verified
>
> Generated from `src/content/user-manual/` — do not edit by hand.

This manual is **V1 / INTERIM**: written before whole-system end-to-end
certification. The final E2E wave MUST execute every step below before the
manual may be described as verified.

## Mandatory refresh steps

1. Re-census application routes, personas and modules from the live platform and reconcile against `sections.ts` / `personas.ts`.
2. Compare the live Entity 360 section catalogue against `entity360.ts`; record every added, renamed or retired section.
3. Compare the live governed AI surface registry against `aiSurfaces.ts`; re-confirm classification, human control and decision authority.
4. Refresh every instruction whose screen, status or authority changed.
5. Recapture stale screenshots with `npm run docs:user-manual:screenshots` using demo-safe data only.
6. Re-run persona journeys A–F end to end and correct any step that no longer matches.
7. Regenerate the portable documents with `npm run docs:user-manual`.
8. Set every re-verified screenshot status to `FINAL_E2E_VERIFIED`.
9. Update `lastE2eVerifiedHead` and `e2eVerificationStatus` in `src/content/user-manual/meta.ts`.
10. Re-run `npm run verify:user-manual` and file the result with the certification evidence.

## Current interim position

- Documented HEAD: `a24f6286782683ed414584405cce4e8b7e8a589e`
- Last E2E verified HEAD: _none — never E2E verified_
- Screenshots captured: 54
- Screenshots pending capture: 7
  - `ext-applicant-dashboard` (applicant): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-applicant-application` (applicant): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-applicant-payment` (applicant): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-licensee-dashboard` (licensee_primary): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-licensee-returns` (licensee_primary): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-licensee-service` (licensee_primary): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
  - `ext-licensee-secondary` (licensee_secondary): No external-portal persona session exists in this environment; capture requires a demo-safe applicant/licensee sign-in.
