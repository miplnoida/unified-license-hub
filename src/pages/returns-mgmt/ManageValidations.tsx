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
import { Plus, Edit, Trash2, History, UploadCloud, Copy, Archive, Undo2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useValidationRules, useUpsertValidationRule, useDeleteValidationRule } from '@/hooks/usePrudentialConfig';
import type { ValidationRule } from '@/lib/returnsValidation';
import Swal from 'sweetalert2';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

function useReturnConfigurationOptions() {
  return useQuery({
    queryKey: ['return_configurations_options'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('return_configurations').select('id,name').order('name');
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });
}

const emptyRule: Partial<ValidationRule> = {
  scope: 'field', rule_type: 'range', severity: 'error', is_active: true,
  name: '', expression: '', error_message: '', field_refs: [],
};

export default function ManageValidations() {
  const [selectedConfig, setSelectedConfig] = useState<string | undefined>();
  const [editing, setEditing] = useState<Partial<ValidationRule> | null>(null);
  const [historyRule, setHistoryRule] = useState<ValidationRule | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const { data: configs = [] } = useReturnConfigurationOptions();
  const { data: rules = [], isLoading } = useValidationRules(selectedConfig);
  const upsert = useUpsertValidationRule();
  const del = useDeleteValidationRule();

  const openHistory = async (r: ValidationRule) => {
    setHistoryRule(r);
    const { data } = await (supabase as any)
      .from('return_validation_rule_versions')
      .select('version,published_at,published_by,is_current,definition')
      .eq('rule_id', r.id)
      .order('version', { ascending: false });
    setVersions(data ?? []);
  };

  const publish = async (r: ValidationRule) => {
    const { error } = await (supabase as any).rpc('publish_validation_rule', { _rule_id: r.id });
    if (error) { Swal.fire({ icon: 'error', text: error.message }); return; }
    Swal.fire({ icon: 'success', text: 'New rule version published', timer: 1400, showConfirmButton: false });
  };


  const columns = useMemo<Column<ValidationRule>[]>(() => [
    { key: 'name', label: 'Rule', render: (r) => <span className="font-medium">{r.name}</span> },
    { key: 'scope', label: 'Scope', render: (r) => <Badge variant="outline">{r.scope}</Badge> },
    { key: 'rule_type', label: 'Type', render: (r) => <Badge variant="outline">{r.rule_type}</Badge> },
    { key: 'expression', label: 'Expression', render: (r) => <code className="text-xs bg-muted px-2 py-1 rounded">{r.expression}</code> },
    { key: 'severity', label: 'Severity', render: (r) => (
      <Badge className={r.severity === 'error' ? 'bg-destructive text-destructive-foreground' : 'bg-warning text-warning-foreground'}>{r.severity}</Badge>
    )},
    { key: 'is_active', label: 'Status', render: (r) => (
      <Badge variant={r.is_active ? 'default' : 'outline'}>{r.is_active ? 'active' : 'inactive'}</Badge>
    )},
    { key: 'current_version', label: 'v', render: (r: any) => (
      <Badge variant="outline">v{r.current_version ?? 1}</Badge>
    )},
    { key: 'actions', label: '', render: (r) => (
      <div className="flex gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditing(r)} title="Edit"><Edit className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => publish(r)} title="Publish new version"><UploadCloud className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openHistory(r)} title="Version history"><History className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={async () => {
          const ok = await Swal.fire({ title: 'Delete rule?', text: r.name, icon: 'warning', showCancelButton: true, confirmButtonText: 'Delete' });
          if (ok.isConfirmed) del.mutate(r.id);
        }} title="Delete"><Trash2 className="h-4 w-4" /></Button>
      </div>
    )},
  ], [del]);

  const save = async () => {
    if (!editing) return;
    if (!editing.return_config_id) { Swal.fire({ icon: 'error', text: 'Select a return configuration first' }); return; }
    if (!editing.name || !editing.expression || !editing.error_message) {
      Swal.fire({ icon: 'error', text: 'Name, expression, and error message are required' }); return;
    }
    await upsert.mutateAsync(editing as any);
    setEditing(null);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manage Validations"
          description="Configure business and cross-field validation rules per return configuration."
          actions={
            <Button disabled={!selectedConfig} onClick={() => setEditing({ ...emptyRule, return_config_id: selectedConfig })}>
              <Plus className="h-4 w-4 mr-2" />Add Rule
            </Button>
          }
        />

        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px]">
            <Label>Return Configuration</Label>
            <Select value={selectedConfig ?? 'all'} onValueChange={(v) => setSelectedConfig(v === 'all' ? undefined : v)}>
              <SelectTrigger><SelectValue placeholder="All configurations" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All configurations</SelectItem>
                {configs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="animate-slide-up delay-100">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading rules…</div>
          ) : (
            <DataTableShell columns={columns} data={rules} searchPlaceholder="Search rules..." />
          )}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? 'Edit' : 'Add'} Validation Rule</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <Label>Return Configuration *</Label>
                <Select
                  value={editing.return_config_id ?? ''}
                  onValueChange={(v) => setEditing({ ...editing, return_config_id: v })}
                >
                  <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {configs.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>Scope</Label>
                  <Select value={editing.scope} onValueChange={(v: any) => setEditing({ ...editing, scope: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field">Field</SelectItem>
                      <SelectItem value="cross_field">Cross-field</SelectItem>
                      <SelectItem value="cross_form">Cross-form</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={editing.rule_type} onValueChange={(v: any) => setEditing({ ...editing, rule_type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="range">Range</SelectItem>
                      <SelectItem value="comparison">Comparison</SelectItem>
                      <SelectItem value="pattern">Pattern</SelectItem>
                      <SelectItem value="expression">Expression</SelectItem>
                      <SelectItem value="required_if">Required if</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={editing.severity} onValueChange={(v: any) => setEditing({ ...editing, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="error">Error (blocks submit)</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Name *</Label>
                <Input value={editing.name ?? ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <Label>Expression *</Label>
                <Textarea
                  rows={2}
                  placeholder="e.g. formA.total_assets >= formA.current_assets + formA.fixed_assets"
                  value={editing.expression ?? ''}
                  onChange={(e) => setEditing({ ...editing, expression: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Reference fields as <code>formId.fieldKey</code>. Comparison operators (=, ≠, &lt;, &gt;, ≤, ≥) and arithmetic (+, -, *, /) are supported.
                </p>
              </div>
              <div>
                <Label>Error Message *</Label>
                <Input value={editing.error_message ?? ''} onChange={(e) => setEditing({ ...editing, error_message: e.target.value })} />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                <Label>Active</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={upsert.isPending}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyRule} onOpenChange={(o) => !o && setHistoryRule(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          <SheetHeader><SheetTitle>Version history — {historyRule?.name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            {versions.length === 0 && <div className="text-sm text-muted-foreground">No versions published yet.</div>}
            {versions.map((v: any) => (
              <div key={v.version} className="border rounded p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="font-medium">v{v.version}{v.is_current && <Badge className="ml-2">current</Badge>}</div>
                  <div className="text-xs text-muted-foreground">{new Date(v.published_at).toLocaleString()}</div>
                </div>
                <code className="text-xs block bg-muted p-2 rounded whitespace-pre-wrap">{v.definition?.expression}</code>
                <div className="text-xs text-muted-foreground">Severity: {v.definition?.severity} · Type: {v.definition?.rule_type}</div>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
}
