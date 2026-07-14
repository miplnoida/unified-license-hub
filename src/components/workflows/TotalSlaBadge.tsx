import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WorkflowTotalSlaEntry } from '@/hooks/useWorkflowTotalSla';

function formatHours(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return '0h';
  if (h < 1) {
    const mins = Math.max(1, Math.round(h * 60));
    return `${mins}m`;
  }
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
 * Displays "Total SLA" = sum of actual time spent on every workflow step so far.
 */
export function TotalSlaBadge({ entry, variant = 'inline', className }: Props) {
  const hasData = !!entry && entry.stepCount > 0 && entry.totalHours != null;
  const value = hasData ? formatHours(entry!.totalHours!) : '—';
  const stepText = hasData
    ? `${entry!.stepCount} step${entry!.stepCount === 1 ? '' : 's'}`
    : '';
  const inProgress = !!entry?.inProgress;
  const title = 'Sum of actual time spent on each approval step so far.';

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
          <span className="font-medium">Total SLA: {value}</span>
          {hasData && (
            <span className="text-[10px] text-muted-foreground">
              Across {stepText}
              {inProgress ? ' · still in progress' : ''}
            </span>
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
      Total SLA: {value}
      {hasData && (
        <span className="text-muted-foreground">
          {` · ${stepText}${inProgress ? ' · in progress' : ''}`}
        </span>
      )}
    </Badge>
  );
}
