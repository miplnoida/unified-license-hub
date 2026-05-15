import type { RegField, RegFormSchema } from '@/types/registrationForm';

export const PRIMARY_EMAIL_FIELD_NAMES = [
  'email',
  'primary_email',
  'primary_user_email',
  'user_email',
  'applicant_email',
  'contact_email',
  'email_address',
] as const;

const PRIMARY_EMAIL_METADATA_TOKENS = [
  'primary user email',
  'primary email',
  'primary user',
  'contact email',
  'email address',
  'email',
];

function normalizeToken(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function fieldMetadataStrings(field: RegField): string[] {
  const maybeAny = field as RegField & Record<string, unknown>;
  return [
    field.fieldName,
    field.label,
    field.placeholder,
    field.helpText,
    field.content,
    maybeAny.key,
    maybeAny.metadata,
    maybeAny.name,
  ]
    .map(normalizeToken)
    .filter(Boolean);
}

export function isPrimaryEmailField(field?: RegField | null): field is RegField {
  if (!field || field.type !== 'email') return false;
  const maybeAny = field as unknown as Record<string, unknown>;
  const fieldName = normalizeToken(field.fieldName ?? maybeAny.name ?? field.id);
  const label = normalizeToken(field.label || field.placeholder || field.helpText);

  if (PRIMARY_EMAIL_FIELD_NAMES.includes(fieldName as (typeof PRIMARY_EMAIL_FIELD_NAMES)[number])) {
    return true;
  }

  if (
    label.includes('primary user email') ||
    label.includes('primary email') ||
    label === 'email' ||
    label.includes('email address')
  ) {
    return true;
  }

  const haystack = fieldMetadataStrings(field).join(' ');
  return PRIMARY_EMAIL_METADATA_TOKENS.some(token => haystack.includes(token));
}

/** Resolve the dynamic field that represents the primary email in a schema. */
export function resolvePrimaryEmailField(schema?: RegFormSchema | null): RegField | null {
  if (!schema) return null;
  const all = schema.flatMap(s => s.rows.flatMap(r => r.columns.map(c => c.field).filter(Boolean) as RegField[]));
  return all.find(isPrimaryEmailField) || null;
}

export function normalizeEmailValue(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}