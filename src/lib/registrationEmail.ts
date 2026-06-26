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

function normalizeCompact(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase().replace(/[^a-z0-9]+/g, '') : '';
}

function getDynamicValue(dynamicData: Record<string, unknown>, key: string): unknown {
  if (Object.prototype.hasOwnProperty.call(dynamicData, key)) return dynamicData[key];
  const normalized = normalizeKey(key);
  const compact = normalizeCompact(key);
  for (const [dataKey, value] of Object.entries(dynamicData)) {
    if (normalizeKey(dataKey) === normalized || normalizeCompact(dataKey) === compact) return value;
  }
  return undefined;
}

function fieldMeta(field: RegField) {
  return {
    fieldName: normalizeKey(field.fieldName),
    compactFieldName: normalizeCompact(field.fieldName),
    label: normalizeKey(field.label),
    compactLabel: normalizeCompact(field.label),
    rawFieldName: typeof field.fieldName === 'string' ? field.fieldName : '',
    labelText: typeof field.label === 'string' ? field.label.toLowerCase() : '',
  };
}

const FIRST_NAME_KEYS = [
  'first_name', 'firstName', 'firstname', 'given_name', 'givenName', 'givenname',
  'primary_user_first_name', 'contact_first_name', 'applicant_first_name',
];
const FIRST_NAME_LABEL_TOKENS = ['first name', 'given name'];

const LAST_NAME_KEYS = [
  'last_name', 'lastName', 'lastname', 'surname', 'family_name', 'familyName', 'familyname',
  'primary_user_last_name', 'contact_last_name', 'applicant_last_name',
];
const LAST_NAME_LABEL_TOKENS = ['last name', 'surname', 'family name'];

const APPLICANT_NAME_KEYS = [
  'applicant_name', 'applicantName', 'applicantname',
  'entity_name', 'entityName', 'entityname',
  'legal_name', 'legalName', 'legalname',
  'company_name', 'companyName', 'companyname',
  'business_name', 'businessname',
  'licensee_name', 'licenseename',
  'organisation_name', 'organisationname',
  'organization_name', 'organizationname',
];
const APPLICANT_NAME_LABEL_TOKENS = [
  'applicant name', 'entity name', 'legal name', 'company name',
  'business name', 'licensee name', 'organisation name', 'organization name',
];

const FULL_NAME_KEYS = ['full_legal_name', 'fullLegalName', 'full_name', 'fullName'];
const FULL_NAME_LABEL_TOKENS = ['full legal name', 'full name'];

function normalizedKeySet(keys: string[]): Set<string> {
  return new Set(keys.flatMap(k => [normalizeKey(k), normalizeCompact(k)]));
}

function fieldMatches(field: RegField | undefined | null, keys: string[], labelTokens: string[]): boolean {
  if (!field) return false;
  const meta = fieldMeta(field);
  const keySet = normalizedKeySet(keys);
  if (keySet.has(meta.fieldName) || keySet.has(meta.compactFieldName)) return true;
  for (const token of labelTokens) {
    if (meta.labelText.includes(token) || meta.label.includes(normalizeKey(token)) || meta.compactLabel.includes(normalizeCompact(token))) return true;
  }
  return false;
}

function resolveFullNameValue(
  dynamicData: Record<string, unknown>,
  schema: RegFormSchema | null | undefined,
): string {
  const candidates: unknown[] = [];
  for (const k of FULL_NAME_KEYS) candidates.push(getDynamicValue(dynamicData, k));
  if (schema) {
    for (const step of schema) {
      for (const row of step.rows) {
        for (const col of row.columns) {
          if (fieldMatches(col.field, FULL_NAME_KEYS, FULL_NAME_LABEL_TOKENS)) {
            candidates.push(dynamicData[col.field!.fieldName]);
          }
        }
      }
    }
  }
  for (const v of candidates) {
    if (typeof v === 'string') {
      const t = v.trim().replace(/\s+/g, ' ');
      if (t) return t;
    }
  }
  return '';
}

function splitFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[0] || '';
}

function splitLastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts.length > 1 ? parts.slice(1).join(' ') : '';
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
  for (const k of keys) candidates.push(getDynamicValue(dynamicData, k));
  for (const k of extraFieldNames) if (k) candidates.push(getDynamicValue(dynamicData, k));
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
  const direct = resolveByMatcher(staticValue, dynamicData, schema, FIRST_NAME_KEYS, FIRST_NAME_LABEL_TOKENS);
  return direct || splitFirstName(resolveFullNameValue(dynamicData, schema));
}

export function resolveRegistrationLastName(
  staticValue: string | undefined,
  dynamicData: Record<string, unknown>,
  schema?: RegFormSchema | null,
): string {
  const direct = resolveByMatcher(staticValue, dynamicData, schema, LAST_NAME_KEYS, LAST_NAME_LABEL_TOKENS);
  return direct || splitLastName(resolveFullNameValue(dynamicData, schema));
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
  return findFirstFieldMatch(schema, FIRST_NAME_KEYS, FIRST_NAME_LABEL_TOKENS)
    || findFirstFieldMatch(schema, FULL_NAME_KEYS, FULL_NAME_LABEL_TOKENS);
}

export function findRegistrationLastNameField(schema?: RegFormSchema | null) {
  return findFirstFieldMatch(schema, LAST_NAME_KEYS, LAST_NAME_LABEL_TOKENS)
    || findFirstFieldMatch(schema, FULL_NAME_KEYS, FULL_NAME_LABEL_TOKENS);
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

