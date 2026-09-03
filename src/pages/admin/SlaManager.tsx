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
import { configDelete, configRetire, configSave } from '@/lib/configWriter';
import { authorizedAction } from '@/lib/rbac/authorizedAction';
import { logAudit } from '@/hooks/useAuditLog';
import { Trash2, Plus, Upload, GitBranch, ExternalLink, AlertTriangle, Info, RefreshCw, Eye } from 'lucide-react';
import { formatDateTime } from '@/lib/datetime';
import { Link } from 'react-router-dom';


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

/**
 * Process types the SLA runtime actually opens stages for
 * (`sla_stage_open(_process_type => …)`). Configuration must use exactly these
 * keys, otherwise `resolve_stage_sla` never matches and every stage silently
 * falls back to the workflow step default.
 */
const RUNTIME_PROCESS_TYPES: Array<{ value: string; label: string }> = [
  { value: 'application', label: 'application — Licence applications' },
  { value: 'pre_application', label: 'pre_application — Pre-application / registration intake' },
  { value: 'registration', label: 'registration — Entity registration review' },
  { value: 'return', label: 'return — Regulatory return filings' },
  { value: 'complaint', label: 'complaint — Complaint cases' },
];

/** Workflow entity_type(s) whose steps are valid stage names for a process type. */
const WORKFLOW_ENTITY_TYPES_FOR_PROCESS: Record<string, string[]> = {
  application: ['pre_application', 'post_application'],
  pre_application: ['pre_application'],
  registration: ['registration'],
  return: ['return'],
  complaint: ['complaint'],
};

const CUSTOM_STAGE = '__custom__';
const UNSET_PROCESS = '__unset__';


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
            <Button data-rbac="workflow_management.view" variant="outline" onClick={() => navigate('/workflows')}>
              <GitBranch className="h-4 w-4 mr-2" /> Workflow Designer
            </Button>
          }
        />

        <Tabs defaultValue="sla">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="sla">SLA Configuration</TabsTrigger>
            <TabsTrigger value="calendar">Business Calendar</TabsTrigger>
            <TabsTrigger value="escalation">Escalation Chains</TabsTrigger>
            <TabsTrigger value="monitor">Live Stages &amp; Breaches</TabsTrigger>
            <TabsTrigger value="summary">Performance Summary</TabsTrigger>
          </TabsList>

          <TabsContent value="sla" className="mt-4"><SlaConfigTab /></TabsContent>
          <TabsContent value="calendar" className="mt-4"><CalendarTab /></TabsContent>
          <TabsContent value="escalation" className="mt-4"><EscalationTab /></TabsContent>
          <TabsContent value="monitor" className="mt-4"><StageMonitorTab /></TabsContent>
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
  /** Real workflow stage names per process type, so config keys match runtime. */
  const [stageOptions, setStageOptions] = useState<Record<string, string[]>>({});
  // Freshest row keyed by id so onBlur reads up-to-date values (no stale closure).
  const latestRef = useRef<Record<string, SlaRow>>({});
  // JSON snapshot of last successfully-persisted row state — drives no-op detection.
  const lastPersisted = useRef<Record<string, string>>({});

  const syncLatest = (list: SlaRow[]) => {
    latestRef.current = Object.fromEntries(list.map(r => [r.id, r]));
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [cfgRes, wfRes] = await Promise.all([
      supabase
        .from('sla_configurations')
        .select('*')
        .order('process_type', { ascending: true })
        .order('stage_name', { ascending: true }),
      supabase.from('approval_workflows').select('id, entity_type').eq('is_active', true),
    ]);
    if (cfgRes.error) toast({ title: 'Failed to load SLA configs', description: cfgRes.error.message, variant: 'destructive' });
    else {
      const list = (cfgRes.data ?? []) as unknown as SlaRow[];
      setRows(list);
      syncLatest(list);
      // Initialise persisted snapshots so the first onBlur after load is a no-op.
      lastPersisted.current = Object.fromEntries(list.map(r => [r.id, JSON.stringify(r)]));
    }

    const workflows = (wfRes.data ?? []) as Array<{ id: string; entity_type: string }>;
    if (workflows.length > 0) {
      const { data: steps } = await supabase
        .from('approval_steps')
        .select('workflow_id, name')
        .in('workflow_id', workflows.map(w => w.id));
      const entityByWorkflow = new Map(workflows.map(w => [w.id, w.entity_type]));
      const namesByEntity = new Map<string, Set<string>>();
      ((steps ?? []) as Array<{ workflow_id: string; name: string | null }>).forEach(s => {
        const ent = entityByWorkflow.get(s.workflow_id);
        if (!ent || !s.name) return;
        const set = namesByEntity.get(ent) ?? new Set<string>();
        set.add(s.name);
        namesByEntity.set(ent, set);
      });
      const byProcess: Record<string, string[]> = {};
      RUNTIME_PROCESS_TYPES.forEach(({ value }) => {
        const ents = WORKFLOW_ENTITY_TYPES_FOR_PROCESS[value] ?? [value];
        const merged = new Set<string>();
        ents.forEach(e => (namesByEntity.get(e) ?? new Set<string>()).forEach(n => merged.add(n)));
        byProcess[value] = Array.from(merged).sort();
      });
      setStageOptions(byProcess);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);


  const validate = (r: Partial<SlaRow>): string | null => {
    if (!r.process_type?.trim()) return 'Process Type is required';
    if (!RUNTIME_PROCESS_TYPES.some(p => p.value === r.process_type))
      return 'Process Type must be one of the runtime process types, otherwise the SLA engine ignores this row';
    if (!r.stage_name?.trim()) return 'Stage Name is required';
    if (!Number.isInteger(r.sla_duration) || (r.sla_duration ?? 0) < 1)
      return `SLA duration must be a whole number of ${r.sla_unit === 'days' ? 'business days' : 'business hours'} (minimum 1)`;
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
    // GAP-F1-03: governed configuration writer (workflow_management.manage_config + audit).
    try {
      await configSave('sla_configurations', {
        process_type: row.process_type,
        stage_name: row.stage_name,
        sla_duration: row.sla_duration,
        sla_unit: row.sla_unit,
        warning_threshold_pct: row.warning_threshold_pct,
        pause_conditions: row.pause_conditions,
        escalation_recipient: row.escalation_recipient,
        active: row.active,
        updated_by: user?.id ?? null,
      }, { id: row.id, entityLabel: 'SLA configuration' });
    } catch (error: any) {
      toast({ title: 'Save failed', description: error?.message, variant: 'destructive' }); return;
    }
    lastPersisted.current[id] = snapshot;

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
    const defaultProcess = 'application';
    const draft = {
      process_type: defaultProcess,
      stage_name: (stageOptions[defaultProcess] ?? [])[0] ?? 'New Stage',

      sla_duration: 8,
      sla_unit: 'hours',
      warning_threshold_pct: 75,
      active: true,
      created_by: user?.id ?? null,
      updated_by: user?.id ?? null,
    };
    let newRow: SlaRow;
    try {
      newRow = await configSave<SlaRow>('sla_configurations', draft, { entityLabel: 'SLA configuration' });
    } catch (error: any) {
      toast({ title: 'Add failed', description: error?.message, variant: 'destructive' }); return;
    }
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
    // SLA rows are referenced by historical breach evidence — retire, never delete.
    try {
      await configRetire('sla_configurations', id, { entityLabel: 'SLA configuration' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error?.message, variant: 'destructive' }); return;
    }
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
        <Button data-rbac="workflow_management.edit" onClick={addRow}><Plus className="h-4 w-4 mr-2" /> Add SLA</Button>
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
                  <TableCell className="min-w-[190px]">
                    <Select
                      value={RUNTIME_PROCESS_TYPES.some(p => p.value === row.process_type) ? row.process_type : UNSET_PROCESS}
                      onValueChange={v => update(row.id, { process_type: v }, true)}
                    >
                      <SelectTrigger><SelectValue placeholder="Select process type" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNSET_PROCESS} disabled>Select process type</SelectItem>
                        {RUNTIME_PROCESS_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    {!RUNTIME_PROCESS_TYPES.some(p => p.value === row.process_type) && (
                      <p className="mt-1 text-xs text-destructive">
                        "{row.process_type}" is not a runtime process type — this row is ignored by the SLA engine.
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="min-w-[220px]">
                    {(() => {
                      const options = stageOptions[row.process_type] ?? [];
                      const isKnown = options.includes(row.stage_name);
                      return (
                        <>
                          <Select
                            value={isKnown ? row.stage_name : CUSTOM_STAGE}
                            onValueChange={v => update(row.id, { stage_name: v === CUSTOM_STAGE ? '' : v }, v !== CUSTOM_STAGE)}
                          >
                            <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
                            <SelectContent>
                              {options.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                              <SelectItem value={CUSTOM_STAGE}>Custom stage name…</SelectItem>
                            </SelectContent>
                          </Select>
                          {!isKnown && (
                            <>
                              <Input
                                className="mt-1"
                                value={row.stage_name}
                                onChange={e => update(row.id, { stage_name: e.target.value })}
                                onBlur={() => saveRow(row.id)}
                              />
                              <p className="mt-1 text-xs text-warning">
                                {row.stage_name.trim()
                                  ? 'No active workflow step named this — SLA will fall back to the step default.'
                                  : 'Type the custom stage name to save this row.'}
                              </p>
                            </>
                          )}
                        </>
                      );
                    })()}
                  </TableCell>

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
    const [{ data: profs }, { data: asn }] = await Promise.all([
      supabase.from('business_calendar_profiles').select('*').order('name'),
      supabase.from('business_calendar_process_assignments').select('*'),
    ]);
    const list = (profs ?? []) as unknown as CalendarProfile[];
    setProfiles(list);
    setAssignments((asn ?? []) as unknown as Assignment[]);
    // Runtime process types — a calendar can be assigned before any SLA row exists.
    setProcessOptions(RUNTIME_PROCESS_TYPES.map(p => p.value));
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
    try {
      await configSave('business_calendar_profiles', {
        name: active.name,
        description: active.description,
        working_days: active.working_days,
        working_start_time: active.working_start_time,
        working_end_time: active.working_end_time,
        timezone: active.timezone,
        updated_by: user?.id ?? null,
      }, { id: active.id, entityLabel: 'calendar profile' });
    } catch (error: any) {
      toast({ title: 'Save failed', description: error?.message, variant: 'destructive' }); return;
    }
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_profile', entityId: active.id, newValue: active as unknown as Record<string, unknown> });
    toast({ title: 'Calendar saved', description: active.name });
  };

  const createProfile = async () => {
    if (!newProfileName.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    let data: { id: string };
    try {
      data = await configSave<{ id: string }>('business_calendar_profiles',
        { name: newProfileName.trim(), created_by: user?.id ?? null },
        { entityLabel: 'calendar profile' });
    } catch (error: any) {
      toast({ title: 'Create failed', description: error?.message, variant: 'destructive' }); return;
    }
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
    try {
      await configSave('business_calendar_holidays',
        { profile_id: active.id, holiday_date: newHolidayDate, name: newHolidayName.trim(), created_by: user?.id ?? null },
        { entityLabel: 'calendar holiday' });
    } catch (error: any) {
      toast({ title: 'Add failed', description: error?.message, variant: 'destructive' }); return;
    }
    setNewHolidayDate(''); setNewHolidayName('');
    loadHolidays(active.id);
    await logAudit({ action: 'ADMIN_CALENDAR_UPDATED', entityType: 'business_calendar_holidays', entityId: active.id, metadata: { added: newHolidayDate } });
  };

  const deleteHoliday = async (id: string) => {
    try {
      await configDelete('business_calendar_holidays', id, { entityLabel: 'calendar holiday' });
    } catch (error: any) {
      toast({ title: 'Delete failed', description: error?.message, variant: 'destructive' }); return;
    }
    if (active) loadHolidays(active.id);
  };

  const importCsv = async (file: File) => {
    if (!active) return;
    try {
      await authorizedAction('settings', 'edit', { profile_id: active.id, file: file.name });
    } catch (e: any) {
      toast({ title: 'Not authorized', description: e?.message ?? '', variant: 'destructive' });
      return;
    }
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
    try {
      for (const row of valid) {
        const existing = holidays.find(h => h.holiday_date === row.holiday_date);
        await configSave('business_calendar_holidays', row, {
          id: existing?.id ?? null,
          entityLabel: 'calendar holiday',
        });
      }
    } catch (error: any) {
      toast({ title: 'Import failed', description: error?.message, variant: 'destructive' }); return;
    }
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
            <CardDescription>e.g. St. Lucia Calendar, FSC Calendar</CardDescription>
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
                    <Button data-rbac="settings.edit" variant="outline" size="sm" onClick={() => document.getElementById('hcsv')?.click()}>
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
                <Button data-rbac="workflow_management.edit" onClick={saveProfile}>Save Calendar</Button>
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
  const [processType, setProcessType] = useState(RUNTIME_PROCESS_TYPES[0].value);
  const [loaded, setLoaded] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [tierErrors, setTierErrors] = useState<Record<string, string | null>>({});

  const latestRef = useRef<Record<string, EscalationTier>>({});
  const lastPersisted = useRef<Record<string, string>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('sla_escalation_tiers').select('*').order('process_type').order('tier');
    const list = (data ?? []) as unknown as EscalationTier[];
    setTiers(list);
    latestRef.current = Object.fromEntries(list.map(t => [t.id, t]));
    lastPersisted.current = Object.fromEntries(list.map(t => [t.id, JSON.stringify(t)]));
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Seed defaults for a process type that has no tiers yet. Only runs after the
  // initial load has resolved, and uses a conflict-ignoring upsert so a race can
  // never produce a duplicate-key error.
  useEffect(() => {
    if (!loaded || seeding || !processType) return;
    const existing = tiers.filter(t => t.process_type === processType).map(t => t.tier);
    const missing = TIER_DEFAULTS.filter(d => !existing.includes(d.tier));
    if (missing.length === 0) return;
    setSeeding(true);
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
      try {
        for (const row of inserts) {
          await configSave('sla_escalation_tiers', row, { entityLabel: 'escalation tier' });
        }
      } catch (error: any) {
        toast({ title: 'Failed to prepare escalation tiers', description: error?.message, variant: 'destructive' });
        setSeeding(false);
        return;
      }
      await load();
      setSeeding(false);
    })();
  }, [processType, tiers, loaded, seeding, load]);


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
    const problem =
      t.tier < 1 || t.tier > 3 ? 'Tier must be 1, 2 or 3'
      : !Number.isInteger(t.delay_days) || t.delay_days < 0 ? 'Delay must be a whole number of days (0 or more)'
      : !t.recipients.trim() ? 'At least one recipient is required'
      : null;
    setTierErrors(prev => ({ ...prev, [id]: problem }));
    if (problem) return;


    const snapshot = JSON.stringify(t);
    if (lastPersisted.current[id] === snapshot) return;

    const { data: { user } } = await supabase.auth.getUser();
    try {
      await configSave('sla_escalation_tiers', {
        delay_days: t.delay_days,
        recipients: t.recipients,
        notify_roles: t.notify_roles,
        updated_by: user?.id ?? null,
      }, { id, entityLabel: 'escalation tier' });
    } catch (error: any) {
      toast({ title: 'Save failed', description: error?.message, variant: 'destructive' }); return;
    }
    lastPersisted.current[id] = snapshot;

    await logAudit({
      action: 'ADMIN_SLA_UPDATED',
      entityType: 'sla_escalation_tier',
      entityId: id,
      newValue: t as unknown as Record<string, unknown>,
      metadata: { process_type: t.process_type, tier: t.tier },
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
          <Select value={processType} onValueChange={setProcessType}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select process type" /></SelectTrigger>
            <SelectContent>
              {RUNTIME_PROCESS_TYPES.map(p => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
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
                    {tierErrors[t.id] && (
                      <p className="md:col-span-4 text-xs text-destructive">{tierErrors[t.id]}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        {processType && tiersForProcess.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {seeding ? 'Preparing default escalation tiers…' : 'No escalation tiers configured for this process type yet.'}
          </p>
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

/* -------------------- Live Stages & Breaches -------------------- */

type StageMonitorRow = {
  id: string;
  process_type: string;
  entity_type: string;
  entity_id: string;
  stage_name: string | null;
  sla_hours: number | null;
  sla_source: string | null;
  started_at: string;
  due_at: string | null;
  paused_at: string | null;
  pause_seconds: number | null;
  state: string;
  breached_at: string | null;
  workflow_instance_id: string | null;
};

const STATE_BADGE: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  breached: 'destructive',
  completed: 'outline',
};

/**
 * Read-only evidence view over `sla_stage_instances`: what the SLA engine is
 * actually tracking right now, where each duration came from (SLA Manager
 * configuration vs workflow step default), and which escalation tiers have
 * been dispatched by the sweep.
 */
const ENTITY_ROUTE: Record<string, (id: string) => string> = {
  application: id => objectRoute.application(id),
  pre_application: id => objectRoute.application(id),
  complaint: id => objectRoute.complaint(id),
  // SLA rows may hold either a canonical or a legacy filing id; the
  // compatibility route resolves the id domain server-side.
  return: id => objectRoute.returnFilingFromLegacy(id),
};

function StageMonitorTab() {
  const [rows, setRows] = useState<StageMonitorRow[]>([]);
  /** Dispatched escalation tiers per workflow instance (sla_escalation_dispatches). */
  const [tiersByInstance, setTiersByInstance] = useState<Record<string, number[]>>({});
  /** entity_id → human case reference (application/complaint/registration number). */
  const [refById, setRefById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState<number | null>(null);
  const [stateFilter, setStateFilter] = useState<string>('open');
  const [processFilter, setProcessFilter] = useState<string>('all');

  const ROW_LIMIT = 500;

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, { count }] = await Promise.all([
      (supabase as any)
        .from('sla_stage_instances')
        .select('id,process_type,entity_type,entity_id,workflow_instance_id,stage_name,sla_hours,sla_source,started_at,due_at,paused_at,pause_seconds,state,breached_at')
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(ROW_LIMIT),
      (supabase as any).from('sla_stage_instances').select('id', { count: 'exact', head: true }),
    ]);
    if (error) {
      toast({ title: 'Failed to load SLA stages', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as StageMonitorRow[];
    setRows(list);
    setTotal(typeof count === 'number' ? count : null);

    const instanceIds = Array.from(new Set(list.map(r => r.workflow_instance_id).filter((v): v is string => !!v)));
    if (instanceIds.length > 0) {
      const { data: dispatches } = await (supabase as any)
        .from('sla_escalation_dispatches')
        .select('workflow_instance_id, tier')
        .in('workflow_instance_id', instanceIds);
      const map: Record<string, number[]> = {};
      ((dispatches ?? []) as Array<{ workflow_instance_id: string; tier: number }>).forEach(d => {
        map[d.workflow_instance_id] = [...(map[d.workflow_instance_id] ?? []), d.tier].sort();
      });
      setTiersByInstance(map);
    }

    // Resolve human case references so the monitor is usable as evidence.
    const idsFor = (types: string[]) =>
      Array.from(new Set(list.filter(r => types.includes(r.entity_type)).map(r => r.entity_id)));
    const refs: Record<string, string> = {};
    const appIds = idsFor(['application', 'pre_application']);
    const complaintIds = idsFor(['complaint']);
    const registrationIds = idsFor(['registration']);
    const lookups: Promise<void>[] = [];
    if (appIds.length) {
      lookups.push((async () => {
        const { data: d } = await (supabase as any).from('applications').select('id, application_number').in('id', appIds);
        ((d ?? []) as Array<{ id: string; application_number: string | null }>).forEach(a => {
          if (a.application_number) refs[a.id] = a.application_number;
        });
      })());
    }
    if (complaintIds.length) {
      lookups.push((async () => {
        const { data: d } = await (supabase as any).from('complaints').select('id, complaint_number').in('id', complaintIds);
        ((d ?? []) as Array<{ id: string; complaint_number: string | null }>).forEach(c => {
          if (c.complaint_number) refs[c.id] = c.complaint_number;
        });
      })());
    }
    if (registrationIds.length) {
      lookups.push((async () => {
        const { data: d } = await (supabase as any).from('registrations').select('id, registration_number').in('id', registrationIds);
        ((d ?? []) as Array<{ id: string; registration_number: string | null }>).forEach(x => {
          if (x.registration_number) refs[x.id] = x.registration_number;
        });
      })());
    }
    await Promise.all(lookups);
    setRefById(refs);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => rows.filter(r => {
    const stateOk =
      stateFilter === 'all' ? true :
      stateFilter === 'open' ? ['active', 'paused', 'breached'].includes(r.state) :
      r.state === stateFilter;
    const processOk = processFilter === 'all' || r.process_type === processFilter;
    return stateOk && processOk;
  }), [rows, stateFilter, processFilter]);

  const counts = useMemo(() => {
    const c = { active: 0, paused: 0, breached: 0, completed: 0, unconfigured: 0 };
    rows.forEach(r => {
      if (r.state in c) (c as Record<string, number>)[r.state] += 1;
      if (r.sla_hours == null && ['active', 'paused'].includes(r.state)) c.unconfigured += 1;
    });
    return c;
  }, [rows]);

  const fmt = (ts?: string | null) => formatDateTime(ts);


  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Live Stages &amp; Breaches</CardTitle>
          <CardDescription>
            What the SLA engine is tracking right now. Read-only — state changes are made by the
            workflow engine and the escalation sweep.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="default">Active {counts.active}</Badge>
          <Badge variant="secondary">Paused {counts.paused}</Badge>
          <Badge variant="destructive">Breached {counts.breached}</Badge>
          <Badge variant="outline">Completed {counts.completed}</Badge>
          {total != null && (
            <span className="text-xs text-muted-foreground">
              Showing {filtered.length} of {total} tracked stage{total === 1 ? '' : 's'}
              {total > ROW_LIMIT ? ` (latest ${ROW_LIMIT} loaded)` : ''}
            </span>
          )}
        </div>


        {counts.unconfigured > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{counts.unconfigured} open stage(s) have no SLA duration</AlertTitle>
            <AlertDescription>
              Neither an SLA Manager configuration nor a workflow step SLA resolved for these
              stages, so no due date or breach can be computed. Add a configuration row for the
              matching process type and stage name.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Label className="text-xs">State</Label>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open (active/paused/breached)</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
                <SelectItem value="breached">Breached</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Process</Label>
            <Select value={processFilter} onValueChange={setProcessFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All processes</SelectItem>
                {RUNTIME_PROCESS_TYPES.map(p => <SelectItem key={p.value} value={p.value}>{p.value}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Case</TableHead>
                <TableHead>Process</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>State</TableHead>
                <TableHead>SLA</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Paused</TableHead>
                <TableHead>Escalations sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground">No stages match this filter.</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {(() => {
                      const label = refById[r.entity_id] ?? `${r.entity_type.replace(/_/g, ' ')} · ${r.entity_id.slice(0, 8)}`;
                      const to = ENTITY_ROUTE[r.entity_type]?.(r.entity_id);
                      return to ? (
                        <Link to={to} className="inline-flex items-center gap-1 text-primary hover:underline">
                          <Eye className="h-3.5 w-3.5" /> {label}
                        </Link>
                      ) : <span className="text-muted-foreground">{label}</span>;
                    })()}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.process_type}</TableCell>
                  <TableCell>{r.stage_name || '—'}</TableCell>
                  <TableCell><Badge variant={STATE_BADGE[r.state] ?? 'outline'}>{r.state}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {r.sla_hours != null
                      ? `${r.sla_hours}h · ${r.sla_source === 'configuration' ? 'SLA Manager' : 'step default'}`
                      : <span className="text-destructive">not configured</span>}
                  </TableCell>
                  <TableCell className="text-xs">{fmt(r.started_at)}</TableCell>
                  <TableCell className="text-xs">{fmt(r.due_at)}</TableCell>
                  <TableCell className="text-xs">
                    {r.pause_seconds && r.pause_seconds > 0 ? `${Math.round(r.pause_seconds / 60)} min` : '—'}
                  </TableCell>
                  <TableCell className="text-xs">
                    {(() => {
                      const tiers = r.workflow_instance_id ? (tiersByInstance[r.workflow_instance_id] ?? []) : [];
                      return tiers.length > 0 ? tiers.map(t => `Tier ${t}`).join(', ') : '—';
                    })()}
                  </TableCell>
                </TableRow>
              ))}

            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
