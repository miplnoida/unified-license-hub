/**
 * Dimension side, weight, aggregation and minimum-completeness policy (AML-06).
 *
 * The regulator decides which side of the assessment each dimension feeds
 * (inherent risk or control effectiveness), how much it weighs, how its
 * questions aggregate and how complete it must be before it counts. No score is
 * aggregated in the browser.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import {
  CONTRIBUTES_TO_OPTIONS, DIMENSION_AGGREGATION_OPTIONS, calcPolicyErrorMessage,
  useCalculationPolicyLayers, useMethodologyDimensionCatalogue, useSetDimensionWeights,
  type DimensionWeightRow,
} from '@/hooks/useAmlCalculationPolicy';

interface Props {
  configId: string;
  methodologyId: string;
  canEdit: boolean;
}

export function DimensionPolicyEditor({ configId, methodologyId, canEdit }: Props) {
  const { data: dimensions, isLoading } = useMethodologyDimensionCatalogue(methodologyId);
  const { data: layers } = useCalculationPolicyLayers(configId);
  const save = useSetDimensionWeights();
  const [rows, setRows] = useState<DimensionWeightRow[]>([]);

  useEffect(() => {
    if (!layers || !dimensions) return;
    setRows(dimensions.map((d) => {
      const existing = layers.dimensionWeights.find((r) => r.dimension_code === d.dimension_code);
      return existing ?? {
        dimension_code: d.dimension_code,
        contributes_to: '',
        weight: null,
        min_completeness_pct: null,
        aggregation_method: null,
      };
    }));
  }, [layers, dimensions]);

  const patch = (code: string, next: Partial<DimensionWeightRow>) =>
    setRows((prev) => prev.map((r) => (r.dimension_code === code ? { ...r, ...next } : r)));

  const commit = async () => {
    try {
      await save.mutateAsync({ configId, rows: rows.filter((r) => r.contributes_to !== '') });
      toast.success('Dimension policy saved.');
    } catch (e) {
      toast.error(calcPolicyErrorMessage(e));
    }
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading the dimension catalogue…</p>;
  if (!dimensions?.length) {
    return <p className="text-sm text-muted-foreground">This methodology publishes no active dimensions.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A dimension with no side chosen does not participate in the calculation at all, and the policy cannot be
        submitted while any dimension the methodology publishes is left undecided.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Dimension</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-56">Contributes to</TableHead>
              <TableHead className="w-52">Aggregation</TableHead>
              <TableHead className="w-28">Weight</TableHead>
              <TableHead className="w-36">Min. completeness %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const d = dimensions.find((x) => x.dimension_code === r.dimension_code);
              return (
                <TableRow key={r.dimension_code}>
                  <TableCell className="font-mono text-xs">{r.dimension_code}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d?.label ?? '—'}</TableCell>
                  <TableCell>
                    <Select value={r.contributes_to || 'none'} disabled={!canEdit}
                      onValueChange={(v) => patch(r.dimension_code, { contributes_to: v === 'none' ? '' : v })}>
                      <SelectTrigger><SelectValue placeholder="Undecided" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Undecided</SelectItem>
                        {CONTRIBUTES_TO_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Select value={r.aggregation_method || 'none'} disabled={!canEdit}
                      onValueChange={(v) => patch(r.dimension_code, { aggregation_method: v === 'none' ? null : v })}>
                      <SelectTrigger><SelectValue placeholder="Use configuration default" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Use configuration default</SelectItem>
                        {DIMENSION_AGGREGATION_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="0.01" disabled={!canEdit} value={r.weight ?? ''}
                      aria-label={`Weight for ${r.dimension_code}`}
                      onChange={(e) => patch(r.dimension_code, { weight: e.target.value === '' ? null : Number(e.target.value) })} />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="1" min="0" max="100" disabled={!canEdit}
                      value={r.min_completeness_pct ?? ''}
                      aria-label={`Minimum completeness for ${r.dimension_code}`}
                      onChange={(e) => patch(r.dimension_code, { min_completeness_pct: e.target.value === '' ? null : Number(e.target.value) })} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <Button data-rbac="aml_supervision.manage_config" onClick={commit} disabled={!canEdit || save.isPending}>
        <Save className="h-4 w-4 mr-2" />Save dimension policy
      </Button>
    </div>
  );
}

export default DimensionPolicyEditor;
