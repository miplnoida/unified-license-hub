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

// Applied to the whole card (background + border), not just the icon chip,
// but only when the metric is actually "live" (see isActive below) — a zero
// breach count shouldn't compete visually with a real, non-zero one.
const toneCardTint: Record<MetricTone, string> = {
  default: '',
  primary: '',
  success: 'border-emerald-200/70 bg-emerald-50/60 dark:border-emerald-900/50 dark:bg-emerald-950/20',
  warning: 'border-amber-200/70 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20',
  destructive: 'border-destructive/30 bg-destructive/[0.04] dark:bg-destructive/10',
  muted: '',
};

const toneValueText: Record<MetricTone, string> = {
  default: '',
  primary: '',
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  destructive: 'text-destructive',
  muted: '',
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

  // A "live" metric — non-zero and worth drawing the eye to. Zero breaches or
  // zero open cases is good news and should stay visually quiet, not compete
  // for attention with the ones that actually need it.
  const isActive = !loading && typeof value === 'number' && value > 0;

  const inner = (
    <Card
      className={cn(
        'h-full transition-all group',
        isActive ? cn(toneCardTint[tone], 'hover:shadow-md') : 'hover:border-primary/50 hover:shadow-md',
      )}
    >
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
          <div className={cn('text-3xl font-bold mt-1 tabular-nums', isActive && toneValueText[tone])}>
            {loading ? <Skeleton className="h-8 w-16" /> : display}
          </div>
          {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
  return to ? <Link to={to}>{inner}</Link> : inner;
}
