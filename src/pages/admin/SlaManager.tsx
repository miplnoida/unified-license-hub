import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { Trash2, Plus, Upload, GitBranch, ExternalLink, AlertTriangle } from 'lucide-react';

type SlaRow = {
  id: string;
  process_type: string;
  stage_name: string;
  sla_duration: number;
  sla_unit: 'hours' | 'days';
  warning_threshold_pct: number;
  pause_conditions: string | null;
  escalation_recipient: string | null;
  active: boolean;
};

type CalendarProfile = {
  id: string;
  name: string;
  description: string | null;
  working_days: number[];
  working_start_time: string;
  working_end_time: string;
  timezone: string;
  is_default: boolean;
};

type Holiday = { id: string; profile_id: string; holiday_date: string; name: string };

type EscalationTier = {
  id: string;
  process_type: string;
  tier: number;
  delay_days: number;
  recipients: string;
  notify_roles: string | null;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SlaManager() {
  const navigate = useNavigate();
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="SLA Manager"
          description="Configure SLA timers, business calendars, and escalation chains across workflow stages."
          actions={
            <Button variant="outline" onClick={() => navigate('/workflows')}>
              <GitBranch className="h-4 w-4 mr-2" /> Workflow Designer (ADM-WF-001)
            </Button>
          }
        />

        <Tabs defaultValue="sla">
          <TabsList>
            <TabsTrigger value="sla">SLA Configuration</TabsTrigger>
            <TabsTrigger value="calendar">Business Calendar</TabsTrigger>
            <TabsTrigger value="escalation">Escalation Chains</TabsTrigger>
            <TabsTrigger value="summary">Performance Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="sla" className="mt-4"><SlaConfigTab /></TabsContent>
          <TabsContent value="calendar" className="mt-4"><CalendarTab /></TabsContent>
          <TabsContent value="escalation" className="mt-4"><EscalationTab /></TabsContent>
          <TabsContent value="summary" className="mt-4"><SummaryTab /></TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/* -------------------- SLA Configuration -------------------- */

function SlaConfigTab() {
  const [rows, setRows] = useState<SlaRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('sla_configurations')
      .select('*')
      .order('process_type', { ascending: true })
      .order('stage_name', { ascending: true });
    if (error) toast({ title: 'Failed to load SLA configs', description: error.message, variant: 'destructive' });
    else setRows((data ?? []) as SlaRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const validate = (r: Partial<SlaRow>): string | null => {
    if (!r.process_type?.trim()) return 'Process Type is required';
    if (!r.stage_name?.trim()) return 'Stage Name is required';
    if (!r.sla_duration || r.sla_duration < 1) return 'SLA duration must be a positive integer (min 1 business hour)';
    if (r.sla_unit === 'hours' && r.sla_duration < 1) return 'Minimum SLA is 1 business hour';
    if (r.warning_threshold_pct == null || r.warning_threshold_pct < 1 || r.warning_threshold_pct > 100)
      return 'Warning threshold must be 1-100%';
    return null;
  };

  const saveRow = async (row: SlaRow) => {
    const err = validate(row);
    if (err) { toast({ title: 'Invalid SLA', description: err, variant: 'destructive' }); return; }
    const { error } = await (supabase as any).from('sla_configurations').update({
      process_type: row.process_type,
      stage_name: row.stage_name,
      sla_duration: row.sla_duration,
      sla_unit: row.sla_unit,
      warning_threshold_pct: row.warning_threshold_pct,
      pause_conditions: row.pause_conditions,
      escalation_recipient: row.escalation_recipient,
      active: row.active,
    }).eq('id', row.id);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit({
      action: 'ADMIN_SLA_UPDATED',
      entityType: 'sla_configuration',
      entityId: row.id,
      newValue: row as unknown as Record<string, unknown>,
      metadata: { process_type: row.process_type, stage_name: row.stage_name },
    });
    toast({ title: 'SLA updated', description: `${row.process_type} • ${row.stage_name}` });
  };

  const addRow = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const draft = {
      process_type: 'NEW_PROCESS',
      stage_name: 'New Stage',
      sla_duration: 8,
      sla_unit: 'hours',
      warning_threshold_pct: 75,
      active: true,
      created_by: user?.id ?? null,
    };
    const { data, error } = await (supabase as any).from('sla_configurations').insert(draft).select().single();
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    setRows(prev => [...prev, data as SlaRow]);
    await logAudit({ action: 'ADMIN_SLA_UPDATED', entityType: 'sla_configuration', entityId: (data as any).id, newValue: data, metadata: { created: true } });
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this SLA configuration?')) return;
    const { error } = await (supabase as any).from('sla_configurations').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setRows(prev => prev.filter(r => r.id !== id));
    await logAudit({ action: 'ADMIN_SLA_UPDATED', entityType: 'sla_configuration', entityId: id, metadata: { deleted: true } });
  };

  const update = (id: string, patch: Partial<SlaRow>) =>
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>SLA Configuration</CardTitle>
          <CardDescription>
            Changes apply only to new cases / stages entered after save. In-progress timers are unaffected.
          </CardDescription>
        </div>
        <Button onClick={addRow}><Plus className="h-4 w-4 mr-2" /> Add SLA</Button>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Process Type</TableHead>
                <TableHead>Stage Name</TableHead>
                <TableHead className="w-28">Duration</TableHead>
                <TableHead className="w-28">Unit</TableHead>
                <TableHead className="w-28">Warning %</TableHead>
                <TableHead>Pause Conditions</TableHead>
                <TableHead>Escalation Recipient</TableHead>
                <TableHead className="w-20">Active</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No SLA configurations yet. Click "Add SLA" to begin.</TableCell></TableRow>
              ) : rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell><Input value={row.process_type} onChange={e => update(row.id, { process_type: e.target.value })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell><Input value={row.stage_name} onChange={e => update(row.id, { stage_name: e.target.value })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell><Input type="number" min={1} value={row.sla_duration} onChange={e => update(row.id, { sla_duration: parseInt(e.target.value) || 0 })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell>
                    <Select value={row.sla_unit} onValueChange={(v: 'hours' | 'days') => { update(row.id, { sla_unit: v }); setTimeout(() => saveRow({ ...row, sla_unit: v }), 0); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={1} max={100} value={row.warning_threshold_pct} onChange={e => update(row.id, { warning_threshold_pct: parseInt(e.target.value) || 0 })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell><Input value={row.pause_conditions ?? ''} placeholder="e.g. awaiting_applicant" onChange={e => update(row.id, { pause_conditions: e.target.value })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell><Input value={row.escalation_recipient ?? ''} placeholder="role / email" onChange={e => update(row.id, { escalation_recipient: e.target.value })} onBlur={() => saveRow(row)} /></TableCell>
                  <TableCell><Checkbox checked={row.active} onCheckedChange={(v) => { update(row.id, { active: !!v }); setTimeout(() => saveRow({ ...row, active: !!v }), 0); }} /></TableCell>
                  <TableCell><Button size="icon" variant="ghost" onClick={() => deleteRow(row.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------- Business Calendar -------------------- */

function CalendarTab() {
  const [profiles, setProfiles] = useState<CalendarProfile[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newProfileName, setNewProfileName] = useState('');

  const active = useMemo(() => profiles.find(p => p.id === activeId) ?? null, [profiles, activeId]);

  const load = useCallback(async () => {
    const { data: profs } = await (supabase as any).from('business_calendar_profiles').select('*').order('name');
    const list = (profs ?? []) as CalendarProfile[];
    setProfiles(list);
    if (list.length && !activeId) setActiveId(list[0].id);
  }, [activeId]);

  const loadHolidays = useCallback(async (pid: string) => {
    const { data } = await (supabase as any).from('business_calendar_holidays').select('*').eq('profile_id', pid).order('holiday_date');
    setHolidays((data ?? []) as Holiday[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeId) loadHolidays(activeId); }, [activeId, loadHolidays]);

  const saveProfile = async () => {
    if (!active) return;
    const { error } = await (supabase as any).from('business_calendar_profiles').update({
      name: active.name,
      description: active.description,
      working_days: active.working_days,
      working_start_time: active.working_start_time,
      working_end_time: active.working_end_time,
      timezone: active.timezone,
    }).eq('id', active.id);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_profile', entityId: active.id, newValue: active as unknown as Record<string, unknown> });
    toast({ title: 'Calendar saved', description: active.name });
  };

  const createProfile = async () => {
    if (!newProfileName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await (supabase as any).from('business_calendar_profiles')
      .insert({ name: newProfileName.trim(), created_by: user?.id ?? null }).select().single();
    if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
    setNewProfileName('');
    await load();
    setActiveId((data as any).id);
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_profile', entityId: (data as any).id, metadata: { created: true } });
  };

  const toggleDay = (d: number) => {
    if (!active) return;
    const next = active.working_days.includes(d) ? active.working_days.filter(x => x !== d) : [...active.working_days, d].sort();
    setProfiles(prev => prev.map(p => p.id === active.id ? { ...p, working_days: next } : p));
  };

  const addHoliday = async () => {
    if (!active || !newHolidayDate || !newHolidayName.trim()) return;
    const d = new Date(newHolidayDate);
    if (isNaN(d.getTime())) { toast({ title: 'Invalid date', variant: 'destructive' }); return; }
    const { error } = await (supabase as any).from('business_calendar_holidays')
      .insert({ profile_id: active.id, holiday_date: newHolidayDate, name: newHolidayName.trim() });
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    setNewHolidayDate(''); setNewHolidayName('');
    loadHolidays(active.id);
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_holidays', entityId: active.id, metadata: { added: newHolidayDate } });
  };

  const deleteHoliday = async (id: string) => {
    await (supabase as any).from('business_calendar_holidays').delete().eq('id', id);
    if (active) loadHolidays(active.id);
  };

  const importCsv = async (file: File) => {
    if (!active) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const rows: { profile_id: string; holiday_date: string; name: string }[] = [];
    for (const line of lines) {
      const [date, ...nameParts] = line.split(',');
      const name = nameParts.join(',').trim();
      if (!date || !name) continue;
      const d = new Date(date.trim());
      if (isNaN(d.getTime())) continue;
      rows.push({ profile_id: active.id, holiday_date: d.toISOString().slice(0, 10), name });
    }
    if (!rows.length) { toast({ title: 'No valid rows in CSV', variant: 'destructive' }); return; }
    const { error } = await (supabase as any).from('business_calendar_holidays').upsert(rows, { onConflict: 'profile_id,holiday_date' });
    if (error) { toast({ title: 'Import failed', description: error.message, variant: 'destructive' }); return; }
    loadHolidays(active.id);
    toast({ title: 'Holidays imported', description: `${rows.length} entries` });
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_holidays', entityId: active.id, metadata: { imported: rows.length } });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Calendar Profiles</CardTitle>
          <CardDescription>e.g. BOJ Calendar, FSC Calendar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {profiles.map(p => (
            <div key={p.id} onClick={() => setActiveId(p.id)}
              className={`p-2 rounded border cursor-pointer ${activeId === p.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{p.name}</span>
                {p.is_default && <Badge variant="secondary">Default</Badge>}
              </div>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input placeholder="New profile name" value={newProfileName} onChange={e => setNewProfileName(e.target.value)} />
            <Button onClick={createProfile}><Plus className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{active?.name ?? 'Select a profile'}</CardTitle>
          <CardDescription className="flex items-center gap-2 text-warning">
            <AlertTriangle className="h-4 w-4" /> Calendar changes do not affect in-progress SLA timers.
          </CardDescription>
        </CardHeader>
        {active && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Name</Label>
                <Input value={active.name} onChange={e => setProfiles(prev => prev.map(p => p.id === active.id ? { ...p, name: e.target.value } : p))} />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input value={active.timezone} onChange={e => setProfiles(prev => prev.map(p => p.id === active.id ? { ...p, timezone: e.target.value } : p))} />
              </div>
              <div>
                <Label>Working Start</Label>
                <Input type="time" value={active.working_start_time?.slice(0, 5)} onChange={e => setProfiles(prev => prev.map(p => p.id === active.id ? { ...p, working_start_time: e.target.value } : p))} />
              </div>
              <div>
                <Label>Working End</Label>
                <Input type="time" value={active.working_end_time?.slice(0, 5)} onChange={e => setProfiles(prev => prev.map(p => p.id === active.id ? { ...p, working_end_time: e.target.value } : p))} />
              </div>
            </div>
            <div>
              <Label>Working Days</Label>
              <div className="flex gap-2 mt-2 flex-wrap">
                {DAY_LABELS.map((lbl, i) => (
                  <Button key={i} type="button" size="sm" variant={active.working_days.includes(i) ? 'default' : 'outline'} onClick={() => toggleDay(i)}>{lbl}</Button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Public Holidays</Label>
                <div>
                  <input id="hcsv" type="file" accept=".csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) importCsv(f); e.currentTarget.value = ''; }} />
                  <Button variant="outline" size="sm" onClick={() => document.getElementById('hcsv')?.click()}>
                    <Upload className="h-4 w-4 mr-2" /> Import CSV
                  </Button>
                </div>
              </div>
              <div className="flex gap-2 mb-2">
                <Input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)} />
                <Input placeholder="Holiday name" value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)} />
                <Button onClick={addHoliday}><Plus className="h-4 w-4" /></Button>
              </div>
              <div className="border rounded max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Name</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                  <TableBody>
                    {holidays.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No holidays yet</TableCell></TableRow>
                    ) : holidays.map(h => (
                      <TableRow key={h.id}>
                        <TableCell>{h.holiday_date}</TableCell>
                        <TableCell>{h.name}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" onClick={() => deleteHoliday(h.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveProfile}>Save Calendar</Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

/* -------------------- Escalation Chains -------------------- */

const TIER_DEFAULTS = [
  { tier: 1, label: 'Tier 1 — immediate breach', recipients: 'Assigned officer, Team lead' },
  { tier: 2, label: 'Tier 2 — breach + N days', recipients: 'Deputy Director' },
  { tier: 3, label: 'Tier 3 — escalation', recipients: 'Director' },
];

function EscalationTab() {
  const [tiers, setTiers] = useState<EscalationTier[]>([]);
  const [processType, setProcessType] = useState('');
  const [processOptions, setProcessOptions] = useState<string[]>([]);

  const load = useCallback(async () => {
    const { data: cfgs } = await (supabase as any).from('sla_configurations').select('process_type');
    const distinct = Array.from(new Set(((cfgs ?? []) as { process_type: string }[]).map(r => r.process_type))).sort();
    setProcessOptions(distinct);
    if (!processType && distinct.length) setProcessType(distinct[0]);
    const { data } = await (supabase as any).from('sla_escalation_tiers').select('*').order('process_type').order('tier');
    setTiers((data ?? []) as EscalationTier[]);
  }, [processType]);

  useEffect(() => { load(); }, [load]);

  const tiersForProcess = tiers.filter(t => t.process_type === processType);

  const upsertTier = async (tier: number, patch: Partial<EscalationTier>) => {
    const existing = tiersForProcess.find(t => t.tier === tier);
    if (existing) {
      const merged = { ...existing, ...patch };
      const { error } = await (supabase as any).from('sla_escalation_tiers').update({
        delay_days: merged.delay_days, recipients: merged.recipients, notify_roles: merged.notify_roles,
      }).eq('id', existing.id);
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      setTiers(prev => prev.map(t => t.id === existing.id ? merged : t));
    } else {
      const insert = {
        process_type: processType, tier, delay_days: patch.delay_days ?? 0,
        recipients: patch.recipients ?? TIER_DEFAULTS.find(d => d.tier === tier)?.recipients ?? '',
        notify_roles: patch.notify_roles ?? null,
      };
      const { data, error } = await (supabase as any).from('sla_escalation_tiers').insert(insert).select().single();
      if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
      setTiers(prev => [...prev, data as EscalationTier]);
    }
    await logAudit({ action: 'ADMIN_SLA_UPDATED', entityType: 'sla_escalation_tier', metadata: { process_type: processType, tier } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalation Chains</CardTitle>
        <CardDescription>Per process type — define tier delays and recipients.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Label>Process Type</Label>
          <Select value={processType || 'none'} onValueChange={v => setProcessType(v === 'none' ? '' : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select process type" /></SelectTrigger>
            <SelectContent>
              {processOptions.length === 0 ? <SelectItem value="none" disabled>No SLA configs yet</SelectItem> :
                processOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {processType && (
          <div className="space-y-3">
            {TIER_DEFAULTS.map(td => {
              const current = tiersForProcess.find(t => t.tier === td.tier);
              return (
                <Card key={td.tier} className="border-l-4 border-l-primary">
                  <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-1">
                      <Badge variant="outline">{td.label}</Badge>
                    </div>
                    <div>
                      <Label className="text-xs">Delay (days after breach)</Label>
                      <Input type="number" min={0} defaultValue={current?.delay_days ?? (td.tier === 1 ? 0 : td.tier)}
                        onBlur={e => upsertTier(td.tier, { delay_days: parseInt(e.target.value) || 0 })} />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Recipients (comma-separated emails or roles)</Label>
                      <Input defaultValue={current?.recipients ?? td.recipients}
                        onBlur={e => upsertTier(td.tier, { recipients: e.target.value })} />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* -------------------- Performance Summary -------------------- */

function SummaryTab() {
  const navigate = useNavigate();
  // Placeholder read-only widget. Real metrics live in DASH-OPS.
  const sample = [
    { process: 'License Application', onTime: 82, nearBreach: 11, breached: 7 },
    { process: 'Compliance Return', onTime: 76, nearBreach: 14, breached: 10 },
    { process: 'Complaint', onTime: 91, nearBreach: 5, breached: 4 },
  ];
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>SLA Performance Summary</CardTitle>
          <CardDescription>Read-only snapshot. Open DASH-OPS for full analytics.</CardDescription>
        </div>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          <ExternalLink className="h-4 w-4 mr-2" /> Open DASH-OPS
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Process Type</TableHead>
              <TableHead>% On-time</TableHead>
              <TableHead>Near-breach</TableHead>
              <TableHead>Breached</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sample.map(r => (
              <TableRow key={r.process}>
                <TableCell>{r.process}</TableCell>
                <TableCell><Badge className="bg-success/15 text-success border-success/30" variant="outline">{r.onTime}%</Badge></TableCell>
                <TableCell><Badge className="bg-warning/15 text-warning border-warning/30" variant="outline">{r.nearBreach}%</Badge></TableCell>
                <TableCell><Badge className="bg-destructive/15 text-destructive border-destructive/30" variant="outline">{r.breached}%</Badge></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
