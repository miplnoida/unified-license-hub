/**
 * MC-07.3 — Renders a server-returned breakdown map (status, severity,
 * category, product, channel …) in business language, largest first.
 */
import { formatAmount, formatCount, isAmountMeasure } from '@/lib/conductFactLabels';

interface Props {
  title: string;
  data?: unknown;
  labelFn?: (key: string) => string;
  amountKey?: string;
  emptyMessage?: string;
}

export function BreakdownList({ title, data, labelFn, amountKey, emptyMessage = 'Not recorded for this window.' }: Props) {
  const map = (data && typeof data === 'object' && !Array.isArray(data)) ? (data as Record<string, unknown>) : {};
  const rows = Object.entries(map)
    .map(([k, v]) => ({ key: k, label: labelFn ? labelFn(k) : k, value: v }))
    .sort((a, b) => Number(b.value ?? 0) - Number(a.value ?? 0));

  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="font-mono font-medium">
                {amountKey && isAmountMeasure(amountKey) ? formatAmount(r.value) : formatCount(r.value)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface SeriesProps {
  title: string;
  items?: unknown;
  labelField: string;
  valueField: string;
  labelFn?: (value: unknown) => string;
  emptyMessage?: string;
}

/** Renders an ordered server series such as complaints by month. */
export function SeriesList({ title, items, labelField, valueField, labelFn, emptyMessage = 'Not recorded for this window.' }: SeriesProps) {
  const rows = Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
  return (
    <div className="rounded-md border p-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((r, i) => (
            <li key={`${String(r[labelField])}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {labelFn ? labelFn(r[labelField]) : String(r[labelField] ?? '—')}
              </span>
              <span className="font-mono font-medium">{formatCount(r[valueField])}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
