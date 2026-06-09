import { StatCard } from '@/components/dashboard/StatCard';
import { Skeleton } from '@/components/ui/skeleton';
import {
  FileBarChart, Clock, BarChart3, TrendingUp, DollarSign, AlertTriangle,
  CheckCircle2, MessageSquare, Activity,
} from 'lucide-react';
import type { ReportDashboardWidget } from '../../services/reportMetadataService';
import { useWidgetData } from '../../hooks/useWidgetData';

const ICONS: Record<string, any> = {
  FileBarChart, Clock, BarChart3, TrendingUp, DollarSign, AlertTriangle, CheckCircle2, MessageSquare, Activity,
};

interface Props {
  widget: ReportDashboardWidget;
  onClick?: () => void;
}

function formatValue(value: number | string, format?: string) {
  if (typeof value !== 'number') return String(value);
  if (format === 'currency') return `$${value.toLocaleString()}`;
  if (format === 'percent') return `${value}%`;
  return value.toLocaleString();
}

export function KpiWidget({ widget, onClick }: Props) {
  const { data, isLoading } = useWidgetData(widget);
  const Icon = (widget.icon && ICONS[widget.icon]) || FileBarChart;
  const variant = (widget.variant as any) || 'default';
  const format = widget.chartConfig?.format;

  if (isLoading || !data) return <Skeleton className="h-24" />;
  const card = (
    <StatCard
      title={widget.title}
      value={formatValue(data.value, format)}
      icon={<Icon className="h-6 w-6" />}
      variant={variant}
    />
  );
  if (!onClick) return card;
  return <button type="button" className="text-left w-full" onClick={onClick}>{card}</button>;
}
