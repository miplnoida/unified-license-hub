/**
 * Governed fact transformation and threshold-band policy (AML-06).
 *
 * Structured facts become scores only through bands the regulator publishes
 * here. The browser never converts a fact value into a score or band: it saves
 * the rule and its threshold rows, and the server does the transformation.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  FACT_DATA_TYPE_OPTIONS, FACT_DIRECTION_OPTIONS, FACT_MISSING_OPTIONS, calcPolicyErrorMessage,
  useCalculationPolicyLayers, useMethodologyDimensionCatalogue, useMethodologyFactCatalogue,
  useSetFactRules, type FactRuleRow,
} from '@/hooks/useAmlCalculationPolicy';

interface Props {
  configId: string;
  methodologyId: string;
  canEdit: boolean;
  /** Codes published by the methodology's own risk scale. */
  bandCodes: string[];
}

export function FactTransformEditor({ configId, methodologyId, canEdit, bandCodes }: Props) {
  const { data: facts = [], isLoading } = useMethodologyFactCatalogue(methodologyId);
  const { data: dimensions = [] } = useMethodologyDimensionCatalogue(methodologyId);
  const { data: layers } = useCalculationPolicyLayers(configId);
  const save = useSetFactRules();
  const [rows, setRows] = useState<FactRuleRow[]>([]);

  useEffect(() => {
    if (layers) setRows(layers.factRules);
  }, [layers]);

  const patch = (code: string, next: Partial<FactRuleRow>) =>
    setRows((prev) => prev.map((r) => (r.fact_code === code ? { ...r, ...next } : r)));

  const addRule = (factCode: string) => {
    const fact = facts.find((f) => f.fact_code === factCode);
    setRows((prev) => [...prev, {
      fact_code: factCode,
      data_type: (fact?.data_type ?? '').toUpperCase(),
      unit: fact?.unit ?? null,
      direction: '',
      missing_handling: '',
      requires_period: true,
      requires_ratio_provenance: false,
      target_dimension_code: null,
      weight: null,
      notes: null,
      thresholds: [],
    }]);
  };

  const removeRule = (code: string) => setRows((prev) => prev.filter((r) => r.fact_code !== code));

  const addThreshold = (code: string) =>
    patch(code, {
      thresholds: [
        ...(rows.find((r) => r.fact_code === code)?.thresholds ?? []),
        { band_code: '', min_value: null, max_value: null, score: null, sort_order: (rows.find((r) => r.fact_code === code)?.thresholds.length ?? 0) + 1 },
      ],
    });

  const patchThreshold = (code: string, index: number, next: Partial<FactRuleRow['thresholds'][number]>) =>
    patch(code, {
      thresholds: (rows.find((r) => r.fact_code === code)?.thresholds ?? []).map((t, i) => (i === index ? { ...t, ...next } : t)),
    });

  const removeThreshold = (code: string, index: number) =>
    patch(code, { thresholds: (rows.find((r) => r.fact_code === code)?.thresholds ?? []).filter((_, i) => i !== index) });

  const commit = async () => {
    try {
      await save.mutateAsync({
        configId,
        rows: rows.filter((r) => r.direction !== '' && r.missing_handling !== '' && r.data_type !== ''),
      });
      toast.success('Fact transformation policy saved.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the fact catalogue…</p>;
  if (facts.length === 0) {
    return <p className="text-sm text-muted-foreground">This methodology declares no structured facts, so no fact transformation is needed.</p>;
  }

  const unused = facts.filter((f) => !rows.some((r) => r.fact_code === f.fact_code));

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A fact contributes to the calculation only when a rule exists for it and its threshold bands are published.
        A rule with no complete band coverage is refused at submission rather than silently ignored.
      </p>

      {unused.length > 0 && canEdit && (
        <div className="flex items-end gap-2">
          <div className="space-y-2">
            <Label>Add a rule for a declared fact</Label>
            <Select value="none" onValueChange={(v) => { if (v !== 'none') addRule(v); }}>
              <SelectTrigger className="w-80"><SelectValue placeholder="Choose a fact" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Choose a fact</SelectItem>
                {unused.map((f) => (
                  <SelectItem key={f.fact_code} value={f.fact_code}>{f.fact_code} — {f.label ?? ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Plus className="h-4 w-4 mb-3 text-muted-foreground" />
        </div>
      )}

      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No fact transformation rule has been published for this version yet.</p>
      )}

      {rows.map((r) => (
        <Card key={r.fact_code}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span className="font-mono">{r.fact_code}</span>
              <Badge variant="outline">{facts.find((f) => f.fact_code === r.fact_code)?.label ?? 'declared fact'}</Badge>
            </CardTitle>
            {canEdit && (
              <Button variant="ghost" size="sm" onClick={() => removeRule(r.fact_code)}
                aria-label={`Remove rule for ${r.fact_code}`}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Data type</Label>
                <Select value={r.data_type || 'none'} disabled={!canEdit}
                  onValueChange={(v) => patch(r.fact_code, { data_type: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Undecided</SelectItem>
                    {FACT_DATA_TYPE_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Direction</Label>
                <Select value={r.direction || 'none'} disabled={!canEdit}
                  onValueChange={(v) => patch(r.fact_code, { direction: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Undecided</SelectItem>
                    {FACT_DIRECTION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>When the fact is missing</Label>
                <Select value={r.missing_handling || 'none'} disabled={!canEdit}
                  onValueChange={(v) => patch(r.fact_code, { missing_handling: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Undecided</SelectItem>
                    {FACT_MISSING_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Target dimension</Label>
                <Select value={r.target_dimension_code || 'none'} disabled={!canEdit}
                  onValueChange={(v) => patch(r.fact_code, { target_dimension_code: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue placeholder="Whole assessment" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Whole assessment</SelectItem>
                    {dimensions.map((d) => (
                      <SelectItem key={d.dimension_code} value={d.dimension_code}>{d.dimension_code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Unit</Label>
                <Input value={r.unit ?? ''} disabled={!canEdit}
                  onChange={(e) => patch(r.fact_code, { unit: e.target.value || null })} />
              </div>
              <div className="space-y-2">
                <Label>Weight</Label>
                <Input type="number" step="0.01" value={r.weight ?? ''} disabled={!canEdit}
                  aria-label={`Weight for ${r.fact_code}`}
                  onChange={(e) => patch(r.fact_code, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox id={`period-${r.fact_code}`} checked={r.requires_period} disabled={!canEdit}
                  onCheckedChange={(v) => patch(r.fact_code, { requires_period: v === true })} />
                <Label htmlFor={`period-${r.fact_code}`} className="text-xs">Reporting period required</Label>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Checkbox id={`prov-${r.fact_code}`} checked={r.requires_ratio_provenance} disabled={!canEdit}
                  onCheckedChange={(v) => patch(r.fact_code, { requires_ratio_provenance: v === true })} />
                <Label htmlFor={`prov-${r.fact_code}`} className="text-xs">Ratio provenance required</Label>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Threshold bands</Label>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => addThreshold(r.fact_code)}>
                    <Plus className="h-4 w-4 mr-2" />Add band
                  </Button>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Band</TableHead>
                    <TableHead className="w-32">From</TableHead>
                    <TableHead className="w-32">To</TableHead>
                    <TableHead className="w-28">Score</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {r.thresholds.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-xs text-muted-foreground">No band published for this fact yet.</TableCell></TableRow>
                  )}
                  {r.thresholds.map((t, i) => (
                    <TableRow key={`${r.fact_code}-${i}`}>
                      <TableCell>
                        <Select value={t.band_code || 'none'} disabled={!canEdit}
                          onValueChange={(v) => patchThreshold(r.fact_code, i, { band_code: v === 'none' ? '' : v })}>
                          <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Undecided</SelectItem>
                            {bandCodes.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={t.min_value ?? ''} disabled={!canEdit}
                          aria-label={`Band ${i + 1} lower bound for ${r.fact_code}`}
                          onChange={(e) => patchThreshold(r.fact_code, i, { min_value: e.target.value === '' ? null : Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={t.max_value ?? ''} disabled={!canEdit}
                          aria-label={`Band ${i + 1} upper bound for ${r.fact_code}`}
                          onChange={(e) => patchThreshold(r.fact_code, i, { max_value: e.target.value === '' ? null : Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={t.score ?? ''} disabled={!canEdit}
                          aria-label={`Band ${i + 1} score for ${r.fact_code}`}
                          onChange={(e) => patchThreshold(r.fact_code, i, { score: e.target.value === '' ? null : Number(e.target.value) })} />
                      </TableCell>
                      <TableCell>
                        {canEdit && (
                          <Button variant="ghost" size="sm" onClick={() => removeThreshold(r.fact_code, i)}
                            aria-label={`Remove band ${i + 1} for ${r.fact_code}`}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-2">
              <Label>Supervisory note</Label>
              <Textarea rows={2} value={r.notes ?? ''} disabled={!canEdit}
                onChange={(e) => patch(r.fact_code, { notes: e.target.value || null })} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Button data-rbac="aml_supervision.manage_config" onClick={commit} disabled={!canEdit || save.isPending}>
        <Save className="h-4 w-4 mr-2" />Save fact transformation policy
      </Button>
    </div>
  );
}

export default FactTransformEditor;
