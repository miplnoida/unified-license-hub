/**
 * Helpers for building and parsing Return File Upload templates (XLSX / XML).
 *
 * A "form spec" describes one form template inside a return:
 *   - formId          (form_templates.id)
 *   - templateName    (form_templates.name)
 *   - formVersionId   (form_versions.id) — the version pinned for this return
 *   - fields          list of { field_name, label, field_type, line_code, section_title }
 *   - currentValues   { [field_name]: string }
 *
 * The XLSX template embeds a hidden `__meta` sheet that maps each visible
 * sheet name back to its (formId, formVersionId). On upload we use that
 * mapping — renames stay safe, and we can flag drift when the version no
 * longer matches the return.
 */
import * as XLSX from 'xlsx';

export interface ReturnUploadFieldSpec {
  field_name: string;
  label: string;
  field_type: string;
  line_code: string | null;
  section_title: string | null;
}

export interface ReturnUploadFormSpec {
  formId: string;
  templateName: string;
  formVersionId: string | null;
  fields: ReturnUploadFieldSpec[];
  currentValues: Record<string, string>;
}

export interface ReturnUploadRow {
  form_id: string;
  form_version_id: string | null;
  field_id: string;
  field_name: string;
  field_value: string;
}

export interface ParseResult {
  rows: ReturnUploadRow[];
  nonEmptyRows: number;
  errors: Array<{ scope: string; message: string }>;
  warnings: Array<{ scope: string; message: string }>;
  formVersionIds: string[];
}

const META_SHEET = '__meta';
const HEADER = ['Section', 'Line Code', 'Field ID', 'Label', 'Type', 'Current Value', 'New Value'];

function normalizeUploadedValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function sanitizeSheetName(name: string, taken: Set<string>): string {
  // Excel sheet names: max 31 chars, cannot contain : \ / ? * [ ]
  const base = (name || 'Form').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Form';
  let candidate = base;
  let i = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 28 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function buildXlsxTemplate(
  returnUniqueId: string,
  forms: ReturnUploadFormSpec[],
): Blob {
  const wb = XLSX.utils.book_new();
  const meta: Array<Record<string, string>> = [];
  const taken = new Set<string>();

  // Instructions sheet
  const instructions = [
    ['Return Data Upload Template'],
    [`Return: ${returnUniqueId}`],
    [`Generated: ${new Date().toISOString()}`],
    [],
    ['Instructions:'],
    ['1. Fill values in the "New Value" column of each form sheet.'],
    ['2. Do NOT rename or delete the __meta sheet — it maps sheets to forms.'],
    ['3. Leave a "New Value" blank to keep the current value. Only populated values are imported.'],
    ['4. Save the file as .xlsx and upload it back into the return.'],
  ];
  const wsIntro = XLSX.utils.aoa_to_sheet(instructions);
  wsIntro['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsIntro, 'Instructions');

  for (const f of forms) {
    const sheetName = sanitizeSheetName(f.templateName, taken);
    const rows: any[][] = [HEADER];
    for (const field of f.fields) {
      if (['section', 'divider', 'heading', 'content'].includes(field.field_type)) continue;
      rows.push([
        field.section_title || '',
        field.line_code || '',
        field.field_name,
        field.label,
        field.field_type,
        f.currentValues[field.field_name] ?? '',
        '', // New Value column
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 28 }, { wch: 12 }, { wch: 28 }, { wch: 40 },
      { wch: 12 }, { wch: 18 }, { wch: 22 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    meta.push({
      sheet_name: sheetName,
      form_id: f.formId,
      form_version_id: f.formVersionId ?? '',
      template_name: f.templateName,
    });
  }

  // Hidden meta sheet (still readable — hidden only in Excel UI).
  const wsMeta = XLSX.utils.json_to_sheet(meta);
  XLSX.utils.book_append_sheet(wb, wsMeta, META_SHEET);
  if ((wb as any).Workbook == null) (wb as any).Workbook = { Sheets: [] };
  (wb as any).Workbook.Sheets = wb.SheetNames.map((n) => ({
    name: n,
    Hidden: n === META_SHEET ? 1 : 0,
  }));

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function buildXmlTemplate(
  returnUniqueId: string,
  forms: ReturnUploadFormSpec[],
): Blob {
  const esc = (s: string) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Return uniqueId="${esc(returnUniqueId)}" generatedAt="${new Date().toISOString()}">`,
  ];
  for (const f of forms) {
    parts.push(
      `  <Form id="${esc(f.formId)}" versionId="${esc(f.formVersionId ?? '')}" name="${esc(f.templateName)}">`,
    );
    for (const field of f.fields) {
      if (['section', 'divider', 'heading', 'content'].includes(field.field_type)) continue;
      const current = f.currentValues[field.field_name] ?? '';
      parts.push(
        `    <Field id="${esc(field.field_name)}" label="${esc(field.label)}" type="${esc(field.field_type)}" lineCode="${esc(field.line_code || '')}"><Current>${esc(current)}</Current><NewValue></NewValue></Field>`,
      );
    }
    parts.push('  </Form>');
  }
  parts.push('</Return>');

  return new Blob([parts.join('\n')], { type: 'application/xml' });
}

/**
 * Parse an uploaded XLSX file against the current form spec.
 * Only rows with a non-empty "New Value" cell contribute to the import set.
 * If a user accidentally edits "Current Value" instead, we accept it only
 * when it differs from the server-side current value for that field.
 */
export async function parseXlsxUpload(
  file: File,
  forms: ReturnUploadFormSpec[],
  _strategy: 'replace' | 'fill_blanks',
): Promise<ParseResult> {
  const errors: ParseResult['errors'] = [];
  const warnings: ParseResult['warnings'] = [];
  const rows: ReturnUploadRow[] = [];
  const seenVersions = new Set<string>();

  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const metaSheet = wb.Sheets[META_SHEET];
  if (!metaSheet) {
    errors.push({ scope: 'file', message: 'Template metadata sheet (__meta) is missing. Use the downloaded template.' });
    return { rows, nonEmptyRows: 0, errors, warnings, formVersionIds: [] };
  }
  const metaRows = XLSX.utils.sheet_to_json<any>(metaSheet, { defval: '' });
  const specByFormId = new Map(forms.map((f) => [f.formId, f]));

  for (const m of metaRows) {
    const sheetName = String(m.sheet_name || '');
    const formId = String(m.form_id || '');
    const versionId = String(m.form_version_id || '') || null;
    const spec = specByFormId.get(formId);
    if (!spec) {
      warnings.push({ scope: sheetName, message: `Form "${sheetName}" is not part of this return and will be ignored.` });
      continue;
    }
    if (versionId) seenVersions.add(versionId);
    if (spec.formVersionId && versionId && spec.formVersionId !== versionId) {
      warnings.push({
        scope: sheetName,
        message: `Template version has changed for "${spec.templateName}". Uploaded values will be mapped to the current version by Field ID.`,
      });
    }

    const ws = wb.Sheets[sheetName];
    if (!ws) {
      errors.push({ scope: sheetName, message: `Sheet "${sheetName}" is missing from the file.` });
      continue;
    }
    const dataRows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
    const fieldSet = new Set(spec.fields.map((f) => f.field_name));
    for (const r of dataRows) {
      const fieldId = String(r['Field ID'] ?? '').trim();
      if (!fieldId) continue;
      if (!fieldSet.has(fieldId)) {
        warnings.push({ scope: sheetName, message: `Field ID "${fieldId}" no longer exists on this form — skipped.` });
        continue;
      }
      const fieldValue = normalizeUploadedValue(r['New Value']);
      const editedCurrentValue = normalizeUploadedValue(r['Current Value']);
      const backendCurrentValue = normalizeUploadedValue(spec.currentValues[fieldId]);
      const fallbackValue = fieldValue === '' && editedCurrentValue !== '' && editedCurrentValue !== backendCurrentValue
        ? editedCurrentValue
        : '';
      const uploadedValue = fieldValue || fallbackValue;
      if (uploadedValue !== '') {
        rows.push({
          form_id: spec.formId,
          form_version_id: spec.formVersionId,
          field_id: fieldId,
          field_name: fieldId,
          field_value: uploadedValue,
        });
      }
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    warnings.push({
      scope: 'file',
      message: 'No populated New Value cells were found. Enter values in the New Value column before importing.',
    });
  }

  return { rows, nonEmptyRows: rows.length, errors, warnings, formVersionIds: Array.from(seenVersions) };
}

export async function parseXmlUpload(
  file: File,
  forms: ReturnUploadFormSpec[],
  _strategy: 'replace' | 'fill_blanks',
): Promise<ParseResult> {
  const errors: ParseResult['errors'] = [];
  const warnings: ParseResult['warnings'] = [];
  const rows: ReturnUploadRow[] = [];
  const seenVersions = new Set<string>();

  const text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    errors.push({ scope: 'file', message: 'The uploaded XML file is not well-formed.' });
    return { rows, nonEmptyRows: 0, errors, warnings, formVersionIds: [] };
  }

  const specByFormId = new Map(forms.map((f) => [f.formId, f]));
  const formNodes = Array.from(doc.getElementsByTagName('Form'));
  for (const fn of formNodes) {
    const formId = fn.getAttribute('id') || '';
    const versionId = fn.getAttribute('versionId') || null;
    const spec = specByFormId.get(formId);
    const scope = fn.getAttribute('name') || formId;
    if (!spec) {
      warnings.push({ scope, message: `Form "${scope}" is not part of this return and will be ignored.` });
      continue;
    }
    if (versionId) seenVersions.add(versionId);
    if (spec.formVersionId && versionId && spec.formVersionId !== versionId) {
      warnings.push({
        scope,
        message: `Template version has changed for "${spec.templateName}". Uploaded values will be mapped to the current version by Field ID.`,
      });
    }
    const fieldSet = new Set(spec.fields.map((f) => f.field_name));
    for (const el of Array.from(fn.getElementsByTagName('Field'))) {
      const fieldId = el.getAttribute('id') || '';
      if (!fieldId) continue;
      if (!fieldSet.has(fieldId)) {
        warnings.push({ scope, message: `Field ID "${fieldId}" no longer exists on this form — skipped.` });
        continue;
      }
      const fieldValue = normalizeUploadedValue(el.getElementsByTagName('NewValue')[0]?.textContent ?? '');
      const editedCurrentValue = normalizeUploadedValue(el.getElementsByTagName('Current')[0]?.textContent ?? '');
      const backendCurrentValue = normalizeUploadedValue(spec.currentValues[fieldId]);
      const fallbackValue = fieldValue === '' && editedCurrentValue !== '' && editedCurrentValue !== backendCurrentValue
        ? editedCurrentValue
        : '';
      const uploadedValue = fieldValue || fallbackValue;
      if (uploadedValue !== '') {
        rows.push({
          form_id: spec.formId,
          form_version_id: spec.formVersionId,
          field_id: fieldId,
          field_name: fieldId,
          field_value: uploadedValue,
        });
      }
    }
  }

  if (rows.length === 0 && errors.length === 0) {
    warnings.push({
      scope: 'file',
      message: 'No populated NewValue elements were found. Enter values in NewValue before importing.',
    });
  }

  return { rows, nonEmptyRows: rows.length, errors, warnings, formVersionIds: Array.from(seenVersions) };
}

export function summarizeParse(result: ParseResult): {
  totalRows: number;
  nonEmptyRows: number;
  perForm: Record<string, number>;
} {
  const perForm: Record<string, number> = {};
  for (const r of result.rows) {
    perForm[r.form_id] = (perForm[r.form_id] ?? 0) + 1;
  }
  return { totalRows: result.rows.length, nonEmptyRows: result.nonEmptyRows ?? result.rows.length, perForm };
}
