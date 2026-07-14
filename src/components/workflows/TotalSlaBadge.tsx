import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowTotalSlaEntry } from '@/hooks/useWorkflowTotalSla';

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  const days = Math.floor(h / 24);
  const hrs = Math.round(h - days * 24);
  if (days > 0 && hrs > 0) return `${days}d ${hrs}h`;
  if (days > 0) return `${days}d`;
  return `${hrs}h`;
}

interface Props {
  entry?: WorkflowTotalSlaEntry | null;
  variant?: 'inline' | 'card';
  className?: string;
}

/**
 * Displays the sum of `sla_hours` across all workflow steps.
 * - `inline`: compact chip suitable for list rows.
 * - `card`: bordered block suitable for detail-page headers.
 */
export function TotalSlaBadge({ entry, variant = 'inline', className }: Props) {
  const hasData = !!entry && entry.stepCount > 0 && entry.totalHours != null;
  const label = hasData
    ? `Total SLA: ${formatHours(entry!.totalHours!)}${entry!.hasMissingSla ? '*' : ''}`
    : 'Total SLA: —';
  const suffix = hasData ? ` (${entry!.stepCount} step${entry!.stepCount === 1 ? '' : 's'})` : '';
  const title = entry?.hasMissingSla
    ? 'Some workflow steps have no SLA configured; total excludes those steps.'
    : 'Sum of SLA hours across all workflow steps.';

  if (variant === 'card') {
    return (
      <div
        className={cn(
          'rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs flex items-center gap-2',
          className,
        )}
        title={title}
      >
        <Timer className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="flex flex-col leading-tight">
          <span className="font-medium">{label}</span>
          {hasData && (
            <span className="text-[10px] text-muted-foreground">Across {entry!.stepCount} approval step{entry!.stepCount === 1 ? '' : 's'}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn('text-[10px] gap-1 whitespace-nowrap', className)}
      title={title}
    >
      <Timer className="h-3 w-3" />
      {label}
      {suffix && <span className="text-muted-foreground">{suffix}</span>}
    </Badge>
  );
}
