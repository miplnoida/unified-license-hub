/**
 * Grid filter bar — per-column filters expressed in business terms with a
 * visible summary of what is currently applied and a one-click reset.
 */
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import type { GridColumn, GridFilterValue, GridState } from './types';

const ANY = '__any__';

function describe<T>(col: GridColumn<T>, f: GridFilterValue): string {
  switch (f.kind) {
    case 'multiEnum': {
      const labels = f.values.map((v) => col.filterOptions?.find((o) => o.value === v)?.label ?? v);
      return labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
    }
    case 'enum': return col.filterOptions?.find((o) => o.value === f.value)?.label ?? f.value;
    case 'boolean': return f.value ? 'Yes' : 'No';
    case 'dateRange': return `${f.from ?? 'any'} → ${f.to ?? 'any'}`;
    case 'numberRange': return `${f.min ?? 'any'} – ${f.max ?? 'any'}`;
    case 'number': return String(f.value);
    default: return f.value;
  }
}

export interface GridFilterBarProps<T> {
  columns: Array<GridColumn<T>>;
  state: GridState;
  onChange: (next: GridState | ((prev: GridState) => GridState)) => void;
}

export function GridFilterBar<T>({ columns, state, onChange }: GridFilterBarProps<T>) {
  const filterable = columns.filter((c) => c.filterable && c.filterType);
  if (filterable.length === 0) return null;

  const activeCount = Object.keys(state.filters).length;

  const setFilter = (id: string, value: GridFilterValue | null) => {
    onChange((prev) => {
      const filters = { ...prev.filters };
      if (value === null) delete filters[id];
      else filters[id] = value;
      return { ...prev, filters, pageIndex: 0 };
    });
  };

  const clearAll = () => onChange((prev) => ({ ...prev, filters: {}, pageIndex: 0 }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Filter className="h-3.5 w-3.5" />
            Filters
            {activeCount > 0 && <Badge variant="secondary" className="ml-1">{activeCount}</Badge>}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold">Refine results</p>
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs">Reset</Button>
            )}
          </div>
          <Separator />
          <ScrollArea className="max-h-[22rem]">
            <div className="space-y-4 p-3">
              {filterable.map((col) => {
                const current = state.filters[col.id];
                const label = col.filterLabel ?? col.header;

                if (col.filterType === 'multiEnum') {
                  const selected = current?.kind === 'multiEnum' ? current.values : [];
                  return (
                    <div key={col.id} className="space-y-2">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <div className="space-y-1.5">
                        {(col.filterOptions ?? []).map((opt) => (
                          <label key={opt.value} className="flex cursor-pointer items-center gap-2 text-sm">
                            <Checkbox
                              checked={selected.includes(opt.value)}
                              onCheckedChange={(checked) => {
                                const next = checked
                                  ? [...selected, opt.value]
                                  : selected.filter((v) => v !== opt.value);
                                setFilter(col.id, next.length ? { kind: 'multiEnum', values: next } : null);
                              }}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                }

                if (col.filterType === 'enum') {
                  return (
                    <div key={col.id} className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <Select
                        value={current?.kind === 'enum' ? current.value : ANY}
                        onValueChange={(v) => setFilter(col.id, v === ANY ? null : { kind: 'enum', value: v })}
                      >
                        <SelectTrigger className="h-9"><SelectValue placeholder={`Any ${label.toLowerCase()}`} /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>Any {label.toLowerCase()}</SelectItem>
                          {(col.filterOptions ?? []).map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                if (col.filterType === 'boolean') {
                  const value = current?.kind === 'boolean' ? String(current.value) : ANY;
                  return (
                    <div key={col.id} className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <Select
                        value={value}
                        onValueChange={(v) => setFilter(col.id, v === ANY ? null : { kind: 'boolean', value: v === 'true' })}
                      >
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY}>Any</SelectItem>
                          <SelectItem value="true">Yes</SelectItem>
                          <SelectItem value="false">No</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                if (col.filterType === 'dateRange') {
                  const from = current?.kind === 'dateRange' ? current.from ?? '' : '';
                  const to = current?.kind === 'dateRange' ? current.to ?? '' : '';
                  return (
                    <div key={col.id} className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="date" value={from} className="h-9"
                          onChange={(e) => {
                            const next = { kind: 'dateRange' as const, from: e.target.value || undefined, to: to || undefined };
                            setFilter(col.id, next.from || next.to ? next : null);
                          }}
                        />
                        <span className="text-xs text-muted-foreground">to</span>
                        <Input
                          type="date" value={to} className="h-9"
                          onChange={(e) => {
                            const next = { kind: 'dateRange' as const, from: from || undefined, to: e.target.value || undefined };
                            setFilter(col.id, next.from || next.to ? next : null);
                          }}
                        />
                      </div>
                    </div>
                  );
                }

                if (col.filterType === 'numberRange') {
                  const min = current?.kind === 'numberRange' && current.min !== undefined ? String(current.min) : '';
                  const max = current?.kind === 'numberRange' && current.max !== undefined ? String(current.max) : '';
                  return (
                    <div key={col.id} className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" placeholder="Min" value={min} className="h-9"
                          onChange={(e) => {
                            const next = {
                              kind: 'numberRange' as const,
                              min: e.target.value === '' ? undefined : Number(e.target.value),
                              max: max === '' ? undefined : Number(max),
                            };
                            setFilter(col.id, next.min === undefined && next.max === undefined ? null : next);
                          }}
                        />
                        <Input
                          type="number" placeholder="Max" value={max} className="h-9"
                          onChange={(e) => {
                            const next = {
                              kind: 'numberRange' as const,
                              min: min === '' ? undefined : Number(min),
                              max: e.target.value === '' ? undefined : Number(e.target.value),
                            };
                            setFilter(col.id, next.min === undefined && next.max === undefined ? null : next);
                          }}
                        />
                      </div>
                    </div>
                  );
                }

                // text / date / number single value
                return (
                  <div key={col.id} className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
                    <Input
                      className="h-9"
                      type={col.filterType === 'date' ? 'date' : col.filterType === 'number' ? 'number' : 'text'}
                      placeholder={`Filter by ${label.toLowerCase()}`}
                      value={current && 'value' in current ? String(current.value) : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return setFilter(col.id, null);
                        if (col.filterType === 'number') return setFilter(col.id, { kind: 'number', value: Number(v) });
                        if (col.filterType === 'date') return setFilter(col.id, { kind: 'date', value: v });
                        return setFilter(col.id, { kind: 'text', value: v });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {Object.entries(state.filters).map(([id, f]) => {
        const col = filterable.find((c) => c.id === id);
        if (!col) return null;
        return (
          <Badge key={id} variant="secondary" className="gap-1 font-normal">
            <span className="text-muted-foreground">{col.filterLabel ?? col.header}:</span>
            <span>{describe(col, f)}</span>
            <button
              type="button"
              aria-label={`Remove ${col.header} filter`}
              onClick={() => setFilter(id, null)}
              className="ml-0.5 rounded-sm hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        );
      })}
    </div>
  );
}

export default GridFilterBar;
