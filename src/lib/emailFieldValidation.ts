import {
  EMAIL_ALREADY_IN_USE_MESSAGE,
  EMAIL_NOT_VERIFIED_MESSAGE,
  EMAIL_UNIQUENESS_CHECKING_MESSAGE,
  isValidEmailValue,
  resolveEmailFieldSettings,
} from '@/lib/emailFieldConfig';
import { currentEmailFieldRuntimeState } from '@/lib/emailFieldRuntimeState';

interface EmailFieldLike {
  type?: string;
  validation?: { requireEmailVerification?: boolean; uniqueEmail?: boolean } | null;
}

interface Args {
  field: EmailFieldLike;
  /** Key the control publishes state under (usually the effective field name). */
  fieldKey: string;
  value: unknown;
  /** The record's own existing email in edit/update mode — never a duplicate. */
  ownEmail?: string | null;
  /** Hidden / conditionally inapplicable fields are never checked. */
  applicable?: boolean;
}

/**
 * Validation for the admin-configured email settings. Returns an error message
 * or null. An empty value is left to the normal required-check so an optional
 * email field can still be skipped entirely.
 */
export function validateEmailFieldSettings({
  field,
  fieldKey,
  value,
  ownEmail,
  applicable = true,
}: Args): string | null {
  if (!applicable) return null;
  const settings = resolveEmailFieldSettings(field);
  if (!settings.requireVerification && !settings.requireUniqueness) return null;
  if (!isValidEmailValue(value)) return null;

  const normalized = String(value).trim().toLowerCase();
  const own = (ownEmail || '').trim().toLowerCase();
  const isOwnEmail = !!own && own === normalized;
  const state = currentEmailFieldRuntimeState(fieldKey, value);

  if (settings.requireUniqueness && !isOwnEmail) {
    if (state?.unique === 'taken') return EMAIL_ALREADY_IN_USE_MESSAGE;
    if (state?.unique === 'checking') return EMAIL_UNIQUENESS_CHECKING_MESSAGE;
  }

  if (settings.requireVerification && !isOwnEmail && !state?.verified) {
    return EMAIL_NOT_VERIFIED_MESSAGE;
  }

  return null;
}
