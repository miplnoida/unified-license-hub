/**
 * Pure helpers for the Applications CSV export.
 *
 * Kept separate from ApplicationsList.tsx so they can be unit tested without
 * mounting the page or stubbing Supabase.
 *
 * IMPORTANT: this exporter intentionally never emits the raw `data` JSON
 * blob from an application. It only emits a curated set of safe columns
 * (number, applicant identity, taxonomy labels, payment summary, status,
 * timestamps). Permission / visibility enforcement happens server-side in
 * the `get_application_list_page` RPC — this module only formats the rows
 * the server already authorized.
 */

export interface CsvAppRow {
  application_number: string;
  applicant_id: string;
  applicant_name?: string | null;
  applicant_email?: string | null;
  status: string;
  submitted_at?: string | null;
  created_at?: string | null;
  data?: Record<string, any> | null;
  // Embedded by the RPC (may be present on the row directly):
  sector_name?: string | null;
  sub_sector_name?: string | null;
  category_name?: string | null;
  service_name?: string | null;
  payment_amount?: number | null;
  payment_currency?: string | null;
  payment_status?: string | null;
  payment_paid_at?: string | null;
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
  'Application Number',
  'Applicant',
  'Applicant Email',
  'License Type',
  'Sector',
  'Sub Sector',
  'Category',
  'Service',
  'Payment Status',
  'Payment Amount',
  'Payment Currency',
  'Payment Paid At',
  'Status',
  'Submitted At',
  'Created At',
];

/** Build a single CSV row from an application + lookups. */
export function buildCsvRow(app: CsvAppRow, l: CsvLookups): string {
  const data = (app.data || {}) as any;
  const sectorName = app.sector_name
    || (data.sector_id ? l.sectorNameById[data.sector_id] || data.sector_id : '');
  const subSectorName = app.sub_sector_name
    || (data.sub_sector_id ? l.subSectorNameById[data.sub_sector_id] || data.sub_sector_id : '');
  const categoryName = app.category_name
    || (data.category_id ? l.categoryNameById[data.category_id] || data.category_id : '');
  const serviceName = app.service_name
    || (data.service_id ? l.serviceNameById[data.service_id] || data.service_id : '');
  const licenseType = data.service_id || app.service_name
    ? 'Post Licensee'
    : (data.category_id || app.category_name ? 'Pre Licensee' : '—');

  return [
    escapeCsv(app.application_number),
    escapeCsv(app.applicant_name || l.applicantNameById(app.applicant_id)),
    escapeCsv(app.applicant_email || ''),
    escapeCsv(licenseType),
    escapeCsv(sectorName),
    escapeCsv(subSectorName),
    escapeCsv(categoryName),
    escapeCsv(serviceName),
    escapeCsv(app.payment_status || ''),
    escapeCsv(app.payment_amount ?? ''),
    escapeCsv(app.payment_currency || ''),
    escapeCsv(app.payment_paid_at || ''),
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
