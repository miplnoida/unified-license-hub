import type { ReportDashboardWidget } from '../../services/reportMetadataService';
import { KpiWidget } from './KpiWidget';
import { ChartWidget } from './ChartWidget';

interface Props {
  widget: ReportDashboardWidget;
  onDrilldown?: (widget: ReportDashboardWidget) => void;
}

export function ReportWidgetRenderer({ widget, onDrilldown }: Props) {
  if (widget.widgetType === 'kpi' || widget.widgetType === 'number') {
    return <KpiWidget widget={widget} onClick={widget.drilldownReportSlug && onDrilldown ? () => onDrilldown(widget) : undefined} />;
  }
  if (['bar_chart', 'pie_chart', 'line_chart', 'area_chart'].includes(widget.widgetType)) {
    return <ChartWidget widget={widget} />;
  }
  return null;
}
