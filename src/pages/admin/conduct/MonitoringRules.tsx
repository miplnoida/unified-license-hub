import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAction } from '@/hooks/useAuditLog';
import { Loader2, Plus, Play, History } from 'lucide-react';

const RULE_TYPES = ['complaint_volume', 'complaint_upheld_rate', 'sla_breach_rate', 'repeat_offender', 'monitoring_signal', 'metric_threshold', 'custom'];
const FREQUENCIES = ['daily', 'weekly', 'monthly', 'on_demand'];
const SCOPES = ['entity', 'product', 'sector', 'global'];
const OPERATORS = ['>=', '>', '=', '<', '<='];
const METRICS = [
  'open_complaints_rolling',
  'complaints_by_channel',
  'post_remediation_complaint_count',
  'upheld_rate',
  'sla_breach_rate',
  'repeat_complaint_count',
];

export default function MonitoringRules() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<any | null>(null);
  const [running, setRunning] = useState(false);
  const [versionsFor, setVersionsFor] = useState<any | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('conduct_monitoring_rules' as any).select('*').order('created_at', { ascending: false });
    if (error) toast.error(error.message); else setRows((data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openVersions = async (r: any) => {
    setVersionsFor(r); setVersions([]); setVersionsLoading(true);
    const { data, error } = await supabase.from('conduct_monitoring_rule_versions' as any)
      .select('*').eq('rule_id', r.id).order('version', { ascending: false });
    if (error) toast.error(error.message); else setVersions((data as any[]) || []);
    setVersionsLoading(false);
  };

  const save = async () => {
    if (!edit.name?.trim()) return toast.error('Name required');
    let defn: any = {};
    try { defn = typeof edit.definition === 'string' ? JSON.parse(edit.definition || '{}') : (edit.definition || {}); }
    catch { return toast.error('Definition must be valid JSON'); }
    if (edit.threshold_value !== '' && edit.threshold_value != null && isNaN(Number(edit.threshold_value))) {
      return toast.error('Threshold must be numeric');
    }
    const payload: any = {
      name: edit.name.trim(),
      description: edit.description || null,
      rule_type: edit.rule_type,
      scope: edit.scope,
      frequency: edit.frequency,
      active: !!edit.active,
      risk_delta: Number(edit.risk_delta) || 0,
      definition: defn,
      metric: edit.metric || null,
      source_dataset: edit.source_dataset || null,
      threshold_value: edit.threshold_value === '' || edit.threshold_value == null ? null : Number(edit.threshold_value),
      comparison_operator: edit.comparison_operator || null,
      lookback_days: edit.lookback_days === '' || edit.lookback_days == null ? null : Number(edit.lookback_days),
    };
    let error;
    if (edit.id) ({ error } = await supabase.from('conduct_monitoring_rules' as any).update(payload).eq('id', edit.id));
    else ({ error } = await supabase.from('conduct_monitoring_rules' as any).insert(payload));
    if (error) return toast.error(error.message);
    await logAction(edit.id ? 'monitoring_rule.updated' : 'monitoring_rule.created', 'conduct_monitoring_rule', edit.id || 'new', { after: payload });
    setEdit(null); load();
  };

  const toggle = async (r: any) => {
    const { error } = await supabase.from('conduct_monitoring_rules' as any).update({ active: !r.active }).eq('id', r.id);
    if (error) return toast.error(error.message);
    await logAction('monitoring_rule.toggled', 'conduct_monitoring_rule', r.id, { before: { active: r.active }, after: { active: !r.active } });
    load();
  };


  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-conduct-monitoring', { body: { on_demand: true } });
      if (error) throw error;
      toast.success(`Evaluated: ${(data as any)?.evaluated ?? 0} rules · ${(data as any)?.matched ?? 0} matches`);
    } catch (e: any) { toast.error(e.message); }
    setRunning(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader title="Conduct Monitoring Rules"
          description="Automated rules that continuously scan conduct signals and feed into entity risk profiles."
          actions={
            <div className="flex gap-2">
              <Button data-rbac="market_conduct.edit" variant="outline" onClick={runNow} disabled={running}>{running ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />} Run now</Button>
              <Button data-rbac="market_conduct.edit" onClick={() => setEdit({ name: '', rule_type: 'complaint_volume', scope: 'entity', frequency: 'daily', active: true, risk_delta: 5, definition: '{\n  "window_days": 30,\n  "threshold": 5\n}' })}>
                <Plus className="h-4 w-4 mr-1" /> New rule
              </Button>
            </div>
          }
        />
        <Card><CardContent className="p-0">
          {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
          : rows.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No rules yet.</div>
          : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead>Metric / threshold</TableHead>
                <TableHead>Lookback</TableHead><TableHead>Scope</TableHead>
                <TableHead>Frequency</TableHead><TableHead>Risk Δ</TableHead><TableHead>Version</TableHead><TableHead>Active</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>{rows.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.code || '—'}</TableCell>
                  <TableCell><div className="font-medium">{r.name}</div>{r.description && <div className="text-xs text-muted-foreground line-clamp-1">{r.description}</div>}</TableCell>
                  <TableCell className="text-xs">
                    {r.metric ? <><span className="font-mono">{r.metric}</span> {r.comparison_operator} {r.threshold_value}</> : <Badge variant="outline">{r.rule_type}</Badge>}
                  </TableCell>
                  <TableCell className="text-xs">{r.lookback_days != null ? `${r.lookback_days}d` : '—'}</TableCell>
                  <TableCell><Badge variant="outline">{r.scope}</Badge></TableCell>
                  <TableCell className="text-xs">{r.frequency}</TableCell>
                  <TableCell className="text-xs">{r.risk_delta}</TableCell>
                  <TableCell className="text-xs">v{r.current_version ?? 1}</TableCell>
                  <TableCell><Switch checked={r.active} onCheckedChange={() => toggle(r)} /></TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => openVersions(r)}><History className="h-3 w-3 mr-1" />Versions</Button>
                    <Button data-rbac="market_conduct.edit" size="sm" variant="ghost" onClick={() => setEdit({ ...r, definition: JSON.stringify(r.definition || {}, null, 2) })}>Edit</Button>
                  </TableCell>
                </TableRow>
              ))}</TableBody>

            </Table>
          )}
        </CardContent></Card>
      </div>

      <Dialog open={!!edit} onOpenChange={o => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{edit?.id ? 'Edit rule' : 'New monitoring rule'}</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label>Name</Label><Input value={edit.name} onChange={e => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea rows={2} value={edit.description || ''} onChange={e => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Rule type</Label><select className="w-full h-10 rounded-md border bg-background px-3" value={edit.rule_type} onChange={e => setEdit({ ...edit, rule_type: e.target.value })}>{RULE_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><Label>Scope</Label><select className="w-full h-10 rounded-md border bg-background px-3" value={edit.scope} onChange={e => setEdit({ ...edit, scope: e.target.value })}>{SCOPES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><Label>Frequency</Label><select className="w-full h-10 rounded-md border bg-background px-3" value={edit.frequency} onChange={e => setEdit({ ...edit, frequency: e.target.value })}>{FREQUENCIES.map(t => <option key={t}>{t}</option>)}</select></div>
                <div><Label>Risk delta (Δ score on match)</Label><Input type="number" value={edit.risk_delta} onChange={e => setEdit({ ...edit, risk_delta: e.target.value })} /></div>
              </div>
              <div className="flex items-center gap-2"><Switch checked={edit.active} onCheckedChange={v => setEdit({ ...edit, active: v })} /><Label>Active</Label></div>
              <div>
                <Label>Definition (JSON)</Label>
                <Textarea rows={8} className="font-mono text-xs" value={edit.definition} onChange={e => setEdit({ ...edit, definition: e.target.value })} />
                <p className="text-xs text-muted-foreground mt-1">Interpreted by the evaluate-conduct-monitoring function. Common keys: <code>window_days</code>, <code>threshold</code>, <code>severity_min</code>, <code>product_ids</code>.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button>
            <Button data-rbac="market_conduct.edit" onClick={save}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
