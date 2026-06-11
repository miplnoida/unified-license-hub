/**
 * Public self-registration entry point.
 * Canonical URL is `/register`. Renders the pre-licensee registration form
 * directly so the browser URL stays `/register` (no nested route).
 */
import PreLicenseeRegistration from '@/pages/registration/PreLicenseeRegistration';

export default function Register() {
  return <PreLicenseeRegistration />;
}
