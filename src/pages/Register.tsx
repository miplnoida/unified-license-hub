/**
 * RDM-ENTITY-001 Wave C — `/register` is the USER ACCOUNT step only (§17).
 * Chain: /register (user account) → /register/entity (entity identification)
 * → authority/membership request → Application / Form Package.
 * The legacy all-in-one flow remains available at `/register/legacy` and at
 * the existing update/resubmission routes.
 */
import UserAccountStep from '@/pages/registration/UserAccountStep';

export default function Register() {
  return <UserAccountStep />;
}
