import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle2, Clock, Flame, PauseCircle } from 'lucide-react';
import { useWorkflowSLA, type UseWorkflowSLAInput, type WorkflowSLAResult } from '@/hooks/useWorkflowSLA';

const STATUS_STYLES: Record<WorkflowSLAResult['status'], string> = {
  healthy: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-200',
  breached: 'bg-red-500/10 text-red-700 border-red-200',
  unknown: 'bg-muted text-muted-foreground border-border',
};

const STATUS_DOT: Record<WorkflowSLAResult['status'], string> = {
  healthy: '🟢',
  warning: '🟡',
  breached: '🔴',
  unknown: '⚪',
};

interface BadgeProps {
  sla: WorkflowSLAResult;
  /** Show emoji dot prefix (defaults true for list contexts). */
  showDot?: boolean;
  className?: string;
}

export function SlaStatusBadge({ sla, showDot = true, className }: BadgeProps) {
  if (sla.status === 'unknown') {
    return (
      <Badge variant="outline" className={cn('text-[10px]', STATUS_STYLES.unknown, className)}>
        No SLA
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={cn('text-[10px] gap-1', STATUS_STYLES[sla.status], className)}>
      {showDot ? <span aria-hidden>{STATUS_DOT[sla.status]}</span> : null}
      {sla.label}
    </Badge>
  );
}

interface InlineProps {
  input: UseWorkflowSLAInput;
  className?: string;
}

/** Compact list-row indicator: 🟢 12h left / 🟡 1h left / 🔴 Overdue 4h. */
export function SlaInlineIndicator({ input, className }: InlineProps) {
  const sla = useWorkflowSLA(input);
  return <SlaStatusBadge sla={sla} className={className} />;
}

interface PanelProps {
  input: UseWorkflowSLAInput;
  /** Heading shown above the bar. */
  title?: string;
  className?: string;
}

const BAR_TONE: Record<WorkflowSLAResult['status'], string> = {
  healthy: '[&>div]:bg-emerald-500',
  warning: '[&>div]:bg-amber-500',
  breached: '[&>div]:bg-red-500',
  unknown: '[&>div]:bg-muted-foreground/30',
};

function formatHoursShort(h: number) {
  const abs = Math.abs(h);
  if (abs >= 24) return `${Math.floor(abs / 24)}d ${Math.round(abs % 24)}h`;
  if (abs >= 1) return `${Math.floor(abs)}h ${Math.round((abs % 1) * 60)}m`;
  return `${Math.max(1, Math.round(abs * 60))}m`;
}

/** Full SLA card: countdown + deadline + progress bar + escalation banner. */
export function SlaProgressPanel({ input, title = 'SLA', className }: PanelProps) {
  const sla = useWorkflowSLA(input);

  if (sla.status === 'unknown') {
    return (
      <div className={cn('rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground', className)}>
        <div className="flex items-center gap-2">
          <Clock className="h-3.5 w-3.5" />
          {title}: not configured for this step.
        </div>
      </div>
    );
  }

  const Icon = input.paused
    ? PauseCircle
    : sla.status === 'breached'
      ? AlertTriangle
      : sla.status === 'warning'
        ? Clock
        : CheckCircle2;

  const headline =
    input.paused
      ? 'SLA paused'
      : sla.status === 'breached'
        ? `SLA Breached · Overdue ${formatHoursShort(sla.breachedByHours)}`
        : sla.status === 'warning'
          ? `SLA Warning · ${formatHoursShort(sla.remainingHours)} left`
          : `Within SLA · ${formatHoursShort(sla.remainingHours)} left`;

  return (
    <div className={cn('rounded-md border border-border/60 bg-card p-3 space-y-2', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon
            className={cn(
              'h-4 w-4',
              sla.status === 'breached' && 'text-red-600',
              sla.status === 'warning' && 'text-amber-600',
              sla.status === 'healthy' && 'text-emerald-600',
            )}
          />
          {headline}
        </div>
        <SlaStatusBadge sla={sla} showDot={false} />
      </div>

      <Progress
        value={Math.min(100, sla.percentConsumed)}
        className={cn('h-2', BAR_TONE[sla.status])}
      />

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>
          {Math.round(sla.percentConsumed)}% consumed
          {input.slaHours ? <> · SLA {input.slaHours}h</> : null}
        </span>
        {sla.deadline ? (
          <span>Deadline: {new Date(sla.deadline).toLocaleString()}</span>
        ) : null}
      </div>

      {sla.escalationTriggered && (
        <div className="flex items-center gap-2 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-700">
          <Flame className="h-3.5 w-3.5" />
          Escalation Triggered
          {input.escalationAfterHours ? (
            <span className="text-red-700/70">
              · threshold {input.escalationAfterHours}h reached
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
