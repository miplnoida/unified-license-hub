/**
 * Dimension Studio — the governed dimension register with authoring.
 *
 * Display order is real configuration: "Move up" / "Move down" persist a new
 * sort order through `supervisory_methodology_dimension_save`, carrying the
 * row's own change timestamp so a competing edit is refused by the server
 * rather than silently overwritten. Retirement is refused by the server while
 * active questions remain; nothing is cascaded, deleted or hidden here.
 */
import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  useRetireMethodologyDimension,
  useSaveMethodologyDimension,
  useSupervisoryMethodologyDimensions,
  useSupervisoryMethodologyStudioCapabilities,
  type MethodologyDimension,
} from '@/hooks/useSupervisoryMethodologyAdmin';
import { ErrorPanel, YesNo, humanize } from '../labels';
import { DimensionEditorDialog } from './DimensionEditorDialog';
import { AuthoringHeader } from './StudioKit';

function RetireDimensionDialog({
  methodologyId, dimension, open, onClose,
}: { methodologyId: string; dimension: MethodologyDimension | null; open: boolean; onClose: () => void }) {
  const [rationale, setRationale] = useState('');
  const retire = useRetireMethodologyDimension();
  const [refusal, setRefusal] = useState<string | null>(null);

  const submit = async () => {
    if (!dimension) return;
    setRefusal(null);
    try {
      await retire.mutateAsync({ methodologyId, dimensionCode: dimension.dimension_code, rationale: rationale.trim() });
      toast.success(`${dimension.dimension_code} retired from this draft version`);
      setRationale('');
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The dimension could not be retired';
      setRefusal(msg.replace(/^ERROR:\s*/i, ''));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Retire {dimension?.dimension_code}</DialogTitle>
          <DialogDescription>
            Retirement is refused while this dimension still holds active questions — retire or move those questions first.
            Nothing is deleted: the dimension stays in the record for history and comparison.
          </DialogDescription>
        </DialogHeader>
        {dimension && dimension.question_count > 0 ? (
          <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
            {dimension.question_count} active {dimension.question_count === 1 ? 'question' : 'questions'} still belong to this dimension.
          </p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="dim-retire-rationale">Reason (at least 10 characters)</Label>
          <Input id="dim-retire-rationale" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        </div>
        {refusal ? <p className="text-sm text-destructive" role="alert">{refusal}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={retire.isPending}>Cancel</Button>
          <Button variant="destructive" onClick={submit} data-rbac="aml_supervision.manage_config"
                  disabled={retire.isPending || rationale.trim().length < 10}>
            {retire.isPending ? 'Retiring…' : 'Retire dimension'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DimensionStudio({ methodologyId }: { methodologyId: string }) {
  const [showRetired, setShowRetired] = useState(false);
  const dims = useSupervisoryMethodologyDimensions(methodologyId, true, showRetired);
  const caps = useSupervisoryMethodologyStudioCapabilities(methodologyId);
  const capability = caps.data?.can_author_dimensions;
  const canAuthor = capability?.allowed === true;
  const save = useSaveMethodologyDimension();

  const [editing, setEditing] = useState<{ open: boolean; row: MethodologyDimension | null }>({ open: false, row: null });
  const [retiring, setRetiring] = useState<MethodologyDimension | null>(null);

  const rows = dims.data ?? [];

  const persistOrder = async (row: MethodologyDimension, sortOrder: number) => {
    await save.mutateAsync({
      methodologyId,
      payload: {
        dimension_code: row.dimension_code,
        label: row.label,
        description: row.description,
        dimension_group: row.dimension_group ?? 'OTHER',
        dimension_kind: row.dimension_kind,
        weight: row.weight,
        sort_order: sortOrder,
        evidence_required: row.evidence_required ?? false,
        ...(row.updated_at ? { expected_updated_at: row.updated_at } : {}),
      },
    });
  };

  const move = async (row: MethodologyDimension, direction: -1 | 1) => {
    const peers = rows.filter((d) => d.dimension_kind === row.dimension_kind && d.active !== false);
    const index = peers.findIndex((d) => d.id === row.id);
    const target = peers[index + direction];
    if (!target) return;
    try {
      const rowOrder = row.sort_order ?? (index + 1) * 10;
      const targetOrder = target.sort_order ?? (index + 1 + direction) * 10;
      const [a, b] = rowOrder === targetOrder
        ? [targetOrder + direction, rowOrder]
        : [targetOrder, rowOrder];
      await persistOrder(row, a);
      await persistOrder(target, b);
      toast.success(`${row.dimension_code} moved ${direction === -1 ? 'up' : 'down'}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'The display order could not be saved';
      toast.error(msg.replace(/^ERROR:\s*/i, ''));
    }
  };

  if (dims.error) return <ErrorPanel error={dims.error} title="The dimensions could not be loaded" />;

  return (
    <Card>
      <CardHeader className="gap-2 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Dimensions</CardTitle>
          <div className="flex items-center gap-2">
            <Switch id="dim-show-retired" checked={showRetired} onCheckedChange={setShowRetired} />
            <Label htmlFor="dim-show-retired" className="text-xs font-normal">Show retired</Label>
          </div>
        </div>
        <AuthoringHeader
          capability={capability}
          label="Add dimension"
          onAdd={() => setEditing({ open: true, row: null })}
          note="Dimensions may be added, edited, reordered and retired on this draft version."
        />
        {!canAuthor ? (
          <p className="text-xs text-muted-foreground">Read only. Create a new version to make changes.</p>
        ) : null}
      </CardHeader>
      <CardContent>
        {dims.isLoading ? <Skeleton className="h-40 w-full" /> : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Group</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Weight</TableHead>
                  <TableHead className="text-right">Order</TableHead>
                  <TableHead>Evidence expected</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Active questions</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((d, i) => {
                  const retired = d.active === false;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs">{d.dimension_code}</TableCell>
                      <TableCell className="text-sm">{d.label}</TableCell>
                      <TableCell className="text-xs">{humanize(d.dimension_group ?? '—')}</TableCell>
                      <TableCell className="text-xs">{humanize(d.dimension_kind)}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{d.weight ?? '—'}</TableCell>
                      <TableCell className="text-right font-mono text-xs">{d.sort_order ?? '—'}</TableCell>
                      <TableCell><YesNo value={d.evidence_required} /></TableCell>
                      <TableCell>
                        <Badge variant="outline" className={retired ? 'text-muted-foreground' : 'border-success/40 bg-success/10 text-success'}>
                          {retired ? 'Retired' : 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{d.question_count}</TableCell>
                      <TableCell className="text-right">
                        {canAuthor && !retired ? (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${d.dimension_code} up`}
                                    disabled={save.isPending || i === 0} onClick={() => move(d, -1)}
                                    data-rbac="aml_supervision.manage_config">
                              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7" aria-label={`Move ${d.dimension_code} down`}
                                    disabled={save.isPending || i === rows.length - 1} onClick={() => move(d, 1)}
                                    data-rbac="aml_supervision.manage_config">
                              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditing({ open: true, row: d })}
                                    data-rbac="aml_supervision.manage_config">Edit</Button>
                            <Button size="sm" variant="ghost" className="text-destructive"
                                    onClick={() => setRetiring(d)} data-rbac="aml_supervision.manage_config">Retire</Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {retired ? 'Retired' : 'Read only'}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <DimensionEditorDialog
        methodologyId={methodologyId}
        open={editing.open}
        existing={editing.row}
        onClose={() => setEditing({ open: false, row: null })}
      />
      <RetireDimensionDialog
        methodologyId={methodologyId}
        dimension={retiring}
        open={!!retiring}
        onClose={() => setRetiring(null)}
      />
    </Card>
  );
}
