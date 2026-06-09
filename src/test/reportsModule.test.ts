import { describe, expect, it } from 'vitest';
import {
  calculateNextRunAt, ALLOWED_SOURCES, isAllowedSource, selectColumns,
  resolveScheduleSource, REPORT_SLUG_SOURCE_MAP,
} from '@/pages/reports/services/reportService';
import { sanitizeCsvValue, flattenRecord } from '@/pages/reports/services/exportService';
import { REPORT_DEFINITIONS } from '@/pages/reports/reportDefinitions';

describe('calculateNextRunAt', () => {
  const base = new Date('2026-06-09T12:00:00.000Z');
  it('daily adds 1 day', () => {
    const d = calculateNextRunAt('daily', base);
    expect(d.getUTCDate()).toBe(10);
  });
  it('weekly adds 7 days', () => {
    const d = calculateNextRunAt('weekly', base);
    expect(Math.round((d.getTime() - base.getTime()) / 86_400_000)).toBeGreaterThanOrEqual(7);
  });
  it('monthly adds 1 month', () => {
    const d = calculateNextRunAt('monthly', base);
    expect(d.getMonth()).toBe(new Date(new Date(base).setMonth(base.getMonth() + 1)).getMonth());
  });
  it('quarterly adds 3 months', () => {
    const d = calculateNextRunAt('quarterly', base);
    expect(d.getMonth()).toBe(new Date(new Date(base).setMonth(base.getMonth() + 3)).getMonth());
  });
});

describe('sanitizeCsvValue', () => {
  it('quotes plain strings', () => {
    expect(sanitizeCsvValue('hello')).toBe('"hello"');
  });
  it('escapes quotes', () => {
    expect(sanitizeCsvValue('a"b')).toBe('"a""b"');
  });
  it('prefixes formula triggers', () => {
    expect(sanitizeCsvValue('=SUM(A1)')).toBe('"\'=SUM(A1)"');
    expect(sanitizeCsvValue('+1+1')).toBe('"\'+1+1"');
    expect(sanitizeCsvValue('-2')).toBe('"\'-2"');
    expect(sanitizeCsvValue('@cmd')).toBe('"\'@cmd"');
  });
  it('handles null/undefined', () => {
    expect(sanitizeCsvValue(null)).toBe('');
    expect(sanitizeCsvValue(undefined)).toBe('');
  });
});

describe('flattenRecord', () => {
  it('strips sensitive columns', () => {
    const r = flattenRecord({ id: 1, password: 'x', token: 'y', name: 'a' });
    expect(r.password).toBeUndefined();
    expect(r.token).toBeUndefined();
    expect(r.name).toBe('a');
  });
  it('flattens nested objects', () => {
    const r = flattenRecord({ id: 1, meta: { color: 'red', n: 2 } });
    expect(r['meta.color']).toBe('red');
    expect(r['meta.n']).toBe(2);
  });
});

describe('selectColumns', () => {
  it('returns rows unchanged when no columns selected', () => {
    const rows = [{ a: 1, b: 2 }];
    expect(selectColumns(rows)).toEqual(rows);
  });
  it('limits to selected columns', () => {
    const rows = [{ a: 1, b: 2, c: 3 }];
    expect(selectColumns(rows, ['a', 'c'])).toEqual([{ a: 1, c: 3 }]);
  });
});

describe('source allowlist', () => {
  it('accepts known sources', () => {
    expect(isAllowedSource('applications')).toBe(true);
    expect(isAllowedSource('licenses')).toBe(true);
  });
  it('rejects unknown sources', () => {
    expect(isAllowedSource('auth.users')).toBe(false);
    expect(isAllowedSource('drop table x')).toBe(false);
  });
  it('exposes expected source set', () => {
    expect(ALLOWED_SOURCES.length).toBeGreaterThan(0);
  });
});

describe('report definitions', () => {
  it('has unique ids', () => {
    const ids = REPORT_DEFINITIONS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('each definition has module + source', () => {
    REPORT_DEFINITIONS.forEach((d) => {
      expect(d.module).toBeTruthy();
      expect(d.source).toBeTruthy();
    });
  });
});

describe('resolveScheduleSource', () => {
  it('resolves explicit valid source', () => {
    expect(resolveScheduleSource({ source: 'applications' })).toBe('applications');
  });
  it('resolves from slug when source missing', () => {
    expect(resolveScheduleSource({ report_slug: 'app-status' })).toBe('applications');
    expect(resolveScheduleSource({ report_slug: 'ret-overdue' })).toBe('compliance_returns');
    expect(resolveScheduleSource({ report_slug: 'fee-collection' })).toBe('payments');
    expect(resolveScheduleSource({ report_slug: 'cmp-pending' })).toBe('complaints');
  });
  it('returns null for unknown slug + no source', () => {
    expect(resolveScheduleSource({ report_slug: 'nope-xyz' })).toBeNull();
    expect(resolveScheduleSource({})).toBeNull();
  });
  it('never resolves to the slug itself', () => {
    Object.keys(REPORT_SLUG_SOURCE_MAP).forEach((slug) => {
      const resolved = resolveScheduleSource({ report_slug: slug });
      expect(resolved).not.toBe(slug);
      expect(ALLOWED_SOURCES).toContain(resolved);
    });
  });
  it('rejects invalid explicit source and falls back to slug', () => {
    expect(resolveScheduleSource({ source: 'not-a-table', report_slug: 'app-status' })).toBe('applications');
  });
});
