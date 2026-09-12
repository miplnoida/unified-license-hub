import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { toast } from 'sonner';
import {
  Loader2,
  Scale,
  FilePlus,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  Link2,
  FileText,
  Gavel,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Appeal {
  id: string;
  individual_id: string;
  determination_id: string;
  grounds: string | null;
  status: string;
  filed_at: string;
  filed_by: string;
  decided_at: string | null;
  decided_by: string | null;
  decision: string | null;
  decision_rationale: string | null;
  license_id: string | null;
  appeal_committee_id: string | null;
  supporting_docs: any;
  created_at: string | null;
  // joined
  individual_name?: string | null;
  determination_outcome?: string | null;
  determination_assessment_id?: string | null;
}

interface Individual {
  id: string;
  full_name: string | null;
}

interface Determination {
  id: string;
  individual_id: string;
  outcome: string;
  determined_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(dt: string | null): string {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function truncate(str: string | null, len: number): string {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

function statusBadge(status: string | null): { label: string; cls: string } {
  switch ((status ?? '').toLowerCase()) {
    case 'submitted':
      return { label: 'Filed', cls: 'bg-blue-100 text-blue-800 border border-blue-300' };
    case 'under_review':
      return { label: 'Under Review', cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
    case 'decided':
      return { label: 'Decided', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
    case 'withdrawn':
      return { label: 'Withdrawn', cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
    default:
      return { label: status ?? '—', cls: 'bg-slate-100 text-slate-600 border border-slate-200' };
  }
}

function decisionBadge(decision: string | null): { label: string; cls: string } | null {
  if (!decision) return null;
  switch (decision.toLowerCase()) {
    case 'upheld':
      return { label: 'Upheld', cls: 'bg-emerald-100 text-emerald-800 border border-emerald-300' };
    case 'dismissed':
      return { label: 'Dismissed', cls: 'bg-slate-100 text-slate-700 border border-slate-300' };
    case 'partially_upheld':
      return { label: 'Partially Upheld', cls: 'bg-amber-100 text-amber-800 border border-amber-300' };
    case 'remitted':
      return { label: 'Remitted', cls: 'bg-blue-100 text-blue-800 border border-blue-300' };
    case 'overturned_to_approved':
      return { label: 'Overturned → Approved', cls: 'bg-red-100 text-red-800 border border-red-300' };
    case 'overturned_to_conditional':
      return { label: 'Overturned → Conditional', cls: 'bg-red-100 text-red-800 border border-red-300' };
    default:
      return { label: decision, cls: 'bg-slate-100 text-slate-700 border border-slate-200' };
  }
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
          {icon && <div className="opacity-25 mt-0.5">{icon}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Timeline component
// ---------------------------------------------------------------------------
interface TimelineProps {
  appeal: Appeal;
}

function AppealTimeline({ appeal }: TimelineProps) {
  const steps = [
    {
      label: 'Filed',
      date: appeal.filed_at,
      done: true,
    },
    {
      label: 'Under Review',
      date: appeal.status === 'decided' || appeal.status === 'under_review' ? appeal.filed_at : null,
      done: appeal.status === 'decided' || appeal.status === 'under_review',
    },
    {
      label: 'Decision',
      date: appeal.decided_at,
      done: !!appeal.decided_at,
    },
  ];

  return (
    <div className="space-y-3 py-2">
      <div className="flex items-start gap-0">
        {steps.map((step, i) => (
          <div key={step.label} className="flex flex-col items-center flex-1">
            {/* Connector line above (hidden for first) */}
            <div className="flex items-center w-full">
              {i > 0 && (
                <div
                  className={`flex-1 h-0.5 ${step.done ? 'bg-emerald-400' : 'bg-slate-200'}`}
                />
              )}
              <div
                className={`flex items-center justify-center h-7 w-7 rounded-full border-2 flex-shrink-0 ${
                  step.done
                    ? 'bg-emerald-50 border-emerald-400 text-emerald-600'
                    : 'bg-white border-slate-200 text-slate-300'
                }`}
              >
                {step.done ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 ${
                    steps[i + 1].done ? 'bg-emerald-400' : 'bg-slate-200'
                  }`}
                />
              )}
            </div>
            <div className="text-center mt-1.5">
              <p className={`text-xs font-semibold ${step.done ? 'text-emerald-700' : 'text-slate-400'}`}>
                {step.label}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                {step.date ? formatDate(step.date) : '—'}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Decision rationale */}
      {appeal.decision_rationale && (
        <div className="mt-3 rounded-md border bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1">
            Decision Rationale
          </p>
          <p className="text-sm text-slate-700 leading-relaxed">{appeal.decision_rationale}</p>
        </div>
      )}

      {/* Supporting docs */}
      {appeal.supporting_docs && (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-1.5">
            Supporting Documents
          </p>
          {(() => {
            let docs: string[] = [];
            try {
              const parsed = typeof appeal.supporting_docs === 'string'
                ? JSON.parse(appeal.supporting_docs)
                : appeal.supporting_docs;
              docs = Array.isArray(parsed) ? parsed : [];
            } catch {
              docs = [];
            }
            if (docs.length === 0) {
              return <p className="text-xs text-muted-foreground">No documents attached.</p>;
            }
            return (
              <div className="flex flex-wrap gap-2">
                {docs.map((url, idx) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 underline underline-offset-2 hover:text-blue-800"
                  >
                    <FileText className="h-3 w-3" />
                    Document {idx + 1}
                  </a>
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// License Impact Banner
// ---------------------------------------------------------------------------
function LicenseImpactBanner({ licenseId }: { licenseId: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-red-300 bg-red-50 px-3 py-2.5 mt-3">
      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-red-800">
        <span className="font-semibold">License Impact:</span> This appeal is linked to License{' '}
        <span className="font-mono font-semibold">#{licenseId}</span>. The license status may be
        affected by the appeal outcome.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function FpaAppeals() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Row expansion
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // File Appeal dialog
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [fileIndividualId, setFileIndividualId] = useState('');
  const [fileDeterminationId, setFileDeterminationId] = useState('');
  const [fileGrounds, setFileGrounds] = useState('');
  const [fileLicenseId, setFileLicenseId] = useState('');
  const [fileCommitteeId, setFileCommitteeId] = useState('');

  // Decision dialog
  const [decisionTarget, setDecisionTarget] = useState<Appeal | null>(null);
  const [decisionValue, setDecisionValue] = useState('');
  const [decisionRationale, setDecisionRationale] = useState('');

  // ---------------------------------------------------------------------------
  // Data: appeals + join individuals and determinations
  // ---------------------------------------------------------------------------
  const { data: appeals, isLoading } = useQuery({
    queryKey: ['fp_appeals_page'],
    queryFn: async (): Promise<Appeal[]> => {
      const { data: raw, error } = await (supabase as any)
        .from('fp_appeals')
        .select(`
          id,
          individual_id,
          determination_id,
          grounds,
          status,
          filed_at,
          filed_by,
          decided_at,
          decided_by,
          decision,
          decision_rationale,
          license_id,
          appeal_committee_id,
          supporting_docs,
          created_at
        `)
        .order('created_at', { ascending: false })
        .limit(300);

      if (error) throw error;
      const rows: any[] = raw ?? [];

      // Collect IDs
      const individualIds = [...new Set(rows.map((r: any) => r.individual_id).filter(Boolean))];
      const determinationIds = [...new Set(rows.map((r: any) => r.determination_id).filter(Boolean))];

      // Fetch names
      const nameMap: Record<string, string> = {};
      if (individualIds.length > 0) {
        const { data: inds } = await (supabase as any)
          .from('fp_individuals')
          .select('id, full_name')
          .in('id', individualIds);
        (inds ?? []).forEach((i: any) => { nameMap[i.id] = i.full_name ?? '—'; });
      }

      // Fetch determinations
      const detMap: Record<string, string> = {};
      const detAssessmentMap: Record<string, string | null> = {};
      if (determinationIds.length > 0) {
        const { data: dets } = await (supabase as any)
          .from('fp_determinations')
          .select('id, outcome, assessment_id')
          .in('id', determinationIds);
        (dets ?? []).forEach((d: any) => {
          detMap[d.id] = d.outcome ?? '—';
          detAssessmentMap[d.id] = d.assessment_id ?? null;
        });
      }

      return rows.map((r: any) => ({
        ...r,
        individual_name: r.individual_id ? (nameMap[r.individual_id] ?? '—') : '—',
        determination_outcome: r.determination_id ? (detMap[r.determination_id] ?? null) : null,
        determination_assessment_id: r.determination_id ? (detAssessmentMap[r.determination_id] ?? null) : null,
      }));
    },
  });

  // ---------------------------------------------------------------------------
  // Data: individuals + determinations for file dialog
  // ---------------------------------------------------------------------------
  const { data: individuals, isError: individualsError } = useQuery({
    queryKey: ['fp_individuals_list'],
    queryFn: async (): Promise<Individual[]> => {
      const { data, error } = await (supabase as any)
        .from('fp_individuals')
        .select('id, full_name')
        .order('full_name');
      if (error) throw error;
      return data ?? [];
    },
    meta: {
      onError: () => toast.error('Failed to load individuals'),
    },
  });

  const { data: determinations, isError: determinationsError } = useQuery({
    queryKey: ['fp_determinations_for_individual', fileIndividualId],
    enabled: !!fileIndividualId,
    queryFn: async (): Promise<Determination[]> => {
      const { data, error } = await (supabase as any)
        .from('fp_determinations')
        .select('id, individual_id, outcome, determined_at')
        .eq('individual_id', fileIndividualId)
        .order('determined_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    meta: {
      onError: () => toast.error('Failed to load determinations'),
    },
  });

  const { data: eligibleLicenses } = useQuery({
    queryKey: ['fp_appeal_eligible_licenses', fileIndividualId],
    enabled: !!fileIndividualId,
    queryFn: async () => {
      const { data: roles } = await supabase.from('fp_individual_roles')
        .select('license_id').eq('individual_id', fileIndividualId).eq('is_current', true);
      const licIds = Array.from(new Set((roles ?? []).map((r: any) => r.license_id).filter(Boolean)));
      if (licIds.length === 0) return [];
      const { data } = await supabase.from('licenses').select('id, license_number, license_type').in('id', licIds);
      return data ?? [];
    },
  });

  const { data: eligibleCommittees } = useQuery({
    queryKey: ['fp_appeal_eligible_committees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('fp_committees')
        .select('id, name').eq('is_active', true).order('name');
      if (error) throw error;
      return data ?? [];
    },
  });

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  const stats = useMemo(() => {
    const all = appeals ?? [];
    return {
      total: all.length,
      pending: all.filter((a) =>
        ['submitted', 'under_review'].includes((a.status ?? '').toLowerCase())
      ).length,
      upheld: all.filter((a) => (a.decision ?? '').toLowerCase() === 'upheld').length,
      dismissed: all.filter((a) => (a.decision ?? '').toLowerCase() === 'dismissed').length,
      overturned: all.filter((a) =>
        ['overturned_to_approved', 'overturned_to_conditional'].includes((a.decision ?? '').toLowerCase())
      ).length,
    };
  }, [appeals]);

  // ---------------------------------------------------------------------------
  // Mutations
  // ---------------------------------------------------------------------------
  const fileAppealMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('You must be logged in to file an appeal');
      if (!fileIndividualId) throw new Error('Individual is required');
      if (!fileDeterminationId) throw new Error('Determination is required');
      if (!fileGrounds.trim()) throw new Error('Grounds are required');
      const { data, error } = await (supabase as any).rpc('fp_appeal_file', {
        _individual_id: fileIndividualId,
        _determination_id: fileDeterminationId,
        _grounds: fileGrounds.trim(),
        _license_id: fileLicenseId.trim() || null,
      });
      if (error) throw error;
      // Authoritative audit event is written by the governed operation.
      if (fileCommitteeId.trim()) {
        const { error: cErr } = await (supabase as any).rpc('fp_appeal_assign_committee', {
          _appeal_id: (data as any)?.id,
          _committee_id: fileCommitteeId.trim(),
        });
        if (cErr) throw cErr;
      }
    },
    onSuccess: () => {
      toast.success('Appeal filed successfully');
      qc.invalidateQueries({ queryKey: ['fp_appeals_page'] });
      setShowFileDialog(false);
      setFileIndividualId('');
      setFileDeterminationId('');
      setFileGrounds('');
      setFileLicenseId('');
      setFileCommitteeId('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to file appeal'),
  });

  const startReviewMutation = useMutation({
    mutationFn: async (appeal: Appeal) => {
      const { error } = await (supabase as any).rpc('fp_appeal_start_review', { _appeal_id: appeal.id });
      if (error) throw error;
      // Authoritative audit event is written by the governed operation.
    },
    onSuccess: () => {
      toast.success('Appeal moved to Under Review');
      qc.invalidateQueries({ queryKey: ['fp_appeals_page'] });
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to update status'),
  });

  const recordDecisionMutation = useMutation({
    mutationFn: async () => {
      if (!decisionTarget) return;
      if (!decisionValue) throw new Error('Decision is required');
      if (decisionRationale.trim().length < 10) throw new Error('Decision rationale required (min 10 chars)');

      const { error } = await (supabase as any).rpc('fp_appeal_decide', {
        _appeal_id: decisionTarget.id,
        _decision: decisionValue,
        _rationale: decisionRationale.trim(),
      });
      if (error) throw error;
      // Determination supersession, license action and the authoritative audit
      // event are all performed inside the governed operation.
      try {
        await supabase.functions.invoke('dispatch-notification-event', {
          body: { event_key: 'fp_appeal_decided', entity_type: 'fp_appeal', entity_id: decisionTarget.id, payload: { decision: decisionValue, individual_id: decisionTarget.individual_id, filed_by: decisionTarget.filed_by ?? null } },
        });
      } catch (e) { console.warn('dispatch-notification-event failed', e); }
    },
    onSuccess: () => {
      toast.success('Decision recorded');
      qc.invalidateQueries({ queryKey: ['fp_appeals_page'] });
      // An overturn inserts a new fp_determinations row — refresh the
      // "Linked Determination" picker (File Appeal dialog, and Conditions &
      // SLA's Add Condition dialog) for this individual so it isn't served
      // stale/empty cached results.
      if (decisionTarget) {
        qc.invalidateQueries({ queryKey: ['fp_determinations_for_individual', decisionTarget.individual_id] });
      }
      setDecisionTarget(null);
      setDecisionValue('');
      setDecisionRationale('');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Failed to record decision'),
  });

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <PageHeader
          title="Appeals"
          description="Fit & Proper appeal management with license impact tracking — FPA-014"
          actions={
            <Button data-rbac="fit_and_proper.edit"
              size="sm"
              onClick={() => setShowFileDialog(true)}
              className="gap-1.5"
            >
              <FilePlus className="h-4 w-4" />
              File Appeal
            </Button>
          }
        />

        {/* Stats row */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading appeals…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard
                label="Total"
                value={stats.total}
                icon={<Scale className="h-6 w-6" />}
              />
              <StatCard
                label="Pending"
                value={stats.pending}
                colorClass="bg-amber-50 border-amber-200 text-amber-900"
                icon={<Clock className="h-6 w-6" />}
              />
              <StatCard
                label="Upheld"
                value={stats.upheld}
                colorClass="bg-emerald-50 border-emerald-200 text-emerald-900"
                icon={<CheckCircle2 className="h-6 w-6" />}
              />
              <StatCard
                label="Dismissed"
                value={stats.dismissed}
                colorClass="bg-slate-50 border-slate-200 text-slate-700"
                icon={<Gavel className="h-6 w-6" />}
              />
              <StatCard
                label="Overturned"
                value={stats.overturned}
                colorClass="bg-red-50 border-red-200 text-red-900"
                icon={<AlertTriangle className="h-6 w-6" />}
              />
            </div>

            {/* Main table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  Appeal Register
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!appeals || appeals.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    No appeals recorded. Use "File Appeal" to create the first one.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-8" />
                          <TableHead className="text-xs whitespace-nowrap">Individual</TableHead>
                          <TableHead className="text-xs">Grounds</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Status</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">License</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Filed</TableHead>
                          <TableHead className="text-xs">Decision</TableHead>
                          <TableHead className="text-xs whitespace-nowrap">Committee ID</TableHead>
                          <TableHead className="text-xs text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appeals.map((appeal) => {
                          const isExpanded = expandedRow === appeal.id;
                          const sb = statusBadge(appeal.status);
                          const db = decisionBadge(appeal.decision);
                          const hasLicense = !!appeal.license_id;
                          const st = (appeal.status ?? '').toLowerCase();

                          return (
                            <>
                              <TableRow
                                key={appeal.id}
                                className="hover:bg-muted/30 transition-colors cursor-pointer"
                                onClick={() =>
                                  setExpandedRow(isExpanded ? null : appeal.id)
                                }
                              >
                                {/* Expand toggle */}
                                <TableCell className="py-3 pl-4">
                                  <div className="text-muted-foreground">
                                    {isExpanded ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </div>
                                </TableCell>

                                {/* Individual */}
                                <TableCell className="py-3 font-medium text-sm whitespace-nowrap">
                                  {appeal.individual_name ?? '—'}
                                </TableCell>

                                {/* Grounds (truncated) */}
                                <TableCell className="py-3 max-w-[220px]">
                                  <span
                                    className="text-sm text-muted-foreground"
                                    title={appeal.grounds ?? undefined}
                                  >
                                    {truncate(appeal.grounds, 70)}
                                  </span>
                                </TableCell>

                                {/* Status badge */}
                                <TableCell className="py-3">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${sb.cls}`}
                                  >
                                    {sb.label}
                                  </span>
                                </TableCell>

                                {/* License badge */}
                                <TableCell className="py-3">
                                  {hasLicense ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap bg-red-100 text-red-800 border border-red-300">
                                      <Link2 className="h-3 w-3" />
                                      LICENSE LINKED
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>

                                {/* Filed at */}
                                <TableCell className="py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                                  {formatDate(appeal.filed_at)}
                                </TableCell>

                                {/* Decision */}
                                <TableCell className="py-3">
                                  {db ? (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide whitespace-nowrap ${db.cls}`}
                                    >
                                      {db.label}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                </TableCell>

                                {/* Committee ID */}
                                <TableCell className="py-3 text-xs text-muted-foreground font-mono">
                                  {appeal.appeal_committee_id
                                    ? truncate(appeal.appeal_committee_id, 12)
                                    : '—'}
                                </TableCell>

                                {/* Actions */}
                                <TableCell
                                  className="py-3 text-right"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex items-center justify-end gap-1.5">
                                    {st === 'submitted' && (
                                      <Button data-rbac="fit_and_proper.edit"
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2 text-xs"
                                        disabled={startReviewMutation.isPending}
                                        onClick={() => startReviewMutation.mutate(appeal)}
                                      >
                                        {startReviewMutation.isPending && (
                                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        )}
                                        Start Review
                                      </Button>
                                    )}
                                    {st === 'under_review' && (
                                      <Button data-rbac="fit_and_proper.edit"
                                        size="sm"
                                        variant="default"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => {
                                          setDecisionTarget(appeal);
                                          setDecisionValue('');
                                          setDecisionRationale('');
                                        }}
                                      >
                                        <Gavel className="h-3 w-3 mr-1" />
                                        Record Decision
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>

                              {/* Expanded detail row */}
                              {isExpanded && (
                                <TableRow key={`${appeal.id}-expanded`} className="bg-slate-50/60">
                                  <TableCell colSpan={9} className="px-6 pb-5 pt-2">
                                    <div className="space-y-1">
                                      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                                        Appeal Timeline
                                      </p>
                                      <AppealTimeline appeal={appeal} />

                                      {/* License impact banner */}
                                      {appeal.license_id && (
                                        <LicenseImpactBanner licenseId={appeal.license_id} />
                                      )}

                                      {/* Determination outcome if set */}
                                      {appeal.determination_outcome && (
                                        <div className="mt-3 flex items-center gap-2">
                                          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                            Original Determination:
                                          </span>
                                          <Badge variant="outline" className="text-[10px]">
                                            {appeal.determination_outcome}
                                          </Badge>
                                        </div>
                                      )}
                                    </div>
                                  </TableCell>
                                </TableRow>
                              )}
                            </>
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

      {/* ─── File Appeal Dialog ─────────────────────────────────────────────── */}
      <Dialog open={showFileDialog} onOpenChange={setShowFileDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5 text-primary" />
              File Appeal
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Individual */}
            <div className="space-y-1.5">
              <Label htmlFor="file-individual">
                Individual <span className="text-red-500">*</span>
              </Label>
              <Select
                value={fileIndividualId}
                onValueChange={(v) => {
                  setFileIndividualId(v);
                  setFileDeterminationId('');
                  setFileLicenseId('');
                }}
              >
                <SelectTrigger id="file-individual">
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
              {individualsError && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Failed to load individuals. Please close and reopen the dialog.
                </p>
              )}
            </div>

            {/* Determination */}
            <div className="space-y-1.5">
              <Label htmlFor="file-determination">
                Determination <span className="text-red-500">*</span>
              </Label>
              <Select
                value={fileDeterminationId}
                onValueChange={setFileDeterminationId}
                disabled={!fileIndividualId}
              >
                <SelectTrigger id="file-determination">
                  <SelectValue placeholder={fileIndividualId ? 'Select determination…' : 'Select individual first'} />
                </SelectTrigger>
                <SelectContent>
                  {(determinations ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.outcome} — {formatDate(d.determined_at)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {determinationsError && (
                <p className="text-xs text-red-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="h-3 w-3" />
                  Failed to load determinations. Please try again.
                </p>
              )}
              {fileIndividualId && (determinations ?? []).length === 0 && !determinationsError && (
                <p className="text-xs text-muted-foreground mt-1">
                  No determinations recorded for this individual yet — record one on the Determinations screen first.
                </p>
              )}
            </div>

            {/* Grounds */}
            <div className="space-y-1.5">
              <Label htmlFor="file-grounds">
                Grounds <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="file-grounds"
                rows={4}
                placeholder="State the grounds for this appeal…"
                value={fileGrounds}
                onChange={(e) => setFileGrounds(e.target.value)}
              />
            </div>

            <Separator />

            {/* License */}
            <div className="space-y-1.5">
              <Label htmlFor="file-license">
                Linked License{' '}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Select
                value={fileLicenseId || 'none'}
                onValueChange={(v) => setFileLicenseId(v === 'none' ? '' : v)}
                disabled={!fileIndividualId}
              >
                <SelectTrigger id="file-license">
                  <SelectValue placeholder={fileIndividualId ? 'No license link' : 'Select individual first'} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No license link</SelectItem>
                  {(eligibleLicenses ?? []).map((l: any) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.license_number || l.id.slice(0, 8)} · {l.license_type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {fileLicenseId.trim() && (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Linking a license enables FPA-014 license impact tracking.
                </p>
              )}
            </div>

            {/* Appeal Committee */}
            <div className="space-y-1.5">
              <Label htmlFor="file-committee">
                Appeal Committee{' '}
                <span className="text-muted-foreground text-xs">(optional)</span>
              </Label>
              <Select
                value={fileCommitteeId || 'none'}
                onValueChange={(v) => setFileCommitteeId(v === 'none' ? '' : v)}
              >
                <SelectTrigger id="file-committee">
                  <SelectValue placeholder="No committee assigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No committee assigned</SelectItem>
                  {(eligibleCommittees ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setShowFileDialog(false)}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              disabled={!fileGrounds.trim() || !fileIndividualId || !fileDeterminationId || fileAppealMutation.isPending}
              onClick={() => fileAppealMutation.mutate()}
            >
              {fileAppealMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              File Appeal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Record Decision Dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!decisionTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDecisionTarget(null);
            setDecisionValue('');
            setDecisionRationale('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="h-5 w-5 text-primary" />
              Record Appeal Decision
            </DialogTitle>
          </DialogHeader>

          {decisionTarget && (
            <div className="space-y-4">
              {/* Context */}
              <div className="rounded-md border bg-muted/40 p-3 space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Appeal — {decisionTarget.individual_name}
                </p>
                <p className="text-sm text-foreground leading-snug">
                  {truncate(decisionTarget.grounds, 120)}
                </p>
                {decisionTarget.license_id && (
                  <p className="text-xs text-red-600 font-medium mt-1 flex items-center gap-1">
                    <Link2 className="h-3 w-3" />
                    License #{decisionTarget.license_id} is linked — outcome affects license status.
                  </p>
                )}
              </div>

              <Separator />

              {/* Decision select */}
              <div className="space-y-1.5">
                <Label htmlFor="decision-select">
                  Decision <span className="text-red-500">*</span>
                </Label>
                <Select value={decisionValue} onValueChange={setDecisionValue}>
                  <SelectTrigger id="decision-select">
                    <SelectValue placeholder="Select outcome…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upheld">Upheld</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                    <SelectItem value="partially_upheld">Partially upheld</SelectItem>
                    <SelectItem value="remitted">Remit for reconsideration</SelectItem>
                    <SelectItem value="overturned_to_approved">Overturned → Approved</SelectItem>
                    <SelectItem value="overturned_to_conditional">Overturned → Conditional</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Rationale */}
              <div className="space-y-1.5">
                <Label htmlFor="decision-rationale">
                  Decision Rationale <span className="text-red-500">*</span>{' '}
                  <span className="text-muted-foreground text-xs">(min 10 characters)</span>
                </Label>
                <Textarea
                  id="decision-rationale"
                  rows={4}
                  placeholder="Provide the committee's rationale for this decision…"
                  value={decisionRationale}
                  onChange={(e) => setDecisionRationale(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDecisionTarget(null);
                setDecisionValue('');
                setDecisionRationale('');
              }}
            >
              Cancel
            </Button>
            <Button data-rbac="fit_and_proper.edit"
              disabled={!decisionValue || decisionRationale.trim().length < 10 || recordDecisionMutation.isPending}
              onClick={() => recordDecisionMutation.mutate()}
            >
              {recordDecisionMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirm Decision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
