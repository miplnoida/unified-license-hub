// ─── Row layout helpers for the Application Form Builder ───
// Rows are the source of truth for field layout (mirrors the Register Form).
// `section.fields` is kept as a derived flat list for validation, conditional
// logic, progress, and persistence to the normalized `form_fields` table.

import type { FormField, FormRow, FormSection } from '@/types/formBuilder';

const newId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2)}_${Date.now()}`;

export function emptyRow(columns: 1 | 2 | 3 | 4 = 1): FormRow {
  return {
    id: newId(),
    columns,
    fields: Array(columns).fill(null) as (FormField | null)[],
  };
}

export function resizeRow(row: FormRow, columns: 1 | 2 | 3 | 4): FormRow {
  const next = row.fields.slice(0, columns);
  while (next.length < columns) next.push(null);
  return { ...row, columns, fields: next };
}

/** True when the section already has at least one row defined. */
function hasRows(section: FormSection): boolean {
  return Array.isArray((section as any).rows) && (section as any).rows.length > 0;
}

/** Build 1-column rows from a flat field list (legacy migration). */
function rowsFromFlatFields(fields: FormField[]): FormRow[] {
  return fields.map((f) => ({
    id: newId(),
    columns: 1 as const,
    fields: [f] as (FormField | null)[],
  }));
}

/** Ensure `section.fields` matches `section.rows`. Returns a new section. */
export function syncSectionFields(section: FormSection): FormSection {
  const rows = (section.rows || []).map((r) => ({
    ...r,
    fields: r.fields.slice(0, r.columns),
  }));
  // pad short rows
  rows.forEach((r) => {
    while (r.fields.length < r.columns) r.fields.push(null);
  });
  const flat = rows.flatMap((r) => r.fields).filter((f): f is FormField => !!f);
  return { ...section, rows, fields: flat };
}

/**
 * Ensure every section has a `rows` array. If missing/empty and the section has
 * legacy flat fields, pack each field into its own 1-column row. Always
 * re-syncs `section.fields` from the resulting rows.
 */
export function migrateSectionsToRows(sections: FormSection[] | undefined | null): FormSection[] {
  if (!Array.isArray(sections)) return [];
  return sections.map((section) => {
    const base: FormSection = {
      ...section,
      fields: Array.isArray(section.fields) ? section.fields : [],
      rows: Array.isArray((section as any).rows) ? (section as any).rows : [],
    };
    if (!hasRows(base) && base.fields.length > 0) {
      base.rows = rowsFromFlatFields(base.fields);
    }
    if (!hasRows(base)) base.rows = [];
    return syncSectionFields(base);
  });
}

/** Append a field to the first available empty slot, or to a new 1-col row. */
export function appendFieldToRows(rows: FormRow[], field: FormField): FormRow[] {
  for (let i = 0; i < rows.length; i++) {
    const slotIdx = rows[i].fields.findIndex((f) => !f);
    if (slotIdx >= 0) {
      const next = rows.slice();
      const newFields = next[i].fields.slice();
      newFields[slotIdx] = field;
      next[i] = { ...next[i], fields: newFields };
      return next;
    }
  }
  return [...rows, { id: newId(), columns: 1, fields: [field] }];
}
