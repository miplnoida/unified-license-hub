/**
 * Admin-configurable behaviour for dynamic `email` fields, shared by every form
 * builder (registration, pre-licensee, post-licensee, returns, internal forms).
 *
 * Backward compatibility: both flags are optional and default to OFF, so email
 * fields saved before this feature keep behaving exactly as they did — no form
 * suddenly starts demanding verification or uniqueness.
 */

export interface EmailFieldSettings {
  /** Applicant must complete OTP verification of this address. */
  requireVerification: boolean;
  /** Address must not already belong to another account/registration. */
  requireUniqueness: boolean;
}

export const EMAIL_FIELD_SETTINGS_OFF: EmailFieldSettings = {
  requireVerification: false,
  requireUniqueness: false,
};

interface EmailFieldLike {
  type?: string;
  validation?: {
    requireEmailVerification?: boolean;
    uniqueEmail?: boolean;
  } | null;
}

/** Resolve the two settings for a field. Non-email fields always return OFF. */
export function resolveEmailFieldSettings(field?: EmailFieldLike | null): EmailFieldSettings {
  if (!field || field.type !== 'email') return EMAIL_FIELD_SETTINGS_OFF;
  const v = field.validation || {};
  return {
    requireVerification: v.requireEmailVerification === true,
    requireUniqueness: v.uniqueEmail === true,
  };
}

export function hasEmailFieldSettings(field?: EmailFieldLike | null): boolean {
  const s = resolveEmailFieldSettings(field);
  return s.requireVerification || s.requireUniqueness;
}

export const EMAIL_NOT_VERIFIED_MESSAGE = 'Please verify this email address to continue.';
export const EMAIL_ALREADY_IN_USE_MESSAGE =
  'This email address is already in use. Please use a different address.';
export const EMAIL_UNIQUENESS_CHECKING_MESSAGE = 'Checking email availability…';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailValue(value: unknown): boolean {
  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
}
