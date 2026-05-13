/**
 * Field types that are display-only — they have no input, no value,
 * no validation, and must never show "Not provided" in review pages.
 */
export const DISPLAY_ONLY_FIELD_TYPES = [
  'heading',
  'paragraph',
  'static_text',
  'section_title',
  'divider',
  'info',
] as const;

export const DISPLAY_ONLY_TYPES = DISPLAY_ONLY_FIELD_TYPES;

export type DisplayOnlyFieldLike = {
  type?: string | null;
  label?: string | null;
  placeholder?: string | null;
  defaultValue?: string | null;
  content?: string | null;
  helpText?: string | null;
};

export function normalizeRegistrationFieldType(type: string | undefined | null): string {
  return String(type || '').trim().toLowerCase();
}

export function isDisplayOnlyFieldType(type: string | undefined | null): boolean {
  const normalized = normalizeRegistrationFieldType(type);
  if (!normalized) return false;
  return (DISPLAY_ONLY_FIELD_TYPES as readonly string[]).includes(normalized);
}

export function isDisplayOnlyField(field: DisplayOnlyFieldLike | null | undefined): boolean {
  return isDisplayOnlyFieldType(field?.type);
}

export type DisplayKind = 'heading' | 'info' | 'divider';

export function resolveDisplayKind(type: string | undefined | null): DisplayKind {
  const normalized = normalizeRegistrationFieldType(type);
  if (normalized === 'heading' || normalized === 'section_title') return 'heading';
  if (normalized === 'divider') return 'divider';
  return 'info';
}

export function resolveDisplayOnlyFieldText(field: DisplayOnlyFieldLike | null | undefined): string {
  if (!field) return '';

  const kind = resolveDisplayKind(field.type);
  if (kind === 'heading') {
    return field.label || field.placeholder || field.defaultValue || field.content || field.helpText || '';
  }

  return field.defaultValue || field.content || field.helpText || field.label || field.placeholder || '';
}
