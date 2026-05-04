// Resolves the verification email used by the registration OTP step.
// Priority: static form.email > common dynamic field names > any field declared as type=email.
// Always returns a trimmed, lowercased string (or '' if none found).

import type { RegFormSchema } from '@/types/registrationForm';

const COMMON_KEYS = [
  'email',
  'contact_email',
  'applicant_email',
  'user_email',
  'primary_email',
  'email_address',
];

export function resolveRegistrationEmail(
  staticEmail: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
): string {
  const candidates: unknown[] = [staticEmail];
  for (const k of COMMON_KEYS) candidates.push(dynamicData[k]);
  if (schema) {
    for (const step of schema) {
      for (const row of step.rows) {
        for (const col of row.columns) {
          if (col.field?.type === 'email') {
            candidates.push(dynamicData[col.field.fieldName]);
          }
        }
      }
    }
  }
  for (const v of candidates) {
    if (typeof v === 'string') {
      const t = v.trim().toLowerCase();
      if (t) return t;
    }
  }
  return '';
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
