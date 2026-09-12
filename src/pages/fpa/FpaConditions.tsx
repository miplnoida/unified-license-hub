import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fpConditionCreate, fpConditionRecordReminder, fpConditionSetStatus } from '@/lib/fpGovernedOps';
import { useEmployeeApprovers } from '@/hooks/useEmployeeApprovers';
import { toast } from 'sonner';
import {
  Loader2,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Filter,
  CalendarClock,
  ShieldCheck,
  ListChecks,
  Gauge,
  Bell,
  History,
  RefreshCw,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RawCondition {
  id: string;
  individual_id: string;
  determination_id: string;
  description: string | null;
  status: string | null;
  due_date: string | null;
  category: string;
  overdue_at: string | null;
  satisfied_at: string | null;
  monitoring_owner: string | null;
  satisfaction_note: string | null;
  waiver_reason: string | null;
  created_at: string | null;
  evidence_type: string | null;
  reminder_sent_at: string | null;
  satisfied_by: string | null;
  // joined
  individual_name?: string | null;
  determination_outcome?: string | null;
}

interface Individual {
  id: string;
  full_name: string | null;
}

interface Determination {
  id: string;
  individual_id: string | null;
  outcome: string | null;
  determined_at: string | null;
  rationale: string | null;
}

// Sentinel value used in lieu of empty string for Radix UI SelectItem
const NONE_SENTINEL = '__none__';

// Matches FpConditionsPanel.tsx's list so both condition-creation UIs write
// the same fixed vocabulary instead of arbitrary free text.
const CONDITION_CATEGORIES = [
  { value: 'training', label: 'Training / certification' },
  { value: 'reporting', label: 'Periodic reporting' },
  { value: 'restriction', label: 'Role restriction' },
  { value: 'monitoring', label: 'Enhanced monitoring' },
  { value: 'disclosure', label: 'Ongoing disclosure' },
  { value: 'other', label: 'Other' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const TODAY = new Date().toISOString().split('T')[0];

function isOverdue(cond: RawCondition): boolean {
  return (
    cond.status === 'open' &&
    !!cond.due_date &&
    cond.due_date < TODAY
  );
}

function daysOverdue(dueDate: string): number {
  return Math.floor((new Date().getTime() - new Date(dueDate).getTime()) / 86400000);
}

function daysUntil(dueDate: string): number {
  return Math.floor((new Date(dueDate).getTime() - new Date().getTime()) / 86400000);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function truncate(s: string | null, len: number): string {
  if (!s) return '—';
  return s.length > len ? s.slice(0, len) + '…' : s;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'open':      return 'bg-blue-100 text-blue-800 border border-blue-300';
    case 'satisfied': return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
    case 'waived':    return 'bg-slate-100 text-slate-600 border border-slate-300';
    case 'overdue':   return 'bg-red-100 text-red-800 border border-red-300';
    default:          return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

function categoryBadgeClass(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes('training') || lower.includes('education')) return 'bg-violet-100 text-violet-800 border border-violet-300';
  if (lower.includes('report') || lower.includes('disclosure')) return 'bg-amber-100 text-amber-800 border border-amber-300';
  if (lower.includes('conduct') || lower.includes('compliance')) return 'bg-rose-100 text-rose-800 border border-rose-300';
  return 'bg-sky-100 text-sky-800 border border-sky-300';
}

function fmtDeterminationLabel(det: Determination): string {
  const datePart = det.determined_at ? ` [${fmtDate(det.determined_at)}]` : '';
  return `${det.outcome ?? det.id}${datePart}`;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  colorClass?: string;
}

function StatCard({ label, value, sub, icon, colorClass = 'bg-card text-card-foreground' }: StatCardProps) {
  return (
    <Card className={`overflow-hidden ${colorClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest opacity-60 truncate">{label}</p>
            <p className="mt-1.5 text-2xl font-bold tabular-nums leading-none">{value}</p>
            {sub && <p className="mt-1 text-[11px] opacity-55 truncate">{sub}</p>}
          </div>
          <div className="opacity-20 mt-0.5 flex-shrink-0">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function FpaConditions() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [overdueOnly, setOverdueOnly] = useState(false);

  // Add Condition dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addIndividualId, setAddIndividualId] = useState('');
  const [addDeterminationId, setAddDeterminationId] = useState('');
  const [addDescription, setAddDescription] = useState('');
  const [addCategory, setAddCategory] = useState('');
  const [addDueDate, setAddDueDate] = useState('');
  const [addMonitoringOwner, setAddMonitoringOwner] = useState('');

  // Deep-link prefill: a freshly-recorded "conditional" determination can send
  // the user straight here (e.g. from FpaDeterminations.tsx) with the
  // individual/determination already known, so the Add Condition dialog opens
  // pre-populated instead of asking them to look both back up.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const individualId = searchParams.get('individual_id');
    const determinationId = searchParams.get('determination_id');
    if (searchParams.get('open') === '1' && individualId) {
      setAddIndividualId(individualId);
      if (determinationId) setAddDeterminationId(determinationId);
      setAddOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete('open');
      next.delete('individual_id');
      next.delete('determination_id');
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mark Satisfied dialog
  const [satisfyTarget, setSatisfyTarget] = useState<RawCondition | null>(null);
  const [satisfyNote, setSatisfyNote] = useState('');

  // Waive dialog
  const [waiveTarget, setWaiveTarget] = useState<RawCondition | null>(null);
  const [waiveReason, setWaiveReason] = useState('');

  // History (breach/reminder log) dialog
  const [historyTarget, setHistoryTarget] = useState<RawCondition | null>(null);

  // ---------------------------------------------------------------------------
  // Data: conditions + joined individuals + determinations
  // ---------------------------------------------------------------------------
  const { data: conditions, isLoading, isError, error } = useQuery({
    queryKey: ['fp_conditions_page'],
    queryFn: async (): Promise<RawCondition[]> => {
      const { data: raw, error } = await (supabase as any)
        .from('fp_conditions')
        .select(`
          id, individual_id, determination_id, description, status, due_date,
          category, overdue_at, satisfied_at, monitoring_owner, satisfaction_note,
          waiver_reason, created_at, evidence_type, reminder_sent_at, satisfied_by
        `)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      const rows: any[] = raw ?? [];

      // Collect IDs
      const individualIds = Array.from(new Set(rows.map((r: any) => r.individual_id).filter(Boolean)));
      const determinationIds = Array.from(new Set(rows.map((r: any) => r.determination_id).filter(Boolean)));

      // Fetch names
      const nameMap: Record<string, string> = {};
      if (individualIds.length > 0) {
        const { data: indData } = await (supabase as any)
          .from('fp_individuals')
          .select('id, full_name')
          .in('id', individualIds);
        (indData ?? []).forEach((ind: any) => {
          nameMap[ind.id] = ind.full_name ?? '—';
        });
      }

      // Fetch determination outcomes
      const detMap: Record<string, string> = {};
      if (determinationIds.length > 0) {
        const { data: detData } = await (supabase as any)
          .from('fp_determinations')
          .select('id, outcome')
          .in('id', determinationIds);
        (detData ?? []).forEach((d: any) => {
          detMap[d.id] = d.outcome ?? '—';
        });
      }

      return rows.map((r: any) => ({
        ...r,
        individual_name: r.individual_id ? (nameMap[r.individual_id] ?? '—') : '—',
        determination_outcome: r.determination_id ? (detMap[r.determination_id] ?? null) : null,
      }));
    },
  });

  // Data: individuals list for Add dialog
  const {
    data: individuals,
    isError: individualsError,
  } = useQuery({
    queryKey: ['fp_individuals_list'],
    queryFn: async (): Promise<Individual[]> => {
      const { data, error } = await (supabase as any)
        .from('fp_individuals')
        .select('id, full_name')
        .order('full_name', { ascending: true })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Monitoring owner options — fp_conditions.monitoring_owner is a UUID
  // column (a real staff member), not free text; previously a plain text
  // Input wrote arbitrary strings into it, which fails at the database with
  // "invalid input syntax for type uuid" the moment anyone typed a real name.
  const { data: monitoringOwners } = useEmployeeApprovers();
  const monitoringOwnerMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const e of monitoringOwners ?? []) m[e.id] = e.full_name || e.email || e.id;
    return m;
  }, [monitoringOwners]);

  // Data: determinations for selected individual in Add dialog
  const {
    data: determinationsForIndividual,
    isError: determinationsError,
  } = useQuery({
    queryKey: ['fp_determinations_for_individual', addIndividualId],
    enabled: !!addIndividualId,
    queryFn: async (): Promise<Determination[]> => {
      const { data, error } = await (supabase as any)
        .from('fp_determinations')
        .select('id, individual_id, outcome, determined_at, rationale')
        .eq('individual_id', addIndividualId)
        .order('determined_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const all = conditions ?? [];
    const total = all.length;
    const active = all.filter((c) => c.status === 'open').length;
    const overdueList = all.filter(isOverdue);
    const overdueCnt = overdueList.length;
    const satisfied = all.filter((c) => c.status === 'satisfied').length;
    const slaPct = total > 0 ? Math.round((overdueCnt / total) * 100) : 0;
    return { total, active, overdueCnt, satisfied, slaPct };
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Categories for filter (derived from data)
  // ---------------------------------------------------------------------------
  const categories = useMemo(() => {
    const cats = new Set<string>();
    (conditions ?? []).forEach((c) => { if (c.category) cats.add(c.category); });
    return Array.from(cats).sort();
  }, [conditions]);

  // ---------------------------------------------------------------------------
  // Filtered list
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let rows = conditions ?? [];
    if (statusFilter !== 'ALL') rows = rows.filter((c) => c.status === statusFilter);
    if (categoryFilter !== 'ALL') rows = rows.filter((c) => c.category === categoryFilter);
    if (overdueOnly) rows = rows.filter(isOverdue);
    return rows;
  }, [conditions, statusFilter, categoryFilter, overdueOnly]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const satisfyMutation = useMutation({
    mutationFn: async ({ id, note, condition }: { id: string; note: string; condition: RawCondition }) => {
      await fpConditionSetStatus(id, 'satisfied', note.trim() || null);
    },
    onSuccess: () => {
      toast.success('Condition marked as satisfied');
      qc.invalidateQueries({ queryKey: ['fp_conditions_page'] });
      setSatisfyTarget(null);
      setSatisfyNote('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Update failed'),
  });

  const waiveMutation = useMutation({
    mutationFn: async ({ id, reason, condition }: { id: string; reason: string; condition: RawCondition }) => {
      await fpConditionSetStatus(id, 'waived', reason.trim() || null);
    },
    onSuccess: () => {
      toast.success('Condition waived');
      qc.invalidateQueries({ queryKey: ['fp_conditions_page'] });
      setWaiveTarget(null);
      setWaiveReason('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Update failed'),
  });

  // Sends a reminder for a single condition right now — mirrors the reminder
  // half of fp-monitoring-sweep, scoped to one row, for on-demand demoing.
  const sendReminderMutation = useMutation({
    mutationFn: async (cond: RawCondition) => {
      // Governed operation: raises the monitoring event, stamps
      // reminder_sent_at and audits the reminder in one transaction.
      await fpConditionRecordReminder(cond.id);

      await supabase.functions.invoke('dispatch-notification-event', {
        body: {
          event_key: 'fp_condition_reminder',
          entity_type: 'fp_condition',
          entity_id: cond.id,
          // fp_condition_reminder's recipient_rules resolve monitoring_owner
          // from THIS payload field first, falling back to the supervisor
          // role only if it's absent — this manual "Remind" button omitted
          // it (unlike fp-monitoring-sweep's automated version of the same
          // reminder), so the condition's actual assigned owner never got
          // notified; it silently fell through to "supervisor," and if
          // nobody currently holds that role, nobody was notified at all.
          payload: { individual_id: cond.individual_id, due_date: cond.due_date, monitoring_owner: cond.monitoring_owner ?? null },
        },
      }).catch(() => { /* notification dispatch failure shouldn't block the reminder record */ });
    },
    onSuccess: () => {
      toast.success('Reminder sent and logged.');
      qc.invalidateQueries({ queryKey: ['fp_conditions_page'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to send reminder'),
  });

  // Runs the full monitoring sweep now (reminders + overdue detection across
  // every condition), instead of waiting for the scheduled cron job.
  const runSweepMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('fp-monitoring-sweep', { body: {} });
      if (error) throw error;
      return data as { ok: boolean; scanned: number; rescreened: number; alerts: number; reminders: number; errors: number };
    },
    onSuccess: (data) => {
      toast.success(
        data?.ok
          ? `Sweep complete — ${data.alerts} alert(s), ${data.reminders} reminder(s) sent.`
          : 'Sweep completed with errors — check integration logs.',
      );
      qc.invalidateQueries({ queryKey: ['fp_conditions_page'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Sweep failed'),
  });

  const { data: historyEvents, isLoading: historyLoading } = useQuery({
    queryKey: ['fp_condition_history', historyTarget?.id],
    enabled: !!historyTarget,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('fp_monitoring_events')
        .select('id, event_type, severity, summary, raised_at, acknowledged_at')
        .eq('individual_id', historyTarget!.individual_id)
        .contains('detail', { condition_id: historyTarget!.id })
        .order('raised_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!addIndividualId) throw new Error('Individual is required');
      if (!addDeterminationId || addDeterminationId === NONE_SENTINEL) throw new Error('Linked Determination is required');
      if (!addCategory.trim()) throw new Error('Category is required');
      if (!addDescription.trim()) throw new Error('Description is required');
      if (!addDueDate) throw new Error('Due date is required');

      await fpConditionCreate({
        determinationId: addDeterminationId,
        individualId: addIndividualId,
        category: addCategory.trim(),
        description: addDescription.trim(),
        dueDate: addDueDate,
        monitoringOwner: addMonitoringOwner.trim() || null,
      });
    },
    onSuccess: () => {
      toast.success('Condition added');
      qc.invalidateQueries({ queryKey: ['fp_conditions_page'] });
      setAddOpen(false);
      setAddIndividualId('');
      setAddDeterminationId('');
      setAddDescription('');
      setAddCategory('');
      setAddDueDate('');
      setAddMonitoringOwner('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Could not add condition'),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <PageHeader
          title="Conditions & SLA"
          description="Conditional Fit &amp; Proper determinations with SLA breach monitoring — FPA-013"
          actions={
            <div className="flex items-center gap-2">
              <Button data-rbac="fit_and_proper.edit"
                size="sm"
                variant="outline"
                onClick={() => runSweepMutation.mutate()}
                disabled={runSweepMutation.isPending}
                title="Runs the same reminder + overdue-detection sweep that's scheduled every 6 hours"
              >
                {runSweepMutation.isPending
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <RefreshCw className="h-4 w-4 mr-1.5" />}
                Run Sweep Now
              </Button>
              <Button data-rbac="fit_and_proper.create" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                Add Condition
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading conditions…
          </div>
        ) : isError ? (
          <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-800">Failed to load conditions</p>
              <p className="text-xs text-red-700 mt-0.5 opacity-80">
                {(error as any)?.message ?? 'An unexpected error occurred. Please try refreshing the page.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* SLA Breach Alert */}
            {stats.overdueCnt > 0 && (
              <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">
                    {stats.overdueCnt} condition{stats.overdueCnt !== 1 ? 's' : ''} past due date. Immediate review required.
                  </p>
                  <p className="text-xs text-red-700 mt-0.5 opacity-80">
                    SLA breach rate: {stats.slaPct}% of all conditions. Use the "Overdue Only" filter to prioritise.
                  </p>
                </div>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Total"
                value={stats.total}
                icon={<ListChecks className="h-7 w-7" />}
                colorClass="bg-card text-card-foreground"
              />
              <StatCard
                label="Open"
                value={stats.active}
                icon={<Clock className="h-7 w-7" />}
                colorClass="bg-blue-50 border-blue-200 text-blue-900"
              />
              <StatCard
                label="Overdue"
                value={stats.overdueCnt}
                icon={<XCircle className="h-7 w-7" />}
                colorClass={stats.overdueCnt > 0 ? 'bg-red-50 border-red-200 text-red-900' : 'bg-card text-card-foreground'}
              />
              <StatCard
                label="Satisfied"
                value={stats.satisfied}
                icon={<CheckCircle2 className="h-7 w-7" />}
                colorClass="bg-emerald-50 border-emerald-200 text-emerald-900"
              />
              <StatCard
                label="SLA Breach %"
                value={`${stats.slaPct}%`}
                sub={`${stats.overdueCnt} of ${stats.total} conditions`}
                icon={<Gauge className="h-7 w-7" />}
                colorClass={stats.slaPct > 0 ? 'bg-amber-50 border-amber-200 text-amber-900' : 'bg-card text-card-foreground'}
              />
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                    <Filter className="h-4 w-4" />
                    <span className="text-xs font-semibold uppercase tracking-widest">Filters</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="satisfied">Satisfied</SelectItem>
                        <SelectItem value="waived">Waived</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All categories</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2 pb-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={overdueOnly}
                      onClick={() => setOverdueOnly((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${overdueOnly ? 'bg-red-500' : 'bg-muted-foreground/30'}`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${overdueOnly ? 'translate-x-4.5' : 'translate-x-0.5'}`}
                        style={{ transform: overdueOnly ? 'translateX(18px)' : 'translateX(2px)' }}
                      />
                    </button>
                    <Label className="text-xs cursor-pointer" onClick={() => setOverdueOnly((v) => !v)}>
                      Overdue Only
                    </Label>
                  </div>

                  {(statusFilter !== 'ALL' || categoryFilter !== 'ALL' || overdueOnly) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setStatusFilter('ALL');
                        setCategoryFilter('ALL');
                        setOverdueOnly(false);
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Conditions table */}
            <Card>
              <CardContent className="p-0">
                {filtered.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No conditions match the current filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs whitespace-nowrap">Individual</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Category</TableHead>
                          <TableHead className="text-xs">Description</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Due Date</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Monitoring Owner</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Satisfied By</TableHead>
                          <TableHead className="text-xs whitespace-nowrap text-right">Days Until Due</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((cond) => {
                          const overdue = isOverdue(cond);
                          const daysOv = cond.due_date && overdue ? daysOverdue(cond.due_date) : 0;
                          const daysUntilDue = cond.due_date && cond.status === 'open' && !overdue
                            ? daysUntil(cond.due_date)
                            : null;

                          return (
                            <TableRow
                              key={cond.id}
                              className={`group hover:bg-muted/30 transition-colors ${overdue ? 'bg-red-50/40' : ''}`}
                            >
                              {/* Individual */}
                              <TableCell className="py-3 text-sm font-medium whitespace-nowrap">
                                {cond.individual_name ?? '—'}
                              </TableCell>

                              {/* Category */}
                              <TableCell className="py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${categoryBadgeClass(cond.category)}`}>
                                  {cond.category}
                                </span>
                              </TableCell>

                              {/* Description */}
                              <TableCell className="py-3 max-w-[240px]">
                                <span
                                  className="text-sm text-foreground leading-snug"
                                  title={cond.description ?? undefined}
                                >
                                  {truncate(cond.description, 80)}
                                </span>
                              </TableCell>

                              {/* Due Date */}
                              <TableCell className="py-3 whitespace-nowrap">
                                <div className="flex flex-col gap-0.5">
                                  <span className={`text-sm tabular-nums font-medium ${overdue ? 'text-red-700' : 'text-foreground'}`}>
                                    {fmtDate(cond.due_date)}
                                  </span>
                                  {overdue && (
                                    <span className="inline-flex items-center gap-1">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide bg-red-100 text-red-800 border border-red-300 whitespace-nowrap">
                                        OVERDUE
                                      </span>
                                      <span className="text-[10px] text-red-600 tabular-nums">{daysOv}d</span>
                                    </span>
                                  )}
                                  {cond.reminder_sent_at && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                      <Bell className="h-2.5 w-2.5" />
                                      Reminded {fmtDate(cond.reminder_sent_at)}
                                    </span>
                                  )}
                                </div>
                              </TableCell>

                              {/* Status */}
                              <TableCell className="py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${statusBadgeClass(cond.status ?? '')}`}>
                                  {(cond.status ?? '—').replace(/_/g, ' ')}
                                </span>
                              </TableCell>

                              {/* Monitoring Owner */}
                              <TableCell className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                                {cond.monitoring_owner ? (monitoringOwnerMap[cond.monitoring_owner] ?? cond.monitoring_owner.slice(0, 8) + '…') : '—'}
                              </TableCell>

                              {/* Satisfied By (audit trail) */}
                              <TableCell className="py-3 text-sm text-muted-foreground whitespace-nowrap">
                                {cond.status === 'satisfied' ? (cond.satisfied_by ?? '—') : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Days Until Due */}
                              <TableCell className="py-3 text-right tabular-nums">
                                {cond.status === 'open' && cond.due_date ? (
                                  overdue ? (
                                    <span className="text-xs font-semibold text-red-600">{daysOv} days overdue</span>
                                  ) : (
                                    <span className={`text-xs font-semibold ${daysUntilDue !== null && daysUntilDue <= 7 ? 'text-amber-600' : 'text-emerald-700'}`}>
                                      {daysUntilDue !== null ? `${daysUntilDue}d` : '—'}
                                    </span>
                                  )
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                              </TableCell>

                              {/* Actions */}
                              <TableCell className="py-3 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  {cond.status === 'open' && (
                                    <>
                                      <Button data-rbac="fit_and_proper.edit"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                                        onClick={() => {
                                          setSatisfyTarget(cond);
                                          setSatisfyNote('');
                                        }}
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                        Mark Satisfied
                                      </Button>
                                      <Button data-rbac="fit_and_proper.edit"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-slate-600"
                                        onClick={() => {
                                          setWaiveTarget(cond);
                                          setWaiveReason('');
                                        }}
                                      >
                                        Waive
                                      </Button>
                                      <Button data-rbac="fit_and_proper.edit"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs text-slate-600"
                                        disabled={sendReminderMutation.isPending}
                                        onClick={() => sendReminderMutation.mutate(cond)}
                                        title="Send reminder now and log it"
                                      >
                                        <Bell className="h-3.5 w-3.5 mr-1" />
                                        Remind
                                      </Button>
                                    </>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs text-slate-600"
                                    onClick={() => setHistoryTarget(cond)}
                                    title="View reminder / breach log"
                                  >
                                    <History className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Mark Satisfied dialog                                              */}
      {/* ----------------------------------------------------------------- */}
      <Dialog
        open={!!satisfyTarget}
        onOpenChange={(open) => {
          if (!open) { setSatisfyTarget(null); setSatisfyNote(''); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Mark Condition Satisfied
            </DialogTitle>
          </DialogHeader>

          {satisfyTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Condition</p>
                <p className="text-sm font-medium">{satisfyTarget.individual_name}</p>
                <p className="text-sm text-muted-foreground">{satisfyTarget.description ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Due: {fmtDate(satisfyTarget.due_date)}</p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="satisfy-note" className="text-sm">
                  Satisfaction note
                </Label>
                <Textarea
                  id="satisfy-note"
                  rows={4}
                  placeholder="Describe how the condition was satisfied, evidence reviewed, etc."
                  value={satisfyNote}
                  onChange={(e) => setSatisfyNote(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setSatisfyTarget(null); setSatisfyNote(''); }}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              disabled={satisfyMutation.isPending}
              onClick={() => {
                if (satisfyTarget) satisfyMutation.mutate({ id: satisfyTarget.id, note: satisfyNote, condition: satisfyTarget });
              }}
            >
              {satisfyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Satisfied
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Waive dialog                                                       */}
      {/* ----------------------------------------------------------------- */}
      <Dialog
        open={!!waiveTarget}
        onOpenChange={(open) => {
          if (!open) { setWaiveTarget(null); setWaiveReason(''); }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-slate-500" />
              Waive Condition
            </DialogTitle>
          </DialogHeader>

          {waiveTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Condition</p>
                <p className="text-sm font-medium">{waiveTarget.individual_name}</p>
                <p className="text-sm text-muted-foreground">{waiveTarget.description ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Due: {fmtDate(waiveTarget.due_date)}</p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="waive-reason" className="text-sm">
                  Waiver reason <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="waive-reason"
                  rows={4}
                  placeholder="State the basis for waiving this condition…"
                  value={waiveReason}
                  onChange={(e) => setWaiveReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => { setWaiveTarget(null); setWaiveReason(''); }}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              variant="secondary"
              disabled={!waiveReason.trim() || waiveMutation.isPending}
              onClick={() => {
                if (waiveTarget) waiveMutation.mutate({ id: waiveTarget.id, reason: waiveReason, condition: waiveTarget });
              }}
            >
              {waiveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm Waiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* History dialog — reminder / SLA breach log for one condition       */}
      {/* ----------------------------------------------------------------- */}
      <Dialog open={!!historyTarget} onOpenChange={(open) => { if (!open) setHistoryTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-muted-foreground" />
              Reminder &amp; Breach Log
            </DialogTitle>
          </DialogHeader>

          {historyTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Condition</p>
                <p className="text-sm font-medium">{historyTarget.individual_name}</p>
                <p className="text-sm text-muted-foreground">{historyTarget.description ?? '—'}</p>
                <p className="text-xs text-muted-foreground">Due: {fmtDate(historyTarget.due_date)}</p>
              </div>

              {historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading log…
                </div>
              ) : !historyEvents || historyEvents.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No reminders or breaches logged yet for this condition.
                </p>
              ) : (
                <ul className="space-y-2 max-h-72 overflow-y-auto">
                  {historyEvents.map((ev: any) => (
                    <li key={ev.id} className="rounded-md border p-2.5 text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded font-semibold tracking-wide ${
                          ev.event_type === 'condition_overdue'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {ev.event_type === 'condition_overdue' ? 'BREACH' : 'REMINDER'}
                        </span>
                        <span className="text-muted-foreground tabular-nums">{new Date(ev.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-foreground">{ev.summary}</p>
                      {ev.acknowledged_at && (
                        <p className="text-muted-foreground">Acknowledged {new Date(ev.acknowledged_at).toLocaleString()}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setHistoryTarget(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ----------------------------------------------------------------- */}
      {/* Add Condition dialog                                               */}
      {/* ----------------------------------------------------------------- */}
      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open) {
            setAddOpen(false);
            setAddIndividualId('');
            setAddDeterminationId('');
            setAddDescription('');
            setAddCategory('');
            setAddDueDate('');
            setAddMonitoringOwner('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Add Condition
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Individual */}
            <div className="space-y-1.5">
              <Label htmlFor="add-individual" className="text-sm">
                Individual <span className="text-red-500">*</span>
              </Label>
              {individualsError ? (
                <SelectTrigger disabled className="opacity-60">
                  <SelectValue placeholder="Failed to load individuals — retry" />
                </SelectTrigger>
              ) : (
                <Select
                  value={addIndividualId}
                  onValueChange={(v) => {
                    setAddIndividualId(v);
                    setAddDeterminationId('');
                  }}
                >
                  <SelectTrigger id="add-individual">
                    <SelectValue placeholder="Select individual…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(individuals ?? []).map((ind) => (
                      <SelectItem key={ind.id} value={ind.id}>
                        {ind.full_name ?? ind.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Determination */}
            <div className="space-y-1.5">
              <Label htmlFor="add-determination" className="text-sm">
                Linked Determination <span className="text-red-500">*</span>
              </Label>
              {determinationsError ? (
                <SelectTrigger disabled className="opacity-60">
                  <SelectValue placeholder="Failed to load determinations — retry" />
                </SelectTrigger>
              ) : (
                <Select
                  value={addDeterminationId}
                  onValueChange={setAddDeterminationId}
                  disabled={!addIndividualId}
                >
                  <SelectTrigger id="add-determination">
                    <SelectValue placeholder={addIndividualId ? 'Select determination…' : 'Select individual first'} />
                  </SelectTrigger>
                  <SelectContent>
                    {(determinationsForIndividual ?? []).map((det) => (
                      <SelectItem key={det.id} value={det.id}>
                        {fmtDeterminationLabel(det)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {addIndividualId && (determinationsForIndividual ?? []).length === 0 && !determinationsError && (
                <p className="text-xs text-muted-foreground">
                  No determinations recorded for this individual yet — record one on the Determinations screen first.
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="add-description" className="text-sm">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="add-description"
                rows={3}
                placeholder="Describe the condition the individual must meet…"
                value={addDescription}
                onChange={(e) => setAddDescription(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Category */}
              <div className="space-y-1.5">
                <Label htmlFor="add-category" className="text-sm">
                  Category <span className="text-red-500">*</span>
                </Label>
                <Select value={addCategory} onValueChange={setAddCategory}>
                  <SelectTrigger id="add-category">
                    <SelectValue placeholder="Select category…" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Due Date */}
              <div className="space-y-1.5">
                <Label htmlFor="add-due-date" className="text-sm">
                  Due Date <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="add-due-date"
                  type="date"
                  value={addDueDate}
                  min={TODAY}
                  onChange={(e) => setAddDueDate(e.target.value)}
                />
              </div>
            </div>

            {/* Monitoring Owner */}
            <div className="space-y-1.5">
              <Label htmlFor="add-owner" className="text-sm">Monitoring Owner</Label>
              <Select
                value={addMonitoringOwner || NONE_SENTINEL}
                onValueChange={(v) => setAddMonitoringOwner(v === NONE_SENTINEL ? '' : v)}
              >
                <SelectTrigger id="add-owner">
                  <SelectValue placeholder="Select the person/team responsible…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_SENTINEL}>Not assigned</SelectItem>
                  {(monitoringOwners ?? []).map((e) => (
                    <SelectItem key={e.id} value={e.id}>{e.full_name || e.email || e.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setAddOpen(false)}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.create"
              disabled={
                !addIndividualId ||
                !addDeterminationId ||
                addDeterminationId === NONE_SENTINEL ||
                !addCategory.trim() ||
                !addDescription.trim() ||
                !addDueDate ||
                addMutation.isPending
              }
              onClick={() => addMutation.mutate()}
            >
              {addMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Condition
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
