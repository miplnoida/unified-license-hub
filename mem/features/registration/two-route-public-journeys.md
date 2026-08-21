---
name: Public registration two-route architecture
description: FORM_FIRST vs ENTITY_FIRST public registration journeys, their routes, and the governed resolution path
type: feature
---
Public registration has exactly two first-class journeys, driven by
`registration_journey_types` (readable by anon; `is_enabled` + `is_public` +
`sort_order`):

- **FORM_FIRST** — "New Applicant Registration", `/register/applicant`,
  resolution timing LATE. Uses the existing `PreLicenseeRegistration` form.
  After the `register-pre-licensee` edge function inserts the registration it
  calls `onboarding_form_first_resolve_service` (service-role only) →
  EXACT_MATCH = bind existing entity, POSSIBLE_MATCH = governed resolution case
  (`PENDING_RESOLUTION`, no entity created), NO_MATCH = governed provisional
  entity (`LOCAL_PROVISIONAL`).
- **ENTITY_FIRST** — "Connect to an Existing Entity", `/register/entity`,
  resolution timing EARLY (token-based, `useOnboardingTokens`).

Routes: `/register` = journey choice page, `/register/account` = shared user
account step (honours `?journey=` and `?next=`), `/register/legacy` = redirect to
`/register/applicant`. Update/resubmission stays separate
(`/registration/portal`, `/update-registration-form`, `/registration/update/:id`).

Onboarding audit ledger tables are append-only; delete is refused, so DB checks
must roll back rather than clean up. Regression artefacts:
`src/test/registrationTwoRouteArchitecture.test.ts` and
`supabase/tests/onboarding/01_form_first_resolution.sql`.
