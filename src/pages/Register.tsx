/**
 * `/register` — public registration decision page (not a journey itself).
 *
 * Chain:
 *   /register            → choose a governed public registration journey
 *   /register/applicant  → FORM_FIRST  (New Applicant Registration)
 *   /register/entity     → ENTITY_FIRST (Connect to an Existing Entity)
 *
 * Account creation (`/register/account`) is a shared prerequisite, not a
 * journey. Both journeys converge on canonical entity resolution/binding and
 * the same regulator-side onboarding controls.
 */
import RegistrationJourneyChoice from '@/pages/registration/RegistrationJourneyChoice';

export default function Register() {
  return <RegistrationJourneyChoice />;
}
