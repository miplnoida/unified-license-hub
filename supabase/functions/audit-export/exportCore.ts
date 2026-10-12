// Pure helpers for the audit export (no Deno / network APIs) so they can be
// unit-tested without deploying the function.

/** Hard safety limit per export. Larger result sets are exported up to this
 * many rows and the job is explicitly marked truncated — never silently. */
export const EXPORT_MAX_ROWS = 100_000;
export const EXPORT_PAGE_SIZE = 1_000;

export type AuditExportSource = 'audit_logs' | 'compliance_audit_logs';

/** Column that holds the "module" for each log (verified against the schema). */
export const MODULE_FILTER_COLUMN: Record<AuditExportSource, string> = {
  audit_logs: 'entity_type',
  compliance_audit_logs: 'object_type',
};

/** Stable keyset order so pages never repeat or skip rows. */
export const ORDER_COLUMNS: Record<AuditExportSource, [string, string]> = {
  audit_logs: ['created_at', 'id'],
  compliance_audit_logs: ['created_at', 'entry_id'],
};

export function truncationInfo(totalMatching: number, exported: number) {
  return {
    truncated: totalMatching > exported,
    total_matching: totalMatching,
    exported,
    max_rows: EXPORT_MAX_ROWS,
  };
}

/** Neutralise spreadsheet formula injection: only cells that START with a
 * formula trigger get a leading apostrophe; everything else is unchanged. */
export function neutraliseFormula(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: unknown) => {
    if (v == null) return '';
    const raw = typeof v === 'object' ? JSON.stringify(v) : String(v);
    const s = neutraliseFormula(raw);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.map(esc).join(',');
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

/** Fetch all pages via a page loader (offset-based over a stable order). */
export async function fetchAllPages<T>(
  loadPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null }>,
  limit: number = EXPORT_MAX_ROWS,
  pageSize: number = EXPORT_PAGE_SIZE,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  while (rows.length < limit) {
    const from = rows.length;
    const to = Math.min(from + pageSize, limit) - 1;
    const { data, error } = await loadPage(from, to);
    if (error) return { rows, error: error.message };
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
  }
  return { rows, error: null };
}
