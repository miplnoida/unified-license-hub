import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Pencil, Wand2 } from 'lucide-react';
import Swal from 'sweetalert2';
import { FormulaText } from '@/components/prudential/FormulaText';
import {
  FormulaBuilder,
  emptyExpr,
  isExprComplete,
  parseFormula,
  serializeExpr,
  type Expr,
} from '@/components/prudential/FormulaBuilder';
import { useConfigFormFields } from '@/hooks/useConfigFormFields';
import { useThresholds } from '@/hooks/usePrudentialConfig';
import type { FormulaLabelMap } from '@/hooks/useFormulaLabels';
import type { PrudentialRatio } from '@/lib/returnsRatios';

const FORMAT_HINTS: Record<string, string> = {
  decimal: 'e.g. 1.25',
  percent: 'e.g. 12.5%',
  currency: 'e.g. $1,250',
  ratio: 'e.g. 1.25x',
};

export function slugifyKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

interface Props {
  editing: Partial<PrudentialRatio> | null;
  setEditing: (v: Partial<PrudentialRatio> | null) => void;
  configs: { id: string; name: string }[];
  ratios: PrudentialRatio[];
  tokenLabels?: FormulaLabelMap;
  ratioLabels: Map<string, string>;
  onSave: () => void;
  saving: boolean;
}

export function RatioEditDialog({
  editing,
  setEditing,
  configs,
  ratios,
  tokenLabels,
  ratioLabels,
  onSave,
  saving,
}: Props) {
  const open = !!editing;
  const configId = editing?.return_config_id ?? null;
  const { data: forms = [], isLoading: formsLoading } = useConfigFormFields(configId);
  const { data: thresholds = [] } = useThresholds(configId);

  const [advanced, setAdvanced] = useState(false);
  const [expr, setExpr] = useState<Expr>(emptyExpr());
  const [keyTouched, setKeyTouched] = useState(false);
  const editingId = editing?.id ?? 'new';

  // Load the record into the builder whenever a different ratio is opened.
  useEffect(() => {
    if (!open) return;
    const parsed = parseFormula(editing?.formula);
    setExpr(parsed ?? emptyExpr());
    setAdvanced(!!editing?.formula && !parsed);
    setKeyTouched(!!editing?.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const ratioOptions = useMemo(
    () => ratios.filter((r) => r.ratio_key && r.id !== editing?.id).map((r) => ({ key: r.ratio_key, label: r.label })),
    [ratios, editing?.id],
  );

  if (!editing) return null;

  const applyExpr = (next: Expr) => {
    setExpr(next);
    setEditing({ ...editing, formula: serializeExpr(next) });
  };

  const setLabel = (label: string) => {
    const patch: Partial<PrudentialRatio> = { ...editing, label };
    if (!keyTouched) patch.ratio_key = slugifyKey(label);
    setEditing(patch);
  };

  const toggleAdvanced = () => {
    if (advanced) {
      const parsed = parseFormula(editing.formula);
      if (!parsed) {
        Swal.fire({
          icon: 'info',
          text: 'This expression is too complex for the guided builder. Keep editing it here, or clear it to start over with the pickers.',
        });
        return;
      }
      setExpr(parsed);
      setAdvanced(false);
    } else {
      setAdvanced(true);
    }
  };

  const guidedIncomplete = !advanced && !isExprComplete(expr);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && setEditing(null)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing.id ? 'Edit' : 'Add'} Ratio</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Return Configuration *</Label>
            <Select
              value={editing.return_config_id ?? ''}
              onValueChange={(v) => setEditing({ ...editing, return_config_id: v })}
            >
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>{configs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ratio name *</Label>
              <Input
                placeholder="e.g. Asset Turnover"
                value={editing.label ?? ''}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div>
              <Label>Internal code *</Label>
              <Input
                value={editing.ratio_key ?? ''}
                onChange={(e) => { setKeyTouched(true); setEditing({ ...editing, ratio_key: e.target.value }); }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Used by reports and thresholds. Filled in from the name — change only if you know why.
              </p>
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="mb-0">How is this ratio calculated? *</Label>
              <Button type="button" variant="ghost" size="sm" onClick={toggleAdvanced}>
                {advanced ? (<><Wand2 className="h-4 w-4 mr-2" />Use guided builder</>) : (<><Pencil className="h-4 w-4 mr-2" />Advanced (edit expression)</>)}
              </Button>
            </div>

            {advanced ? (
              <>
                <Textarea
                  rows={3}
                  className="font-mono text-xs"
                  placeholder="e.g. formId.line_1_col_1 / formId.line_3_col_1"
                  value={editing.formula ?? ''}
                  onChange={(e) => setEditing({ ...editing, formula: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Reference values as <code>formId.fieldKey</code>. Only + - * / and parentheses are supported.
                </p>
              </>
            ) : formsLoading ? (
              <div className="flex items-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading forms and line items…
              </div>
            ) : (
              <>
                <FormulaBuilder
                  expr={expr}
                  onChange={applyExpr}
                  forms={forms}
                  ratios={ratioOptions}
                  configChosen={!!configId}
                />
                {!configId && (
                  <p className="text-xs text-muted-foreground">Choose a Return Configuration to see its forms.</p>
                )}
                {!!configId && forms.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No forms are attached to this configuration yet, so there are no line items to pick.
                  </p>
                )}
              </>
            )}

            {!!editing.formula && (
              <div className="border rounded p-2 bg-background">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Reads as</div>
                <FormulaText formula={editing.formula} labels={tokenLabels} ratioLabels={ratioLabels} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Link to threshold</Label>
              <Select
                value={editing.metric_key ?? 'none'}
                onValueChange={(v) => setEditing({ ...editing, metric_key: v === 'none' ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {thresholds
                    .filter((t: any) => !!t.metric_key)
                    .map((t: any) => (
                      <SelectItem key={t.id} value={t.metric_key}>{t.label || t.metric_key}</SelectItem>
                    ))}
                  {/* Preserve a value that no longer matches a threshold */}
                  {!!editing.metric_key && !thresholds.some((t: any) => t.metric_key === editing.metric_key) && (
                    <SelectItem value={editing.metric_key}>{editing.metric_key}</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Breaches are raised against the linked threshold.</p>
            </div>
            <div>
              <Label>Display format</Label>
              <Select value={editing.display_format} onValueChange={(v: any) => setEditing({ ...editing, display_format: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['decimal', 'percent', 'currency', 'ratio'] as const).map((f) => (
                    <SelectItem key={f} value={f}>
                      {f.charAt(0).toUpperCase() + f.slice(1)} — {FORMAT_HINTS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
          <Button data-rbac="prudential_supervision.edit" onClick={onSave} disabled={saving || guidedIncomplete}>
            {saving ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
