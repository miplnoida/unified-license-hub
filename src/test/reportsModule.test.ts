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
  it('aud-export resolves to report_logs', () => {
    expect(resolveScheduleSource({ report_slug: 'aud-export' })).toBe('report_logs');
  });
});

import {
  buildReportSummary, decorate, getEffectiveColumns, strip,
  REQUIRED_COMPUTED_COLUMNS,
} from '../../supabase/functions/_shared/report-generator.ts';

describe('decorate', () => {
  it('app-aging adds aging_days and aging_bucket', () => {
    const rows = decorate('app-aging', [{ id: 1, created_at: new Date(Date.now() - 10 * 86400_000).toISOString() }]);
    expect(rows[0].aging_days).toBeGreaterThanOrEqual(9);
    expect(rows[0].aging_bucket).toBeTruthy();
  });
  it('ret-overdue excludes submitted returns', () => {
    const past = new Date(Date.now() - 5 * 86400_000).toISOString();
    const rows = decorate('ret-overdue', [
      { id: 1, due_date: past, status: 'pending' },
      { id: 2, due_date: past, status: 'submitted' },
      { id: 3, due_date: past, submitted_at: past, status: 'pending' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(1);
    expect(rows[0].days_overdue).toBeGreaterThanOrEqual(4);
  });
});

describe('strip sensitive fields', () => {
  it('removes password/token/private_key', () => {
    const out = strip({ id: 1, password: 'x', token: 'y', private_key: 'z', name: 'ok' });
    expect(out.password).toBeUndefined();
    expect(out.token).toBeUndefined();
    expect(out.private_key).toBeUndefined();
    expect(out.name).toBe('ok');
  });
});

describe('getEffectiveColumns', () => {
  it('appends required computed columns when user picks a subset', () => {
    const cols = getEffectiveColumns('app-aging', ['application_number'], []);
    expect(cols).toContain('application_number');
    expect(cols).toContain('aging_days');
    expect(cols).toContain('aging_bucket');
  });
  it('uses defaults plus required when selection is empty', () => {
    const cols = getEffectiveColumns('ret-overdue', [], ['license_id']);
    expect(cols).toContain('license_id');
    expect(cols).toContain('days_overdue');
  });
  it('returns user selection unchanged for non-predefined reports', () => {
    expect(getEffectiveColumns(undefined, ['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('buildReportSummary', () => {
  it('returns status_counts for app-status', () => {
    const s = buildReportSummary('app-status', [{ status: 'approved' }, { status: 'pending' }, { status: 'approved' }]);
    expect(s.status_counts.approved).toBe(2);
    expect(s.status_counts.pending).toBe(1);
  });
  it('returns sla bucket counts for app-sla', () => {
    const s = buildReportSummary('app-sla', [
      { sla_status: 'breached' }, { sla_status: 'at_risk' }, { sla_status: 'on_track' }, { sla_status: 'breached' },
    ]);
    expect(s.breached_count).toBe(2);
    expect(s.at_risk_count).toBe(1);
    expect(s.on_track_count).toBe(1);
  });
  it('tolerates missing fields without crashing', () => {
    expect(() => buildReportSummary('ret-scorecard', [])).not.toThrow();
  });
});

describe('REQUIRED_COMPUTED_COLUMNS', () => {
  it('covers key predefined slugs', () => {
    expect(REQUIRED_COMPUTED_COLUMNS['app-aging']).toContain('aging_days');
    expect(REQUIRED_COMPUTED_COLUMNS['app-sla']).toContain('sla_status');
    expect(REQUIRED_COMPUTED_COLUMNS['lic-expiry']).toContain('days_to_expiry');
  });
});
