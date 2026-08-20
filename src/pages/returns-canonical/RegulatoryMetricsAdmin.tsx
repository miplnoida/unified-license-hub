/**
 * RDM-ENTITY-001 Wave C — regulatory metric catalogue and return definitions.
 * Configuration is written only through `returns_save_metric` /
 * `returns_save_definition`; this screen never mutates the tables directly.
 */
import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  useRegulatoryMetrics, useMetricCalculationRules, useReturnDefinitions,
  useObligationRules, useWaveCMutations, FREQUENCY_LABELS,
} from '@/hooks/useWaveC';
import { formatDateOnly } from '@/lib/datetime';
import { Loader2, Plus, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function RegulatoryMetricsAdmin() {
  const { data: metrics = [], isLoading } = useRegulatoryMetrics();
  const { data: rules = [] } = useMetricCalculationRules();
  const { data: definitions = [] } = useReturnDefinitions();
  const { data: obligationRules = [] } = useObligationRules();
  const { saveMetric } = useWaveCMutations();

  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: '', name: '', description: '', unit: '', data_type: 'NUMERIC', aggregation_type: 'POINT_IN_TIME' });

  const ruleByMetric = useMemo(
    () => new Map(rules.map((r) => [r.regulatory_metric_id, r])),
    [rules],
  );

  const filtered = metrics.filter((m) => {
    const q = term.trim().toLowerCase();
    return !q || m.code.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  });

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: 'Code and name are required', variant: 'destructive' });
      return;
    }
    try {
      await saveMetric.mutateAsync({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        unit: form.unit.trim() || null,
        data_type: form.data_type,
        aggregation_type: form.aggregation_type,
      });
      toast({ title: 'Metric saved' });
      setOpen(false);
      setForm({ code: '', name: '', description: '', unit: '', data_type: 'NUMERIC', aggregation_type: 'POINT_IN_TIME' });
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Returns Configuration"
          description="Return definitions, obligation rules and the regulatory metric catalogue"
          actions={<Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />New metric</Button>}
        />

        <Tabs defaultValue="metrics">
          <TabsList>
            <TabsTrigger value="metrics">Metrics ({metrics.length})</TabsTrigger>
            <TabsTrigger value="definitions">Return definitions ({definitions.length})</TabsTrigger>
            <TabsTrigger value="rules">Obligation rules ({obligationRules.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="metrics" className="space-y-3">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Search metric code or name…" value={term} onChange={(e) => setTerm(e.target.value)} />
            </div>
            <Card><CardContent className="overflow-x-auto p-0">
              {isLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Unit</TableHead>
                    <TableHead>Type</TableHead><TableHead>Aggregation</TableHead><TableHead>Calculated</TableHead>
                    <TableHead>Expression</TableHead><TableHead>Active</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {filtered.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-mono text-xs font-medium">{m.code}</TableCell>
                        <TableCell>{m.name}</TableCell>
                        <TableCell>{m.unit ?? '—'}</TableCell>
                        <TableCell>{m.data_type}</TableCell>
                        <TableCell>{m.aggregation_type}</TableCell>
                        <TableCell>{m.is_calculated ? 'Yes' : 'No'}</TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs text-muted-foreground">
                          {ruleByMetric.get(m.id)?.expression ?? '—'}
                        </TableCell>
                        <TableCell><Badge variant="outline">{m.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="definitions">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Frequency</TableHead>
                  <TableHead>Basis</TableHead><TableHead>Due days</TableHead><TableHead>Declaration</TableHead>
                  <TableHead>Status</TableHead><TableHead>Effective from</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {definitions.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono text-xs font-medium">{d.code}</TableCell>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>{FREQUENCY_LABELS[d.frequency] ?? d.frequency}</TableCell>
                      <TableCell>{d.filing_basis}</TableCell>
                      <TableCell>{d.due_days_after_period_end}</TableCell>
                      <TableCell>{d.requires_declaration ? 'Required' : 'No'}</TableCell>
                      <TableCell><Badge variant="outline">{d.status}</Badge></TableCell>
                      <TableCell className="whitespace-nowrap">{formatDateOnly(d.effective_from)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>

          <TabsContent value="rules">
            <Card><CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Priority</TableHead>
                  <TableHead>Active licence</TableHead><TableHead>Frequency override</TableHead>
                  <TableHead>Due days override</TableHead><TableHead>Active</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {obligationRules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs font-medium">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>{r.priority}</TableCell>
                      <TableCell>{r.requires_active_license ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{r.frequency_override ? FREQUENCY_LABELS[r.frequency_override] : '—'}</TableCell>
                      <TableCell>{r.due_days_override ?? '—'}</TableCell>
                      <TableCell><Badge variant="outline">{r.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New regulatory metric</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Code</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CAR_TOTAL" />
              </div>
              <div className="space-y-1">
                <Label>Unit</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="%" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saveMetric.isPending}>
              {saveMetric.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save metric
            </Button>
          </DialogFooter>
        </DialogContent>

      </Dialog>
    </DashboardLayout>
  );
}
