import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Aggregation tokens the consolidation engine actually supports. */
export const AGGREGATION_METHODS: Record<string, string> = {
  sum: 'Sum of member values',
  weighted_avg: 'Weighted average by ownership',
};

export const EXPOSURE_TYPES = ['loan', 'deposit', 'capital', 'guarantee', 'other'] as const;

export interface MethodologyRule {
  ratio_key: string;
  method: string;
  eliminate?: boolean;
}

export interface MethodologyValue {
  ratio_rules: MethodologyRule[];
  eliminate_exposure_types: string[];
  large_exposure_pct: number;
  notes?: string | null;
}

export const DEFAULT_METHODOLOGY: MethodologyValue = {
  ratio_rules: [
    { ratio_key: 'TOTAL_ASSETS', method: 'sum', eliminate: true },
    { ratio_key: 'TOTAL_CAPITAL', method: 'sum', eliminate: false },
    { ratio_key: 'CAR', method: 'weighted_avg', eliminate: false },
  ],
  eliminate_exposure_types: ['loan', 'deposit', 'capital'],
  large_exposure_pct: 10,
  notes: null,
};

/**
 * Structured methodology capture. Only engine-supported aggregation tokens can be
 * chosen, so a saved methodology always matches how consolidation is computed.
 */
export function MethodologyRulesEditor({ value, onChange }: {
  value: MethodologyValue;
  onChange: (v: MethodologyValue) => void;
}) {
  const setRule = (i: number, patch: Partial<MethodologyRule>) => {
    const rules = value.ratio_rules.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ ...value, ratio_rules: rules });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Ratio roll-up rules</Label>
        {!value.ratio_rules.length && (
          <p className="text-xs text-muted-foreground">
            No rules configured — percentage metrics default to a weighted average and absolute metrics to a sum.
          </p>
        )}
        {value.ratio_rules.map((r, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border border-border/70 p-2">
            <div className="min-w-[10rem] flex-1">
              <Label className="text-xs">Metric code</Label>
              <Input className="font-mono text-xs" value={r.ratio_key}
                onChange={(e) => setRule(i, { ratio_key: e.target.value.trim() })} placeholder="TOTAL_ASSETS" />
            </div>
            <div className="min-w-[12rem]">
              <Label className="text-xs">Aggregation</Label>
              <Select value={r.method || 'sum'} onValueChange={(v) => setRule(i, { method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(AGGREGATION_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs">
              <Checkbox checked={!!r.eliminate} onCheckedChange={(c) => setRule(i, { eliminate: !!c })} />
              Net off intra-group
            </label>
            <Button size="sm" variant="ghost"
              onClick={() => onChange({ ...value, ratio_rules: value.ratio_rules.filter((_, idx) => idx !== i) })}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button size="sm" variant="outline"
          onClick={() => onChange({ ...value, ratio_rules: [...value.ratio_rules, { ratio_key: '', method: 'sum', eliminate: false }] })}>
          <Plus className="mr-2 h-4 w-4" />Add rule
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <Label>Exposure types eliminated on consolidation</Label>
          <div className="mt-2 flex flex-wrap gap-3">
            {EXPOSURE_TYPES.map((t) => (
              <label key={t} className="flex items-center gap-2 text-xs capitalize">
                <Checkbox
                  checked={value.eliminate_exposure_types.includes(t)}
                  onCheckedChange={(c) => onChange({
                    ...value,
                    eliminate_exposure_types: c
                      ? [...value.eliminate_exposure_types, t]
                      : value.eliminate_exposure_types.filter((x) => x !== t),
                  })}
                />
                {t}
              </label>
            ))}
          </div>
        </div>
        <div>
          <Label>Large exposure threshold (% of group total)</Label>
          <Input type="number" step="0.1" min={0} max={100} value={value.large_exposure_pct}
            onChange={(e) => onChange({ ...value, large_exposure_pct: Number(e.target.value) })} />
        </div>
      </div>

      <div>
        <Label>Methodology notes</Label>
        <Textarea rows={2} value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value || null })} />
      </div>
      <p className="text-xs text-muted-foreground">
        Saving creates a new immutable methodology version; every consolidation snapshot records the version used.
      </p>
    </div>
  );
}

/** Client-side check mirroring the server-side methodology validation. */
export function methodologyIssue(v: MethodologyValue): string | null {
  if (v.ratio_rules.some((r) => !r.ratio_key.trim())) return 'Every rule needs a metric code.';
  if (v.ratio_rules.some((r) => !(r.method in AGGREGATION_METHODS))) return 'Unsupported aggregation method.';
  const keys = v.ratio_rules.map((r) => r.ratio_key.trim().toUpperCase());
  if (new Set(keys).size !== keys.length) return 'Each metric code may only appear once.';
  if (!(v.large_exposure_pct >= 0 && v.large_exposure_pct <= 100)) return 'The large exposure threshold must be between 0 and 100.';
  return null;
}
