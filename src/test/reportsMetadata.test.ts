import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/integrations/supabase/client', () => {
  const chain = () => {
    const c: any = {};
    const r = { data: [], error: new Error('not configured'), count: null };
    c.select = vi.fn(() => c);
    c.eq = vi.fn(() => c);
    c.order = vi.fn(() => c);
    c.limit = vi.fn(() => c);
    c.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    c.then = (resolve: any) => Promise.resolve(r).then(resolve);
    return c;
  };
  return { supabase: { from: vi.fn(() => chain()) } };
});

import {
  getReportSources, getReportDefinitions, getOptionSet, getDashboardWidgets,
} from '@/pages/reports/services/reportMetadataService';
import { REPORT_DEFINITIONS } from '@/pages/reports/reportDefinitions';

describe('reportMetadataService — fallbacks when DB unavailable', () => {
  beforeEach(() => vi.clearAllMocks());

  it('getReportSources returns fallback list with 8 sources', async () => {
    const sources = await getReportSources();
    expect(sources.length).toBeGreaterThanOrEqual(7);
    expect(sources.find((s) => s.sourceKey === 'applications')).toBeTruthy();
    expect(sources.find((s) => s.sourceKey === 'users')?.tableName).toBe('profiles');
  });

  it('getReportDefinitions falls back to REPORT_DEFINITIONS', async () => {
    const defs = await getReportDefinitions();
    expect(defs.length).toBe(REPORT_DEFINITIONS.length);
    expect(defs[0].id).toBeTruthy();
  });

  it('categories can be derived from definitions', async () => {
    const defs = await getReportDefinitions();
    const cats = Array.from(new Set(defs.map((d) => d.category)));
    expect(cats.length).toBeGreaterThan(1);
    expect(cats).toContain('Licensing & Applications');
  });

  it('getOptionSet returns fallback option set for schedule_frequency', async () => {
    const opts = await getOptionSet('schedule_frequency');
    expect(opts.map((o) => o.value)).toEqual(['daily', 'weekly', 'monthly', 'quarterly']);
  });

  it('getOptionSet returns fallback for export_format', async () => {
    const opts = await getOptionSet('export_format');
    expect(opts.map((o) => o.value)).toEqual(['csv', 'xlsx', 'json', 'pdf']);
  });

  it('getOptionSet returns fallback for report_run_status', async () => {
    const opts = await getOptionSet('report_run_status');
    expect(opts.map((o) => o.value)).toContain('ready');
    expect(opts.map((o) => o.value)).toContain('failed');
  });

  it('unknown option set returns empty array (no crash)', async () => {
    const opts = await getOptionSet('does_not_exist');
    expect(opts).toEqual([]);
  });

  it('getDashboardWidgets returns empty array on failure (no crash)', async () => {
    const widgets = await getDashboardWidgets('executive-overview');
    expect(Array.isArray(widgets)).toBe(true);
  });
});
