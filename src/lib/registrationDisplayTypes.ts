/**
 * Field types that are display-only — they have no input, no value,
 * no validation, and must never show "Not provided" in review pages.
 */
export const DISPLAY_ONLY_TYPES = [
  'heading',
  'paragraph',
  'static_text',
  'section_title',
  'divider',
  'info',
] as const;

export function isDisplayOnlyFieldType(type: string | undefined | null): boolean {
  if (!type) return false;
  return (DISPLAY_ONLY_TYPES as readonly string[]).includes(type);
}

export type DisplayKind = 'heading' | 'info' | 'divider';

export function resolveDisplayKind(type: string): DisplayKind {
  if (type === 'heading' || type === 'section_title') return 'heading';
  if (type === 'divider') return 'divider';
  return 'info';
}
