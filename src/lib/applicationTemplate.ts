/**
 * Build Excel / XML sample templates for the applicant licensee application
 * form, derived from the live form schema (sections + fields).
 *
 * UI-only phase: these produce sample files for download. Parsing/import is
 * not wired yet.
 */
import * as XLSX from 'xlsx';

export interface AppTemplateField {
  label: string;
  fieldName: string;
  type: string;
  required?: boolean;
}

export interface AppTemplateSection {
  title: string;
  fields: AppTemplateField[];
}

const SKIP_TYPES = new Set(['section', 'divider', 'heading', 'content']);

function sanitizeSheetName(name: string, taken: Set<string>): string {
  const base = (name || 'Section').replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 28) || 'Section';
  let candidate = base;
  let i = 2;
  while (taken.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 28 - suffix.length) + suffix;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export function buildApplicationExcelTemplate(
  formName: string,
  sections: AppTemplateSection[],
): Blob {
  const wb = XLSX.utils.book_new();
  const taken = new Set<string>();

  const instructions = [
    ['Application Data Upload Template'],
    [`Form: ${formName}`],
    [`Generated: ${new Date().toISOString()}`],
    [],
    ['Instructions:'],
    ['1. Fill the "Value" column of each sheet below.'],
    ['2. One sheet per form section.'],
    ['3. Do not rename column headers or the Field Key column.'],
    ['4. Save as .xlsx and upload it back into the application.'],
  ];
  const wsIntro = XLSX.utils.aoa_to_sheet(instructions);
  wsIntro['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, wsIntro, 'Instructions');

  const usable = sections.filter((s) => s.fields.some((f) => !SKIP_TYPES.has(f.type)));
  const list = usable.length > 0 ? usable : [{ title: 'Fields', fields: [] as AppTemplateField[] }];

  for (const section of list) {
    const sheetName = sanitizeSheetName(section.title || 'Section', taken);
    const rows: any[][] = [['Field Label', 'Field Key', 'Type', 'Required', 'Value']];
    for (const field of section.fields) {
      if (SKIP_TYPES.has(field.type)) continue;
      rows.push([
        field.label || '',
        field.fieldName,
        field.type,
        field.required ? 'Yes' : 'No',
        '',
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 40 }, { wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 28 }];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function buildApplicationXmlTemplate(
  formName: string,
  sections: AppTemplateSection[],
): Blob {
  const esc = (s: string) =>
    (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Application name="${esc(formName)}" generatedAt="${new Date().toISOString()}">`,
  ];
  for (const section of sections) {
    const usableFields = section.fields.filter((f) => !SKIP_TYPES.has(f.type));
    if (usableFields.length === 0) continue;
    parts.push(`  <Section title="${esc(section.title || '')}">`);
    for (const field of usableFields) {
      parts.push(
        `    <Field key="${esc(field.fieldName)}" label="${esc(field.label || '')}" type="${esc(field.type)}" required="${field.required ? 'true' : 'false'}"><Value></Value></Field>`,
      );
    }
    parts.push('  </Section>');
  }
  parts.push('</Application>');

  return new Blob([parts.join('\n')], { type: 'application/xml' });
}
