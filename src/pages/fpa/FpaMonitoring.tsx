import { useState, useMemo } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { fpMonitoringEventAcknowledge, fpMonitoringEventRaise } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { authorizedExport } from '@/lib/rbac/authorizedExport';
import { logFpAction } from '@/lib/fpAudit';
import {
  Loader2,
  Activity,
  AlertTriangle,
  BellRing,
  BellOff,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Filter,
  Radio,
  RefreshCw,
  ShieldAlert,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string | null): string {
  if (!isoString) return '—';
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(isoString).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function startOfWeekIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function convertToCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const keys = Object.keys(rows[0]);
  const header = keys.join(',');
  const lines = rows.map((row) =>
    keys.map((k) => {
      const val = row[k] ?? '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  return [header, ...lines].join('\n');
}

function downloadCSV(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Safely render a JSON value from the DB as a displayable string
function renderDetailValue(detail: unknown): string {
  if (detail === null || detail === undefined) return '';
  if (typeof detail === 'string') return detail;
  if (typeof detail === 'object') {
    const obj = detail as Record<string, unknown>;
    // If stored as { text: "..." }, unwrap that
    if (typeof obj.text === 'string') return obj.text;
    return JSON.stringify(detail);
  }
  return String(detail);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonitoringEvent {
  id: string;
  individual_id: string | null;
  determination_id: string | null;
  event_type: string | null;
  summary: string | null;
  // detail is Json | null in the DB schema
  detail: unknown;
  severity: string | null;
  raised_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  acknowledgement_note: string | null;
  // joined
  individual_name?: string | null;
}

interface Individual {
  id: string;
  full_name: string | null;
}

// Matches the real compliance_audit_logs schema columns:
// entry_id (PK), action_type, object_type, object_id, user_id,
// metadata, justification, before_value, after_value, timestamp, created_at
interface AuditLog {
  entry_id: string;
  created_at: string | null;
  action_type: string | null;
  object_type: string | null;
  object_id: string | null;
  user_id: string | null;
  metadata: unknown;
  justification: string | null;
  before_value: unknown;
  after_value: unknown;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

function severityDotClass(severity: string | null): string {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high') return 'bg-red-500';
  if (s === 'medium') return 'bg-amber-400';
  return 'bg-emerald-500';
}

function severityBadgeClass(severity: string | null): string {
  const s = (severity ?? '').toLowerCase();
  if (s === 'high') return 'bg-red-100 text-red-800 border border-red-300';
  if (s === 'medium') return 'bg-amber-100 text-amber-800 border border-amber-300';
  return 'bg-emerald-100 text-emerald-800 border border-emerald-300';
}

function eventTypeBadgeClass(eventType: string | null): string {
  const t = (eventType ?? '').toLowerCase();
  if (t === 'media_alert') return 'bg-rose-50 text-rose-700 border border-rose-200';
  if (t === 'complaint') return 'bg-orange-50 text-orange-700 border border-orange-200';
  if (t === 'regulatory_notice') return 'bg-violet-50 text-violet-700 border border-violet-200';
  if (t === 'role_change') return 'bg-blue-50 text-blue-700 border border-blue-200';
  if (t === 'assessment_due') return 'bg-sky-50 text-sky-700 border border-sky-200';
  if (t === 'self_report') return 'bg-teal-50 text-teal-700 border border-teal-200';
  if (t === 'manual_flag') return 'bg-red-50 text-red-700 border border-red-200';
  return 'bg-slate-50 text-slate-600 border border-slate-200';
}

function eventTypeLabel(eventType: string | null): string {
  return (eventType ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) || '—';
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number | undefined;
  isLoading: boolean;
  icon: React.ReactNode;
  colorClass: string;
}

function StatCard({ label, value, isLoading, icon, colorClass }: StatCardProps) {
  return (
    <Card className={`relative overflow-hidden ${colorClass}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin opacity-50 inline" /> : (value ?? 0)}
            </p>
          </div>
          <div className="opacity-25 mt-0.5">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline event row
// ---------------------------------------------------------------------------

interface EventRowProps {
  event: MonitoringEvent;
  onAcknowledge: (event: MonitoringEvent) => void;
}

function EventRow({ event, onAcknowledge }: EventRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isHigh = (event.severity ?? '').toLowerCase() === 'high';
  const isAcknowledged = !!event.acknowledged_at;
  const detailText = renderDetailValue(event.detail);

  return (
    <div className="flex gap-4 group">
      {/* Timeline spine */}
      <div className="flex flex-col items-center flex-shrink-0 pt-1">
        <div className="relative">
          {isHigh && !isAcknowledged ? (
            <span className="flex h-3 w-3">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${severityDotClass(event.severity)}`} />
              <span className={`relative inline-flex rounded-full h-3 w-3 ${severityDotClass(event.severity)}`} />
            </span>
          ) : (
            <span className={`inline-flex rounded-full h-3 w-3 ${severityDotClass(event.severity)}`} />
          )}
        </div>
        <div className="w-px bg-border flex-1 mt-2 min-h-[2rem]" />
      </div>

      {/* Event content */}
      <div className="flex-1 min-w-0 pb-5">
        <div className="flex flex-wrap items-start gap-2 mb-1">
          {/* Event type badge */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${eventTypeBadgeClass(event.event_type)}`}
          >
            {eventTypeLabel(event.event_type)}
          </span>

          {/* Severity badge */}
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase ${severityBadgeClass(event.severity)}`}
          >
            {event.severity ?? '—'}
          </span>

          {/* Critical alert badge */}
          {isHigh && !isAcknowledged && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-red-600 text-white">
              <ShieldAlert className="h-2.5 w-2.5" />
              Critical Alert
            </span>
          )}

          {/* Acknowledged badge */}
          {isAcknowledged && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              <CheckCircle2 className="h-2.5 w-2.5" />
              Acknowledged
            </span>
          )}
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {event.individual_name && (
                <span className="text-muted-foreground font-normal mr-1">{event.individual_name} —</span>
              )}
              {event.summary ?? '—'}
            </p>

            {detailText && (
              <div className="mt-1">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {expanded ? 'Collapse detail' : 'Show detail'}
                </button>
                {expanded && (
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed bg-muted/50 rounded p-2 border">
                    {detailText}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
              {relativeTime(event.raised_at)}
            </span>
            {!isAcknowledged && (
              <Button data-rbac="fit_and_proper.edit"
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-xs gap-1.5"
                onClick={() => onAcknowledge(event)}
              >
                <BellOff className="h-3 w-3" />
                Acknowledge
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function FpaMonitoring() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // ── Trigger event dialog state ──────────────────────────────────────────
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerIndividualId, setTriggerIndividualId] = useState('');
  const [triggerEventType, setTriggerEventType] = useState('');
  const [triggerSeverity, setTriggerSeverity] = useState('');
  const [triggerSummary, setTriggerSummary] = useState('');
  const [triggerDetail, setTriggerDetail] = useState('');

  // ── Acknowledge dialog state ────────────────────────────────────────────
  const [ackTarget, setAckTarget] = useState<MonitoringEvent | null>(null);
  const [ackNote, setAckNote] = useState('');

  // ── Events stream filters ───────────────────────────────────────────────
  const [filterEventType, setFilterEventType] = useState('ALL');
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [filterAcknowledged, setFilterAcknowledged] = useState('ALL');

  // ── Fetch individuals (for trigger dialog select) ───────────────────────
  const {
    data: individuals,
    isLoading: individualsLoading,
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

  // ── Fetch monitoring events ─────────────────────────────────────────────
  const {
    data: events,
    isLoading: eventsLoading,
    isError: eventsIsError,
    error: eventsError,
    refetch: eventsRefetch,
  } = useQuery({
    queryKey: ['fp_monitoring_events'],
    queryFn: async (): Promise<MonitoringEvent[]> => {
      const { data: raw, error } = await (supabase as any)
        .from('fp_monitoring_events')
        .select(`
          id, individual_id, determination_id, event_type, summary, detail,
          severity, raised_at, acknowledged_at, acknowledged_by, acknowledgement_note
        `)
        .order('raised_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      const rows: any[] = raw ?? [];

      // Collect individual IDs and fetch names
      const ids = Array.from(new Set(rows.map((r) => r.individual_id).filter(Boolean)));
      const nameMap: Record<string, string> = {};
      if (ids.length > 0) {
        const { data: inds } = await (supabase as any)
          .from('fp_individuals')
          .select('id, full_name')
          .in('id', ids);
        (inds ?? []).forEach((ind: any) => { nameMap[ind.id] = ind.full_name ?? '—'; });
      }

      return rows.map((r) => ({
        ...r,
        individual_name: r.individual_id ? (nameMap[r.individual_id] ?? '—') : null,
      }));
    },
  });

  // ── Fetch audit logs ────────────────────────────────────────────────────
  const {
    data: auditLogs,
    isLoading: auditLoading,
    isError: auditError,
    refetch: auditRefetch,
  } = useQuery({
    queryKey: ['compliance_audit_logs_fp'],
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await (supabase as any)
        .from('compliance_audit_logs')
        .select('*')
        // Filter on a real column: object_type instead of the non-existent action column
        .ilike('object_type', 'fp_%')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    retry: false,
  });

  // ── Computed stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const all = events ?? [];
    const weekStart = startOfWeekIso();
    return {
      total: all.length,
      critical: all.filter((e) => (e.severity ?? '').toLowerCase() === 'high').length,
      unacknowledged: all.filter((e) => !e.acknowledged_at).length,
      thisWeek: all.filter((e) => (e.raised_at ?? '') >= weekStart).length,
    };
  }, [events]);

  // ── Filtered events stream ──────────────────────────────────────────────
  const filteredEvents = useMemo(() => {
    let rows = events ?? [];
    if (filterEventType !== 'ALL') rows = rows.filter((e) => e.event_type === filterEventType);
    if (filterSeverity !== 'ALL') rows = rows.filter((e) => (e.severity ?? '').toLowerCase() === filterSeverity.toLowerCase());
    if (filterAcknowledged === 'unacknowledged') rows = rows.filter((e) => !e.acknowledged_at);
    if (filterAcknowledged === 'acknowledged') rows = rows.filter((e) => !!e.acknowledged_at);
    return rows;
  }, [events, filterEventType, filterSeverity, filterAcknowledged]);

  // ── Trigger event mutation ──────────────────────────────────────────────
  const triggerMutation = useMutation({
    mutationFn: async () => {
      // Wrap detail string as a JSON object to satisfy the Json column type
      const detailPayload = triggerDetail.trim()
        ? { text: triggerDetail.trim() }
        : null;

      await fpMonitoringEventRaise({
        individualId: triggerIndividualId,
        eventType: triggerEventType,
        summary: triggerSummary.trim(),
        severity: triggerSeverity || null,
        detail: detailPayload,
      });
    },
    onSuccess: () => {
      toast.success('Event triggered');
      qc.invalidateQueries({ queryKey: ['fp_monitoring_events'] });
      setTriggerOpen(false);
      setTriggerIndividualId('');
      setTriggerEventType('');
      setTriggerSeverity('');
      setTriggerSummary('');
      setTriggerDetail('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to trigger event'),
  });

  // ── Acknowledge mutation ────────────────────────────────────────────────
  const ackMutation = useMutation({
    mutationFn: async ({ event, note }: { event: MonitoringEvent; note: string }) => {
      await fpMonitoringEventAcknowledge(event.id, note.trim() || null);
    },
    onSuccess: () => {
      toast.success('Event acknowledged');
      qc.invalidateQueries({ queryKey: ['fp_monitoring_events'] });
      setAckTarget(null);
      setAckNote('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Acknowledgement failed'),
  });

  // ── CSV export for audit logs ───────────────────────────────────────────
  async function handleExportAudit() {
    try {
      await authorizedExport('fit_and_proper', 'export', { count: (auditLogs ?? []).length, kind: 'audit_trail' });
    } catch (e: any) {
      toast.error(e?.message ?? 'Not authorized');
      return;
    }
    const rows = (auditLogs ?? []).map((log) => ({
      timestamp: log.created_at ?? '',
      action_type: log.action_type ?? '',
      object_type: log.object_type ?? '',
      object_id: log.object_id ?? '',
      user_id: log.user_id ?? '',
      justification: log.justification ?? '',
      metadata: log.metadata != null ? JSON.stringify(log.metadata) : '',
    }));
    const csv = convertToCSV(rows);
    downloadCSV(csv, `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success('Audit trail exported');
  }

  const canTrigger =
    !!triggerIndividualId && !!triggerEventType && !!triggerSeverity && !!triggerSummary.trim();

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Page header */}
        <PageHeader
          title="Monitoring & Audit"
          description="Ongoing monitoring events and full compliance audit trail — FPA-015"
          actions={
            <Button data-rbac="fit_and_proper.create"
              size="sm"
              className="gap-2"
              onClick={() => setTriggerOpen(true)}
            >
              <Zap className="h-4 w-4" />
              Trigger Event
            </Button>
          }
        />

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Events"
            value={stats.total}
            isLoading={eventsLoading}
            icon={<Activity className="h-6 w-6" />}
            colorClass="bg-card text-card-foreground"
          />
          <StatCard
            label="Critical Severity"
            value={stats.critical}
            isLoading={eventsLoading}
            icon={<ShieldAlert className="h-6 w-6" />}
            colorClass="bg-red-50 border-red-200 text-red-900"
          />
          <StatCard
            label="Unacknowledged"
            value={stats.unacknowledged}
            isLoading={eventsLoading}
            icon={<BellRing className="h-6 w-6" />}
            colorClass="bg-amber-50 border-amber-200 text-amber-900"
          />
          <StatCard
            label="Events This Week"
            value={stats.thisWeek}
            isLoading={eventsLoading}
            icon={<Radio className="h-6 w-6" />}
            colorClass="bg-blue-50 border-blue-200 text-blue-900"
          />
        </div>

        {/* Main tabs */}
        <Tabs defaultValue="events">
          <TabsList className="h-9">
            <TabsTrigger value="events" className="text-xs gap-1.5">
              <Activity className="h-3.5 w-3.5" />
              Events Stream
            </TabsTrigger>
            <TabsTrigger value="audit" className="text-xs gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              Audit Trail
            </TabsTrigger>
          </TabsList>

          {/* ── Events Stream tab ───────────────────────────────────────── */}
          <TabsContent value="events" className="mt-4 space-y-4">
            {/* Filter bar */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground mr-1">
                    <Filter className="h-4 w-4" />
                    <span className="text-xs font-medium uppercase tracking-wide">Filters</span>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Event Type</Label>
                    <Select value={filterEventType} onValueChange={setFilterEventType}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All types</SelectItem>
                        <SelectItem value="media_alert">Media Alert</SelectItem>
                        <SelectItem value="complaint">Complaint</SelectItem>
                        <SelectItem value="role_change">Role Change</SelectItem>
                        <SelectItem value="assessment_due">Assessment Due</SelectItem>
                        <SelectItem value="regulatory_notice">Regulatory Notice</SelectItem>
                        <SelectItem value="self_report">Self Report</SelectItem>
                        <SelectItem value="manual_flag">Manual Flag</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Severity</Label>
                    <Select value={filterSeverity} onValueChange={setFilterSeverity}>
                      <SelectTrigger className="h-8 w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All severities</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Acknowledgement</Label>
                    <Select value={filterAcknowledged} onValueChange={setFilterAcknowledged}>
                      <SelectTrigger className="h-8 w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All</SelectItem>
                        <SelectItem value="unacknowledged">Unacknowledged</SelectItem>
                        <SelectItem value="acknowledged">Acknowledged</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {(filterEventType !== 'ALL' || filterSeverity !== 'ALL' || filterAcknowledged !== 'ALL') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        setFilterEventType('ALL');
                        setFilterSeverity('ALL');
                        setFilterAcknowledged('ALL');
                      }}
                    >
                      Clear filters
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Timeline */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  Event Timeline
                  <Badge variant="secondary" className="text-xs tabular-nums">
                    {filteredEvents.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4">
                {eventsLoading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading events…
                  </div>
                ) : eventsIsError ? (
                  <div className="py-10 px-4 text-center space-y-3">
                    <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
                    <p className="text-sm font-medium text-destructive">
                      Failed to load monitoring events
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(eventsError as any)?.message ?? 'An unexpected error occurred.'}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => eventsRefetch()}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No monitoring events match the current filters.
                  </div>
                ) : (
                  <div className="space-y-0">
                    {filteredEvents.map((event) => (
                      <EventRow
                        key={event.id}
                        event={event}
                        onAcknowledge={(e) => {
                          setAckTarget(e);
                          setAckNote('');
                        }}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Audit Trail tab ─────────────────────────────────────────── */}
          <TabsContent value="audit" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    Compliance Audit Logs
                    {!auditError && !auditLoading && (
                      <Badge variant="secondary" className="text-xs tabular-nums">
                        {(auditLogs ?? []).length}
                      </Badge>
                    )}
                  </CardTitle>
                  {!auditError && (auditLogs ?? []).length > 0 && (
                    <Button data-rbac="fit_and_proper.export"
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1.5 text-xs"
                      onClick={handleExportAudit}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-4 p-0">
                {auditLoading ? (
                  <div className="flex items-center justify-center py-12 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                    Loading audit trail…
                  </div>
                ) : auditError ? (
                  <div className="py-10 px-4 text-center space-y-3">
                    <AlertTriangle className="h-8 w-8 text-destructive mx-auto" />
                    <p className="text-sm font-medium text-destructive">
                      Failed to load audit logs
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Unable to query compliance_audit_logs. Check your permissions or contact an administrator.
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => auditRefetch()}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Retry
                    </Button>
                  </div>
                ) : (auditLogs ?? []).length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No FP audit log entries found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="text-xs whitespace-nowrap">Timestamp</TableHead>
                          <TableHead className="text-xs">Action Type</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Object Type</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Object ID</TableHead>
                          <TableHead className="text-xs">User</TableHead>
                          <TableHead className="text-xs">Justification</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(auditLogs ?? []).map((log) => (
                          <TableRow key={log.entry_id} className="hover:bg-muted/30 transition-colors">
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                              {formatDateTime(log.created_at)}
                            </TableCell>
                            <TableCell className="text-xs font-mono">
                              {log.action_type ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {log.object_type ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono max-w-[120px] truncate" title={log.object_id ?? undefined}>
                              {log.object_id ?? '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground font-mono max-w-[100px] truncate" title={log.user_id ?? undefined}>
                              {log.user_id ? log.user_id.slice(0, 8) + '…' : '—'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={log.justification ?? undefined}>
                              {log.justification ?? '—'}
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

      {/* ── Trigger Event dialog ──────────────────────────────────────────── */}
      <Dialog open={triggerOpen} onOpenChange={(open) => {
        setTriggerOpen(open);
        if (!open) {
          setTriggerIndividualId('');
          setTriggerEventType('');
          setTriggerSeverity('');
          setTriggerSummary('');
          setTriggerDetail('');
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Trigger Monitoring Event
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="trigger-individual">Individual <span className="text-red-500">*</span></Label>
              <Select value={triggerIndividualId} onValueChange={setTriggerIndividualId}>
                <SelectTrigger id="trigger-individual" className="w-full">
                  <SelectValue placeholder="Select individual…" />
                </SelectTrigger>
                <SelectContent>
                  {individualsLoading && (
                    <div className="flex items-center justify-center py-3 text-xs text-muted-foreground gap-2">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading individuals…
                    </div>
                  )}
                  {individualsError && !individualsLoading && (
                    <div className="px-3 py-2 text-xs text-destructive">
                      Failed to load individuals. Please close and try again.
                    </div>
                  )}
                  {!individualsLoading && !individualsError && (individuals ?? []).map((ind) => (
                    <SelectItem key={ind.id} value={ind.id}>
                      {ind.full_name ?? '—'}
                    </SelectItem>
                  ))}
                  {!individualsLoading && !individualsError && (individuals ?? []).length === 0 && (
                    <SelectItem value="__none__" disabled>No individuals found</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trigger-event-type">Event Type <span className="text-red-500">*</span></Label>
                <Select value={triggerEventType} onValueChange={setTriggerEventType}>
                  <SelectTrigger id="trigger-event-type">
                    <SelectValue placeholder="Select type…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="media_alert">Media Alert</SelectItem>
                    <SelectItem value="complaint">Complaint</SelectItem>
                    <SelectItem value="role_change">Role Change</SelectItem>
                    <SelectItem value="assessment_due">Assessment Due</SelectItem>
                    <SelectItem value="regulatory_notice">Regulatory Notice</SelectItem>
                    <SelectItem value="self_report">Self Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="trigger-severity">Severity <span className="text-red-500">*</span></Label>
                <Select value={triggerSeverity} onValueChange={setTriggerSeverity}>
                  <SelectTrigger id="trigger-severity">
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trigger-summary">Summary <span className="text-red-500">*</span></Label>
              <Input
                id="trigger-summary"
                placeholder="Brief description of the event…"
                value={triggerSummary}
                onChange={(e) => setTriggerSummary(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="trigger-detail">Detail</Label>
              <Textarea
                id="trigger-detail"
                rows={3}
                placeholder="Additional context or detail (optional)…"
                value={triggerDetail}
                onChange={(e) => setTriggerDetail(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setTriggerOpen(false)}>
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.create"
              disabled={!canTrigger || triggerMutation.isPending}
              onClick={() => triggerMutation.mutate()}
            >
              {triggerMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Trigger Event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Acknowledge dialog ────────────────────────────────────────────── */}
      <Dialog open={!!ackTarget} onOpenChange={(open) => {
        if (!open) { setAckTarget(null); setAckNote(''); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Acknowledge Event
            </DialogTitle>
          </DialogHeader>

          {ackTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${severityBadgeClass(ackTarget.severity)}`}>
                    {ackTarget.severity ?? '—'}
                  </span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${eventTypeBadgeClass(ackTarget.event_type)}`}>
                    {eventTypeLabel(ackTarget.event_type)}
                  </span>
                </div>
                <p className="text-sm font-medium">{ackTarget.summary ?? '—'}</p>
                {ackTarget.individual_name && (
                  <p className="text-xs text-muted-foreground">Individual: {ackTarget.individual_name}</p>
                )}
                <p className="text-xs text-muted-foreground">Raised: {formatDateTime(ackTarget.raised_at)}</p>
              </div>

              <Separator />

              <div className="space-y-1.5">
                <Label htmlFor="ack-note">Acknowledgement Note</Label>
                <Textarea
                  id="ack-note"
                  rows={3}
                  placeholder="Optional note on action taken or reason for acknowledgement…"
                  value={ackNote}
                  onChange={(e) => setAckNote(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAckTarget(null); setAckNote(''); }}>
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              className="gap-2"
              disabled={ackMutation.isPending}
              onClick={() => {
                if (ackTarget) ackMutation.mutate({ event: ackTarget, note: ackNote });
              }}
            >
              {ackMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <CheckCircle2 className="h-4 w-4" />
              Confirm Acknowledgement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
