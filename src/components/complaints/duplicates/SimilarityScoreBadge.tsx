import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export function SimilarityScoreBadge({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 90 ? 'bg-destructive/15 text-destructive border-destructive/30'
    : score >= 75 ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={cn('font-mono', tone, className)}>
      {score}% match
    </Badge>
  );
}
