/**
 * Materiality rule policy (AML-06).
 *
 * A materiality rule tells the server when a fact value is significant enough
 * to floor a band or raise a flag. The comparison itself is performed by the
 * server against the run's fact snapshot; nothing is evaluated in the browser.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Save, Trash2 } from 'lucide-react';
import {
  MATERIALITY_ADJUSTMENT_OPTIONS, MATERIALITY_COMPARATOR_OPTIONS, calcPolicyErrorMessage,
  useCalculationPolicyLayers, useMethodologyFactCatalogue, useSetMaterialityRules,
  type MaterialityRuleRow,
} from '@/hooks/useAmlCalculationPolicy';

interface Props {
  configId: string;
  methodologyId: string;
  canEdit: boolean;
  bandCodes: string[];
}

export function MaterialityEditor({ configId, methodologyId, canEdit, bandCodes }: Props) {
  const { data: facts = [] } = useMethodologyFactCatalogue(methodologyId);
  const { data: layers } = useCalculationPolicyLayers(configId);
  const save = useSetMaterialityRules();
  const [rows, setRows] = useState<MaterialityRuleRow[]>([]);

  useEffect(() => {
    if (layers) setRows(layers.materialityRules);
  }, [layers]);

  const patch = (index: number, next: Partial<MaterialityRuleRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...next } : r)));

  const addRow = () => setRows((prev) => [...prev, {
    parameter_code: '', fact_code: null, comparator: '', threshold_value: null,
    unit: null, adjustment_kind: '', adjustment_band: null, rationale: '',
  }]);

  const commit = async () => {
    try {
      await save.mutateAsync({
        configId,
        rows: rows.filter((r) => r.parameter_code.trim() !== '' && r.comparator !== '' && r.adjustment_kind !== ''),
      });
      toast.success('Materiality rules saved.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Each rule names the parameter it represents, the declared fact it compares, the comparison and the
        consequence. A rule without a written supervisory rationale is refused.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Parameter</TableHead>
              <TableHead className="w-48">Fact</TableHead>
              <TableHead className="w-28">Comparator</TableHead>
              <TableHead className="w-32">Threshold</TableHead>
              <TableHead className="w-24">Unit</TableHead>
              <TableHead className="w-44">Consequence</TableHead>
              <TableHead className="w-40">Floor at band</TableHead>
              <TableHead>Rationale</TableHead>
              <TableHead className="w-16" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-sm text-muted-foreground">No materiality rule has been published for this version.</TableCell></TableRow>
            )}
            {rows.map((r, i) => (
              <TableRow key={`mat-${i}`}>
                <TableCell>
                  <Input value={r.parameter_code} disabled={!canEdit} aria-label={`Parameter code ${i + 1}`}
                    onChange={(e) => patch(i, { parameter_code: e.target.value })} />
                </TableCell>
                <TableCell>
                  <Select value={r.fact_code || 'none'} disabled={!canEdit}
                    onValueChange={(v) => patch(i, { fact_code: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="No fact" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No fact</SelectItem>
                      {facts.map((f) => <SelectItem key={f.fact_code} value={f.fact_code}>{f.fact_code}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={r.comparator || 'none'} disabled={!canEdit}
                    onValueChange={(v) => patch(i, { comparator: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Undecided</SelectItem>
                      {MATERIALITY_COMPARATOR_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Input type="number" step="any" value={r.threshold_value ?? ''} disabled={!canEdit}
                    aria-label={`Threshold value ${i + 1}`}
                    onChange={(e) => patch(i, { threshold_value: e.target.value === '' ? null : Number(e.target.value) })} />
                </TableCell>
                <TableCell>
                  <Input value={r.unit ?? ''} disabled={!canEdit} aria-label={`Unit ${i + 1}`}
                    onChange={(e) => patch(i, { unit: e.target.value || null })} />
                </TableCell>
                <TableCell>
                  <Select value={r.adjustment_kind || 'none'} disabled={!canEdit}
                    onValueChange={(v) => patch(i, { adjustment_kind: v === 'none' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Undecided</SelectItem>
                      {MATERIALITY_ADJUSTMENT_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Select value={r.adjustment_band || 'none'} disabled={!canEdit}
                    onValueChange={(v) => patch(i, { adjustment_band: v === 'none' ? null : v })}>
                    <SelectTrigger><SelectValue placeholder="Not applicable" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not applicable</SelectItem>
                      {bandCodes.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  <Textarea rows={2} value={r.rationale} disabled={!canEdit} aria-label={`Rationale ${i + 1}`}
                    onChange={(e) => patch(i, { rationale: e.target.value })} />
                </TableCell>
                <TableCell>
                  {canEdit && (
                    <Button variant="ghost" size="sm" aria-label={`Remove materiality rule ${i + 1}`}
                      onClick={() => setRows((prev) => prev.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex gap-2">
        {canEdit && (
          <Button data-rbac="aml_supervision.manage_config" variant="outline" onClick={addRow}><Plus className="h-4 w-4 mr-2" />Add rule</Button>
        )}
        <Button data-rbac="aml_supervision.manage_config" onClick={commit} disabled={!canEdit || save.isPending}>
          <Save className="h-4 w-4 mr-2" />Save materiality rules
        </Button>
      </div>
    </div>
  );
}

export default MaterialityEditor;
