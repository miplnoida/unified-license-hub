/**
 * Presentation-only badges for Document Management states.
 * Codes are translated by `@/lib/presentation/dmsLabels`; no raw enum is shown.
 */
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { TONE_CLASS } from '@/lib/presentation/statusLabels';
import type { DmsPresented } from '@/lib/presentation/dmsLabels';

interface Props {
  presented: DmsPresented | null;
  emptyLabel?: string;
  className?: string;
}

export function DmsBadge({ presented, emptyLabel = '—', className }: Props) {
  if (!presented) return <span className="text-muted-foreground">{emptyLabel}</span>;
  const badge = (
    <Badge variant="outline" className={cn('font-medium whitespace-nowrap', TONE_CLASS[presented.tone], className)}>
      {presented.label}
    </Badge>
  );
  if (!presented.description) return badge;
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild><span className="inline-flex">{badge}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{presented.description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default DmsBadge;
