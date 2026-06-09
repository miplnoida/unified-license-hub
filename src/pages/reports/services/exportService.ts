import * as XLSX from 'xlsx';
import { SENSITIVE_COLUMNS } from '../reportDefinitions';

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

export function exportToCsv(data: Record<string, unknown>[], filename: string) {
  const rows = safeRows(data);
  if (!rows.length) {
    download(new Blob([''], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
    return;
  }
  const headers = Array.from(rows.reduce((set, r) => {
    Object.keys(r).forEach((k) => set.add(k));
    return set;
  }, new Set<string>()));
  const lines = [
    headers.map(sanitizeCsvValue).join(','),
    ...rows.map((r) => headers.map((h) => sanitizeCsvValue(r[h])).join(',')),
  ];
  download(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), `${filename}.csv`);
}

export function exportToXlsx(data: Record<string, unknown>[], filename: string) {
  const rows = safeRows(data);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export function exportToJson(data: Record<string, unknown>[], filename: string) {
  const rows = safeRows(data);
  download(
    new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' }),
    `${filename}.json`,
  );
}

export function sanitizeFilename(name: string) {
  return name.replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'report';
}
