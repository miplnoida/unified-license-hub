# F5-B2 DELTA — Post-Licensing Intake Authority & Service-Scope Closure

Date: 2026-08-29  •  Status: **CLOSED (44/44 PASS, zero residue)**  •  Gate: `npm run verify:f5b2`

## Scope closed
1. **Delegated submission restricted to F5.** `public.can_submit_application` now grants
   entity-delegate authority only when `public.is_post_license_filing` is true. Initial (F4)
   licensing filings remain creator/applicant-only.
2. **Complete service↔licence compatibility.** `public.post_license_service_applicability`
   evaluates service status, effective window, `lifecycle_stage ∈ (post_license, renewal)`,
   effective regulator (resolved via the licence, falling back to sector), sector, sub-sector
   and category. `service_license_compatible` delegates to it.
3. **Hardened classification.** A `service_id` alone can no longer reclassify an F4 filing as
   F5; canonical indicators (bound licence + applicable F5 service) are required, otherwise the
   call fails with a governed code instead of silently falling through to initial intake.
4. **Canonical taxonomy preserved.** `create_application_draft` / `submit_application` overwrite
   client-supplied sector/sub-sector/category/entity with licence-derived truth.
5. **UI binding.** Licence renewal now sends `license_id` (src/pages/licenses/LicenseDetail.tsx).

## Governed error codes
`LICENSE_REQUIRED`, `LICENSE_NOT_FOUND`, `LICENSE_ENTITY_MISMATCH`,
`POST_LICENSE_SERVICE_REQUIRED`, `POST_LICENSE_SERVICE_NOT_APPLICABLE`,
`SERVICE_LICENSE_INCOMPATIBLE`, `FORBIDDEN`.

## Evidence (verify:f5b2 — 44 assertions)
- A (8): governed surface exists, SECURITY DEFINER, pinned search_path, anon 0/5, authenticated 5/5.
- B (8): source contract of both intake RPCs incl. delegation-gated-on-classification.
- C (4): empirical compatibility matrix + fail-closed on null/unknown.
- D (8): F5 creator/delegate/viewer/cross-entity outcomes **plus permanent F4 non-regression
  assertions D-07/D-08 (submit-capable delegate DENIED on an initial application).**
- E (13): canonical taxonomy overwrite, entity derivation, and negative applicability cases
  (pre-licence, inactive, expired, wrong regulator, wrong sub-sector, forged type, missing service,
  no fall-through draft created).
- F (3): zero residue for probe applications, memberships and catalogue services.

## Migration
`supabase/migrations/20260828193758_aa63b852-befe-4dd1-a13a-67f485fcf3b0.sql`

STOP — F5-B3 not started.
