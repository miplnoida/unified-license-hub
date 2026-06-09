/**
 * Reports & Analytics — Overview tab.
 *
 * Fully metadata-driven: layout + widgets come from `report_dashboard_layouts`
 * and `report_dashboard_widgets`. Adding a row in those tables creates a new
 * KPI/chart on this page without touching React code.
 *
 * Drilldown reports are looked up by `drilldown_report_slug` and executed
 * via the shared `generate-report` edge function.
 */
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboardWidgets, useDashboardLayouts } from '../hooks/useReportMetadata';
import { ReportWidgetRenderer } from './widgets/ReportWidgetRenderer';
import { generateReport } from '../services/reportService';
import type { ReportRun } from '../types';
import { useToast } from '@/hooks/use-toast';
import type { ReportDashboardWidget } from '../services/reportMetadataService';

interface Props { onDrilldown?: (run: ReportRun) => void; }

export function ReportsOverview({ onDrilldown }: Props = {}) {
  const { toast } = useToast();
  const { data: layouts } = useDashboardLayouts();
  const layoutKey = layouts?.find((l) => l.isDefault)?.layoutKey || layouts?.[0]?.layoutKey || 'executive-overview';
  const { data: widgets, isLoading } = useDashboardWidgets(layoutKey);

  const drill = async (w: ReportDashboardWidget) => {
    if (!onDrilldown || !w.drilldownReportSlug || !w.sourceKey) return;
    try {
      const run = await generateReport({
        name: w.title,
        category: 'Drilldown',
        source: w.sourceKey as any,
        filters: (w.drilldownFilters || {}) as any,
        reportSlug: w.drilldownReportSlug,
      });
      onDrilldown(run);
    } catch (e: any) {
      toast({ title: 'Drilldown failed', description: e?.message, variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  if (!widgets?.length) {
    return (
      <Card><CardContent className="py-12 text-center text-muted-foreground">
        No dashboard widgets are configured. An administrator can add widgets in <code>report_dashboard_widgets</code>.
      </CardContent></Card>
    );
  }

  const kpis = widgets.filter((w) => w.widgetType === 'kpi' || w.widgetType === 'number');
  const charts = widgets.filter((w) => w.widgetType !== 'kpi' && w.widgetType !== 'number');

  return (
    <div className="space-y-6">
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {kpis.map((w) => <ReportWidgetRenderer key={w.id} widget={w} onDrilldown={drill} />)}
        </div>
      )}
      {charts.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-6">
          {charts.map((w) => <ReportWidgetRenderer key={w.id} widget={w} />)}
        </div>
      )}
    </div>
  );
}
