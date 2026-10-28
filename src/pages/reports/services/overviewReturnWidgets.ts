import type { ReportDashboardWidget } from './reportMetadataService';

/** Adapt only the original executive defaults; historical ad-hoc and scheduled reports remain historical. */
export function canonicalOverviewWidget(widget: ReportDashboardWidget): ReportDashboardWidget {
  if (widget.sourceKey !== 'compliance_returns') return widget;
  if (widget.widgetKey === 'overdue_returns') return {
    ...widget, title: 'Overdue regulatory filings', sourceKey: 'return_filings',
    metricConfig: { type: 'count', filter: { is_overdue: true } },
  };
  if (widget.widgetKey === 'compliance_rate') return {
    ...widget, title: 'Accepted filings / all filings', sourceKey: 'return_filings',
    metricConfig: { type: 'ratio', numerator: { status: 'ACCEPTED' }, denominator: {} },
  };
  if (widget.widgetKey === 'compliance_returns_status') return {
    ...widget, title: 'Regulatory filings by status', sourceKey: 'return_filings',
    metricConfig: { type: 'group_by', column: 'status' },
  };
  return widget;
}