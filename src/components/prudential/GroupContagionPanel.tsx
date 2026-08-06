import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatAmount, deriveContagionChannels, type MatrixCell } from '@/lib/groupConsolidation';

interface Props {
  cells: MatrixCell[];
  total: number;
  nameById: Map<string, string>;
}

/**
 * Contagion transmission view — ranks the largest intra-group exposures by
 * share of total group exposure. Purely derived from recorded exposures.
 */
export function GroupContagionPanel({ cells, total, nameById }: Props) {
  const channels = deriveContagionChannels(cells, nameById, total);
  if (!channels.length) {
    return <p className="text-sm text-muted-foreground">No intra-group exposures recorded, so no contagion channels can be derived.</p>;
  }
  return (
    <div className="space-y-3">
      {channels.map((c, i) => (
        <div key={`${c.from_name}-${c.to_name}-${i}`} className="space-y-1 rounded-md border border-border/60 bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{c.from_name}</span>
            <span className="text-muted-foreground">&rarr;</span>
            <span className="text-sm font-medium">{c.to_name}</span>
            {c.is_large && (
              <Badge variant="outline" className="border-destructive/30 bg-destructive/10 text-[11px] text-destructive">Large exposure</Badge>
            )}
            <span className="ml-auto font-mono text-xs">{formatAmount(c.amount)} · {c.share_of_total}%</span>
          </div>
          <Progress value={c.share_of_total} className="h-1.5" />
          {c.channels.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Channels: {c.channels.join(', ')}</p>
          )}
        </div>
      ))}
    </div>
  );
}
