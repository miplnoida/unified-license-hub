/**
 * MC-07.3 — Server measures rendered as tiles. Values are printed as returned;
 * the component performs no arithmetic.
 */
import { formatAmount, formatCount, isAmountMeasure, measureLabel } from '@/lib/conductFactLabels';
import type { Measures } from '@/hooks/useConduct360';

interface Props {
  measures?: Measures;
  keys?: string[];
  columns?: 2 | 3 | 4;
}

const isScalar = (v: unknown) => v === null || ['string', 'number', 'boolean'].includes(typeof v);

export function MeasureTiles({ measures, keys, columns = 4 }: Props) {
  const source = measures ?? {};
  const entries = (keys ?? Object.keys(source)).filter((k) => k in source && isScalar(source[k]));
  if (!entries.length) return null;

  const grid = columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid gap-3 ${grid}`}>
      {entries.map((key) => {
        const value = source[key];
        return (
          <div key={key} className="rounded-md border bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">{measureLabel(key)}</p>
            <p className="mt-1 font-mono text-xl font-semibold">
              {isAmountMeasure(key) ? formatAmount(value) : formatCount(value)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
