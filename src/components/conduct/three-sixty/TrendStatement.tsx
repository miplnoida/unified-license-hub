/**
 * MC-07.3 — States a server-computed trend in plain business language.
 * The current, comparison and change values all come from the server; the
 * component only chooses the wording.
 */
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { formatCount, measureLabel } from '@/lib/conductFactLabels';
import { cn } from '@/lib/utils';

interface Props {
  measureKey: string;
  trend: unknown;
  comparisonLabel: string;
}

export function TrendStatement({ measureKey, trend, comparisonLabel }: Props) {
  const t = (trend && typeof trend === 'object' ? trend : {}) as Record<string, unknown>;
  const current = t.current;
  const previous = t.previous;
  const change = t.change;
  const label = measureLabel(measureKey);
  const changeNumber = Number(change ?? 0);
  const direction = changeNumber > 0 ? 'up' : changeNumber < 0 ? 'down' : 'flat';

  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : ArrowRight;
  const verb = direction === 'up' ? 'rose' : direction === 'down' ? 'fell' : 'was unchanged';
  const magnitude = Math.abs(changeNumber).toLocaleString('en-US');

  const sentence = direction === 'flat'
    ? `${label} ${verb} at ${formatCount(current)} ${comparisonLabel}.`
    : `${label} ${verb} from ${formatCount(previous)} to ${formatCount(current)} (${direction === 'up' ? 'up' : 'down'} ${magnitude}) ${comparisonLabel}.`;

  return (
    <div className="flex items-start gap-3 rounded-md border p-3">
      <Icon
        className={cn(
          'h-4 w-4 mt-0.5 shrink-0',
          direction === 'up' && 'text-warning',
          direction === 'down' && 'text-success',
          direction === 'flat' && 'text-muted-foreground',
        )}
        aria-hidden
      />
      <div>
        <p className="text-sm">{sentence}</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          This window {formatCount(current)} · comparison window {formatCount(previous)}
        </p>
      </div>
    </div>
  );
}
