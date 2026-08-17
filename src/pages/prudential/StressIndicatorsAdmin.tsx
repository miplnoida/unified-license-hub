import { useState } from 'react';
import { useStressIndicators, useUpsertStressIndicator, useDeleteStressIndicator, useRiskTaxonomy } from '@/hooks/usePrudentialSupervision';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Pencil, Plus, Loader2 } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { stressSeverityLabel } from '@/lib/prudentialLabels';

const EMPTY_FORM: any = { direction: 'gt', severity: 'medium', is_active: true, escalate: false };

const DIRECTION_LABEL: Record<string, string> = {
  gt: 'greater than', gte: 'at or above', lt: 'less than', lte: 'at or below', eq: 'equal to',
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  low: 'bg-muted text-muted-foreground',
};

function useRatioKeyOptions() {
  return useQuery({
    queryKey: ['prudential_ratio_key_options'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('prudential_ratios')
        .select('ratio_key,label')
        .eq('is_active', true);
      if (error) throw error;
      const seen = new Map<string, string>();
      (data ?? []).forEach((r: any) => seen.set(r.ratio_key, r.label));
      return Array.from(seen.entries()).map(([ratio_key, label]) => ({ ratio_key, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
    },
  });
}

export default function StressIndicatorsAdmin() {
  const { data = [], isLoading } = useStressIndicators();
  const { data: tax = [] } = useRiskTaxonomy();
  const { data: ratioKeys = [] } = useRatioKeyOptions();
  const taxLabel = (code?: string | null) => (code ? (tax.find((t) => t.code === code)?.label ?? code) : '—');
  const ratioLabel = (key?: string | null) => (key ? (ratioKeys.find((r) => r.ratio_key === key)?.label ?? key) : '—');
  const upsert = useUpsertStressIndicator();
  const del = useDeleteStressIndicator();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>(EMPTY_FORM);

  const isEdit = !!form.id;

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setForm(EMPTY_FORM);
  };

  const openEdit = (row: any) => {
    setForm({
      id: row.id,
      label: row.label,
      metric_key: row.metric_key,
      direction: row.direction,
      threshold_value: row.threshold_value,
      severity: row.severity,
      taxonomy_code: row.taxonomy_code ?? null,
      is_active: row.is_active,
      escalate: row.escalate,
    });
    setOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stress Indicators</h1>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild><Button data-rbac="prudential_supervision.create" size="sm" onClick={() => setForm(EMPTY_FORM)}><Plus className="h-4 w-4 mr-2" />New indicator</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{isEdit ? 'Edit stress indicator' : 'New stress indicator'}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Label</Label><Input value={form.label || ''} onChange={(e) => setForm({ ...form, label: e.target.value })} /></div>
              <div>
                <Label>Metric / ratio key</Label>
                <Select value={form.metric_key || ''} onValueChange={(v) => setForm({ ...form, metric_key: v })}>
                  <SelectTrigger><SelectValue placeholder="Select a computed ratio" /></SelectTrigger>
                  <SelectContent>
                    {ratioKeys.map((r) => (
                      <SelectItem key={r.ratio_key} value={r.ratio_key}>{r.label} ({r.ratio_key})</SelectItem>
                    ))}
                    {form.metric_key && !ratioKeys.some((r) => r.ratio_key === form.metric_key) && (
                      <SelectItem value={form.metric_key}>{form.metric_key} (not a configured ratio)</SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Only keys from active prudential ratios can be evaluated.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div><Label>Direction</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['gt','lt','gte','lte','eq'].map((d) => <SelectItem key={d} value={d}>{DIRECTION_LABEL[d]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Threshold</Label><Input type="number" value={form.threshold_value ?? ''} onChange={(e) => setForm({ ...form, threshold_value: parseFloat(e.target.value) })} /></div>
                <div><Label>Severity</Label>
                  <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{['low','medium','high','critical'].map((sv) => <SelectItem key={sv} value={sv}>{stressSeverityLabel(sv)}</SelectItem>)}</SelectContent>
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
              <Button disabled={!form.label || !form.metric_key || form.threshold_value == null || upsert.isPending} onClick={async () => {
                if (upsert.isPending) return;
                try { await upsert.mutateAsync(form); setOpen(false); setForm(EMPTY_FORM); } catch { /* toast from hook */ }
              }}>
                {upsert.isPending ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving…</>) : 'Save'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card><CardContent className="pt-4">
        <Table><TableHeader><TableRow>
          <TableHead>Label</TableHead><TableHead>Metric</TableHead><TableHead>Rule</TableHead><TableHead>Severity</TableHead><TableHead>Taxonomy</TableHead><TableHead>Active</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {data.map((i) => (
            <TableRow key={i.id}>
              <TableCell>{i.label}</TableCell>
              <TableCell>
                <div>{ratioLabel(i.metric_key)}</div>
                <code className="text-xs text-muted-foreground">{i.metric_key}</code>
              </TableCell>
              <TableCell>{DIRECTION_LABEL[i.direction] ?? i.direction} {i.threshold_value}</TableCell>
              <TableCell><Badge variant="outline" className={SEVERITY_CLASS[String(i.severity).toLowerCase()] ?? ''}>{stressSeverityLabel(i.severity)}</Badge></TableCell>
              <TableCell>{taxLabel(i.taxonomy_code)}</TableCell>
              <TableCell>{i.is_active ? 'Yes' : 'No'}</TableCell>
              <TableCell className="text-right">
                <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => openEdit(i)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
                <Button data-rbac="prudential_supervision.edit" size="sm" variant="ghost" onClick={() => del.mutate(i.id)} disabled={!i.is_active}>Deactivate</Button>
              </TableCell>
            </TableRow>
          ))}
          {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin inline" />Loading indicators…</TableCell></TableRow>}
          {!isLoading && !data.length && <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground">No indicators.</TableCell></TableRow>}
        </TableBody></Table>
      </CardContent></Card>
      </div>
    </DashboardLayout>
  );
}
