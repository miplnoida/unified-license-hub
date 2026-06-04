import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type MetricTone = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

const toneClasses: Record<MetricTone, string> = {
  default: 'bg-muted text-foreground',
  primary: 'bg-primary/10 text-primary',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  destructive: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
};

export interface MetricCardProps {
  title: string;
  value: number | string | null | undefined;
  icon?: LucideIcon;
  hint?: string;
  tone?: MetricTone;
  loading?: boolean;
  to?: string;
  format?: (v: number) => string;
}

export function MetricCard({
  title, value, icon: Icon, hint, tone = 'primary', loading, to, format,
}: MetricCardProps) {
  const display =
    loading
      ? null
      : value === null || value === undefined
        ? '—'
        : typeof value === 'number' && format
          ? format(value)
          : typeof value === 'number'
            ? value.toLocaleString()
            : value;

  const inner = (
    <Card className="h-full hover:border-primary/50 hover:shadow-md transition-all group">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          {Icon && (
            <div className={cn('flex h-9 w-9 items-center justify-center rounded-lg', toneClasses[tone])}>
              <Icon className="h-4 w-4" />
            </div>
          )}
          {to && <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
        </div>
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1 tabular-nums">
            {loading ? <Skeleton className="h-7 w-16" /> : display}
          </p>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
