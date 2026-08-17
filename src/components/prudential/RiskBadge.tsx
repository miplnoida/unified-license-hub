import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { normalizeSeverity, severityLabel, severityTone } from '@/lib/prudentialSeverity';

const DOT: Record<string, string> = {
  breach: 'bg-destructive',
  warn: 'bg-amber-500',
  ok: 'bg-emerald-500',
};

/**
 * Traffic-light risk badge. Stored tokens (red / amber / green, breach / warn,
 * critical / high / medium / low) are shown as a coloured dot plus a
 * supervisory label — the raw colour word is never printed as text.
 */
export function RiskBadge({
  level,
  className,
}: {
  level?: string | null;
  className?: string;
}) {
  const s = normalizeSeverity(level);
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', severityTone(level), className)}>
      <span
        aria-hidden
        className={cn('inline-block h-2 w-2 rounded-full', s ? DOT[s] : 'bg-muted-foreground/50')}
      />
      {severityLabel(level)}
    </Badge>
  );
}
