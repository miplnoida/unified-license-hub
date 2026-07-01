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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Edit, Trash2, UploadCloud, History, Archive, Undo2 } from 'lucide-react';
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
  const [historyThreshold, setHistoryThreshold] = useState<PrudentialThreshold | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const { data: configs = [] } = useConfigs();
  const { data: rows = [], isLoading } = useThresholds(selected);
  const upsert = useUpsertThreshold();
  const del = useDeleteThreshold();

  const openHistory = async (t: PrudentialThreshold) => {
    setHistoryThreshold(t);
    const { data } = await (supabase as any)
      .from('prudential_threshold_versions')
      .select('version,warn_value,breach_value,upper_value,comparator,unit,effective_from,effective_to,published_at')
      .eq('threshold_id', t.id)
      .order('version', { ascending: false });
    setVersions(data ?? []);
  };

  const publish = async (t: PrudentialThreshold) => {
    const { error } = await (supabase as any).rpc('publish_prudential_threshold', { _threshold_id: t.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    Swal.fire({ icon: 'success', text: 'New threshold version published', timer: 1400, showConfirmButton: false });
  };

  const rollback = async (threshold_id: string, to_version: number) => {
    const ok = await Swal.fire({ title: `Rollback to v${to_version}?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Rollback' });
    if (!ok.isConfirmed) return;
    const { error } = await (supabase as any).rpc('rollback_prudential_threshold', { _threshold_id: threshold_id, _to_version: to_version });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    Swal.fire({ icon: 'success', text: 'Rolled back — new current version published', timer: 1600, showConfirmButton: false });
    setHistoryThreshold(null);
  };

  const archive = async (t: PrudentialThreshold) => {
    const ok = await Swal.fire({ title: 'Archive threshold?', text: t.label, icon: 'warning', showCancelButton: true, confirmButtonText: 'Archive' });
    if (!ok.isConfirmed) return;
    const { error } = await (supabase as any).rpc('archive_prudential_threshold', { _threshold_id: t.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    Swal.fire({ icon: 'success', text: 'Threshold archived', timer: 1200, showConfirmButton: false });
  };

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
    { key: 'current_version', label: 'v', render: (r: any) => <Badge variant="outline">v{r.current_version ?? 1}</Badge> },
    { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'active' : 'inactive'}</Badge> },
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)} title="Edit"><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => publish(r)} title="Publish new version"><UploadCloud className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistory(r)} title="Version history"><History className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(r)} title="Archive"><Archive className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
          const ok = await Swal.fire({ title: 'Delete threshold?', text: r.label, icon: 'warning', showCancelButton: true });
          if (ok.isConfirmed) del.mutate(r.id);
        }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
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

      <Sheet open={!!historyThreshold} onOpenChange={(o) => !o && setHistoryThreshold(null)}>
        <SheetContent className="w-[560px] sm:max-w-[560px] overflow-y-auto">
          <SheetHeader><SheetTitle>Version history — {historyThreshold?.label}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            {versions.length === 0 && <div className="text-sm text-muted-foreground">No versions published yet.</div>}
            {versions.map((v: any) => {
              const isCurrent = !v.effective_to;
              return (
                <div key={v.version} className="border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">v{v.version}{isCurrent && <Badge className="ml-2">current</Badge>}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">{new Date(v.published_at).toLocaleString()}</div>
                      {!isCurrent && historyThreshold && (
                        <Button size="sm" variant="outline" onClick={() => rollback(historyThreshold.id, v.version)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs">
                    {v.comparator === 'between'
                      ? <>Between <b>{v.warn_value}</b> and <b>{v.upper_value}</b></>
                      : <>x <b>{v.comparator}</b> {v.breach_value ?? v.warn_value} (warn {v.warn_value ?? '—'} / breach {v.breach_value ?? '—'})</>}
                    {v.unit && <> · {v.unit}</>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Effective {v.effective_from}{v.effective_to ? ` → ${v.effective_to}` : ' → current'}
                  </div>
                </div>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
