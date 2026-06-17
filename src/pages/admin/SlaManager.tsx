import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { logAudit } from '@/hooks/useAuditLog';
import { notifySlaChange } from '@/lib/slaNotifications';
import { Trash2, Plus, Upload, GitBranch, ExternalLink, AlertTriangle, Info } from 'lucide-react';

/* -------------------- Types -------------------- */

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

type Assignment = { id: string; profile_id: string; process_type: string };

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIER_DEFAULTS: Array<{ tier: number; label: string; delay_days: number; recipients: string }> = [
  { tier: 1, label: 'Tier 1 — immediate', delay_days: 0, recipients: 'assigned_officer, team_lead' },
  { tier: 2, label: 'Tier 2 — escalation', delay_days: 3, recipients: 'deputy_director' },
  { tier: 3, label: 'Tier 3 — senior escalation', delay_days: 7, recipients: 'director' },
];

const RetroNotice = () => (
  <Alert className="mb-4">
    <Info className="h-4 w-4" />
    <AlertTitle>Forward-only</AlertTitle>
    <AlertDescription>
      SLA, calendar and escalation changes apply only to new cases and newly entered workflow
      stages. In-progress timers are not retroactively recalculated.
    </AlertDescription>
  </Alert>
);

/* -------------------- Page -------------------- */

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
              <GitBranch className="h-4 w-4 mr-2" /> Workflow Designer
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
  // Freshest row keyed by id so onBlur reads up-to-date values (no stale closure).
  const latestRef = useRef<Record<string, SlaRow>>({});
  // JSON snapshot of last successfully-persisted row state — drives no-op detection.
  const lastPersisted = useRef<Record<string, string>>({});

  const syncLatest = (list: SlaRow[]) => {
    latestRef.current = Object.fromEntries(list.map(r => [r.id, r]));
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('sla_configurations')
      .select('*')
      .order('process_type', { ascending: true })
      .order('stage_name', { ascending: true });
    if (error) toast({ title: 'Failed to load SLA configs', description: error.message, variant: 'destructive' });
    else {
      const list = (data ?? []) as unknown as SlaRow[];
      setRows(list);
      syncLatest(list);
      // Initialise persisted snapshots so the first onBlur after load is a no-op.
      lastPersisted.current = Object.fromEntries(list.map(r => [r.id, JSON.stringify(r)]));
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const validate = (r: Partial<SlaRow>): string | null => {
    if (!r.process_type?.trim()) return 'Process Type is required';
    if (!r.stage_name?.trim()) return 'Stage Name is required';
    if (!Number.isInteger(r.sla_duration) || (r.sla_duration ?? 0) < 1) return 'SLA duration must be a positive integer (min 1 business hour)';
    if (r.warning_threshold_pct == null || r.warning_threshold_pct < 1 || r.warning_threshold_pct > 100)
      return 'Warning threshold must be 1-100%';
    return null;
  };

  const saveRow = async (id: string) => {
    const row = latestRef.current[id];
    if (!row) return;
    const snapshot = JSON.stringify(row);
    // No-op guard — applies to onBlur from inputs/selects/checkboxes alike.
    if (lastPersisted.current[id] === snapshot) return;

    const err = validate(row);
    if (err) { toast({ title: 'Invalid SLA', description: err, variant: 'destructive' }); return; }

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('sla_configurations').update({
      process_type: row.process_type,
      stage_name: row.stage_name,
      sla_duration: row.sla_duration,
      sla_unit: row.sla_unit,
      warning_threshold_pct: row.warning_threshold_pct,
      pause_conditions: row.pause_conditions,
      escalation_recipient: row.escalation_recipient,
      active: row.active,
      updated_by: user?.id ?? null,
    }).eq('id', row.id);

    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    lastPersisted.current[id] = snapshot;

    await logAudit({
      action: 'ADMIN_SLA_UPDATED',
      entityType: 'sla_configuration',
      entityId: row.id,
      newValue: row as unknown as Record<string, unknown>,
      metadata: { process_type: row.process_type, stage_name: row.stage_name },
    });

    void notifySlaChange({
      process_type: row.process_type,
      entity_id: row.id,
      change_summary: `${row.stage_name}: ${row.sla_duration} ${row.sla_unit}, warn ${row.warning_threshold_pct}%, active=${row.active}`,
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
      updated_by: user?.id ?? null,
    };
    const { data, error } = await supabase.from('sla_configurations').insert(draft).select().single();
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    const newRow = data as unknown as SlaRow;
    setRows(prev => {
      const next = [...prev, newRow];
      syncLatest(next);
      return next;
    });
    lastPersisted.current[newRow.id] = JSON.stringify(newRow);
    await logAudit({ action: 'ADMIN_SLA_UPDATED', entityType: 'sla_configuration', entityId: newRow.id, newValue: newRow as unknown as Record<string, unknown>, metadata: { created: true } });
  };

  const deleteRow = async (id: string) => {
    if (!confirm('Delete this SLA configuration?')) return;
    const { error } = await supabase.from('sla_configurations').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', description: error.message, variant: 'destructive' }); return; }
    setRows(prev => {
      const next = prev.filter(r => r.id !== id);
      syncLatest(next);
      return next;
    });
    delete lastPersisted.current[id];
    await logAudit({ action: 'ADMIN_SLA_UPDATED', entityType: 'sla_configuration', entityId: id, metadata: { deleted: true } });
  };

  // Update local state and (when requested) immediately persist using latestRef
  // so Select/Checkbox changes never read stale state.
  const update = (id: string, patch: Partial<SlaRow>, persistNow = false) => {
    setRows(prev => {
      const next = prev.map(r => r.id === id ? { ...r, ...patch } : r);
      syncLatest(next);
      return next;
    });
    if (persistNow) {
      // latestRef updated synchronously inside syncLatest above
      const merged = { ...(latestRef.current[id]) };
      latestRef.current[id] = merged;
      void saveRow(id);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>SLA Configuration</CardTitle>
          <CardDescription>Per process-type / stage. Edits save on blur; toggles save immediately.</CardDescription>
        </div>
        <Button onClick={addRow}><Plus className="h-4 w-4 mr-2" /> Add SLA</Button>
      </CardHeader>
      <CardContent>
        <RetroNotice />
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
                  <TableCell><Input value={row.process_type} onChange={e => update(row.id, { process_type: e.target.value })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell><Input value={row.stage_name} onChange={e => update(row.id, { stage_name: e.target.value })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell><Input type="number" min={1} value={row.sla_duration} onChange={e => update(row.id, { sla_duration: parseInt(e.target.value) || 0 })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell>
                    <Select value={row.sla_unit} onValueChange={(v: 'hours' | 'days') => update(row.id, { sla_unit: v }, true)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell><Input type="number" min={1} max={100} value={row.warning_threshold_pct} onChange={e => update(row.id, { warning_threshold_pct: parseInt(e.target.value) || 0 })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell><Input value={row.pause_conditions ?? ''} placeholder="e.g. awaiting_applicant" onChange={e => update(row.id, { pause_conditions: e.target.value })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell><Input value={row.escalation_recipient ?? ''} placeholder="role / email" onChange={e => update(row.id, { escalation_recipient: e.target.value })} onBlur={() => saveRow(row.id)} /></TableCell>
                  <TableCell><Checkbox checked={row.active} onCheckedChange={(v) => update(row.id, { active: !!v }, true)} /></TableCell>
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
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [processOptions, setProcessOptions] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newProfileName, setNewProfileName] = useState('');

  const active = useMemo(() => profiles.find(p => p.id === activeId) ?? null, [profiles, activeId]);
  const assignedHere = useMemo(
    () => assignments.filter(a => a.profile_id === activeId).map(a => a.process_type),
    [assignments, activeId],
  );

  const load = useCallback(async () => {
    const [{ data: profs }, { data: cfgs }, { data: asn }] = await Promise.all([
      supabase.from('business_calendar_profiles').select('*').order('name'),
      supabase.from('sla_configurations').select('process_type'),
      supabase.from('business_calendar_process_assignments').select('*'),
    ]);
    const list = (profs ?? []) as unknown as CalendarProfile[];
    setProfiles(list);
    setAssignments((asn ?? []) as unknown as Assignment[]);
    setProcessOptions(Array.from(new Set(((cfgs ?? []) as { process_type: string }[]).map(r => r.process_type))).sort());
    setActiveId(prev => prev ?? list[0]?.id ?? null);
  }, []);

  const loadHolidays = useCallback(async (pid: string) => {
    const { data } = await supabase.from('business_calendar_holidays').select('*').eq('profile_id', pid).order('holiday_date');
    setHolidays((data ?? []) as unknown as Holiday[]);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeId) loadHolidays(activeId); }, [activeId, loadHolidays]);

  const validateProfile = (p: CalendarProfile): string | null => {
    if (!p.name.trim()) return 'Name is required';
    if (!p.working_start_time || !p.working_end_time) return 'Working start and end times are required';
    if (p.working_start_time >= p.working_end_time) return 'Working start time must be before end time';
    if (!Array.isArray(p.working_days) || p.working_days.length < 1 || p.working_days.length > 7) return 'Working days must be 1-7 valid days';
    if (p.working_days.some(d => d < 0 || d > 6)) return 'Working day values must be 0 (Sun) through 6 (Sat)';
    return null;
  };

  const saveProfile = async () => {
    if (!active) return;
    const err = validateProfile(active);
    if (err) { toast({ title: 'Invalid calendar', description: err, variant: 'destructive' }); return; }
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('business_calendar_profiles').update({
      name: active.name,
      description: active.description,
      working_days: active.working_days,
      working_start_time: active.working_start_time,
      working_end_time: active.working_end_time,
      timezone: active.timezone,
      updated_by: user?.id ?? null,
    }).eq('id', active.id);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_profile', entityId: active.id, newValue: active as unknown as Record<string, unknown> });
    toast({ title: 'Calendar saved', description: active.name });
  };

  const createProfile = async () => {
    if (!newProfileName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('business_calendar_profiles')
      .insert({ name: newProfileName.trim(), created_by: user?.id ?? null }).select().single();
    if (error) { toast({ title: 'Create failed', description: error.message, variant: 'destructive' }); return; }
    setNewProfileName('');
    await load();
    setActiveId((data as { id: string }).id);
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_profile', entityId: (data as { id: string }).id, metadata: { created: true } });
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
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('business_calendar_holidays')
      .insert({ profile_id: active.id, holiday_date: newHolidayDate, name: newHolidayName.trim(), created_by: user?.id ?? null });
    if (error) { toast({ title: 'Add failed', description: error.message, variant: 'destructive' }); return; }
    setNewHolidayDate(''); setNewHolidayName('');
    loadHolidays(active.id);
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_holidays', entityId: active.id, metadata: { added: newHolidayDate } });
  };

  const deleteHoliday = async (id: string) => {
    await supabase.from('business_calendar_holidays').delete().eq('id', id);
    if (active) loadHolidays(active.id);
  };

  const importCsv = async (file: File) => {
    if (!active) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const valid: { profile_id: string; holiday_date: string; name: string }[] = [];
    const invalid: { line: number; reason: string; raw: string }[] = [];
    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const [date, ...nameParts] = line.split(',');
      const name = nameParts.join(',').trim();
      if (!date || !name) { invalid.push({ line: lineNo, reason: 'missing date or name', raw: line }); return; }
      const d = new Date(date.trim());
      if (isNaN(d.getTime())) { invalid.push({ line: lineNo, reason: `unparseable date "${date.trim()}"`, raw: line }); return; }
      valid.push({ profile_id: active.id, holiday_date: d.toISOString().slice(0, 10), name });
    });
    if (valid.length === 0) {
      toast({
        title: 'No valid rows in CSV',
        description: invalid.length ? `All ${invalid.length} rows invalid. First: line ${invalid[0].line} — ${invalid[0].reason}` : 'File is empty',
        variant: 'destructive',
      });
      return;
    }
    const { error } = await supabase.from('business_calendar_holidays').upsert(valid, { onConflict: 'profile_id,holiday_date' });
    if (error) { toast({ title: 'Import failed', description: error.message, variant: 'destructive' }); return; }
    loadHolidays(active.id);
    if (invalid.length) {
      toast({
        title: `Imported ${valid.length}, skipped ${invalid.length}`,
        description: `First skipped: line ${invalid[0].line} — ${invalid[0].reason}`,
      });
    } else {
      toast({ title: 'Holidays imported', description: `${valid.length} entries` });
    }
    await logAudit({
      action: 'ADMIN_CALENDAR_UPDATED',
      entityType: 'business_calendar_holidays',
      entityId: active.id,
      metadata: { imported: valid.length, skipped: invalid.length, invalid_lines: invalid.slice(0, 10) },
    });
  };

  const toggleAssignment = async (processType: string, checked: boolean) => {
    if (!active) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (checked) {
      const existing = assignments.find(a => a.process_type === processType && a.profile_id !== active.id);
      if (existing) {
        const otherName = profiles.find(p => p.id === existing.profile_id)?.name ?? 'another profile';
        if (!confirm(`"${processType}" is currently assigned to "${otherName}". Move it to "${active.name}"?`)) return;
      }
      const { error } = await supabase
        .from('business_calendar_process_assignments')
        .upsert(
          { profile_id: active.id, process_type: processType, updated_by: user?.id ?? null, created_by: user?.id ?? null },
          { onConflict: 'process_type' },
        );
      if (error) { toast({ title: 'Assign failed', description: error.message, variant: 'destructive' }); return; }
    } else {
      const { error } = await supabase
        .from('business_calendar_process_assignments')
        .delete()
        .eq('profile_id', active.id)
        .eq('process_type', processType);
      if (error) { toast({ title: 'Unassign failed', description: error.message, variant: 'destructive' }); return; }
    }
    const { data: asn } = await supabase.from('business_calendar_process_assignments').select('*');
    setAssignments((asn ?? []) as unknown as Assignment[]);
    await logAudit({
      action: 'ADMIN_CALENDAR_UPDATED',
      entityType: 'business_calendar_process_assignments',
      entityId: active.id,
      metadata: { process_type: processType, assigned: checked },
    });
    toast({ title: checked ? 'Process assigned' : 'Process unassigned', description: `${processType} ↔ ${active.name}` });
  };

  const assignmentsByProfile = (pid: string) =>
    assignments.filter(a => a.profile_id === pid).map(a => a.process_type);

  return (
    <div>
      <RetroNotice />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Calendar Profiles</CardTitle>
            <CardDescription>e.g. BOJ Calendar, FSC Calendar</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {profiles.map(p => {
              const assigned = assignmentsByProfile(p.id);
              return (
                <div key={p.id} onClick={() => setActiveId(p.id)}
                  className={`p-2 rounded border cursor-pointer ${activeId === p.id ? 'border-primary bg-primary/5' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{p.name}</span>
                    {p.is_default && <Badge variant="secondary">Default</Badge>}
                  </div>
                  {assigned.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {assigned.map(pt => <Badge key={pt} variant="outline" className="text-[10px]">{pt}</Badge>)}
                    </div>
                  )}
                </div>
              );
            })}
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
                <Label>Assigned Process Types</Label>
                {processOptions.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">
                    No process types yet — add SLA configurations first.
                  </p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-2 border rounded p-3">
                    {processOptions.map(pt => {
                      const here = assignedHere.includes(pt);
                      const elsewhere = assignments.find(a => a.process_type === pt && a.profile_id !== active.id);
                      const otherName = elsewhere ? profiles.find(p => p.id === elsewhere.profile_id)?.name : null;
                      return (
                        <label key={pt} className="flex items-center gap-2 text-sm">
                          <Checkbox checked={here} onCheckedChange={(v) => toggleAssignment(pt, !!v)} />
                          <span>{pt}</span>
                          {otherName && <Badge variant="outline" className="text-[10px]">on {otherName}</Badge>}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Each process type can be assigned to exactly one calendar. Moving an existing assignment prompts for confirmation.
                </p>
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
    </div>
  );
}

/* -------------------- Escalation Chains -------------------- */

function EscalationTab() {
  const [tiers, setTiers] = useState<EscalationTier[]>([]);
  const [processType, setProcessType] = useState('');
  const [processOptions, setProcessOptions] = useState<string[]>([]);
  const latestRef = useRef<Record<string, EscalationTier>>({});
  const lastPersisted = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data: cfgs } = await supabase.from('sla_configurations').select('process_type');
    const distinct = Array.from(new Set(((cfgs ?? []) as { process_type: string }[]).map(r => r.process_type))).sort();
    setProcessOptions(distinct);
    setProcessType(prev => prev || distinct[0] || '');
    const { data } = await supabase.from('sla_escalation_tiers').select('*').order('process_type').order('tier');
    const list = (data ?? []) as unknown as EscalationTier[];
    setTiers(list);
    latestRef.current = Object.fromEntries(list.map(t => [t.id, t]));
    lastPersisted.current = Object.fromEntries(list.map(t => [t.id, JSON.stringify(t)]));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Fallback auto-seed in case the migration seed didn't run (e.g. brand new process_type).
  useEffect(() => {
    if (!processType) return;
    const existing = tiers.filter(t => t.process_type === processType).map(t => t.tier);
    const missing = TIER_DEFAULTS.filter(d => !existing.includes(d.tier));
    if (missing.length === 0) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const inserts = missing.map(d => ({
        process_type: processType,
        tier: d.tier,
        delay_days: d.delay_days,
        recipients: d.recipients,
        notify_roles: null,
        created_by: user?.id ?? null,
        updated_by: user?.id ?? null,
      }));
      const { data, error } = await supabase.from('sla_escalation_tiers').insert(inserts).select();
      if (error) { toast({ title: 'Failed to seed tiers', description: error.message, variant: 'destructive' }); return; }
      const added = (data ?? []) as unknown as EscalationTier[];
      setTiers(prev => {
        const next = [...prev, ...added];
        latestRef.current = Object.fromEntries(next.map(t => [t.id, t]));
        added.forEach(t => { lastPersisted.current[t.id] = JSON.stringify(t); });
        return next;
      });
    })();
  }, [processType, tiers]);

  const tiersForProcess = tiers.filter(t => t.process_type === processType).sort((a, b) => a.tier - b.tier);

  const update = (id: string, patch: Partial<EscalationTier>) => {
    setTiers(prev => {
      const next = prev.map(t => t.id === id ? { ...t, ...patch } : t);
      latestRef.current = Object.fromEntries(next.map(t => [t.id, t]));
      return next;
    });
  };

  const saveTier = async (id: string) => {
    const t = latestRef.current[id];
    if (!t) return;
    if (t.tier < 1 || t.tier > 3) { toast({ title: 'Invalid tier', description: 'Tier must be 1, 2 or 3', variant: 'destructive' }); return; }
    if (!Number.isInteger(t.delay_days) || t.delay_days < 0) { toast({ title: 'Invalid delay', description: 'Delay must be a non-negative integer', variant: 'destructive' }); return; }
    if (!t.recipients.trim()) { toast({ title: 'Recipients required', variant: 'destructive' }); return; }

    const snapshot = JSON.stringify(t);
    if (lastPersisted.current[id] === snapshot) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('sla_escalation_tiers').update({
      delay_days: t.delay_days,
      recipients: t.recipients,
      notify_roles: t.notify_roles,
      updated_by: user?.id ?? null,
    }).eq('id', id);
    if (error) { toast({ title: 'Save failed', description: error.message, variant: 'destructive' }); return; }
    lastPersisted.current[id] = snapshot;

    await logAudit({
      action: 'ADMIN_SLA_UPDATED',
      entityType: 'sla_escalation_tier',
      entityId: id,
      newValue: t as unknown as Record<string, unknown>,
      metadata: { process_type: t.process_type, tier: t.tier },
    });
    void notifySlaChange({
      process_type: t.process_type,
      entity_id: id,
      change_summary: `Escalation Tier ${t.tier}: delay ${t.delay_days}d → ${t.recipients}`,
    });
    toast({ title: 'Tier saved', description: `${t.process_type} • Tier ${t.tier}` });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Escalation Chains</CardTitle>
        <CardDescription>Per process type — Tier 1 fires on breach, Tiers 2 and 3 follow after the configured delay.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RetroNotice />
        <div className="flex items-center gap-3">
          <Label>Process Type</Label>
          <Select value={processType || 'none'} onValueChange={v => setProcessType(v === 'none' ? '' : v)}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select process type" /></SelectTrigger>
            <SelectContent>
              {processOptions.length === 0
                ? <SelectItem value="none" disabled>No SLA configs yet</SelectItem>
                : processOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {processType && tiersForProcess.length > 0 && (
          <div className="space-y-3">
            {tiersForProcess.map(t => {
              const def = TIER_DEFAULTS.find(d => d.tier === t.tier);
              return (
                <Card key={t.id} className="border-l-4 border-l-primary">
                  <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-1">
                      <Badge variant="outline">{def?.label ?? `Tier ${t.tier}`}</Badge>
                    </div>
                    <div>
                      <Label className="text-xs">Delay (days after breach)</Label>
                      <Input
                        type="number" min={0}
                        value={t.delay_days}
                        onChange={e => update(t.id, { delay_days: parseInt(e.target.value) || 0 })}
                        onBlur={() => saveTier(t.id)}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label className="text-xs">Recipients (comma-separated emails or role keys)</Label>
                      <Input
                        value={t.recipients}
                        onChange={e => update(t.id, { recipients: e.target.value })}
                        onBlur={() => saveTier(t.id)}
                      />
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
  const [processTypes, setProcessTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('sla_configurations').select('process_type').eq('active', true);
      setProcessTypes(Array.from(new Set(((data ?? []) as { process_type: string }[]).map(r => r.process_type))).sort());
      setLoading(false);
    })();
  }, []);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>SLA Performance Summary</CardTitle>
          <CardDescription>Live SLA on-time / breach metrics are published in DASH-OPS.</CardDescription>
        </div>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          <ExternalLink className="h-4 w-4 mr-2" /> Open DASH-OPS
        </Button>
      </CardHeader>
      <CardContent>
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Performance metrics live in DASH-OPS</AlertTitle>
          <AlertDescription>
            This module configures SLA, calendar and escalation rules. Real-time on-time, near-breach
            and breached counts are computed by the operations dashboard and are not duplicated here
            to avoid showing stale or fabricated figures.
          </AlertDescription>
        </Alert>

        <div className="mt-4">
          <h4 className="text-sm font-medium mb-2">Configured process types</h4>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : processTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active SLA configurations yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {processTypes.map(p => <Badge key={p} variant="outline">{p}</Badge>)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
