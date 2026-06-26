// Resolves the verification email used by the registration OTP step.
// Priority: static form.email > common dynamic field names > any field declared as type=email.
// Always returns a trimmed, lowercased string (or '' if none found).

import type { RegField, RegFormSchema } from '@/types/registrationForm';

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

function credentialMeta(field: RegField) {
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
  field?: RegField | null,
): boolean {
  if (!field) return false;
  const meta = credentialMeta(field);
  const haystack = `${meta.fieldName} ${meta.label} ${meta.type}`;
  return meta.type === 'confirm_password' || (haystack.includes('password') && containsConfirm(haystack));
}

export function isRegistrationPasswordField(
  field?: RegField | null,
): boolean {
  if (!field || isRegistrationConfirmPasswordField(field)) return false;
  const meta = credentialMeta(field);
  return meta.type === 'password' || meta.fieldName.includes('password') || meta.label.includes('password');
}

export function isRegistrationEmailField(
  field?: RegField | null,
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
        .filter((field): field is RegField => !!field)
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

// ---------------------------------------------------------------------------
// Identity field resolvers (first name, last name, applicant/entity name)
// Used by the registration submit flow so dynamic schemas can use custom
// field names while still satisfying the register-pre-licensee edge function.
// ---------------------------------------------------------------------------

function normalizeKey(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') : '';
}

function fieldMeta(field: RegField) {
  return {
    fieldName: normalizeKey(field.fieldName),
    label: normalizeKey(field.label),
    rawFieldName: typeof field.fieldName === 'string' ? field.fieldName : '',
    labelText: typeof field.label === 'string' ? field.label.toLowerCase() : '',
  };
}

const FIRST_NAME_KEYS = [
  'first_name', 'firstname', 'given_name', 'givenname',
  'primary_user_first_name', 'contact_first_name', 'applicant_first_name',
];
const FIRST_NAME_LABEL_TOKENS = ['first name', 'given name'];

const LAST_NAME_KEYS = [
  'last_name', 'lastname', 'surname', 'family_name', 'familyname',
  'primary_user_last_name', 'contact_last_name', 'applicant_last_name',
];
const LAST_NAME_LABEL_TOKENS = ['last name', 'surname', 'family name'];

const APPLICANT_NAME_KEYS = [
  'applicant_name', 'applicantname',
  'entity_name', 'entityname',
  'legal_name', 'legalname',
  'company_name', 'companyname',
  'business_name', 'businessname',
  'licensee_name', 'licenseename',
  'organisation_name', 'organisationname',
  'organization_name', 'organizationname',
];
const APPLICANT_NAME_LABEL_TOKENS = [
  'applicant name', 'entity name', 'legal name', 'company name',
  'business name', 'licensee name', 'organisation name', 'organization name',
];

function fieldMatches(field: RegField | undefined | null, keys: string[], labelTokens: string[]): boolean {
  if (!field) return false;
  const meta = fieldMeta(field);
  if (keys.includes(meta.fieldName)) return true;
  for (const token of labelTokens) {
    if (meta.labelText.includes(token)) return true;
  }
  return false;
}

function resolveByMatcher(
  staticValue: string | undefined,
  dynamicData: Record<string, unknown>,
  schema: RegFormSchema | null | undefined,
  keys: string[],
  labelTokens: string[],
  extraFieldNames: string[] = [],
): string {
  const candidates: unknown[] = [staticValue];
  for (const k of keys) candidates.push(dynamicData[k]);
  for (const k of extraFieldNames) if (k) candidates.push(dynamicData[k]);
  if (schema) {
    for (const step of schema) {
      for (const row of step.rows) {
        for (const col of row.columns) {
          if (fieldMatches(col.field, keys, labelTokens)) {
            candidates.push(dynamicData[col.field!.fieldName]);
          }
        }
      }
    }
  }
  for (const v of candidates) {
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) return t;
    }
  }
  return '';
}

export function resolveRegistrationFirstName(
  staticValue: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
): string {
  return resolveByMatcher(staticValue, dynamicData, schema, FIRST_NAME_KEYS, FIRST_NAME_LABEL_TOKENS);
}

export function resolveRegistrationLastName(
  staticValue: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
): string {
  return resolveByMatcher(staticValue, dynamicData, schema, LAST_NAME_KEYS, LAST_NAME_LABEL_TOKENS);
}

export function resolveRegistrationApplicantName(
  staticValue: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
  applicantNameCheckFieldName?: string | null,
): string {
  const extras = applicantNameCheckFieldName ? [applicantNameCheckFieldName] : [];
  return resolveByMatcher(staticValue, dynamicData, schema, APPLICANT_NAME_KEYS, APPLICANT_NAME_LABEL_TOKENS, extras);
}

export function findRegistrationFirstNameField(schema?: RegFormSchema | null) {
  return findFirstFieldMatch(schema, FIRST_NAME_KEYS, FIRST_NAME_LABEL_TOKENS);
}

export function findRegistrationLastNameField(schema?: RegFormSchema | null) {
  return findFirstFieldMatch(schema, LAST_NAME_KEYS, LAST_NAME_LABEL_TOKENS);
}

export function findRegistrationApplicantNameField(schema?: RegFormSchema | null) {
  return findFirstFieldMatch(schema, APPLICANT_NAME_KEYS, APPLICANT_NAME_LABEL_TOKENS);
}

function findFirstFieldMatch(
  schema: RegFormSchema | null | undefined,
  keys: string[],
  labelTokens: string[],
): { field: RegField; stepIndex: number } | null {
  if (!schema) return null;
  for (let stepIndex = 0; stepIndex < schema.length; stepIndex++) {
    for (const row of schema[stepIndex].rows) {
      for (const col of row.columns) {
        if (fieldMatches(col.field, keys, labelTokens)) {
          return { field: col.field as RegField, stepIndex };
        }
      }
    }
  }
  return null;
}

