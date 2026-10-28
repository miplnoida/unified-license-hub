import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line,
} from 'recharts';
import type { ReportDashboardWidget } from '../../services/reportMetadataService';
import { useWidgetData } from '../../hooks/useWidgetData';

const COLORS = ['#1e3a5f', '#2dd4bf', '#f59e0b', '#ef4444', '#8b5cf6', '#22c55e'];

interface Props { widget: ReportDashboardWidget; }

export function ChartWidget({ widget }: Props) {
  const { data, isLoading, error } = useWidgetData(widget);
  const cfg = widget.chartConfig || {};

  const body = () => {
    if (error) return <p role="alert" className="text-sm text-destructive">Report data unavailable</p>;
    if (isLoading || !data) return <Skeleton className="h-[280px]" />;
    const series = data.series || [];
    if (!series.length) {
      return <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">No data</div>;
    }

    switch (widget.widgetType) {
      case 'bar_chart':
        if (cfg.layout === 'vertical') {
          return (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={series} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" className="text-xs" />
                <YAxis type="category" dataKey={cfg.xKey || 'name'} className="text-xs" width={80} />
                <Tooltip />
                <Bar dataKey={cfg.yKey || 'value'} radius={[0, 4, 4, 0]}>
                  {series.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          );
        }
        return (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={cfg.xKey || 'month'} className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Bar dataKey={cfg.yKey || 'count'} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie_chart':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={series} cx="50%" cy="50%" outerRadius={90} dataKey={cfg.valueKey || 'value'}
                nameKey={cfg.nameKey || 'name'}
                label={({ name, value }) => `${name}: ${value}`}>
                {series.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        );

      case 'area_chart':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={cfg.xKey || 'month'} className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip formatter={(v: number) => cfg.format === 'currency' ? `$${v.toLocaleString()}` : v.toLocaleString()} />
              <Area type="monotone" dataKey={cfg.yKey || 'amount'} stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
            </AreaChart>
          </ResponsiveContainer>
        );

      case 'line_chart':
        return (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey={cfg.xKey || 'month'} className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip />
              <Line type="monotone" dataKey={cfg.yKey || 'expiring'} stroke="hsl(var(--primary))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );

      default:
        return <div className="text-sm text-muted-foreground">Unsupported chart: {widget.widgetType}</div>;
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{widget.title}</CardTitle></CardHeader>
      <CardContent>{body()}</CardContent>
    </Card>
  );
}
