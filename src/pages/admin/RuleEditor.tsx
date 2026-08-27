import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, History, Loader2, Play, Plus, RotateCcw, Save, Trash2, XCircle } from 'lucide-react';
import {
  ACTION_TYPES, EngineRule, OPERATORS, PATTERN_EVENT_TYPES, PATTERN_GROUPINGS,
  RULE_MODULES, RULE_TYPES, RuleAction, RuleConditions, RuleType, SCHEDULE_EVENTS,
  describeRule, emptyConditions, validateRule,
} from '@/lib/ruleEngine';
import { RuleTesterPanel } from '@/components/admin/rule-engine/RuleTesterPanel';


interface Option { value: string; label: string }

const SEVERITIES = ['low', 'medium', 'high', 'critical'];

export default function RuleEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isNew = !id || id === 'new';
  const tab = searchParams.get('tab') || 'configure';
  const setTab = (v: string) => setSearchParams(v === 'configure' ? {} : { tab: v }, { replace: true });

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [rule, setRule] = useState<Partial<EngineRule>>({
    name: '', description: '', rule_type: 'threshold', module: 'prudential',
    sub_module: '', tags: [], severity: 'medium',
    conditions: emptyConditions('threshold'), actions: [], suppression_days: 7,
    status: 'draft', version: 1, trigger_count: 0,
  });
  const [metrics, setMetrics] = useState<Option[]>([]);
  const [sectors, setSectors] = useState<Option[]>([]);
  const [roles, setRoles] = useState<Option[]>([]);
  const [events, setEvents] = useState<Option[]>([]);
  const [workflows, setWorkflows] = useState<Option[]>([]);
  const [owners, setOwners] = useState<Option[]>([]);
  const [versions, setVersions] = useState<any[]>([]);
  const [restoring, setRestoring] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testHistory, setTestHistory] = useState<any[]>([]);
  const [executions, setExecutions] = useState<any[]>([]);
  const [versionNote, setVersionNote] = useState('');



  useEffect(() => {
    (async () => {
      const [mRes, sRes, rRes, eRes, wRes, oRes] = await Promise.all([
        supabase.from('prudential_ratios' as any).select('ratio_key, label').eq('is_active', true).order('label'),
        supabase.from('sectors' as any).select('id, name').order('name'),
        supabase.from('roles' as any).select('name').order('name'),
        supabase.from('notification_event_configs' as any).select('event_key, description').eq('is_active', true).order('event_key'),
        supabase.from('approval_workflows' as any).select('id, name, current_published_version_id').eq('is_active', true).order('name'),
        supabase.rpc('engine_rule_owner_candidates' as any),
      ]);
      const seen = new Set<string>();
      setMetrics(((mRes.data as any[]) || []).filter((m) => {
        if (seen.has(m.ratio_key)) return false; seen.add(m.ratio_key); return true;
      }).map((m) => ({ value: m.ratio_key, label: `${m.label} (${m.ratio_key})` })));
      setSectors(((sRes.data as any[]) || []).map((s) => ({ value: s.id, label: s.name })));
      setRoles(((rRes.data as any[]) || []).map((r) => ({ value: r.name, label: r.name })));
      setEvents(((eRes.data as any[]) || []).map((e) => ({ value: e.event_key, label: e.event_key })));
      setWorkflows(((wRes.data as any[]) || []).filter((w) => w.current_published_version_id).map((w) => ({ value: w.id, label: w.name })));
      setOwners(((oRes.data as any[]) || []).map((p) => ({ value: p.user_id, label: p.full_name || p.email || p.user_id })));
    })();
  }, []);

  const loadRule = async () => {
    if (isNew) return;
    setLoading(true);
    const [{ data, error }, tests, execs, vers] = await Promise.all([
      supabase.from('engine_rules' as any).select('*').eq('id', id).maybeSingle(),
      supabase.from('engine_rule_tests' as any).select('*').eq('rule_id', id).order('created_at', { ascending: false }).limit(50),
      supabase.from('engine_rule_executions' as any).select('*').eq('rule_id', id).order('executed_at', { ascending: false }).limit(50),
      supabase.from('engine_rule_versions' as any).select('*').eq('rule_id', id).order('version', { ascending: false }),
    ]);
    if (error || !data) { toast.error(error?.message || 'Rule not found'); setLoading(false); return; }
    setRule(data as any);
    setTestHistory((tests.data as any[]) || []);
    setExecutions((execs.data as any[]) || []);
    setVersions((vers.data as any[]) || []);
    setLoading(false);
  };
  useEffect(() => { loadRule(); }, [id]);

  const c: RuleConditions = rule.conditions || {};
  const preds = c.predicates || [];
  const p0 = preds[0] || {};
  const setC = (patch: Partial<RuleConditions>) => setRule((r) => ({ ...r, conditions: { ...(r.conditions || {}), ...patch } }));
  const setP0 = (patch: Record<string, unknown>) =>
    setC({ predicates: [{ ...(preds[0] || {}), ...patch }, ...preds.slice(1)] });

  const sectorNames = useMemo(
    () => (c.sector_ids || []).map((sid) => sectors.find((s) => s.value === sid)?.label).filter(Boolean) as string[],
    [c.sector_ids, sectors],
  );
  const workflowNames = useMemo(
    () => Object.fromEntries(workflows.map((w) => [w.value, w.label])),
    [workflows],
  );
  const errors = validateRule({
    name: rule.name, rule_type: rule.rule_type as RuleType,
    conditions: c, actions: rule.actions || [],
  });
  const summary = describeRule({
    name: rule.name || '', rule_type: rule.rule_type as RuleType, severity: rule.severity as any,
    conditions: c, actions: rule.actions || [], suppression_days: Number(rule.suppression_days || 0),
  }, { sectorNames, workflowNames });

  const changeType = (t: RuleType) => setRule((r) => ({ ...r, rule_type: t, conditions: emptyConditions(t), }));

  const buildPayload = (intent: 'draft' | 'activate') => ({
    intent,
    name: rule.name, description: rule.description || null, rule_type: rule.rule_type,
    module: rule.module, sub_module: rule.sub_module || null, tags: rule.tags || [],
    severity: rule.severity, conditions: c, actions: rule.actions || [],
    suppression_days: Number(rule.suppression_days || 0),
    owner_user_id: (rule as any).owner_user_id || null,
    effective_from: (rule as any).effective_from || null,
    effective_to: (rule as any).effective_to || null,
    on_action_failure: (rule as any).on_action_failure || 'continue',
    version_note: versionNote.trim() || null,
  });

  const save = async (intent: 'draft' | 'activate' = 'draft') => {
    if (intent === 'activate' && errors.length) return toast.error(errors[0]);
    setSaving(true);
    const { data, error } = await supabase.rpc('engine_rule_save' as any, {
      _payload: buildPayload(intent) as any, _rule_id: isNew ? null : id,
    });
    setSaving(false);
    if (error) return toast.error(error.message === 'forbidden' ? 'You are not permitted to edit rules.' : error.message);
    const res = data as any;
    if (res?.ok === false) return toast.error((res.errors || ['Rule could not be saved'])[0]);
    const savedId = res?.rule?.id;
    toast.success(res?.new_version ? `Saved as version ${res.rule.version} (draft)` : isNew ? 'Rule created as draft' : 'Rule saved');
    setVersionNote('');
    if (isNew && savedId) navigate(`/admin/rule-engine/${savedId}`, { replace: true });
    else loadRule();
  };


  const restoreVersion = async (version: number) => {
    setRestoring(version);
    const { data, error } = await supabase.rpc('engine_rule_restore_version' as any, {
      _rule_id: id, _version: version, _note: `restored from v${version}`,
    });
    setRestoring(null);
    if (error) return toast.error(error.message);
    if ((data as any)?.ok === false) return toast.error('Restore failed');
    toast.success(`Version ${version} restored as a new draft version`);
    loadRule();
  };


  const runTest = async () => {
    if (isNew) return toast.error('Save the rule before testing.');
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('evaluate-engine-rules', {
        body: { dry_run: true, rule_id: id, limit: 25 },
      });
      if (error) throw error;
      setTestResult(data);
      if ((data as any)?.ok === false) toast.error((data as any).error || 'Test failed');
      else if ((data as any)?.passed) toast.success(`Test passed — ${(data as any).matched} of ${(data as any).candidates} records match`);
      else toast.warning('Test ran but did not pass: no evaluable data or errors were reported.');
      loadRule();
    } catch (e: any) {
      toast.error(e.message);
    }
    setTesting(false);
  };

  const activate = async () => {
    const { data, error } = await supabase.rpc('engine_rule_activate' as any, {
      _rule_id: id, _note: versionNote.trim() || null,
    });
    if (error) return toast.error(error.message === 'forbidden' ? 'You are not permitted to activate rules.' : error.message);
    const res = data as any;
    if (res?.ok === false) return toast.error((res.errors || ['Rule could not be activated'])[0]);
    toast.success('Rule activated');
    setVersionNote('');
    loadRule();
  };

  const addAction = () => setRule((r) => ({ ...r, actions: [...(r.actions || []), { type: 'generate_alert', template: '' }] }));
  const setAction = (i: number, patch: Partial<RuleAction>) =>
    setRule((r) => ({ ...r, actions: (r.actions || []).map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  const removeAction = (i: number) =>
    setRule((r) => ({ ...r, actions: (r.actions || []).filter((_, idx) => idx !== i) }));

  const metricSelect = (value: string | undefined, onChange: (v: string) => void, placeholder = 'Select metric') => (
    <Select value={value || ''} onValueChange={onChange}>
      <SelectTrigger><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {metrics.length === 0 && <SelectItem value="none" disabled>No calculated metrics configured</SelectItem>}
        {metrics.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  const operatorSelect = (value: string | undefined, onChange: (v: string) => void) => (
    <Select value={value || 'lt'} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );

  if (loading) {
    return <DashboardLayout><div className="p-16 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div></DashboardLayout>;
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title={isNew ? 'New Rule' : `${rule.rule_code} — ${rule.name}`}
          description={isNew ? 'Configure a supervisory rule, then test it before activation.' : `Version ${rule.version} · ${rule.status}`}
          actions={
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/rule-engine')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Library
              </Button>
              <Button data-rbac="rule_engine.edit" variant="outline" onClick={runTest} disabled={testing || isNew}>
                {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />} Test rule
              </Button>
              <Button data-rbac="rule_engine.edit" onClick={() => save('draft')} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />} Save draft
              </Button>
              {!isNew && rule.status !== 'active' && (
                <Button data-rbac="rule_engine.activate" variant="secondary" onClick={activate}>Activate</Button>
              )}
            </div>
          }
        />

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="configure">Configuration</TabsTrigger>
            <TabsTrigger value="test">Test (sandbox)</TabsTrigger>
            <TabsTrigger value="versions" disabled={isNew}>Version history</TabsTrigger>
            <TabsTrigger value="history" disabled={isNew}>Execution history</TabsTrigger>
          </TabsList>


          <TabsContent value="configure" className="space-y-4 pt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Identification</CardTitle></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div><Label>Rule name</Label>
                  <Input value={rule.name || ''} onChange={(e) => setRule({ ...rule, name: e.target.value })} /></div>
                <div><Label>Rule type</Label>
                  <Select value={rule.rule_type} onValueChange={(v) => changeType(v as RuleType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">{RULE_TYPES.find((t) => t.value === rule.rule_type)?.blurb}</p>
                </div>
                <div className="md:col-span-2"><Label>Description</Label>
                  <Textarea rows={2} value={rule.description || ''} onChange={(e) => setRule({ ...rule, description: e.target.value })} /></div>
                <div className="md:col-span-2"><Label>Change note {isNew ? '(optional)' : ''}</Label>
                  <Textarea rows={2} value={versionNote} onChange={(e) => setVersionNote(e.target.value)}
                    placeholder="Why is this change being made?" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Required when conditions, actions, severity, owner, effective dates or suppression change. Stored with the new version and the audit trail.
                  </p></div>
                <div><Label>If an action fails</Label>
                  <Select value={(rule as any).on_action_failure || 'continue'}
                    onValueChange={(v) => setRule({ ...rule, on_action_failure: v } as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="continue">Continue with the remaining actions</SelectItem>
                      <SelectItem value="stop">Stop and record the failure</SelectItem>
                    </SelectContent>
                  </Select></div>

                <div><Label>Module</Label>
                  <Select value={rule.module} onValueChange={(v) => setRule({ ...rule, module: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{RULE_MODULES.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, ' ')}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Sub-module (optional)</Label>
                  <Input value={rule.sub_module || ''} onChange={(e) => setRule({ ...rule, sub_module: e.target.value })} /></div>
                <div><Label>Severity</Label>
                  <Select value={rule.severity} onValueChange={(v) => setRule({ ...rule, severity: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label>Suppression window (days)</Label>
                  <Input type="number" min={0} value={rule.suppression_days ?? 0}
                    onChange={(e) => setRule({ ...rule, suppression_days: Number(e.target.value) })} />
                  <p className="text-xs text-muted-foreground mt-1">Critical severity always fires regardless of suppression.</p></div>
                <div><Label>Rule owner</Label>
                  <Select value={(rule as any).owner_user_id || 'none'}
                    onValueChange={(v) => setRule({ ...rule, owner_user_id: v === 'none' ? null : v } as any)}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Unassigned</SelectItem>
                      {owners.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Effective from</Label>
                    <Input type="date" value={(rule as any).effective_from || ''}
                      onChange={(e) => setRule({ ...rule, effective_from: e.target.value || null } as any)} /></div>
                  <div><Label>Effective to</Label>
                    <Input type="date" value={(rule as any).effective_to || ''}
                      onChange={(e) => setRule({ ...rule, effective_to: e.target.value || null } as any)} /></div>
                </div>
                <div className="md:col-span-2"><Label>Tags (comma separated)</Label>
                  <Input value={(rule.tags || []).join(', ')}
                    onChange={(e) => setRule({ ...rule, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></div>

              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Conditions</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {['threshold', 'trend', 'peer_comparison', 'macro_overlay', 'group_contagion', 'cross_field_validation'].includes(rule.rule_type as string) && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div><Label>Metric</Label>{metricSelect(p0.metric_key, (v) => setP0({ metric_key: v }))}</div>
                    {rule.rule_type === 'threshold' && (
                      <>
                        <div><Label>Operator</Label>{operatorSelect(p0.operator, (v) => setP0({ operator: v }))}</div>
                        <div><Label>Value</Label>
                          <Input type="number" value={String(p0.value ?? '')} onChange={(e) => setP0({ value: e.target.value })} /></div>
                      </>
                    )}
                    {rule.rule_type === 'cross_field_validation' && (
                      <>
                        <div><Label>Must be</Label>{operatorSelect(p0.operator, (v) => setP0({ operator: v }))}</div>
                        <div><Label>Compared metric</Label>{metricSelect(p0.compare_metric_key, (v) => setP0({ compare_metric_key: v }))}</div>
                      </>
                    )}
                    {rule.rule_type === 'trend' && (
                      <>
                        <div><Label>Direction</Label>
                          <Select value={c.direction || 'decreasing'} onValueChange={(v) => setC({ direction: v as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="decreasing">Decreasing</SelectItem>
                              <SelectItem value="increasing">Increasing</SelectItem>
                            </SelectContent>
                          </Select></div>
                        <div><Label>Consecutive periods</Label>
                          <Input type="number" min={2} value={c.periods ?? 3} onChange={(e) => setC({ periods: Number(e.target.value) })} /></div>
                        <div><Label>Period type</Label>
                          <Select value={c.period_type || 'quarterly'} onValueChange={(v) => setC({ period_type: v as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {['monthly', 'quarterly', 'annual'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                          </Select></div>
                        <div><Label>Minimum total movement (%)</Label>
                          <Input type="number" value={c.magnitude_pct ?? ''} onChange={(e) => setC({ magnitude_pct: Number(e.target.value) })} /></div>
                      </>
                    )}
                    {['peer_comparison', 'macro_overlay', 'group_contagion'].includes(rule.rule_type as string) && (
                      <div><Label>Deviation threshold (%)</Label>
                        <Input type="number" value={c.peer_deviation_pct ?? 0} onChange={(e) => setC({ peer_deviation_pct: Number(e.target.value) })} /></div>
                    )}
                    {rule.rule_type === 'group_contagion' && (
                      <div><Label>Minimum group members breaching</Label>
                        <Input type="number" min={2} value={c.min_group_members ?? 2} onChange={(e) => setC({ min_group_members: Number(e.target.value) })} /></div>
                    )}
                  </div>
                )}

                {['pattern_detection', 'recurrence'].includes(rule.rule_type as string) && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div><Label>Event type</Label>
                      <Select value={c.event_type || 'complaint'} onValueChange={(v) => setC({ event_type: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PATTERN_EVENT_TYPES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div><Label>Count threshold</Label>
                      <Input type="number" min={1} value={c.count_threshold ?? 2} onChange={(e) => setC({ count_threshold: Number(e.target.value) })} /></div>
                    <div><Label>Rolling window (days, min 7)</Label>
                      <Input type="number" min={7} value={c.window_days ?? 30} onChange={(e) => setC({ window_days: Number(e.target.value) })} /></div>
                    <div><Label>Group by</Label>
                      <Select value={c.group_by || 'entity'} onValueChange={(v) => setC({ group_by: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{PATTERN_GROUPINGS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div><Label>Comparison</Label>
                      <Select value={c.comparison || 'absolute'} onValueChange={(v) => setC({ comparison: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="absolute">Absolute count</SelectItem>
                          <SelectItem value="sector_average">Against sector average</SelectItem>
                        </SelectContent>
                      </Select></div>
                  </div>
                )}

                {rule.rule_type === 'sla' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div><Label>Workflow (optional)</Label>
                      <Select value={c.workflow_id || ''} onValueChange={(v) => setC({ workflow_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Any workflow" /></SelectTrigger>
                        <SelectContent>{workflows.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
                      </Select></div>
                    <div><Label>Stage key (optional)</Label>
                      <Input value={c.stage || ''} onChange={(e) => setC({ stage: e.target.value })} placeholder="e.g. review" /></div>
                    <div><Label>Allowed duration (hours)</Label>
                      <Input type="number" min={1} value={c.duration_hours ?? 72} onChange={(e) => setC({ duration_hours: Number(e.target.value) })} /></div>
                    <div><Label>Warning at (% of limit)</Label>
                      <Input type="number" value={c.warning_pct ?? 80} onChange={(e) => setC({ warning_pct: Number(e.target.value) })} /></div>
                  </div>
                )}

                {rule.rule_type === 'condition_monitoring' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div><Label>Alert this many days before the deadline</Label>
                      <Input type="number" min={1} value={c.days_before ?? 14} onChange={(e) => setC({ days_before: Number(e.target.value) })} /></div>
                  </div>
                )}

                {rule.rule_type === 'routing' && (
                  <div className="space-y-3">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div><Label>Match logic</Label>
                        <Select value={c.logic || 'AND'} onValueChange={(v) => setC({ logic: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent><SelectItem value="AND">All conditions (AND)</SelectItem><SelectItem value="OR">Any condition (OR)</SelectItem></SelectContent>
                        </Select></div>
                      <div><Label>Destination type</Label>
                        <Select value={c.destination_type || 'role'} onValueChange={(v) => setC({ destination_type: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{['role', 'team', 'user', 'queue'].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                        </Select></div>
                      <div><Label>Destination</Label>
                        <Input value={c.destination || ''} onChange={(e) => setC({ destination: e.target.value })} /></div>
                    </div>
                    {preds.map((p, i) => (
                      <div key={i} className="grid gap-3 md:grid-cols-4 items-end">
                        <div><Label>Field</Label>
                          <Select value={p.field || ''} onValueChange={(v) => setC({ predicates: preds.map((x, ix) => ix === i ? { ...x, field: v } : x) })}>
                            <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                            <SelectContent>
                              {['severity', 'priority', 'assigned_team'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                            </SelectContent>
                          </Select></div>
                        <div><Label>Operator</Label>
                          {operatorSelect(p.operator, (v) => setC({ predicates: preds.map((x, ix) => ix === i ? { ...x, operator: v as any } : x) }))}</div>
                        <div><Label>Value</Label>
                          <Input value={String(p.value ?? '')} onChange={(e) => setC({ predicates: preds.map((x, ix) => ix === i ? { ...x, value: e.target.value } : x) })} /></div>
                        <Button variant="ghost" size="sm" className="text-destructive"
                          onClick={() => setC({ predicates: preds.filter((_, ix) => ix !== i) })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button data-rbac="rule_engine.edit" variant="outline" size="sm" onClick={() => setC({ predicates: [...preds, { field: '', operator: 'eq', value: '' }] })}>
                      <Plus className="h-4 w-4 mr-1" /> Add condition
                    </Button>
                  </div>
                )}

                {rule.rule_type === 'scheduling' && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div><Label>Trigger mode</Label>
                      <Select value={c.schedule_mode || 'calendar'} onValueChange={(v) => setC({ schedule_mode: v as any })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="calendar">Calendar schedule</SelectItem>
                          <SelectItem value="event">System event</SelectItem>
                        </SelectContent>
                      </Select></div>
                    {c.schedule_mode === 'event' ? (
                      <>
                        <div><Label>Event</Label>
                          <Select value={c.event || ''} onValueChange={(v) => setC({ event: v })}>
                            <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                            <SelectContent>{SCHEDULE_EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                          </Select></div>
                        <div><Label>Days before (where applicable)</Label>
                          <Input type="number" value={c.days_before ?? 30} onChange={(e) => setC({ days_before: Number(e.target.value) })} /></div>
                      </>
                    ) : (
                      <>
                        <div><Label>Frequency</Label>
                          <Select value={c.frequency || 'monthly'} onValueChange={(v) => setC({ frequency: v as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>{['daily', 'weekly', 'monthly', 'quarterly', 'annual'].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                          </Select></div>
                        <div><Label>Day offset</Label>
                          <Input type="number" value={c.day_offset ?? 0} onChange={(e) => setC({ day_offset: Number(e.target.value) })} /></div>
                      </>
                    )}
                  </div>
                )}

                <div>
                  <Label>Sector scope {['threshold', 'trend', 'peer_comparison', 'macro_overlay', 'group_contagion'].includes(rule.rule_type as string) && <span className="text-destructive">*</span>}</Label>
                  <div className="grid gap-2 md:grid-cols-3 mt-2">
                    {sectors.map((s) => {
                      const checked = (c.sector_ids || []).includes(s.value);
                      return (
                        <label key={s.value} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={checked} onCheckedChange={(v) => setC({
                            sector_ids: v ? [...(c.sector_ids || []), s.value] : (c.sector_ids || []).filter((x) => x !== s.value),
                          })} />
                          {s.label}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Actions on trigger</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {(rule.actions || []).length === 0 && (
                  <p className="text-sm text-muted-foreground">At least one action is required before the rule can be saved.</p>
                )}
                {(rule.actions || []).map((a, i) => (
                  <div key={i} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <Select value={a.type} onValueChange={(v) => setAction(i, { type: v })}>
                        <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                        <SelectContent>{ACTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button variant="ghost" size="sm" className="text-destructive ml-auto" onClick={() => removeAction(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {a.type === 'generate_alert' && (
                      <div><Label>Alert text</Label>
                        <Input value={a.template || ''} onChange={(e) => setAction(i, { template: e.target.value })}
                          placeholder="{{entity}} breached {{metric}} at {{value}}" />
                        <p className="text-xs text-muted-foreground mt-1">Placeholders: {'{{entity}}'}, {'{{metric}}'}, {'{{value}}'}, {'{{rule_code}}'}.</p>
                      </div>
                    )}
                    {a.type === 'send_notification' && (
                      <div className="grid gap-3 md:grid-cols-2">
                        <div><Label>Notification event</Label>
                          <Select value={a.event_key || ''} onValueChange={(v) => setAction(i, { event_key: v })}>
                            <SelectTrigger><SelectValue placeholder="Select event" /></SelectTrigger>
                            <SelectContent>{events.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
                          </Select></div>
                        <div><Label>Recipient role (optional)</Label>
                          <Select value={a.recipient_role || ''} onValueChange={(v) => setAction(i, { recipient_role: v })}>
                            <SelectTrigger><SelectValue placeholder="Use event recipients" /></SelectTrigger>
                            <SelectContent>{roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                          </Select></div>
                      </div>
                    )}
                    {a.type === 'create_task' && (
                      <div className="grid gap-3 md:grid-cols-3">
                        <div><Label>Assigned role</Label>
                          <Select value={a.assigned_role || ''} onValueChange={(v) => setAction(i, { assigned_role: v })}>
                            <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent>{roles.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                          </Select></div>
                        <div><Label>Due in (days)</Label>
                          <Input type="number" value={a.due_in_days ?? 7} onChange={(e) => setAction(i, { due_in_days: Number(e.target.value) })} /></div>
                        <div><Label>Task title</Label>
                          <Input value={a.template || ''} onChange={(e) => setAction(i, { template: e.target.value })} /></div>
                      </div>
                    )}
                    {a.type === 'update_risk_status' && (
                      <div className="md:w-64"><Label>Risk band</Label>
                        <Select value={a.risk_status || 'medium'} onValueChange={(v) => setAction(i, { risk_status: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select></div>
                    )}
                    {a.type === 'initiate_workflow' && (
                      <div className="md:w-96"><Label>Workflow (published only)</Label>
                        <Select value={a.workflow_id || ''} onValueChange={(v) => setAction(i, { workflow_id: v, workflow_name: workflowNames[v] })}>
                          <SelectTrigger><SelectValue placeholder="Select workflow" /></SelectTrigger>
                          <SelectContent>{workflows.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
                        </Select></div>
                    )}
                  </div>
                ))}
                <Button data-rbac="rule_engine.edit" variant="outline" size="sm" onClick={addAction}>
                  <Plus className="h-4 w-4 mr-1" /> Add action
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Plain-language summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm">{summary}</p>
                {errors.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-1">
                    {errors.map((e) => (
                      <div key={e} className="flex items-start gap-2 text-xs text-destructive">
                        <AlertTriangle className="h-3.5 w-3.5 mt-0.5" /> {e}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="test" className="space-y-4 pt-4">
            <RuleTesterPanel
              ruleId={isNew ? undefined : id}
              isNew={isNew}
              ruleCode={rule.rule_code}
              currentVersion={rule.version}
              activeVersion={(rule as any).active_version ?? null}
              versions={versions as any}
              history={testHistory}
              onRan={loadRule}
            />
          </TabsContent>


          <TabsContent value="versions" className="pt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Version history</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Versions are immutable. Restoring a version copies its configuration into a new draft
                  version — no historical record is altered or deleted.
                </p>
                {versions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Only version {rule.version} exists. Editing an active rule creates the next version.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>Version</TableHead><TableHead>Snapshot taken</TableHead>
                        <TableHead>Name at the time</TableHead><TableHead>Type</TableHead>
                        <TableHead>Severity</TableHead><TableHead>Note</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {versions.map((v) => {
                          const s = v.snapshot || {};
                          return (
                            <TableRow key={v.id}>
                              <TableCell className="font-mono text-xs">
                                v{v.version}{v.version === rule.version && <Badge variant="outline" className="ml-2">current</Badge>}
                              </TableCell>
                              <TableCell className="text-xs font-mono">{new Date(v.created_at).toLocaleString()}</TableCell>
                              <TableCell className="text-sm">{s.name || '—'}</TableCell>
                              <TableCell className="text-xs">{RULE_TYPES.find((t) => t.value === s.rule_type)?.label || s.rule_type || '—'}</TableCell>
                              <TableCell className="text-xs capitalize">{s.severity || '—'}</TableCell>
                              <TableCell className="text-xs">{v.note || '—'}</TableCell>
                              <TableCell className="text-right">
                                <Button data-rbac="rule_engine.edit" size="sm" variant="ghost"
                                  disabled={restoring !== null || v.version === rule.version}
                                  onClick={() => restoreVersion(v.version)}>
                                  {restoring === v.version
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <><RotateCcw className="h-4 w-4 mr-1" /> Restore as new</>}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {!isNew && (
                  <Button variant="ghost" size="sm" className="text-xs px-0" onClick={() => setTab('history')}>
                    <History className="h-3.5 w-3.5 mr-1" /> View execution history
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>



          <TabsContent value="history" className="pt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Execution history</CardTitle></CardHeader>
              <CardContent>
                {executions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This rule has not executed yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead>When</TableHead><TableHead>Entity</TableHead><TableHead>Outcome</TableHead>
                        <TableHead>Why</TableHead><TableHead>Actions taken</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {executions.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="text-xs font-mono">{new Date(e.executed_at).toLocaleString()}</TableCell>
                            <TableCell className="text-sm">{e.entity_label || '—'}</TableCell>
                            <TableCell>
                              {e.suppressed ? <Badge variant="outline">Suppressed</Badge>
                                : e.matched ? <Badge variant="approved">Matched</Badge>
                                : <Badge variant="outline">No match</Badge>}
                            </TableCell>
                            <TableCell className="text-xs">{e.reason}</TableCell>
                            <TableCell className="text-xs">
                              {(e.actions_taken || []).length === 0 ? '—'
                                : (e.actions_taken as any[]).map((a, i) => <div key={i}>{a.type}</div>)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
