/**
 * RDM-ENTITY-001 Wave C — Regulatory Metrics governed CRUD.
 * Writes go through `returns_save_metric`; calculation rules are read-only
 * here (created via the metric formula pipeline, not this panel).
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, Loader2, Plus } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useRegulatoryMetrics, useMetricCalculationRules, useWaveCMutations } from '@/hooks/useWaveC';
import { useDataDomainOptions } from '@/hooks/useWaveCConfig';

const NONE = 'none';
const DATA_TYPES = ['NUMERIC', 'PERCENTAGE', 'CURRENCY', 'TEXT', 'BOOLEAN', 'DATE'];
const AGGREGATIONS = ['POINT_IN_TIME', 'PERIOD_SUM', 'PERIOD_AVERAGE', 'CLOSING_BALANCE'];
const SENSITIVITIES = ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'RESTRICTED'];

const emptyForm = {
  id: '' as string | undefined,
  code: '', name: '', description: '', data_domain_id: NONE,
  data_type: 'NUMERIC', unit: '', aggregation_type: 'POINT_IN_TIME', sensitivity: 'INTERNAL',
  is_calculated: false, calculation_strategy: '', is_active: true,
};

export function RegulatoryMetricsPanel({ canWrite }: { canWrite: boolean }) {
  const { data: metrics = [], isLoading } = useRegulatoryMetrics();
  const { data: rules = [] } = useMetricCalculationRules();
  const { data: domains = [] } = useDataDomainOptions();
  const { saveMetric } = useWaveCMutations();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const ruleByMetric = new Map(rules.map((r) => [r.regulatory_metric_id, r]));
  const domainById = new Map(domains.map((d) => [d.id, d.label]));

  const openCreate = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (m: typeof metrics[number]) => {
    setForm({
      id: m.id, code: m.code, name: m.name, description: m.description ?? '',
      data_domain_id: m.data_domain_id ?? NONE, data_type: m.data_type, unit: m.unit ?? '',
      aggregation_type: m.aggregation_type, sensitivity: m.sensitivity,
      is_calculated: m.is_calculated, calculation_strategy: m.calculation_strategy ?? '',
      is_active: m.is_active,
    });
    setOpen(true);
  };

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: 'Code and name are required', variant: 'destructive' });
      return;
    }
    try {
      await saveMetric.mutateAsync({
        id: form.id || undefined,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        data_domain_id: form.data_domain_id === NONE ? null : form.data_domain_id,
        data_type: form.data_type,
        unit: form.unit.trim() || null,
        aggregation_type: form.aggregation_type,
        sensitivity: form.sensitivity,
        is_calculated: form.is_calculated,
        calculation_strategy: form.calculation_strategy.trim() || null,
        is_active: form.is_active,
      });
      toast({ title: 'Metric saved' });
      setOpen(false);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  const deactivate = async (m: typeof metrics[number]) => {
    try {
      await saveMetric.mutateAsync({ id: m.id, code: m.code, name: m.name, is_active: false });
      toast({ title: 'Metric deactivated' });
    } catch (e: any) {
      toast({ title: 'Deactivate failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        {canWrite && <Button data-rbac="returns_management.create" onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New metric</Button>}
      </div>
      <Card><CardContent className="overflow-x-auto p-0">
        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Domain</TableHead>
              <TableHead>Type</TableHead><TableHead>Unit</TableHead><TableHead>Aggregation</TableHead>
              <TableHead>Sensitivity</TableHead><TableHead>Calculated</TableHead><TableHead>Active</TableHead>
              {canWrite && <TableHead className="w-32" />}
            </TableRow></TableHeader>
            <TableBody>
              {metrics.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-xs font-medium">
                    {canWrite ? <button className="hover:underline" onClick={() => openEdit(m)}>{m.code}</button> : m.code}
                  </TableCell>
                  <TableCell>{m.name}</TableCell>
                  <TableCell>{m.data_domain_id ? domainById.get(m.data_domain_id) ?? '—' : '—'}</TableCell>
                  <TableCell>{m.data_type}</TableCell>
                  <TableCell>{m.unit ?? '—'}</TableCell>
                  <TableCell>{m.aggregation_type}</TableCell>
                  <TableCell>{m.sensitivity}</TableCell>
                  <TableCell>{m.is_calculated ? 'Yes' : 'No'}</TableCell>
                  <TableCell><Badge variant="outline">{m.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  {canWrite && (
                    <TableCell>
                      {m.is_active && (
                        <GuardedButton module="returns_management" action="edit" data-rbac="returns_management.edit" variant="outline" size="sm" onClick={() => deactivate(m)}>Deactivate</GuardedButton>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {metrics.length === 0 && (
                <TableRow><TableCell colSpan={10} className="py-10 text-center text-sm text-muted-foreground">No regulatory metrics configured yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </CardContent></Card>

      {form.id && ruleByMetric.get(form.id) && (
        <Card><CardContent className="space-y-2 p-4 text-sm">
          <p className="font-medium">Active calculation rule</p>
          <p className="font-mono text-xs text-muted-foreground">{ruleByMetric.get(form.id)!.expression}</p>
          <p className="text-xs text-muted-foreground">
            Depends on: {ruleByMetric.get(form.id)!.dependency_metric_codes.join(', ') || '—'} · On missing dependency:{' '}
            <Badge variant="outline">{ruleByMetric.get(form.id)!.on_missing_dependency}</Badge>
          </p>
        </CardContent></Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit regulatory metric' : 'New regulatory metric'}</DialogTitle>
            <DialogDescription>Metrics are the canonical values regulatory returns feed into analytics and prudential ratios.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={form.code} disabled={!!form.id} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CAR_TOTAL" />
                {form.id && <p className="text-xs text-muted-foreground">Metric code is fixed once created.</p>}
              </div>
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Data domain</Label>
                <Select value={form.data_domain_id} onValueChange={(v) => setForm({ ...form, data_domain_id: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Unassigned</SelectItem>
                    {domains.map((d) => <SelectItem key={d.id} value={d.id}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Data type</Label>
                <Select value={form.data_type} onValueChange={(v) => setForm({ ...form, data_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DATA_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Aggregation</Label>
                <Select value={form.aggregation_type} onValueChange={(v) => setForm({ ...form, aggregation_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{AGGREGATIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sensitivity</Label>
                <Select value={form.sensitivity} onValueChange={(v) => setForm({ ...form, sensitivity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SENSITIVITIES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Calculated metric</p>
                <p className="text-xs text-muted-foreground">Derived from other metrics via a formula, rather than filed directly.</p>
              </div>
              <Switch checked={form.is_calculated} onCheckedChange={(c) => setForm({ ...form, is_calculated: c })} />
            </div>
            {form.is_calculated && (
              <div className="space-y-1">
                <Label>Calculation strategy note</Label>
                <Textarea rows={2} value={form.calculation_strategy} onChange={(e) => setForm({ ...form, calculation_strategy: e.target.value })} placeholder="Free-text note on the calculation approach" />
              </div>
            )}
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                If a calculated metric's dependency is unavailable, the result is always <strong>ERROR</strong> or{' '}
                <strong>NOT_AVAILABLE</strong> — it is never silently treated as zero.
              </AlertDescription>
            </Alert>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <span className="text-sm font-medium">Active</span>
              <Switch checked={form.is_active} onCheckedChange={(c) => setForm({ ...form, is_active: c })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button data-rbac="returns_management.edit" onClick={submit} disabled={saveMetric.isPending}>
              {saveMetric.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save metric
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
