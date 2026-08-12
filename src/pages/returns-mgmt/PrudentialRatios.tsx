import { useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTableShell, Column } from '@/components/shared/DataTableShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Plus, Edit, Trash2, UploadCloud, History, Archive, Undo2, Loader2, RotateCcw } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRatios, useUpsertRatio, useDeleteRatio } from '@/hooks/usePrudentialConfig';
import { useUserDisplayNames, actorLabel } from '@/hooks/useUserDisplayNames';
import { useFormulaLabels } from '@/hooks/useFormulaLabels';
import { FormulaText } from '@/components/prudential/FormulaText';
import { RatioEditDialog } from '@/components/prudential/RatioEditDialog';

import { formatDateTime, formatDateOnly } from '@/lib/datetime';
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

function useRatioVersions(ratioId?: string | null) {
  return useQuery({
    queryKey: ['prudential_ratio_versions', ratioId],
    enabled: !!ratioId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('prudential_ratio_versions')
        .select('version,published_at,published_by,formula,display_format,effective_from')
        .eq('ratio_id', ratioId)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

const empty: Partial<PrudentialRatio> = { display_format: 'decimal', is_active: true };

export default function PrudentialRatios() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | undefined>();
  const [editing, setEditing] = useState<Partial<PrudentialRatio> | null>(null);
  const [historyRatio, setHistoryRatio] = useState<PrudentialRatio | null>(null);
  const { data: configs = [] } = useConfigs();
  const { data: rows = [], isLoading } = useRatios(selected);
  const upsert = useUpsertRatio();
  const del = useDeleteRatio();

  const versionsQuery = useRatioVersions(historyRatio?.id);
  const versions = versionsQuery.data ?? [];
  const { data: names, isLoading: namesLoading, isError: namesError } = useUserDisplayNames(versions.map((v: any) => v.published_by));
  const currentVersion = (historyRatio as any)?.current_version ?? (versions[0]?.version ?? null);

  // Human-readable formulas: resolve `formId.fieldName` tokens to "Form › Field label".
  const allFormulas = useMemo(
    () => [...rows.map((r) => r.formula), ...versions.map((v: any) => v.formula), editing?.formula ?? ''],
    [rows, versions, editing?.formula],
  );
  const { data: tokenLabels } = useFormulaLabels(allFormulas);
  const ratioLabels = useMemo(
    () => new Map(rows.map((r) => [r.ratio_key, r.label])),
    [rows],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['prudential_ratios'] });
    qc.invalidateQueries({ queryKey: ['prudential_ratio_versions'] });
  };

  const publish = async (r: PrudentialRatio) => {
    const { error } = await (supabase as any).rpc('publish_prudential_ratio', { _ratio_id: r.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    refresh();
    Swal.fire({ icon: 'success', text: 'New ratio version published', timer: 1400, showConfirmButton: false });
  };

  const rollback = async (ratio_id: string, to_version: number) => {
    const ok = await Swal.fire({ title: `Rollback to v${to_version}?`, icon: 'question', showCancelButton: true, confirmButtonText: 'Rollback' });
    if (!ok.isConfirmed) return;
    const { error } = await (supabase as any).rpc('rollback_prudential_ratio', { _ratio_id: ratio_id, _to_version: to_version });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    refresh();
    Swal.fire({ icon: 'success', text: 'Rolled back — new current version published', timer: 1600, showConfirmButton: false });
    setHistoryRatio(null);
  };

  const archive = async (r: PrudentialRatio) => {
    const ok = await Swal.fire({ title: 'Archive ratio?', text: r.label, icon: 'warning', showCancelButton: true, confirmButtonText: 'Archive' });
    if (!ok.isConfirmed) return;
    const { error } = await (supabase as any).rpc('archive_prudential_ratio', { _ratio_id: r.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    refresh();
    Swal.fire({ icon: 'success', text: 'Ratio archived', timer: 1200, showConfirmButton: false });
  };

  const restore = async (r: PrudentialRatio) => {
    const ok = await Swal.fire({ title: 'Restore ratio?', text: r.label, icon: 'question', showCancelButton: true, confirmButtonText: 'Restore' });
    if (!ok.isConfirmed) return;
    const { error } = await (supabase as any).rpc('restore_prudential_ratio', { _ratio_id: r.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    refresh();
    Swal.fire({ icon: 'success', text: 'Ratio restored', timer: 1200, showConfirmButton: false });
  };


  const columns = useMemo<Column<PrudentialRatio>[]>(() => [
    { key: 'label', label: 'Ratio' },
    { key: 'ratio_key', label: 'Key', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.ratio_key}</code> },
    { key: 'formula', label: 'Formula', render: (r) => <FormulaText inline formula={r.formula} labels={tokenLabels} ratioLabels={ratioLabels} /> },
    { key: 'metric_key', label: 'Metric', render: (r) => r.metric_key ? <Badge variant="outline">{r.metric_key}</Badge> : '—' },
    { key: 'display_format', label: 'Format', render: (r) => <Badge variant="outline">{r.display_format}</Badge> },
    { key: 'current_version', label: 'v', render: (r: any) => <Badge variant="outline">v{r.current_version ?? 1}</Badge> },
    { key: 'is_active', label: 'Status', render: (r) => <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'active' : 'archived'}</Badge> },
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)} title="Edit"><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => publish(r)} title="Publish new version"><UploadCloud className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setHistoryRatio(r)} title="Version history"><History className="h-4 w-4" /></Button>
        {r.is_active ? (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => archive(r)} title="Archive"><Archive className="h-4 w-4" /></Button>
        ) : (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => restore(r)} title="Restore"><RotateCcw className="h-4 w-4" /></Button>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
          const ok = await Swal.fire({ title: 'Delete ratio?', text: r.label, icon: 'warning', showCancelButton: true });
          if (ok.isConfirmed) del.mutate(r.id, { onSuccess: refresh });
        }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ], [del, tokenLabels, ratioLabels]);

  const save = async () => {
    const missing: string[] = [];
    if (!editing?.return_config_id) missing.push('a return configuration');
    if (!editing?.label) missing.push('a ratio name');
    if (!editing?.ratio_key) missing.push('an internal code');
    if (!editing?.formula) missing.push('how the ratio is calculated (pick a form and line item)');
    if (missing.length) {
      Swal.fire({ icon: 'error', title: 'Something is missing', text: `Please provide ${missing.join(', ')}.` });
      return;
    }

    try {
      await upsert.mutateAsync(editing as any);
      refresh();
      setEditing(null);
    } catch {
      /* toast surfaced by the hook */
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Prudential Ratios"
          description="Configure ratios computed automatically from filed return data."
          actions={<Button data-rbac="prudential_supervision.edit" disabled={!selected} onClick={() => setEditing({ ...empty, return_config_id: selected })}><Plus className="h-4 w-4 mr-2" />Add Ratio</Button>}
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
        {isLoading ? (
          <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading ratios…</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">No ratios configured for this selection.</div>
        ) : (
          <DataTableShell columns={columns} data={rows} searchPlaceholder="Search ratios..." />
        )}
      </div>

      <RatioEditDialog
        editing={editing}
        setEditing={setEditing}
        configs={configs}
        ratios={rows}
        tokenLabels={tokenLabels}
        ratioLabels={ratioLabels}
        onSave={save}
        saving={upsert.isPending}
      />


      <Sheet open={!!historyRatio} onOpenChange={(o) => !o && setHistoryRatio(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader><SheetTitle>Version history — {historyRatio?.label}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            {versionsQuery.isLoading && (
              <div className="flex items-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading version history…</div>
            )}
            {!!versionsQuery.error && (
              <div className="text-sm text-destructive">Could not load version history: {(versionsQuery.error as any).message}</div>
            )}
            {!versionsQuery.isLoading && !versionsQuery.error && versions.length === 0 && (
              <div className="text-sm text-muted-foreground">No versions recorded yet.</div>
            )}
            {versions.map((v: any) => {
              const isCurrent = v.version === currentVersion;
              return (
                <div key={v.version} className="border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">v{v.version}{isCurrent && <Badge className="ml-2">current</Badge>}</div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground">{formatDateTime(v.published_at)}</div>
                      {!isCurrent && historyRatio && (
                        <Button data-rbac="prudential_supervision.edit" size="sm" variant="outline" onClick={() => rollback(historyRatio.id, v.version)}>
                          <Undo2 className="h-3 w-3 mr-1" /> Rollback
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="bg-muted p-2 rounded">
                    <FormulaText formula={v.formula} labels={tokenLabels} ratioLabels={ratioLabels} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Format: {v.display_format ?? '—'} · effective {formatDateOnly(v.effective_from)} · by {actorLabel(v.published_by, names, { isLoading: namesLoading, isError: namesError })}
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
