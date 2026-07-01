import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useThresholds, useUpsertThreshold, useDeleteThreshold } from '@/hooks/usePrudentialConfig';
import type { PrudentialThreshold } from '@/lib/returnsRatios';
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

const empty: Partial<PrudentialThreshold> = { comparator: '>=', is_active: true };

export default function PrudentialThresholds() {
  const [selected, setSelected] = useState<string | undefined>();
  const [editing, setEditing] = useState<Partial<PrudentialThreshold> | null>(null);
  const { data: configs = [] } = useConfigs();
  const { data: rows = [], isLoading } = useThresholds(selected);
  const upsert = useUpsertThreshold();
  const del = useDeleteThreshold();

  const columns = useMemo<Column<PrudentialThreshold>[]>(() => [
    { key: 'label', label: 'Metric' },
    { key: 'metric_key', label: 'Key', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.metric_key}</code> },
    { key: 'comparator', label: 'Rule', render: (r) =>
      r.comparator === 'between'
        ? `${r.warn_value ?? '—'} ≤ x ≤ ${r.upper_value ?? '—'}`
        : `x ${r.comparator} ${r.breach_value ?? r.warn_value ?? '—'}`
    },
    { key: 'warn_value', label: 'Warn' },
    { key: 'breach_value', label: 'Breach' },
    { key: 'unit', label: 'Unit' },
    { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'active' : 'inactive'}</Badge> },
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)}><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
          const ok = await Swal.fire({ title: 'Delete threshold?', text: r.label, icon: 'warning', showCancelButton: true });
          if (ok.isConfirmed) del.mutate(r.id);
        }}><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ], [del]);

  const save = async () => {
    if (!editing?.return_config_id || !editing.metric_key || !editing.label) {
      Swal.fire({ icon: 'error', text: 'Configuration, key, and label are required' }); return;
    }
    await upsert.mutateAsync(editing as any);
    setEditing(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Prudential Thresholds"
          description="Configure warning and breach limits per prudential metric."
          actions={<Button disabled={!selected} onClick={() => setEditing({ ...empty, return_config_id: selected })}><Plus className="h-4 w-4 mr-2" />Add Threshold</Button>}
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
        {isLoading ? <div className="text-sm text-muted-foreground">Loading…</div> : <DataTableShell columns={columns} data={rows} searchPlaceholder="Search thresholds..." />}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'Add'} Threshold</DialogTitle></DialogHeader>
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
                <div><Label>Metric key *</Label><Input value={editing.metric_key ?? ''} onChange={(e) => setEditing({ ...editing, metric_key: e.target.value })} /></div>
                <div><Label>Label *</Label><Input value={editing.label ?? ''} onChange={(e) => setEditing({ ...editing, label: e.target.value })} /></div>
              </div>
              <div>
                <Label>Comparator</Label>
                <Select value={editing.comparator} onValueChange={(v: any) => setEditing({ ...editing, comparator: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=">=">Must be ≥ value</SelectItem>
                    <SelectItem value="<=">Must be ≤ value</SelectItem>
                    <SelectItem value="between">Between warn and upper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Warn value</Label><Input type="number" value={editing.warn_value ?? ''} onChange={(e) => setEditing({ ...editing, warn_value: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Breach value</Label><Input type="number" value={editing.breach_value ?? ''} onChange={(e) => setEditing({ ...editing, breach_value: e.target.value === '' ? null : Number(e.target.value) })} /></div>
                <div><Label>Upper (between)</Label><Input type="number" value={editing.upper_value ?? ''} onChange={(e) => setEditing({ ...editing, upper_value: e.target.value === '' ? null : Number(e.target.value) })} /></div>
              </div>
              <div><Label>Unit</Label><Input value={editing.unit ?? ''} onChange={(e) => setEditing({ ...editing, unit: e.target.value })} /></div>
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
