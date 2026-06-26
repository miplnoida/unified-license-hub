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

function normalizeMeta(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function credentialMeta(field: NonNullable<RegFormSchema[number]['rows'][number]['columns'][number]['field']>) {
  return {
    fieldName: normalizeMeta(field.fieldName),
    label: normalizeMeta(field.label),
    type: normalizeMeta((field as unknown as Record<string, unknown>).type),
  };
}

function containsConfirm(value: string): boolean {
  return value.includes('confirm');
}

export function isRegistrationConfirmPasswordField(
  field?: NonNullable<RegFormSchema[number]['rows'][number]['columns'][number]['field']> | null,
): boolean {
  if (!field) return false;
  const meta = credentialMeta(field);
  const haystack = `${meta.fieldName} ${meta.label} ${meta.type}`;
  return meta.type === 'confirm_password' || (haystack.includes('password') && containsConfirm(haystack));
}

export function isRegistrationPasswordField(
  field?: NonNullable<RegFormSchema[number]['rows'][number]['columns'][number]['field']> | null,
): boolean {
  if (!field || isRegistrationConfirmPasswordField(field)) return false;
  const meta = credentialMeta(field);
  return meta.type === 'password' || meta.fieldName.includes('password') || meta.label.includes('password');
}

export function isRegistrationEmailField(
  field?: NonNullable<RegFormSchema[number]['rows'][number]['columns'][number]['field']> | null,
): boolean {
  if (!field) return false;
  const meta = credentialMeta(field);
  return meta.type === 'email' || meta.fieldName.includes('email') || meta.label.includes('email');
}

export function getRegistrationCredentialSchemaFields(schema?: RegFormSchema | null) {
  if (!schema) return [];
  return schema.flatMap((step, stepIndex) =>
    step.rows.flatMap(row =>
      row.columns
        .map(col => col.field)
        .filter((field): field is NonNullable<typeof field> => !!field)
        .filter(field => {
          const meta = credentialMeta(field);
          const haystack = `${meta.fieldName} ${meta.label} ${meta.type}`;
          return haystack.includes('email') || haystack.includes('password');
        })
        .map(field => ({
          stepId: step.id,
          stepIndex,
          stepTitle: step.title,
          fieldId: field.id,
          fieldName: field.fieldName,
          label: field.label,
          type: String((field as unknown as Record<string, unknown>).type || ''),
          kind: isRegistrationEmailField(field)
            ? 'email'
            : isRegistrationConfirmPasswordField(field)
              ? 'confirm_password'
              : isRegistrationPasswordField(field)
                ? 'password'
                : 'credential',
        }))
    )
  );
}

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
          if (isRegistrationEmailField(col.field)) {
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

// Resolves the registration account password. Mirrors resolveRegistrationEmail.
// Priority: static form.password > common dynamic keys > any field declared as
// type=password (excluding confirm_password). Returns the raw string.
const COMMON_PASSWORD_KEYS = [
  'password',
  'user_password',
  'primary_password',
  'primary_user_password',
  'login_password',
  'account_password',
];

export function resolveRegistrationPassword(
  staticPassword: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
): string {
  const candidates: unknown[] = [staticPassword];
  for (const k of COMMON_PASSWORD_KEYS) candidates.push(dynamicData[k]);
  if (schema) {
    for (const step of schema) {
      for (const row of step.rows) {
        for (const col of row.columns) {
          const f = col.field;
          if (isRegistrationPasswordField(f)) {
            candidates.push(dynamicData[f.fieldName]);
          }
        }
      }
    }
  }
  for (const v of candidates) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return '';
}

