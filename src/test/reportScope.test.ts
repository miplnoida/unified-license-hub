import { describe, expect, it } from 'vitest';
import { filterReportRows, filingAcceptanceRate } from '@/lib/reportScope';
import { canonicalOverviewWidget } from '@/pages/reports/services/overviewReturnWidgets';
import type { ReportDashboardWidget } from '@/pages/reports/services/reportMetadataService';

const entities = [{ id: 'credit-union', sector_id: 'cu', lead_regulator_id: null }];
const sectors = [{ id: 'cu', regulator_id: 'fsra' }];
const scope = { regulatorId: 'fsra', sectorId: 'cu', from: '2026-10-01', to: '2026-10-28' };
describe('executive reporting population', () => {
  it('includes entity-resolved records and excludes other regulators and unresolved entities', () => {
    const rows = [{ status: 'ACCEPTED', entity_id: 'credit-union', created_at: '2026-10-24T20:35:00Z' },
      { status: 'draft', entity_id: 'credit-union', regulator_id: 'other', created_at: '2026-10-24' },
      { status: 'active', holder_id: 'legacy-user', created_at: '2026-10-24' }];
    expect(filterReportRows(rows, scope, entities, sectors)).toEqual([rows[0]]);
  });
  it('uses inclusive record-created dates and does not invent dates for unresolved rows', () => {
    const rows = ['2026-09-30', '2026-10-01', '2026-10-28', '2026-10-29', undefined]
      .map(created_at => ({ status: 'draft', entity_id: 'credit-union', created_at }));
    expect(filterReportRows(rows, scope, entities, sectors)).toEqual([rows[1], rows[2]]);
  });
  it('retains every supplied visible record in the unfiltered population', () => {
    expect(filterReportRows([{ status: null }], { regulatorId: 'all', sectorId: 'all', from: '', to: '' }, [], [])).toHaveLength(1);
  });
  it('does not equate absence of filings with zero acceptance', () => {
    expect(filingAcceptanceRate(0, 0)).toBeNull();
    expect(filingAcceptanceRate(91, 96)).toBe(95);
  });
});
describe('canonical executive overview without altering historical reports', () => {
  const widget = { sourceKey: 'compliance_returns', metricConfig: {}, widgetKey: 'compliance_rate' } as ReportDashboardWidget;
  it('counts acceptance using canonical ACCEPTED status', () => {
    expect(canonicalOverviewWidget(widget).metricConfig).toEqual({ type: 'ratio', numerator: { status: 'ACCEPTED' }, denominator: {} });
  });
  it('uses canonical server-computed overdue flag', () => {
    expect(canonicalOverviewWidget({ ...widget, widgetKey: 'overdue_returns' }).metricConfig).toEqual({ type: 'count', filter: { is_overdue: true } });
  });
  it('leaves custom historical widgets unchanged', () => {
    const historical = { ...widget, widgetKey: 'historical-returns' };
    expect(canonicalOverviewWidget(historical)).toBe(historical);
  });
});