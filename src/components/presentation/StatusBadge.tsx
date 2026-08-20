/**
 * The single status presentation component.
 *
 * Canonical codes stay in the database; this renders their plain-language
 * label with a consistent tone. Never render a raw enum as a primary label.
 */
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { presentStatus, TONE_CLASS, type StatusTone } from '@/lib/presentation/statusLabels';

export interface StatusBadgeProps {
  /** Canonical code stored in the database. */
  code: string | null | undefined;
  /** Server-provided label, always preferred over the frontend dictionary. */
  label?: string | null;
  /** Force a tone (e.g. derived indicators such as "Overdue"). */
  tone?: StatusTone;
  description?: string;
  className?: string;
  emptyLabel?: string;
}

export function StatusBadge({
  code, label, tone, description, className, emptyLabel = '—',
}: StatusBadgeProps) {
  const presented = presentStatus(code, label);
  if (!presented) {
    return <span className="text-muted-foreground">{emptyLabel}</span>;
  }
  const effectiveTone = tone ?? presented.tone;
  const help = description ?? presented.description;

  const badge = (
    <Badge
      variant="outline"
      className={cn('font-medium', TONE_CLASS[effectiveTone], className)}
    >
      {presented.label}
    </Badge>
  );

  if (!help) return badge;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{badge}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{help}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default StatusBadge;
