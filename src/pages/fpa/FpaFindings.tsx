import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpFindingEscalate } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logComplianceAudit } from '@/lib/complianceAudit';
import {
  Loader2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ArrowUpCircle,
  Eye,
  Filter,
  TrendingUp,
  ClipboardList,
  Search,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface RawFinding {
  id: string;
  assessment_id: string;
  individual_id: string;
  title: string | null;
  summary: string | null;
  severity: string | null;
  resolution_status: string | null;
  check_type: string | null;
  source: string | null;
  confidence_score: number | null;
  review_note: string | null;
  is_false_positive: boolean | null;
  created_at: string | null;
  reviewed_at: string | null;
  assigned_to: string | null;
  severity_basis: {
    escalated?: boolean;
    escalated_at?: string;
    escalated_by?: string;
    note?: string;
    source?: string;
    reason?: string;
    [key: string]: unknown;
  } | null;
  // joined
  individual_name?: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const SEVERITY_ORDER: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

function normSeverity(s: string | null): string {
  return (s ?? '').toUpperCase();
}

function normStatus(s: string | null): string {
  return (s ?? '').toLowerCase();
}

function severityBadgeClass(sev: string): string {
  switch (sev) {
    case 'HIGH':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'MEDIUM':
      return 'bg-amber-100 text-amber-800 border border-amber-300';
    case 'LOW':
      return 'bg-green-100 text-green-800 border border-green-300';
    default:
      return 'bg-slate-100 text-slate-700 border border-slate-200';
  }
}

function routingBadge(sev: string): { label: string; cls: string } {
  if (sev === 'HIGH') {
    return { label: 'SUPERVISOR QUEUE', cls: 'bg-red-100 text-red-800 border border-red-300' };
  }
  return { label: 'ASSESSOR REVIEW', cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-blue-100 text-blue-800 border border-blue-300';
    case 'needs_review':
      return 'bg-amber-100 text-amber-800 border border-amber-300';
    case 'true_positive_draft':
      return 'bg-red-100 text-red-800 border border-red-300';
    case 'false_positive_draft':
      return 'bg-green-100 text-green-800 border border-green-300';
    case 'under_review':
      return 'bg-purple-100 text-purple-800 border border-purple-300';
    case 'resolved':
      return 'bg-slate-100 text-slate-700 border border-slate-200';
    default:
      return 'bg-slate-100 text-slate-600 border border-slate-200';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'pending':          return 'Pending';
    case 'needs_review':     return 'Needs Review';
    case 'true_positive_draft': return 'True Positive';
    case 'false_positive_draft': return 'False Positive';
    case 'under_review':    return 'Under Review';
    case 'resolved':        return 'Resolved';
    default:                return status.replace(/_/g, ' ') || '—';
  }
}

function formatDate(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '—';
  }
}

function truncate(str: string | null, len: number): string {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------
interface StatCardProps {
  label: string;
  value: number;
  colorClass?: string;
  icon?: React.ReactNode;
}

function StatCard({ label, value, colorClass = '', icon }: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden ${colorClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          </div>
          {icon && <div className="opacity-30 mt-0.5">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function FpaFindings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();

  // Filters
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [checkTypeFilter, setCheckTypeFilter] = useState<string>('ALL');
  const [quickTab, setQuickTab] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const tab = searchParams.get('quickTab');
    if (tab === 'action' || tab === 'high' || tab === 'confirmed') {
      setQuickTab(tab);
    }
  }, [searchParams]);

  const individualIdFilter = searchParams.get('individual_id');

  // Escalate dialog
  const [escalateTarget, setEscalateTarget] = useState<RawFinding | null>(null);
  const [escalateNote, setEscalateNote] = useState('');

  // ---------------------------------------------------------------------------
  // Data fetch: findings + joined individual name
  // ---------------------------------------------------------------------------
  const { data: findings, isLoading, isError, error } = useQuery({
    queryKey: ['fp_findings_console'],
    queryFn: async (): Promise<RawFinding[]> => {
      // Fetch findings
      const { data: raw, error } = await (supabase as any)
        .from('fp_findings')
        .select(`
          id,
          assessment_id,
          individual_id,
          title,
          summary,
          severity,
          resolution_status,
          check_type,
          source,
          confidence_score,
          review_note,
          is_false_positive,
          created_at,
          reviewed_at,
          assigned_to,
          severity_basis
        `)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw error;
      const rows: any[] = raw ?? [];

      // Collect individual IDs (directly on finding or via assessments)
      const directIndividualIds = rows.map((r: any) => r.individual_id).filter(Boolean);
      const assessmentIds = rows.map((r: any) => r.assessment_id).filter(Boolean);

      // Build individual_id map from assessments
      const assessmentIndividualMap: Record<string, string> = {};
      if (assessmentIds.length > 0) {
        const { data: assData } = await (supabase as any)
          .from('fp_assessments')
          .select('id, individual_id')
          .in('id', assessmentIds);
        (assData ?? []).forEach((a: any) => {
          if (a.individual_id) assessmentIndividualMap[a.id] = a.individual_id;
        });
      }

      // Resolve all individual IDs
      const allIndividualIds = Array.from(
        new Set([
          ...directIndividualIds,
          ...Object.values(assessmentIndividualMap),
        ])
      );

      // Fetch names
      const nameMap: Record<string, string> = {};
      if (allIndividualIds.length > 0) {
        const { data: indData } = await (supabase as any)
          .from('fp_individuals')
          .select('id, full_name')
          .in('id', allIndividualIds);
        (indData ?? []).forEach((ind: any) => {
          nameMap[ind.id] = ind.full_name ?? '—';
        });
      }

      // Merge
      const merged: RawFinding[] = rows.map((r: any) => {
        const resolvedId =
          r.individual_id ||
          (r.assessment_id ? assessmentIndividualMap[r.assessment_id] : null);
        return {
          ...r,
          individual_id: resolvedId ?? r.individual_id,
          individual_name: resolvedId ? (nameMap[resolvedId] ?? '—') : '—',
        };
      });

      // Sort: HIGH first, then by created_at desc
      merged.sort((a, b) => {
        const sa = SEVERITY_ORDER[normSeverity(a.severity)] ?? 99;
        const sb = SEVERITY_ORDER[normSeverity(b.severity)] ?? 99;
        if (sa !== sb) return sa - sb;
        return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      });

      return merged;
    },
  });

  // ---------------------------------------------------------------------------
  // Check types for filter dropdown (derived from data)
  // ---------------------------------------------------------------------------
  const checkTypes = useMemo(() => {
    const types = new Set<string>();
    (findings ?? []).forEach((f) => {
      if (f.check_type) types.add(f.check_type);
    });
    return Array.from(types).sort();
  }, [findings]);

  // ---------------------------------------------------------------------------
  // Client-side filtering
  // ---------------------------------------------------------------------------
  const filtered = useMemo(() => {
    let rows = findings ?? [];

    // Individual filter (deep-linked from an individual's profile)
    if (individualIdFilter) {
      rows = rows.filter((f) => f.individual_id === individualIdFilter);
    }

    // Quick tab filter
    if (quickTab === 'action') {
      // 'false_positive_draft' is a confidence-based auto-classification
      // (fp_finding_apply_confidence_bands), not a human decision — it still
      // needs someone to confirm/reject it, same as 'true_positive_draft'.
      rows = rows.filter((f) => ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft', 'under_review'].includes(normStatus(f.resolution_status)));
    } else if (quickTab === 'high') {
      rows = rows.filter((f) => normSeverity(f.severity) === 'HIGH');
    } else if (quickTab === 'confirmed') {
      rows = rows.filter((f) => normStatus(f.resolution_status) === 'true_positive_draft');
    } else if (quickTab === 'escalated') {
      rows = rows.filter((f) => f.severity_basis?.escalated === true);
    }

    // Severity filter
    if (severityFilter !== 'ALL') {
      rows = rows.filter((f) => normSeverity(f.severity) === severityFilter);
    }

    // Status filter
    if (statusFilter !== 'ALL') {
      rows = rows.filter((f) => normStatus(f.resolution_status) === statusFilter);
    }

    // Check type filter
    if (checkTypeFilter !== 'ALL') {
      rows = rows.filter((f) => f.check_type === checkTypeFilter);
    }

    // Free-text search — locate a specific assessment by ID, individual, or title
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((f) =>
        f.assessment_id?.toLowerCase().includes(q) ||
        f.individual_name?.toLowerCase().includes(q) ||
        f.title?.toLowerCase().includes(q)
      );
    }

    return rows;
  }, [findings, individualIdFilter, quickTab, severityFilter, statusFilter, checkTypeFilter, search]);

  // ---------------------------------------------------------------------------
  // Stats (always from full dataset, not filtered)
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const all = findings ?? [];
    return {
      total: all.length,
      high: all.filter((f) => normSeverity(f.severity) === 'HIGH').length,
      medium: all.filter((f) => normSeverity(f.severity) === 'MEDIUM').length,
      low: all.filter((f) => normSeverity(f.severity) === 'LOW').length,
      open: all.filter((f) => ['pending', 'needs_review', 'true_positive_draft', 'false_positive_draft', 'under_review'].includes(normStatus(f.resolution_status))).length,
      confirmed: all.filter((f) => normStatus(f.resolution_status) === 'true_positive_draft').length,
      escalated: all.filter((f) => f.severity_basis?.escalated === true).length,
    };
  }, [findings]);

  // ---------------------------------------------------------------------------
  // Escalate mutation
  // ---------------------------------------------------------------------------
  const escalateMutation = useMutation({
    mutationFn: async ({ finding, note }: { finding: RawFinding; note: string }) => {
      await fpFindingEscalate(finding.id, note.trim());

      // Best-effort compliance audit log — routed through the shared RPC
      // helper (log_compliance_audit) like every other F&P screen, instead
      // of inserting into compliance_audit_logs directly. Direct inserts
      // bypass the server-side actor/role attribution the RPC provides and
      // drift from the one audited path the rest of the module uses.
      try {
        await logComplianceAudit({
          action_type: 'WORKFLOW_TRANSITION',
          object_type: 'fp_findings',
          object_id: finding.id,
          after_value: { note, finding_title: finding.title, severity: finding.severity },
        });
      } catch {
        // non-fatal
      }

      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_high_severity_finding', entity_type: 'fp_finding', entity_id: finding.id, payload: { individual_id: finding.individual_id, high_count: 1 } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Finding escalated to supervisor queue');
      qc.invalidateQueries({ queryKey: ['fp_findings_console'] });
      setEscalateTarget(null);
      setEscalateNote('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Escalation failed'),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <PageHeader
          title="Findings Console"
          description="All adverse findings with severity routing and escalation — FPA-007"
        />

        {individualIdFilter && (
          <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 px-4 py-2 text-sm">
            <span>
              Showing findings for{' '}
              <span className="font-medium">
                {filtered[0]?.individual_name ?? (findings ?? []).find((f) => f.individual_id === individualIdFilter)?.individual_name ?? 'this individual'}
              </span>{' '}
              only.
            </span>
            <Link to="/fpa/findings" className="text-primary hover:underline">
              Clear filter
            </Link>
          </div>
        )}

        {/* Stats row */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading findings…
          </div>
        ) : isError ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-red-800">Failed to load findings</p>
                <p className="text-sm text-red-700 mt-1">
                  {(error as any)?.message ?? 'An unexpected error occurred. Please try again.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="Total"
                value={stats.total}
                colorClass="bg-card text-card-foreground"
                icon={<TrendingUp className="h-6 w-6" />}
              />
              <StatCard
                label="HIGH"
                value={stats.high}
                colorClass="bg-red-50 border-red-200 text-red-900"
                icon={<ShieldAlert className="h-6 w-6" />}
              />
              <StatCard
                label="MEDIUM"
                value={stats.medium}
                colorClass="bg-amber-50 border-amber-200 text-amber-900"
                icon={<AlertTriangle className="h-6 w-6" />}
              />
              <StatCard
                label="LOW"
                value={stats.low}
                colorClass="bg-green-50 border-green-200 text-green-900"
                icon={<ShieldCheck className="h-6 w-6" />}
              />
              <StatCard
                label="Open"
                value={stats.open}
                colorClass="bg-blue-50 border-blue-200 text-blue-900"
                icon={<Eye className="h-6 w-6" />}
              />
              <StatCard
                label="Confirmed Adverse"
                value={stats.confirmed}
                colorClass="bg-rose-50 border-rose-200 text-rose-900"
                icon={<ShieldOff className="h-6 w-6" />}
              />
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                    <Filter className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Search</Label>
                    <div className="relative w-56">
                      <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-8 pl-8"
                        placeholder="Assessment ID, individual, or title…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Severity</Label>
                    <Select value={severityFilter} onValueChange={setSeverityFilter}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All severities</SelectItem>
                        <SelectItem value="HIGH">HIGH</SelectItem>
                        <SelectItem value="MEDIUM">MEDIUM</SelectItem>
                        <SelectItem value="LOW">LOW</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Resolution Status</Label>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="needs_review">Needs Review</SelectItem>
                        <SelectItem value="true_positive_draft">True Positive</SelectItem>
                        <SelectItem value="false_positive_draft">False Positive</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Check Type</Label>
                    <Select value={checkTypeFilter} onValueChange={setCheckTypeFilter}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All check types</SelectItem>
                        {checkTypes.map((ct) => (
                          <SelectItem key={ct} value={ct}>
                            {ct.replace(/_/g, ' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(severityFilter !== 'ALL' || statusFilter !== 'ALL' || checkTypeFilter !== 'ALL' || search.trim() !== '') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setSeverityFilter('ALL');
                        setStatusFilter('ALL');
                        setCheckTypeFilter('ALL');
                        setSearch('');
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick tabs + table */}
            <Tabs value={quickTab} onValueChange={setQuickTab}>
              <TabsList className="h-9">
                <TabsTrigger value="all" className="text-xs">
                  All
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({stats.total})</span>
                </TabsTrigger>
                <TabsTrigger value="action" className="text-xs">
                  Requiring Action
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({stats.open})</span>
                </TabsTrigger>
                <TabsTrigger value="high" className="text-xs">
                  HIGH Priority
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({stats.high})</span>
                </TabsTrigger>
                <TabsTrigger value="confirmed" className="text-xs">
                  Confirmed Adverse
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({stats.confirmed})</span>
                </TabsTrigger>
                <TabsTrigger value="escalated" className="text-xs">
                  Escalated
                  <span className="ml-1.5 tabular-nums text-muted-foreground">({stats.escalated})</span>
                </TabsTrigger>
              </TabsList>

              {/* Single shared content area for all tabs (filtered client-side) */}
              {(['all', 'action', 'high', 'confirmed', 'escalated'] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-3">
                  <Card>
                    <CardContent className="p-0">
                      {filtered.length === 0 ? (
                        <div className="py-16 text-center text-sm text-muted-foreground">
                          No findings match the current filters.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/40">
                                <TableHead className="w-2 p-0" />
                                <TableHead className="text-xs whitespace-nowrap">Severity</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Routing</TableHead>
                                <TableHead className="text-xs">Title</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Individual</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Check Type</TableHead>
                                <TableHead className="text-xs">Source</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Confidence</TableHead>
                                <TableHead className="text-xs">Status</TableHead>
                                <TableHead className="text-xs whitespace-nowrap">Created</TableHead>
                                <TableHead className="text-xs text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {filtered.map((finding) => {
                                const sev = normSeverity(finding.severity);
                                const status = normStatus(finding.resolution_status);
                                const routing = routingBadge(sev);
                                const canEscalate = sev === 'HIGH' && !['false_positive_draft', 'resolved'].includes(status) && finding.severity_basis?.escalated !== true;

                                // Left severity stripe color
                                const stripeColor =
                                  sev === 'HIGH'
                                    ? 'bg-red-500'
                                    : sev === 'MEDIUM'
                                    ? 'bg-amber-400'
                                    : 'bg-green-400';

                                return (
                                  <TableRow key={finding.id} className="group hover:bg-muted/30 transition-colors">
                                    {/* Severity stripe */}
                                    <TableCell className="w-1.5 p-0">
                                      <div className={`h-full w-1.5 min-h-[3rem] rounded-l ${stripeColor}`} />
                                    </TableCell>

                                    {/* Severity badge */}
                                    <TableCell className="py-3">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide ${severityBadgeClass(sev)}`}
                                      >
                                        {sev || '—'}
                                      </span>
                                    </TableCell>

                                    {/* Routing badge */}
                                    <TableCell className="py-3">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${routing.cls}`}
                                      >
                                        {routing.label}
                                      </span>
                                    </TableCell>

                                    {/* Title */}
                                    <TableCell className="py-3 max-w-[200px]">
                                      <span className="text-sm font-medium leading-snug" title={finding.title ?? undefined}>
                                        {truncate(finding.title, 60)}
                                      </span>
                                    </TableCell>

                                    {/* Individual */}
                                    <TableCell className="py-3 text-sm whitespace-nowrap">
                                      {finding.individual_id ? (
                                        <Link
                                          to={`/fpa/individuals/${finding.individual_id}`}
                                          className="text-primary hover:underline"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {finding.individual_name ?? '—'}
                                        </Link>
                                      ) : (
                                        <span className="text-muted-foreground">{finding.individual_name ?? '—'}</span>
                                      )}
                                    </TableCell>

                                    {/* Check type */}
                                    <TableCell className="py-3">
                                      {finding.check_type ? (
                                        <Badge variant="outline" className="text-[10px] whitespace-nowrap">
                                          {finding.check_type.replace(/_/g, ' ')}
                                        </Badge>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">—</span>
                                      )}
                                    </TableCell>

                                    {/* Source */}
                                    <TableCell className="py-3 text-xs text-muted-foreground max-w-[120px] truncate">
                                      {finding.source ?? '—'}
                                    </TableCell>

                                    {/* Confidence */}
                                    <TableCell className="py-3 text-xs tabular-nums text-right">
                                      {finding.confidence_score != null
                                        ? `${Math.round(finding.confidence_score)}%`
                                        : '—'}
                                    </TableCell>

                                    {/* Status */}
                                    <TableCell className="py-3">
                                      <span
                                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${statusBadgeClass(status)}`}
                                      >
                                        {statusLabel(status)}
                                      </span>
                                    </TableCell>

                                    {/* Created date */}
                                    <TableCell className="py-3 text-xs text-muted-foreground whitespace-nowrap">
                                      {formatDate(finding.created_at)}
                                    </TableCell>

                                    {/* Actions */}
                                    <TableCell className="py-3 text-right">
                                      <div className="flex items-center justify-end gap-1.5">
                                        <Button data-rbac="fit_and_proper.view"
                                          size="sm"
                                          variant="ghost"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => navigate(`/fpa/findings/${finding.id}`)}
                                        >
                                          <Eye className="h-3.5 w-3.5 mr-1" />
                                          Review
                                        </Button>
                                        <Button data-rbac="fit_and_proper.edit"
                                          size="sm"
                                          variant="outline"
                                          className="h-7 px-2 text-xs"
                                          onClick={() => navigate(`/fpa/manual-tasks/${finding.id}`)}
                                        >
                                          <ClipboardList className="h-3.5 w-3.5 mr-1" />
                                          Manage
                                        </Button>
                                        {canEscalate ? (
                                          <Button data-rbac="fit_and_proper.edit"
                                            size="sm"
                                            variant="destructive"
                                            className="h-7 px-2 text-xs"
                                            onClick={() => {
                                              setEscalateTarget(finding);
                                              setEscalateNote('');
                                            }}
                                          >
                                            <ArrowUpCircle className="h-3.5 w-3.5 mr-1" />
                                            Escalate
                                          </Button>
                                        ) : finding.severity_basis?.escalated === true ? (
                                          <span className="inline-flex items-center h-7 px-2 text-xs text-red-700 gap-1">
                                            <ArrowUpCircle className="h-3.5 w-3.5" />
                                            Escalated
                                          </span>
                                        ) : null}
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
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </div>

      {/* Escalate dialog */}
      <Dialog
        open={!!escalateTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEscalateTarget(null);
            setEscalateNote('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-red-600" />
              Escalate to Supervisor
            </DialogTitle>
          </DialogHeader>

          {escalateTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-red-50 border-red-200 p-3 space-y-1">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                  HIGH SEVERITY — {statusLabel(normStatus(escalateTarget.resolution_status))}
                </p>
                <p className="text-sm font-medium text-red-900">{escalateTarget.title ?? '—'}</p>
                {escalateTarget.source && (
                  <p className="text-xs text-red-700 opacity-80">Source: {escalateTarget.source}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="escalate-note" className="text-sm">
                  Escalation note <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  id="escalate-note"
                  rows={4}
                  placeholder="Explain the basis for escalation and any recommended action…"
                  value={escalateNote}
                  onChange={(e) => setEscalateNote(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setEscalateTarget(null);
                setEscalateNote('');
              }}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              variant="destructive"
              disabled={!escalateNote.trim() || escalateMutation.isPending}
              onClick={() => {
                if (escalateTarget) {
                  escalateMutation.mutate({ finding: escalateTarget, note: escalateNote });
                }
              }}
            >
              {escalateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Escalate Finding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
