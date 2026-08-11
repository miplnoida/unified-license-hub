import { useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { HistoryButton } from '@/components/audit/HistoryButton';
import { toast } from 'sonner';
import { PlusCircle, Pencil, Trash2, Play, Loader2 } from 'lucide-react';

interface Rule {
  id: string; name: string; description: string | null;
  active: boolean; priority_order: number;
  match_mode: 'all' | 'any'; conditions: Condition[]; outputs: Outputs;
}

interface Condition {
  field: string;      // 'complaint_type' | 'product' | 'channel' | 'entity' | 'customer_vulnerability' | 'keywords' | 'repeat_count'
  op: string;         // 'eq' | 'in' | 'contains_any' | 'gte' | 'lte' | 'is_true'
  value: any;
}
interface Outputs {
  severity?: 'low' | 'medium' | 'high' | 'critical';
  priority?: 'p1' | 'p2' | 'p3' | 'p4';
  sla_days?: number;
  assigned_team?: string;
  conduct_risk_category_id?: string;
  conduct_risk_category_code?: string;
  generate_alert_kind?: string;
  alert_severity?: 'low' | 'medium' | 'high' | 'critical';
  alert_title?: string;
  alert_detail?: Record<string, unknown>;
  recommended_action?: string;
}

const FIELDS = [
  { v: 'complaint_type', l: 'Complaint Type (ID)' },
  { v: 'product', l: 'Product (ID)' },
  { v: 'channel', l: 'Channel (ID)' },
  { v: 'entity', l: 'Licensee / Entity (ID)' },
  { v: 'conduct_risk_category', l: 'Conduct Risk Category' },
  { v: 'customer_type', l: 'Customer Type' },
  { v: 'customer_vulnerability', l: 'Customer Vulnerability' },
  { v: 'keywords', l: 'Keywords (subject + description)' },
  { v: 'repeat_count', l: 'Repeat Complaint Count (12m)' },
  { v: 'sla_days', l: 'Current SLA days' },
  { v: 'sla_due_at', l: 'SLA Due At (date/time)' },
  { v: 'status', l: 'Complaint Status' },
  { v: 'severity', l: 'Current Severity' },
  { v: 'priority', l: 'Current Priority' },
  { v: 'assigned_team', l: 'Current Assigned Team' },
  { v: 'age_days', l: 'Complaint Age (days)' },
];

const COMMON_OPS = [
  { v: 'eq', l: 'equals' }, { v: 'neq', l: 'not equals' },
  { v: 'in', l: 'in' }, { v: 'not_in', l: 'not in' },
  { v: 'is_empty', l: 'is empty' }, { v: 'is_not_empty', l: 'is not empty' },
];
const NUM_OPS = [
  { v: 'eq', l: '=' }, { v: 'neq', l: '≠' },
  { v: 'gte', l: '≥' }, { v: 'lte', l: '≤' },
  { v: 'gt', l: '>' }, { v: 'lt', l: '<' },
  { v: 'is_empty', l: 'is empty' }, { v: 'is_not_empty', l: 'is not empty' },
];
const DATE_OPS = [
  { v: 'lt', l: 'before' }, { v: 'lte', l: 'on or before' },
  { v: 'gt', l: 'after' }, { v: 'gte', l: 'on or after' },
  { v: 'is_empty', l: 'is empty' }, { v: 'is_not_empty', l: 'is not empty' },
];
const TEXT_OPS = [
  ...COMMON_OPS,
  { v: 'contains_any', l: 'contains any of' },
  { v: 'contains_all', l: 'contains all of' },
];
const BOOL_OPS = [{ v: 'is_true', l: 'is true' }, { v: 'is_false', l: 'is false' }];

const OPS: Record<string, { v: string; l: string }[]> = {
  complaint_type: COMMON_OPS,
  product: COMMON_OPS,
  channel: COMMON_OPS,
  entity: COMMON_OPS,
  conduct_risk_category: COMMON_OPS,
  customer_type: COMMON_OPS,
  customer_vulnerability: BOOL_OPS,
  keywords: TEXT_OPS,
  repeat_count: NUM_OPS,
  sla_days: NUM_OPS,
  sla_due_at: DATE_OPS,
  status: COMMON_OPS,
  severity: COMMON_OPS,
  priority: COMMON_OPS,
  assigned_team: TEXT_OPS,
  age_days: NUM_OPS,
};

const NO_VALUE_OPS = new Set(['is_true', 'is_false', 'is_empty', 'is_not_empty']);
const LIST_OPS = new Set(['in', 'not_in', 'contains_any', 'contains_all']);
const NUM_FIELDS = new Set(['repeat_count', 'sla_days', 'age_days']);
const DATE_FIELDS = new Set(['sla_due_at']);
const STATUS_VALUES = ['submitted', 'under_investigation', 'resolved', 'closed', 'rejected'];

const SEVS = ['low', 'medium', 'high', 'critical'];
const PRIOS = ['p1', 'p2', 'p3', 'p4'];
const ALERT_KINDS = [
  'repeat_complaint', 'vulnerable_customer', 'critical_severity',
  'thematic_spike', 'sla_breach', 'sla_at_risk',
  'rule_triggered', 'high_risk_category',
];

export default function TriageRules() {
  const [rows, setRows] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [form, setForm] = useState<Rule>(emptyRule());
  const [saving, setSaving] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [categories, setCategories] = useState<Array<{ id: string; name: string; code: string | null }>>([]);
  const [defaultSeverity, setDefaultSeverity] = useState<string>('medium');
  const [savingDefault, setSavingDefault] = useState(false);

  function emptyRule(): Rule {
    return { id: '', name: '', description: '', active: true, priority_order: 100, match_mode: 'all', conditions: [], outputs: {} };
  }


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('conduct_triage_rules').select('*').order('priority_order');
    if (error) toast.error(error.message);
    setRows(((data || []) as unknown) as Rule[]);
    setLoading(false);
  };
  const loadCategories = async () => {
    const { data } = await supabase.from('conduct_risk_categories').select('id, name, code').order('name');
    setCategories((data || []) as any);
  };
  const loadDefaultSeverity = async () => {
    const { data } = await (supabase as any)
      .from('complaint_intake_rules')
      .select('default_severity')
      .is('regulator_id', null)
      .not('default_severity', 'is', null)
      .limit(1)
      .maybeSingle();
    if (data?.default_severity) setDefaultSeverity(data.default_severity);
  };
  const saveDefaultSeverity = async (next: string) => {
    setSavingDefault(true);
    setDefaultSeverity(next);
    const { error } = await (supabase as any)
      .from('complaint_intake_rules')
      .update({ default_severity: next })
      .is('regulator_id', null);
    setSavingDefault(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({
      action: 'complaint_default_severity_updated',
      entityType: 'complaint_intake_rules',
      entityId: 'default',
      metadata: { default_severity: next },
    });
    toast.success('Default severity saved');
  };
  useEffect(() => { load(); loadCategories(); loadDefaultSeverity(); }, []);

  const openNew = () => { setEditing(null); setForm(emptyRule()); setOpen(true); };
  const openEdit = (r: Rule) => {
    setEditing(r);
    setForm({ ...r, conditions: r.conditions || [], outputs: r.outputs || {} });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name required'); return; }
    setSaving(true);
    const payload: any = {
      name: form.name.trim(),
      description: form.description?.trim() || null,
      active: form.active,
      priority_order: form.priority_order,
      match_mode: form.match_mode,
      conditions: form.conditions,
      outputs: form.outputs,
    };
    const { data, error } = editing
      ? await supabase.from('conduct_triage_rules').update(payload).eq('id', editing.id).select('id').maybeSingle()
      : await supabase.from('conduct_triage_rules').insert(payload).select('id').maybeSingle();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({
      action: editing ? 'conduct_triage_rule_updated' : 'conduct_triage_rule_created',
      entityType: 'conduct_triage_rule',
      entityId: (editing?.id || data?.id) as string,
      metadata: { conditions: form.conditions, outputs: form.outputs },
    });
    toast.success('Rule saved'); setOpen(false); load();
  };

  const remove = async (r: Rule) => {
    if (!confirm(`Delete rule "${r.name}"?`)) return;
    const { error } = await supabase.from('conduct_triage_rules').delete().eq('id', r.id);
    if (error) return toast.error(error.message);
    await logAudit({ action: 'conduct_triage_rule_deleted', entityType: 'conduct_triage_rule', entityId: r.id });
    toast.success('Deleted'); load();
  };

  const toggle = async (r: Rule) => {
    const next = !r.active;
    const { error } = await supabase.from('conduct_triage_rules').update({ active: next }).eq('id', r.id);
    if (error) return toast.error(error.message);
    await logAudit({ action: 'conduct_triage_rule_toggled', entityType: 'conduct_triage_rule', entityId: r.id, metadata: { active: next } });
    load();
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Complaint Triage Rules"
          description="Declarative rules that classify complaints on intake — severity, SLA, assigned team, priority, and conduct-risk category."
          actions={
            <div className="flex gap-2">
              <Button data-rbac="market_conduct.edit" variant="outline" onClick={() => setSimOpen(true)}><Play className="h-4 w-4 mr-2" />Simulate</Button>
              <Button data-rbac="market_conduct.edit" onClick={openNew}><PlusCircle className="h-4 w-4 mr-2" />Add Rule</Button>
            </div>
          }
        />

        <Card>
          <CardContent className="p-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <Label className="text-sm">Default severity</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Applied to every complaint when no triage rule below matches. Complainants and staff cannot set severity themselves.
              </p>
            </div>
            <div className="w-full md:w-56">
              <Select value={defaultSeverity} onValueChange={saveDefaultSeverity} disabled={savingDefault}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['low', 'medium', 'high', 'critical'] as const).map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? <div className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div> : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Outputs</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono text-xs">{r.priority_order}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell><Badge variant="outline" className="uppercase">{r.match_mode}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{(r.conditions || []).length} cond.</TableCell>
                      <TableCell className="text-xs">
                        {[r.outputs?.severity && `sev=${r.outputs.severity}`, r.outputs?.priority, r.outputs?.sla_days && `SLA ${r.outputs.sla_days}d`, r.outputs?.assigned_team]
                          .filter(Boolean).join(' • ') || '—'}
                      </TableCell>
                      <TableCell><Switch checked={r.active} onCheckedChange={() => toggle(r)} /></TableCell>
                      <TableCell className="text-right">
                        <div className="inline-flex items-center gap-1">
                          <HistoryButton entityType="conduct_triage_rule" entityId={r.id} title={`History — ${r.name}`} />
                          <Button variant="ghost" size="sm" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <RuleEditor open={open} onOpenChange={setOpen} form={form} setForm={setForm} save={save} saving={saving} editing={editing} categories={categories} />
      <SimulateDialog open={simOpen} onOpenChange={setSimOpen} />
    </DashboardLayout>
  );
}

function RuleEditor({ open, onOpenChange, form, setForm, save, saving, editing, categories }: any) {
  const [detailText, setDetailText] = useState<string>(
    form.outputs?.alert_detail ? JSON.stringify(form.outputs.alert_detail, null, 2) : ''
  );
  const [detailErr, setDetailErr] = useState<string>('');
  useEffect(() => {
    setDetailText(form.outputs?.alert_detail ? JSON.stringify(form.outputs.alert_detail, null, 2) : '');
    setDetailErr('');
  }, [editing?.id]);
  const setCond = (i: number, patch: Partial<Condition>) => {
    const next = [...form.conditions];
    next[i] = { ...next[i], ...patch };
    setForm({ ...form, conditions: next });
  };
  const addCond = () => setForm({ ...form, conditions: [...form.conditions, { field: 'complaint_type', op: 'eq', value: '' }] });
  const rmCond = (i: number) => setForm({ ...form, conditions: form.conditions.filter((_: any, j: number) => j !== i) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>{editing ? 'Edit Rule' : 'Add Rule'}</DialogTitle></DialogHeader>
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Priority (lower runs first)</Label><Input type="number" value={form.priority_order} onChange={e => setForm({ ...form, priority_order: +e.target.value })} /></div>
          </div>
          <div><Label>Description</Label><Textarea value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} /></div>
          <div className="flex items-center gap-4">
            <div>
              <Label>Match mode</Label>
              <Select value={form.match_mode} onValueChange={(v: any) => setForm({ ...form, match_mode: v })}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">ALL</SelectItem><SelectItem value="any">ANY</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2"><Label>Active</Label><Switch checked={form.active} onCheckedChange={(v: boolean) => setForm({ ...form, active: v })} /></div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Conditions</Label>
              <Button data-rbac="market_conduct.edit" size="sm" variant="outline" onClick={addCond}><PlusCircle className="h-3 w-3 mr-1" />Add</Button>
            </div>
            {(form.conditions || []).map((c: Condition, i: number) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start border rounded p-2">
                <Select value={c.field} onValueChange={(v: string) => setCond(i, { field: v, op: OPS[v]?.[0]?.v || 'eq', value: '' })}>
                  <SelectTrigger className="col-span-4"><SelectValue /></SelectTrigger>
                  <SelectContent>{FIELDS.map(f => <SelectItem key={f.v} value={f.v}>{f.l}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={c.op} onValueChange={(v: string) => setCond(i, { op: v })}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent>{(OPS[c.field] || []).map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}</SelectContent>
                </Select>
                {NO_VALUE_OPS.has(c.op) ? (
                  <div className="col-span-4 text-xs text-muted-foreground pt-2">(no value)</div>
                ) : c.field === 'conduct_risk_category' && !LIST_OPS.has(c.op) ? (
                  <Select value={String(c.value ?? '')} onValueChange={(v: string) => setCond(i, { value: v })}>
                    <SelectTrigger className="col-span-4"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>{(categories || []).map((cat: any) => <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>)}</SelectContent>
                  </Select>
                ) : c.field === 'status' && !LIST_OPS.has(c.op) ? (
                  <Select value={String(c.value ?? '')} onValueChange={(v: string) => setCond(i, { value: v })}>
                    <SelectTrigger className="col-span-4"><SelectValue placeholder="Select status" /></SelectTrigger>
                    <SelectContent>{STATUS_VALUES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}</SelectContent>
                  </Select>
                ) : DATE_FIELDS.has(c.field) && !LIST_OPS.has(c.op) ? (
                  <Input
                    type="datetime-local"
                    className="col-span-4"
                    value={typeof c.value === 'string' && c.value ? new Date(c.value).toISOString().slice(0, 16) : ''}
                    onChange={e => setCond(i, { value: e.target.value ? new Date(e.target.value).toISOString() : '' })}
                  />
                ) : (
                  <Input
                    className="col-span-4"
                    placeholder={LIST_OPS.has(c.op) ? 'comma,separated,values' : 'value'}
                    value={Array.isArray(c.value) ? c.value.join(',') : (c.value ?? '')}
                    onChange={e => {
                      const raw = e.target.value;
                      const v = LIST_OPS.has(c.op)
                        ? raw.split(',').map(s => s.trim()).filter(Boolean)
                        : (NUM_FIELDS.has(c.field) ? (raw === '' ? '' : Number(raw)) : raw);
                      setCond(i, { value: v });
                    }}
                  />
                )}
                <Button size="sm" variant="ghost" className="col-span-1" onClick={() => rmCond(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            ))}
            {(form.conditions || []).length === 0 && <p className="text-xs text-muted-foreground">Rule with no conditions matches every complaint.</p>}
          </div>

          <div className="space-y-2 border-t pt-3">
            <Label className="text-sm">Outputs</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={form.outputs?.severity || 'none'} onValueChange={(v: any) => setForm({ ...form, outputs: { ...form.outputs, severity: v === 'none' ? undefined : v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">(leave as-is)</SelectItem>{SEVS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Priority</Label>
                <Select value={form.outputs?.priority || 'none'} onValueChange={(v: any) => setForm({ ...form, outputs: { ...form.outputs, priority: v === 'none' ? undefined : v } })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="none">(leave as-is)</SelectItem>{PRIOS.map(s => <SelectItem key={s} value={s} className="uppercase">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">SLA days</Label><Input type="number" value={form.outputs?.sla_days ?? ''} onChange={e => setForm({ ...form, outputs: { ...form.outputs, sla_days: e.target.value ? +e.target.value : undefined } })} /></div>
              <div><Label className="text-xs">Assigned team</Label><Input value={form.outputs?.assigned_team ?? ''} onChange={e => setForm({ ...form, outputs: { ...form.outputs, assigned_team: e.target.value || undefined } })} placeholder="e.g. Conduct-Retail" /></div>
              <div className="col-span-2 grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Conduct risk category</Label>
                  <Select
                    value={form.outputs?.conduct_risk_category_id || 'none'}
                    onValueChange={(v: string) => {
                      const cat = (categories || []).find((c: any) => c.id === v);
                      setForm({
                        ...form,
                        outputs: {
                          ...form.outputs,
                          conduct_risk_category_id: v === 'none' ? undefined : v,
                          conduct_risk_category_code: v === 'none' ? undefined : (cat?.code || undefined),
                        },
                      });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="(leave as-is)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">(leave as-is)</SelectItem>
                      {(categories || []).map((cat: any) => <SelectItem key={cat.id} value={cat.id}>{cat.name}{cat.code ? ` (${cat.code})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Category code (fallback)</Label>
                  <Input value={form.outputs?.conduct_risk_category_code ?? ''} onChange={e => setForm({ ...form, outputs: { ...form.outputs, conduct_risk_category_code: e.target.value.toUpperCase() || undefined } })} placeholder="MIS_SELLING" />
                </div>
              </div>

              <div className="col-span-2 border-t pt-3">
                <Label className="text-xs font-semibold">Alert generation</Label>
              </div>
              <div>
                <Label className="text-xs">Alert kind</Label>
                <Select value={form.outputs?.generate_alert_kind || 'none'} onValueChange={(v: string) => setForm({ ...form, outputs: { ...form.outputs, generate_alert_kind: v === 'none' ? undefined : v } })}>
                  <SelectTrigger><SelectValue placeholder="(no alert)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(no alert)</SelectItem>
                    {ALERT_KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Alert severity</Label>
                <Select value={form.outputs?.alert_severity || 'none'} onValueChange={(v: any) => setForm({ ...form, outputs: { ...form.outputs, alert_severity: v === 'none' ? undefined : v } })}>
                  <SelectTrigger><SelectValue placeholder="(default)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">(default)</SelectItem>
                    {SEVS.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Alert title</Label>
                <Input value={form.outputs?.alert_title ?? ''} onChange={e => setForm({ ...form, outputs: { ...form.outputs, alert_title: e.target.value || undefined } })} placeholder="Rule triggered: mis-selling risk" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Alert detail (JSON)</Label>
                <Textarea
                  rows={4}
                  className="font-mono text-xs"
                  value={detailText}
                  onChange={e => {
                    const raw = e.target.value;
                    setDetailText(raw);
                    if (!raw.trim()) {
                      setDetailErr('');
                      setForm({ ...form, outputs: { ...form.outputs, alert_detail: undefined } });
                      return;
                    }
                    try {
                      const parsed = JSON.parse(raw);
                      setDetailErr('');
                      setForm({ ...form, outputs: { ...form.outputs, alert_detail: parsed } });
                    } catch (err: any) {
                      setDetailErr(err.message);
                    }
                  }}
                  placeholder='{"note": "context for reviewers"}'
                />
                {detailErr && <p className="text-xs text-destructive mt-1">Invalid JSON: {detailErr}</p>}
              </div>
              <div className="col-span-2"><Label className="text-xs">Recommended action</Label><Input value={form.outputs?.recommended_action ?? ''} onChange={e => setForm({ ...form, outputs: { ...form.outputs, recommended_action: e.target.value || undefined } })} placeholder="Escalate to Conduct-Retail team" /></div>
            </div>
          </div>

          <Button onClick={save} disabled={saving || !!detailErr} className="w-full">{saving ? 'Saving…' : editing ? 'Update rule' : 'Create rule'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SimulateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [complaintId, setComplaintId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    if (!complaintId.trim()) return;
    setRunning(true); setResult(null);
    const { data, error } = await supabase.functions.invoke('evaluate-complaint-triage', {
      body: { complaint_id: complaintId.trim(), dry_run: true, triggered_by: 'admin.simulate' },
    });
    setRunning(false);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: 'conduct_triage_rule_simulated', entityType: 'complaint', entityId: complaintId.trim(), metadata: { dry_run: true, matched_rule_id: data?.matched_rule?.id ?? null } });
    setResult(data);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Simulate triage on complaint</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2"><Input value={complaintId} onChange={e => setComplaintId(e.target.value)} placeholder="Complaint UUID" /><Button onClick={run} disabled={running || !complaintId.trim()}>{running ? '…' : 'Run'}</Button></div>
          {result && (
            <Card><CardHeader><CardTitle className="text-sm">Result</CardTitle></CardHeader>
              <CardContent><pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-96">{JSON.stringify(result, null, 2)}</pre></CardContent></Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
