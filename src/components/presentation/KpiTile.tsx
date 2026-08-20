/**
 * Supervisory KPI tile used across Entity 360 overview and dashboards.
 *
 * A tile states one business fact, optionally with supporting detail and a
 * destination. Tiles never render technical identifiers.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusTone } from '@/lib/presentation/statusLabels';

const ACCENT: Record<StatusTone, string> = {
  neutral: 'border-border',
  muted: 'border-border',
  info: 'border-l-4 border-l-primary',
  progress: 'border-l-4 border-l-accent-foreground/40',
  positive: 'border-l-4 border-l-success',
  warning: 'border-l-4 border-l-warning',
  critical: 'border-l-4 border-l-destructive',
};

export interface KpiTileProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatusTone;
  icon?: LucideIcon;
  /** In-app destination; makes the whole tile actionable. */
  to?: string;
  onClick?: () => void;
  className?: string;
}

export function KpiTile({
  label, value, hint, tone = 'neutral', icon: Icon, to, onClick, className,
}: KpiTileProps) {
  const body = (
    <div
      className={cn(
        'group flex h-full flex-col justify-between gap-2 rounded-lg border bg-card p-3 text-left transition-colors',
        ACCENT[tone],
        (to || onClick) && 'hover:bg-muted/50',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
      </div>
      <p className="text-xl font-semibold leading-tight">{value}</p>
      <div className="flex items-end justify-between gap-2">
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : <span />}
        {(to || onClick) && (
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        )}
      </div>
    </div>
  );

  if (to) return <Link to={to} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">{body}</Link>;
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block h-full w-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </button>
    );
  }
  return body;
}

export default KpiTile;
