/**
 * Pure helpers for the Applications CSV export.
 *
 * Kept separate from ApplicationsList.tsx so they can be unit tested without
 * mounting the page or stubbing Supabase.
 */

export interface CsvAppRow {
  application_number: string;
  applicant_id: string;
  status: string;
  submitted_at?: string | null;
  created_at?: string | null;
  data?: Record<string, any> | null;
}

export interface CsvLookups {
  applicantNameById: (id: string) => string;
  sectorNameById: Record<string, string>;
  subSectorNameById: Record<string, string>;
  categoryNameById: Record<string, string>;
  serviceNameById: Record<string, string>;
  statusLabelById: Record<string, string>;
}

/** RFC-4180-ish CSV cell escape. */
export function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export const CSV_HEADER = [
  'Application Number', 'Applicant', 'License Type', 'Sector', 'Sub Sector',
  'Category', 'Service', 'Status', 'Submitted At', 'Created At',
];

/** Build a single CSV row from an application + lookups. */
export function buildCsvRow(app: CsvAppRow, l: CsvLookups): string {
  const data = (app.data || {}) as any;
  return [
    escapeCsv(app.application_number),
    escapeCsv(l.applicantNameById(app.applicant_id)),
    escapeCsv(data.service_id ? 'Post Licensee' : data.category_id ? 'Pre Licensee' : '—'),
    escapeCsv(data.sector_id ? l.sectorNameById[data.sector_id] || data.sector_id : ''),
    escapeCsv(data.sub_sector_id ? l.subSectorNameById[data.sub_sector_id] || data.sub_sector_id : ''),
    escapeCsv(data.category_id ? l.categoryNameById[data.category_id] || data.category_id : ''),
    escapeCsv(data.service_id ? l.serviceNameById[data.service_id] || data.service_id : ''),
    escapeCsv(l.statusLabelById[app.status] || app.status),
    escapeCsv(app.submitted_at || ''),
    escapeCsv(app.created_at || ''),
  ].join(',');
}

/** Build the full CSV body (header + rows). Caller adds BOM & writes file. */
export function buildCsv(apps: CsvAppRow[], l: CsvLookups): string {
  const lines = [CSV_HEADER.join(',')];
  for (const app of apps) lines.push(buildCsvRow(app, l));
  return lines.join('\n');
}
