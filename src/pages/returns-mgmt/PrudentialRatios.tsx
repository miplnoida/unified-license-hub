import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRatios, useUpsertRatio, useDeleteRatio } from '@/hooks/usePrudentialConfig';
import type { PrudentialRatio } from '@/lib/returnsRatios';
import Swal from 'sweetalert2';

function useConfigs() {
  return useQuery({
    queryKey: ['return_configurations_options'],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('return_configurations').select('id,name').order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

const empty: Partial<PrudentialRatio> = { display_format: 'decimal', is_active: true };

export default function PrudentialRatios() {
  const [selected, setSelected] = useState<string | undefined>();
  const [editing, setEditing] = useState<Partial<PrudentialRatio> | null>(null);
  const { data: configs = [] } = useConfigs();
  const { data: rows = [], isLoading } = useRatios(selected);
  const upsert = useUpsertRatio();
  const del = useDeleteRatio();

  const columns = useMemo<Column<PrudentialRatio>[]>(() => [
    { key: 'label', label: 'Ratio' },
    { key: 'ratio_key', label: 'Key', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.ratio_key}</code> },
    { key: 'formula', label: 'Formula', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.formula}</code> },
    { key: 'metric_key', label: 'Metric', render: (r) => r.metric_key ? <Badge variant="outline">{r.metric_key}</Badge> : '—' },
    { key: 'display_format', label: 'Format', render: (r) => <Badge variant="outline">{r.display_format}</Badge> },
    { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'active' : 'inactive'}</Badge> },
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)}><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
          const ok = await Swal.fire({ title: 'Delete ratio?', text: r.label, icon: 'warning', showCancelButton: true });
          if (ok.isConfirmed) del.mutate(r.id);
        }}><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ], [del]);

  const save = async () => {
    if (!editing?.return_config_id || !editing.ratio_key || !editing.label || !editing.formula) {
      Swal.fire({ icon: 'error', text: 'Configuration, key, label and formula are required' }); return;
    }
    await upsert.mutateAsync(editing as any);
    setEditing(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Prudential Ratios"
          description="Configure ratios computed automatically from filed return data."
          actions={<Button disabled={!selected} onClick={() => setEditing({ ...empty, return_config_id: selected })}><Plus className="h-4 w-4 mr-2" />Add Ratio</Button>}
        />
        <div className="min-w-[280px]">
          <Label>Return Configuration</Label>
          <Select value={selected ?? 'all'} onValueChange={(v) => setSelected(v === 'all' ? undefined : v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All configurations</SelectItem>
              {configs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : <DataTableShell columns={columns} data={rows} searchPlaceholder="Search ratios..." />}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'Add'} Ratio</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Return Configuration *</Label>
                <Select value={editing.return_config_id ?? ''} onValueChange={(v) => setEditing({ ...editing, return_config_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{configs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Ratio key *</Label><Input value={editing.ratio_key ?? ''} onChange={(e) => setEditing({ ...editing, ratio_key: e.target.value })} /></div>
                <div><Label>Label *</Label><Input value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
              </div>
              <div>
                <Label>Formula *</Label>
                <Textarea rows={2} placeholder="e.g. formA.total_assets / formA.total_liabilities" value={editing.formula ?? ''} onChange={(e) => setEditing({ ...editing, formula: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Reference values as <code>formId.fieldKey</code>. Only + - * / and parentheses are supported.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Metric key (links to threshold)</Label>
                  <Input value={editing.metric_key ?? ''} onChange={(e) => setEditing({ ...editing, metric_key: e.target.value || null })} />
                </div>
                <div>
                  <Label>Display format</Label>
                  <Select value={editing.display_format} onValueChange={(v: any) => setEditing({ ...editing, display_format: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="decimal">Decimal</SelectItem>
                      <SelectItem value="percent">Percent</SelectItem>
                      <SelectItem value="currency">Currency</SelectItem>
                      <SelectItem value="ratio">Ratio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} /><Label>Active</Label></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
