/**
 * F3-B2 — neutral submission-time duplicate / entity-resolution messaging.
 *
 * The public registration form no longer probes whether an applicant name or
 * business registration number already exists (that pre-authentication oracle
 * was retired with GAP-F3-14). Duplicate and entity-resolution authority is
 * server-side. When the server rejects an intake for that reason we must not
 * echo a message that confirms an arbitrary name/reference is already held by
 * someone else — the applicant gets a neutral instruction instead.
 */
export const REGISTRATION_DUPLICATE_NEUTRAL_MESSAGE =
  'We could not complete this registration with the details provided. Please review your applicant name and business registration details, or contact the regulator if you believe this entity is already registered.';

const DUPLICATE_SIGNALS = [
  'duplicate key',
  'already exists',
  'already registered',
  'unique constraint',
  'uidx',
  '23505',
  'one live registration',
  'entity resolution',
  'entity_resolution',
];

/**
 * Returns a message safe to show on an unauthenticated page: neutral text when
 * the server error discloses existence of another record, otherwise the
 * original message.
 */
export function neutraliseRegistrationSubmitError(
  message: string | null | undefined,
  fallback = 'Registration failed. Please try again.',
): string {
  const msg = (message ?? '').trim();
  if (!msg) return fallback;
  const lower = msg.toLowerCase();
  if (DUPLICATE_SIGNALS.some((s) => lower.includes(s))) {
    return REGISTRATION_DUPLICATE_NEUTRAL_MESSAGE;
  }
  return msg;
}
