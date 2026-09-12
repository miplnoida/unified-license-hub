import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpFindingAssign } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { useEmployeeApprovers, type EmployeeApprover } from '@/hooks/useEmployeeApprovers';
import { toast } from 'sonner';
import {
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  User,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  ShieldAlert,
  MessageSquare,
  Search,
} from 'lucide-react';

// ─── helpers ────────────────────────────────────────────────────────────────

function severityColor(severity: string) {
  switch (severity?.toLowerCase()) {
    case 'high':
      return 'bg-rose-500';
    case 'medium':
      return 'bg-amber-400';
    case 'low':
      return 'bg-emerald-500';
    default:
      return 'bg-slate-300';
  }
}

function severityBadgeVariant(severity: string): 'destructive' | 'default' | 'secondary' | 'outline' {
  switch (severity?.toLowerCase()) {
    case 'high':
      return 'destructive';
    case 'medium':
      return 'default';
    default:
      return 'secondary';
  }
}

function routingLabel(severity: string) {
  return severity?.toLowerCase() === 'high' ? 'SUPERVISOR QUEUE' : 'ASSESSOR REVIEW';
}

function truncate(text: string | null | undefined, max = 120) {
  if (!text) return null;
  return text.length <= max ? text : text.slice(0, max) + '…';
}

function formatDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function todayIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ─── types ───────────────────────────────────────────────────────────────────

// individual_id and assessment_id are non-nullable per the fp_findings Row schema in types.ts
interface Finding {
  id: string;
  assessment_id: string;
  individual_id: string;
  title: string | null;
  summary: string | null;
  severity: string | null;
  resolution_status: string | null;
  check_type: string | null;
  source: string | null;
  review_note: string | null;
  created_at: string | null;
  resolved_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  assigned_to: string | null;
  // joined
  individual_name?: string | null;
}

// ─── stat card ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: number | undefined;
  accent: string;
}) {
  return (
    <Card className="flex-1 min-w-0">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${accent}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {value ?? <Loader2 className="h-5 w-5 animate-spin inline" />}
          </p>
          <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── task card ───────────────────────────────────────────────────────────────

function TaskCard({
  finding,
  employees,
  onAssign,
  assigning,
}: {
  finding: Finding;
  employees: EmployeeApprover[];
  onAssign: (userId: string) => void;
  assigning: boolean;
}) {
  const isHigh = finding.severity?.toLowerCase() === 'high';

  return (
    <div className="relative flex rounded-lg border bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* severity stripe */}
      <div className={`w-1 flex-shrink-0 ${severityColor(finding.severity ?? '')}`} aria-hidden="true" />

      <div className="flex flex-col flex-1 gap-3 p-4">
        {/* header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Badge variant={severityBadgeVariant(finding.severity ?? '')} className="text-xs uppercase tracking-wide shrink-0">
              {finding.severity ?? '—'}
            </Badge>
            <Badge
              className={`text-xs font-semibold tracking-wide shrink-0 ${
                isHigh
                  ? 'bg-rose-100 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  : 'bg-amber-100 text-amber-700 border border-amber-200 hover:bg-amber-100'
              }`}
              variant="outline"
            >
              {routingLabel(finding.severity ?? '')}
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap shrink-0">
            {formatDate(finding.created_at)}
          </span>
        </div>

        {/* title */}
        <p className="font-semibold text-sm leading-snug text-foreground">
          {finding.title ?? 'Untitled finding'}
        </p>

        {/* summary */}
        {finding.summary && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {truncate(finding.summary)}
          </p>
        )}

        <Separator className="my-0.5" />

        {/* meta row */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="h-3.5 w-3.5" />
            {finding.individual_name ?? 'Unknown individual'}
          </span>
          {finding.check_type && (
            <span className="flex items-center gap-1">
              <ShieldAlert className="h-3.5 w-3.5" />
              {finding.check_type.replace(/_/g, ' ')}
            </span>
          )}
          {finding.source && (
            <span className="flex items-center gap-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {finding.source}
            </span>
          )}
          {finding.resolution_status && (
            <span className="flex items-center gap-1 capitalize">
              <Clock className="h-3.5 w-3.5" />
              {finding.resolution_status.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        {/* review note */}
        {finding.review_note && (
          <div className="flex gap-1.5 text-xs bg-muted/50 rounded px-2 py-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
            <span className="text-muted-foreground">{truncate(finding.review_note, 140)}</span>
          </div>
        )}

        {/* action row */}
        <div className="flex items-center gap-2 pt-0.5">
          <Select value={finding.assigned_to ?? undefined} onValueChange={onAssign} disabled={assigning}>
            <SelectTrigger className="h-8 text-xs w-48">
              {assigning ? (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Assigning…
                </span>
              ) : (
                <SelectValue placeholder="Assign to…" />
              )}
            </SelectTrigger>
            <SelectContent>
              {employees.length === 0 && (
                <SelectItem value="__none__" disabled>No active employees found</SelectItem>
              )}
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.full_name || e.email || e.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="secondary" className="text-xs h-8 ml-auto" asChild>
            <Link to={`/fpa/manual-tasks/${finding.id}`}>
              Open
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function FpaManualTasks() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Severity filter uses lowercase values that match DB storage directly
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // ── fetch findings joined with individuals ────────────────────────────────
  // individual_id is always non-null per the fp_findings schema, so we look
  // up names directly without any assessment fallback.
  const { data: findings, isLoading } = useQuery<Finding[]>({
    queryKey: ['fpa_manual_tasks', severityFilter, statusFilter],
    queryFn: async () => {
      // The DB trigger sets resolution_status to 'pending', 'needs_review',
      // 'true_positive_draft', or 'false_positive_draft' on insert
      // (fp_finding_apply_confidence_bands, keyed off confidence_score) —
      // none of these are a human decision, just a confidence-based
      // pre-fill, so 'false_positive_draft' needs a human to confirm/reject
      // it exactly like 'true_positive_draft' does. Only 'false_positive'
      // and 'confirmed' (set by staff via Mark Cleared / Confirm Adverse in
      // FpaManualTaskDetail.tsx) are actually resolved.
      // 'under_review' is set by the "Assign to Me" action.
      const ACTIONABLE_STATUSES = ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft', 'under_review'];

      // assigned_to is cast via `as any` below — it's a recently-added column
      // not yet reflected in the generated Supabase types.
      let query = supabase
        .from('fp_findings' as any)
        .select(
          `id, assessment_id, individual_id, title, summary, severity,
           resolution_status, check_type, source, review_note,
           created_at, resolved_at, reviewed_at, reviewed_by, assigned_to`
        )
        .in('resolution_status', ACTIONABLE_STATUSES)
        .in('severity', ['high', 'medium', 'low'])
        .order('created_at', { ascending: false });

      if (severityFilter !== 'all') {
        query = query.eq('severity', severityFilter);
      }
      if (statusFilter === 'open') {
        // 'open' covers all unassigned states before someone claims a task
        query = query.in('resolution_status', ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft']);
      } else if (statusFilter !== 'all') {
        query = query.eq('resolution_status', statusFilter);
      }

      const { data: rawFindings, error } = await query;
      if (error) throw error;

      const findings = (rawFindings ?? []) as unknown as Finding[];

      // individual_id is always present (non-nullable in schema), so look up
      // names directly without any assessment-based fallback.
      const individualIds = [...new Set(findings.map((f) => f.individual_id))];
      const individualNameMap: Record<string, string> = {};

      if (individualIds.length > 0) {
        const { data: individuals } = await supabase
          .from('fp_individuals')
          .select('id, full_name')
          .in('id', individualIds);
        (individuals ?? []).forEach((ind: { id: string; full_name: string }) => {
          individualNameMap[ind.id] = ind.full_name;
        });
      }

      return findings.map((f) => ({
        ...f,
        individual_name: individualNameMap[f.individual_id] ?? null,
      }));
    },
  });

  // ── search: locate a specific assessment by ID, individual name, or title ──
  const filteredFindings = useMemo(() => {
    if (!findings) return findings;
    const q = search.trim().toLowerCase();
    if (!q) return findings;
    return findings.filter((f) =>
      f.assessment_id?.toLowerCase().includes(q) ||
      f.individual_name?.toLowerCase().includes(q) ||
      f.title?.toLowerCase().includes(q)
    );
  }, [findings, search]);

  // ── active employees for the assignee dropdown ────────────────────────────
  const { data: allEmployees } = useEmployeeApprovers();
  const activeEmployees = (allEmployees ?? []).filter((e) => e.status === 'active');

  // ── stat queries ──────────────────────────────────────────────────────────
  // Unassigned = resolution_status is one of the pre-claim states — status is
  // the reliable indicator since a task can be assigned without having been
  // reviewed yet.
  const {
    data: allFindings,
    isError: isStatsError,
  } = useQuery<Finding[]>({
    queryKey: ['fpa_manual_tasks_all_stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_findings')
        .select('id, resolution_status, resolved_at, reviewed_at, reviewed_by')
        .in('resolution_status', ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft', 'under_review', 'resolved'])
        .in('severity', ['high', 'medium', 'low']);
      if (error) throw error;
      return (data ?? []) as Finding[];
    },
  });

  // Use resolution_status === 'open' as the reliable "unassigned" indicator.
  // reviewed_at being null is not a reliable assignment proxy since a finding
  // can be reviewed without being assigned via the manual queue.
  const statsUnassigned = isStatsError ? 0 : allFindings?.filter(
    (f) => ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft'].includes(f.resolution_status ?? '')
  ).length;
  const statsInProgress = isStatsError ? 0 : allFindings?.filter(
    (f) => f.resolution_status === 'under_review'
  ).length;
  const statsCompletedToday = isStatsError ? 0 : allFindings?.filter(
    (f) => f.resolved_at && f.resolved_at >= todayIso()
  ).length;

  // ── assign mutation ───────────────────────────────────────────────────────
  // assigned_to records who the task is assigned to; reviewed_by records the
  // current user as the one who performed the assignment action.
  const assignMutation = useMutation({
    mutationFn: async ({ findingId, userId }: { findingId: string; userId: string }) => {
      if (!user?.id) throw new Error('Not authenticated');
      await fpFindingAssign(findingId, userId);
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_finding_assigned', entity_type: 'fp_finding', entity_id: findingId, payload: { assigned_to: userId } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Task assigned.');
      qc.invalidateQueries({ queryKey: ['fpa_manual_tasks'] });
      qc.invalidateQueries({ queryKey: ['fpa_manual_tasks_all_stats'] });
    },
    onError: (e: Error) => toast.error(e?.message ?? 'Assignment failed'),
  });

  const [assigningId, setAssigningId] = useState<string | null>(null);

  const handleAssign = (findingId: string, userId: string) => {
    setAssigningId(findingId);
    assignMutation.mutate({ findingId, userId }, { onSettled: () => setAssigningId(null) });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="Manual Review Queue"
          description="Manual screening tasks for adverse findings requiring human review — FPA-006"
        />

        {/* stats row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <StatCard
            icon={AlertTriangle}
            label="Unassigned"
            value={statsUnassigned}
            accent="bg-rose-500"
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={statsInProgress}
            accent="bg-amber-500"
          />
          <StatCard
            icon={CheckCircle2}
            label="Completed Today"
            value={statsCompletedToday}
            accent="bg-emerald-500"
          />
        </div>

        {isStatsError && (
          <p className="text-xs text-destructive">
            Stats could not be loaded. Counts above show 0 as a fallback.
          </p>
        )}

        {/* filter bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 pl-9"
              placeholder="Search by assessment ID, individual, or title…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Severity</span>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="h-9 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severities</SelectItem>
                <SelectItem value="high">HIGH</SelectItem>
                <SelectItem value="medium">MEDIUM</SelectItem>
                <SelectItem value="low">LOW</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground whitespace-nowrap">Status</span>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="open">Unreviewed</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {(severityFilter !== 'all' || statusFilter !== 'all' || search.trim() !== '') && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              onClick={() => { setSeverityFilter('all'); setStatusFilter('all'); setSearch(''); }}
            >
              Clear filters
            </Button>
          )}

          <span className="ml-auto text-xs text-muted-foreground">
            {filteredFindings !== undefined ? (
              <>
                {filteredFindings.length} task{filteredFindings.length !== 1 ? 's' : ''}
              </>
            ) : null}
          </span>
        </div>

        {/* task grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading tasks…</span>
          </div>
        ) : !filteredFindings || filteredFindings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
            <CalendarDays className="h-8 w-8 opacity-40" />
            <p className="text-sm">No tasks match the current filters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredFindings.map((finding) => (
              <TaskCard
                key={finding.id}
                finding={finding}
                employees={activeEmployees}
                onAssign={(userId) => handleAssign(finding.id, userId)}
                assigning={assigningId === finding.id && assignMutation.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
