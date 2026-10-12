import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EXPORT_MAX_ROWS, MODULE_FILTER_COLUMN, ORDER_COLUMNS, fetchAllPages, neutraliseFormula, toCsv, truncationInfo,
} from '../../supabase/functions/audit-export/exportCore';

describe('RISK-024 module filter column', () => {
  it('uses the real column for each log', () => {
    expect(MODULE_FILTER_COLUMN.audit_logs).toBe('entity_type');
    expect(MODULE_FILTER_COLUMN.compliance_audit_logs).toBe('object_type');
  });
  it('the function no longer filters on table_name nor caps at 20000', () => {
    const src = readFileSync('supabase/functions/audit-export/index.ts', 'utf8');
    expect(src).not.toContain("'table_name'");
    expect(src).not.toContain('limit(20000)');
    expect(src).toContain('MODULE_FILTER_COLUMN[source]');
  });
  it('orders by a unique key for stable paging', () => {
    expect(ORDER_COLUMNS.audit_logs).toEqual(['created_at', 'id']);
    expect(ORDER_COLUMNS.compliance_audit_logs).toEqual(['created_at', 'entry_id']);
  });
});

describe('RISK-025 pagination and truncation', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));
  const loader = (all: { id: number }[]) => async (from: number, to: number) =>
    ({ data: all.slice(from, to + 1), error: null });

  it('fetches every row across pages with no gaps or duplicates', async () => {
    const all = make(2_537);
    const { rows } = await fetchAllPages(loader(all), all.length, 1_000);
    expect(rows.length).toBe(2_537);
    expect(new Set(rows.map((r) => r.id)).size).toBe(2_537);
    expect(rows[2_536].id).toBe(2_536);
  });
  it('stops at the limit and reports truncation explicitly', async () => {
    const all = make(2_500);
    const { rows } = await fetchAllPages(loader(all), 1_200, 500);
    expect(rows.length).toBe(1_200);
    expect(truncationInfo(2_500, rows.length)).toEqual({ truncated: true, total_matching: 2_500, exported: 1_200, max_rows: EXPORT_MAX_ROWS });
    expect(truncationInfo(10, 10).truncated).toBe(false);
  });
  it('returns the error from a failing page', async () => {
    const r = await fetchAllPages(async () => ({ data: null, error: { message: 'boom' } }), 10, 5);
    expect(r.error).toBe('boom');
  });
  it('documents a 100,000 row safety limit', () => expect(EXPORT_MAX_ROWS).toBe(100_000));
});

describe('RISK-025 CSV formula protection', () => {
  it('neutralises formula-leading cells only', () => {
    expect(neutraliseFormula('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(neutraliseFormula('+1')).toBe("'+1");
    expect(neutraliseFormula('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(neutraliseFormula('-5')).toBe("'-5"); // a negative number becomes text (stated trade-off)
    expect(neutraliseFormula('2026-10-12T00:00:00Z')).toBe('2026-10-12T00:00:00Z');
    expect(neutraliseFormula('a.b@example.com')).toBe('a.b@example.com');
  });
  it('keeps baseline output identical for normal values', () => {
    const rows = [
      { id: 'a1', action: 'login', meta: { k: 1 }, note: 'x, y', q: 'he said "hi"', n: null },
      { id: 'a2', action: 'update', extra: 5 },
    ];
    expect(toCsv(rows)).toBe(
      'id,action,meta,note,q,n,extra\n' +
      'a1,login,"{""k"":1}","x, y","he said ""hi""",,\n' +
      'a2,update,,,,,5',
    );
    expect(toCsv([])).toBe('');
  });
});
