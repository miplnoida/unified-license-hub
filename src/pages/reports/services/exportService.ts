import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SENSITIVE_COLUMNS } from '../reportDefinitions';
import { provenanceLines, type ExportProvenance } from '../lib/reportProvenance';
import { loadReportBranding, fitLogo, type ReportBranding } from '../lib/reportBranding';

export function sanitizeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value);
  // Prevent CSV formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // Escape quotes
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

export function flattenRecord(record: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_COLUMNS.has(key.toLowerCase())) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      Object.assign(out, flattenRecord(value as Record<string, unknown>, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

export function safeRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => flattenRecord(r));
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function relabel(rows: Record<string, unknown>[], labels?: Record<string, string>): Record<string, unknown>[] {
  if (!labels || Object.keys(labels).length === 0) return rows;
  return rows.map((r) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      out[labels[k] || k] = v;
    }
    return out;
  });
}

export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string,
  labels?: Record<string, string>,
  provenance?: ExportProvenance,
) {
  const rows = relabel(safeRows(data), labels);
  const header = provenance
    ? provenanceLines(provenance).map(([k, v]) => `${sanitizeCsvValue(`# ${k}`)},${sanitizeCsvValue(v)}`).concat([''])
    : [];
  if (!rows.length) {
    download(new Blob([header.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
    return;
  }
  const headers = Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));
  const lines = [
    ...header,
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => headers.map((h) => sanitizeCsvValue(r[h])).join(',')),
  ];
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export function exportToXlsx(
  data: Record<string, unknown>[],
  filename: string,
  labels?: Record<string, string>,
  provenance?: ExportProvenance,
) {
  const rows = relabel(safeRows(data), labels);
  const branding = getCachedBranding();
  const letterhead = branding
    ? [[branding.authorityName], ...(branding.tagline ? [[branding.tagline]] : []), [`Generated ${new Date().toLocaleString()}`], []]
    : [];
  const ws = XLSX.utils.aoa_to_sheet(letterhead);
  XLSX.utils.sheet_add_json(ws, rows, { origin: letterhead.length ? `A${letterhead.length + 1}` : 'A1' });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  if (provenance) {
    const pws = XLSX.utils.aoa_to_sheet([['Field', 'Value'], ...provenanceLines(provenance)]);
    XLSX.utils.book_append_sheet(wb, pws, 'Provenance');
  }
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

let brandingSnapshot: ReportBranding | null = null;
loadReportBranding().then((b) => { brandingSnapshot = b; }).catch(() => {});
function getCachedBranding() { return brandingSnapshot; }

export async function exportToPdf(
  data: Record<string, unknown>[],
  filename: string,
  title: string,
  labels?: Record<string, string>,
  provenance?: ExportProvenance,
) {
  const rows = relabel(safeRows(data), labels);
  const doc = new jsPDF({ orientation: rows.length && Object.keys(rows[0]).length > 6 ? 'landscape' : 'portrait' });
  const branding = await loadReportBranding().catch(() => null);
  const pageW = doc.internal.pageSize.getWidth();

  // Official letterhead: logo + authority name, then a navy rule.
  let head = 10;
  let textX = 14;
  if (branding?.logoDataUrl) {
    const { w, h } = fitLogo(branding.logoWidth, branding.logoHeight, 45, 16);
    try {
      const fmt = branding.logoDataUrl.includes('image/jpeg') ? 'JPEG' : 'PNG';
      doc.addImage(branding.logoDataUrl, fmt, 14, head, w, h);
      textX = 14 + w + 5;
    } catch { /* unsupported image type — text letterhead only */ }
  }
  doc.setTextColor(30, 58, 138);
  doc.setFontSize(12);
  doc.text(branding?.authorityName || '', textX, head + 6);
  if (branding?.tagline) {
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(branding.tagline, textX, head + 11);
  }
  head += 20;
  doc.setDrawColor(30, 58, 138);
  doc.setLineWidth(0.6);
  doc.line(14, head, pageW - 14, head);

  doc.setTextColor(0);
  doc.setFontSize(14);
  doc.text(title, 14, head + 8);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated ${new Date().toLocaleString()} — ${rows.length} record${rows.length === 1 ? '' : 's'}`, 14, head + 14);

  let cursor = head + 19;
  if (provenance) {
    doc.setFontSize(8);
    doc.setTextColor(90);
    for (const [k, v] of provenanceLines(provenance)) {
      doc.text(`${k}: ${v}`.slice(0, 180), 14, cursor);
      cursor += 4;
    }
    cursor += 3;
  }

  if (rows.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text('No records.', 14, cursor + 6);
  } else {
    const headers = Array.from(rows.reduce((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()));
    autoTable(doc, {
      startY: cursor,
      head: [headers],
      body: rows.map((r) => headers.map((h) => {
        const v = r[h];
        if (v === null || v === undefined) return '';
        return typeof v === 'object' ? JSON.stringify(v) : String(v);
      })),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138] },
      margin: { top: cursor },
    });
  }

  const pages = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`${branding?.authorityName || ''} — Confidential: supervisory use only`, 14, pageH - 8);
    doc.text(`Page ${i} of ${pages}`, pageW - 14, pageH - 8, { align: 'right' });
  }

  doc.save(`${filename}.pdf`);
}

export function exportToJson(
  data: Record<string, unknown>[],
  filename: string,
  provenance?: ExportProvenance,
) {
  const rows = safeRows(data);
  const body = provenance ? { provenance, rows } : rows;
  download(
    new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' }),
    `${filename}.json`,
  );
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'report';
}
