import { useState } from 'react';
import { useStressIndicators, useUpsertStressIndicator, useDeleteStressIndicator, useRiskTaxonomy } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus } from 'lucide-react';

export default function StressIndicatorsAdmin() {
  const { data = [] } = useStressIndicators();
  const { data: tax = [] } = useRiskTaxonomy();
  const upsert = useUpsertStressIndicator();
  const del = useDeleteStressIndicator();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ direction: 'gt', severity: 'medium', is_active: true, escalate: false });

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stress Indicators</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button size="sm"><Plus className="h-4 w-4 mr-2" />New indicator</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New stress indicator</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Label</Label><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div><Label>Metric / ratio key</Label><Input value={form.metric_key || ''} onChange={(e) => setForm({ ...form, metric_key: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['gt','lt','gte','lte','eq'].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Threshold</Label><Input type="number" value={form.threshold_value ?? ''} onChange={(e) => setForm({ ...form, threshold_value: parseFloat(e.target.value) })} /></div>
                <div><Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['low','medium','high','critical'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Taxonomy</Label>
                <Select value={form.taxonomy_code || 'none'} onValueChange={(v) => setForm({ ...form, taxonomy_code: v === 'none' ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {tax.map((t) => <SelectItem key={t.code} value={t.code}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} /><Label>Active</Label></div>
                <div className="flex items-center gap-2"><Switch checked={form.escalate} onCheckedChange={(v) => setForm({ ...form, escalate: v })} /><Label>Auto-escalate</Label></div>
              </div>
            </div>
            <DialogFooter>
              <Button disabled={!form.label || !form.metric_key || form.threshold_value == null} onClick={async () => { await upsert.mutateAsync(form); setOpen(false); setForm({ direction: 'gt', severity: 'medium', is_active: true, escalate: false }); }}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="pt-4">
        <Table><TableHeader><TableRow>
          <TableHead>Label</TableHead><TableHead>Metric</TableHead><TableHead>Rule</TableHead><TableHead>Severity</TableHead><TableHead>Taxonomy</TableHead><TableHead>Active</TableHead><TableHead></TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.map((i) => (
            <TableRow key={i.id}>
              <TableCell>{i.label}</TableCell>
              <TableCell><code>{i.metric_key}</code></TableCell>
              <TableCell>{i.direction} {i.threshold_value}</TableCell>
              <TableCell><Badge>{i.severity}</Badge></TableCell>
              <TableCell>{i.taxonomy_code || '—'}</TableCell>
              <TableCell>{i.is_active ? 'Yes' : 'No'}</TableCell>
              <TableCell><Button size="sm" variant="ghost" onClick={() => del.mutate(i.id)}>Deactivate</Button></TableCell>
            </TableRow>
          ))}
          {!data.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No indicators.</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>
    </div>
  );
}
