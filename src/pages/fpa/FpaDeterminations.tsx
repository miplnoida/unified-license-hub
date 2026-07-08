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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import { resolveFpSectorRule, evaluateFpCriteria, type CriteriaEvaluation } from '@/lib/fpSectorRules';
import {
  Loader2,
  Plus,
  GitBranch,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  LayoutList,
  Columns2,
  AlertCircle,
  History,
  Building2,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface DeterminationRow {
  id: string;
  assessment_id: string;
  individual_id: string;
  outcome: string | null;
  rationale: string | null;
  regulator_id: string | null;
  is_current: boolean | null;
  effective_from: string | null;
  effective_to: string | null;
  determined_at: string;
  determined_by: string;
  created_at: string;
  individual_name?: string;
}

interface FormState {
  individual_id: string;
  assessment_id: string;
  outcome: string;
  rationale: string;
  effective_from: string;
  effective_to: string;
  regulator_id: string;
}

interface AssessmentDetail {
  id: string;
  individual_id: string | null;
  assessment_type: string | null;
  status: string | null;
  role_id: string | null;
  licensee_id: string | null;
  regulator_id: string | null;
}

interface RegulatorRow {
  id: string;
  name: string;
}

const EMPTY_FORM: FormState = {
  individual_id: '',
  assessment_id: '',
  outcome: '',
  rationale: '',
  effective_from: '',
  effective_to: '',
  regulator_id: '',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function truncate(text: string | null, len = 80): string {
  if (!text) return '—';
  return text.length > len ? text.slice(0, len) + '…' : text;
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  if (!outcome) return <Badge variant="outline">—</Badge>;
  switch (outcome) {
    case 'fit':
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Fit
        </Badge>
      );
    case 'not_fit':
      return (
        <Badge className="bg-red-50 text-red-700 border-red-200 hover:bg-red-50 gap-1">
          <XCircle className="h-3 w-3" />
          Not Fit
        </Badge>
      );
    case 'conditional':
      return (
        <Badge className="bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Conditional
        </Badge>
      );
    case 'deferred':
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 gap-1">
          <Clock className="h-3 w-3" />
          Deferred
        </Badge>
      );
    default:
      return <Badge variant="outline">{outcome}</Badge>;
  }
}

function CurrentBadge({ isCurrent }: { isCurrent: boolean | null }) {
  if (isCurrent) {
    return (
      <Badge className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-50">
        Current
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-slate-400">
      Superseded
    </Badge>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accentClass,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  accentClass: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg p-2.5 ${accentClass}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
            {label}
          </p>
          <p className="text-2xl font-semibold tabular-nums leading-tight">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Determination Detail Dialog ─────────────────────────────────────────────
// Shows the assessment context plus an access log — every open is itself
// logged via logFpAction, and the RPC below reads that same trail back so
// "who has looked at this determination and when" is inspectable evidence,
// not just an assertion.

interface AuditLogEntry {
  id: string;
  action: string;
  user_id: string | null;
  actor_name: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function DeterminationDetailDialog({
  determination,
  assessment,
  individualName,
  regulatorName,
  trigger,
}: {
  determination: DeterminationRow;
  assessment: AssessmentDetail | undefined;
  individualName: string;
  regulatorName: string | null;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  const { data: accessLog, isLoading: loadingLog } = useQuery({
    queryKey: ['fp_determination_audit_log', determination.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fp_determination_audit_log' as any, {
        _determination_id: determination.id,
      });
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
  });

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) {
      logFpAction('fp.determination.viewed', 'fp_determination', determination.id, {
        context: {
          individualId: determination.individual_id,
          assessmentId: determination.assessment_id,
          determinationId: determination.id,
          regulatorId: determination.regulator_id ?? undefined,
        },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Determination Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
              Individual
            </p>
            <p>{individualName}</p>
          </div>
          <div className="flex gap-6">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                Outcome
              </p>
              <OutcomeBadge outcome={determination.outcome} />
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                Regulator
              </p>
              <p className="text-sm">{regulatorName ?? <span className="text-muted-foreground italic">Not set</span>}</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
              Rationale
            </p>
            <p className="text-sm leading-relaxed">{determination.rationale ?? '—'}</p>
          </div>
          {assessment && (
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                Assessment
              </p>
              <p>{assessment.assessment_type?.replace(/_/g, ' ') ?? '—'} · <Badge variant="outline">{assessment.status ?? '—'}</Badge></p>
            </div>
          )}

          <Separator />

          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <History className="h-3 w-3" />
              Access Log
            </p>
            {loadingLog ? (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</p>
            ) : !accessLog || accessLog.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No log entries yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-40 overflow-y-auto">
                {accessLog.map((entry) => (
                  <li key={entry.id} className="text-xs text-muted-foreground flex items-center justify-between gap-2">
                    <span>
                      <span className="font-medium text-foreground">{entry.actor_name ?? 'Unknown user'}</span>{' '}
                      {entry.action.replace(/^fp\.determination\./, '').replace(/_/g, ' ')}
                    </span>
                    <span className="tabular-nums whitespace-nowrap">{new Date(entry.created_at).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Comparison Card ──────────────────────────────────────────────────────────

function ComparisonCard({
  individualName,
  determinations,
  regulatorMap,
}: {
  individualName: string;
  determinations: DeterminationRow[];
  regulatorMap: Record<string, string>;
}) {
  const outcomes = determinations.map((d) => d.outcome).filter(Boolean);
  const uniqueOutcomes = new Set(outcomes);
  const isConflicting = uniqueOutcomes.size > 1;

  return (
    <Card className={isConflicting ? 'border-amber-300 ring-1 ring-amber-200' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            {individualName}
            <Badge variant="outline" className="text-xs font-normal">
              {determinations.length} regulator{determinations.length !== 1 ? 's' : ''}
            </Badge>
          </CardTitle>
          {isConflicting && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
              <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              CONFLICTING DETERMINATIONS
            </div>
          )}
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-4">
        <div className="flex gap-4 overflow-x-auto pb-1">
          {determinations.map((det) => (
            <div
              key={det.id}
              className="flex-shrink-0 min-w-[200px] max-w-[260px] rounded-lg border bg-slate-50/50 p-3 space-y-2.5"
            >
              {/* Regulator */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                  Regulator
                </p>
                <p className="text-xs font-semibold text-foreground">
                  {det.regulator_id
                    ? (regulatorMap[det.regulator_id] ?? det.regulator_id.slice(0, 8) + '…')
                    : <span className="italic text-muted-foreground font-normal">Not set</span>}
                </p>
              </div>

              {/* Outcome */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-1">
                  Outcome
                </p>
                <OutcomeBadge outcome={det.outcome} />
              </div>

              {/* Effective period */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                  Effective Period
                </p>
                <p className="text-xs text-foreground tabular-nums">
                  {formatDate(det.effective_from)}
                  {det.effective_to ? ` – ${formatDate(det.effective_to)}` : ' – ongoing'}
                </p>
              </div>

              {/* Rationale snippet */}
              <div>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-0.5">
                  Rationale
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {truncate(det.rationale, 100)}
                </p>
              </div>

              {/* Is Current */}
              <CurrentBadge isCurrent={det.is_current} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Filters ───────────────────────────────────────────────────────────────────

type OutcomeFilter = 'all' | 'fit' | 'not_fit' | 'conditional' | 'deferred';
type CurrentFilter = 'all' | 'current' | 'superseded';

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FpaDeterminations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [view, setView] = useState<'list' | 'comparison'>('list');
  const [outcomeFilter, setOutcomeFilter] = useState<OutcomeFilter>('all');
  const [currentFilter, setCurrentFilter] = useState<CurrentFilter>('all');
  const [regulatorFilter, setRegulatorFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: determinations,
    isLoading,
    error: determinationsError,
  } = useQuery({
    queryKey: ['fp_determinations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_determinations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as DeterminationRow[];
    },
  });

  const { data: individuals, error: individualsError } = useQuery({
    queryKey: ['fp_individuals_minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_individuals')
        .select('id, full_name')
        .order('full_name', { ascending: true })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string }[];
    },
  });

  const { data: assessments, error: assessmentsError } = useQuery({
    queryKey: ['fp_assessments_minimal'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('id, individual_id, assessment_type, status, role_id, licensee_id, regulator_id')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AssessmentDetail[];
    },
  });

  const { data: regulators } = useQuery({
    queryKey: ['regulators_minimal'],
    queryFn: async () => {
      const { data, error } = await supabase.from('regulators').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as RegulatorRow[];
    },
  });

  const regulatorMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const r of regulators ?? []) m[r.id] = r.name;
    return m;
  }, [regulators]);

  // ── Derived data ───────────────────────────────────────────────────────────

  const individualMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ind of individuals ?? []) m[ind.id] = ind.full_name;
    return m;
  }, [individuals]);

  const assessmentMap = useMemo(() => {
    const m: Record<string, AssessmentDetail> = {};
    for (const a of assessments ?? []) m[a.id] = a;
    return m;
  }, [assessments]);

  const enriched: DeterminationRow[] = useMemo(
    () =>
      (determinations ?? []).map((d) => ({
        ...d,
        individual_name: individualMap[d.individual_id] ?? d.individual_id,
      })),
    [determinations, individualMap]
  );

  // Stats
  const totalCount = enriched.length;
  const fitCount = enriched.filter((d) => d.outcome === 'fit').length;
  const notFitCount = enriched.filter((d) => d.outcome === 'not_fit').length;
  const conditionalCount = enriched.filter((d) => d.outcome === 'conditional').length;
  const currentCount = enriched.filter((d) => d.is_current === true).length;

  // List view: apply filters
  const filtered = useMemo(() => {
    return enriched.filter((d) => {
      if (outcomeFilter !== 'all' && d.outcome !== outcomeFilter) return false;
      if (currentFilter === 'current' && !d.is_current) return false;
      if (currentFilter === 'superseded' && d.is_current) return false;
      if (regulatorFilter !== 'all' && (d.regulator_id ?? '__none__') !== regulatorFilter) return false;
      return true;
    });
  }, [enriched, outcomeFilter, currentFilter, regulatorFilter]);

  // Comparison view: group by individual, show only those with >1 determination
  const comparisonGroups = useMemo(() => {
    const groups: Record<string, DeterminationRow[]> = {};
    for (const d of enriched) {
      const key = d.individual_id ?? '__unknown__';
      if (!groups[key]) groups[key] = [];
      groups[key].push(d);
    }
    return Object.entries(groups)
      .filter(([, rows]) => rows.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
  }, [enriched]);

  // Assessments filtered by selected individual
  const filteredAssessments = useMemo(() => {
    if (!form.individual_id) return assessments ?? [];
    return (assessments ?? []).filter((a) => a.individual_id === form.individual_id);
  }, [assessments, form.individual_id]);

  const selectedAssessmentObj = useMemo(
    () => (assessments ?? []).find((a) => a.id === form.assessment_id) ?? null,
    [assessments, form.assessment_id],
  );

  // A regulator is inherent to the assessment (fp_assessments.regulator_id) —
  // when set, it drives the determination's regulator rather than a free pick,
  // so a determination can never end up attributed to a different regulator
  // than the assessment it's based on.
  const assessmentRegulatorId = selectedAssessmentObj?.regulator_id ?? null;

  // ── Sector-specific decision logic (mirrors FpDeterminationsPanel) ─────────

  const { data: sectorContext } = useQuery({
    queryKey: ['fpa_det_sector_ctx', selectedAssessmentObj?.role_id, selectedAssessmentObj?.licensee_id],
    enabled: !!selectedAssessmentObj,
    queryFn: async () => {
      let sectorId: string | null = null;
      let subSectorId: string | null = null;
      let roleType: string | null = null;
      if (selectedAssessmentObj?.role_id) {
        const { data: role } = await supabase
          .from('fp_individual_roles')
          .select('role_type, licensee_id')
          .eq('id', selectedAssessmentObj.role_id)
          .maybeSingle();
        if (role) {
          roleType = role.role_type;
          if (role.licensee_id) {
            const { data: lic } = await supabase.from('licensees').select('sector_id, sub_sector_id').eq('id', role.licensee_id).maybeSingle();
            if (lic) { sectorId = lic.sector_id; subSectorId = lic.sub_sector_id; }
          }
        }
      } else if (selectedAssessmentObj?.licensee_id) {
        const { data: lic } = await supabase.from('licensees').select('sector_id, sub_sector_id').eq('id', selectedAssessmentObj.licensee_id).maybeSingle();
        if (lic) { sectorId = lic.sector_id; subSectorId = lic.sub_sector_id; }
      }
      return { sectorId, subSectorId, roleType };
    },
  });

  const { data: sectorRule } = useQuery({
    queryKey: ['fpa_det_sector_rule', sectorContext?.sectorId, sectorContext?.subSectorId, sectorContext?.roleType],
    enabled: !!sectorContext?.sectorId,
    queryFn: async () => resolveFpSectorRule(sectorContext!),
  });

  const { data: assessmentFindings } = useQuery({
    queryKey: ['fpa_det_findings', form.assessment_id],
    enabled: !!form.assessment_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_findings')
        .select('check_type, severity, is_false_positive, resolution_status, confidence_score')
        .eq('assessment_id', form.assessment_id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const criteriaEval: CriteriaEvaluation = useMemo(() => {
    const active = (assessmentFindings ?? []).filter((f: any) => !f.is_false_positive && f.resolution_status !== 'false_positive');
    const completedChecks = Array.from(new Set(active.map((f: any) => f.check_type)));
    const scores = active.map((f: any) => Number(f.confidence_score ?? 0)).filter((n: number) => Number.isFinite(n));
    const avg = scores.length ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null;
    return evaluateFpCriteria(sectorRule ?? null, { score: avg, completedChecks });
  }, [assessmentFindings, sectorRule]);

  // ── Insert mutation ────────────────────────────────────────────────────────

  const addDetermination = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('You must be logged in to record a determination.');
      if (!form.individual_id) throw new Error('Individual is required.');
      if (!form.assessment_id) throw new Error('Assessment is required.');
      if (!form.outcome) throw new Error('Outcome is required.');
      if (form.rationale.trim().length < 10) {
        throw new Error(
          sectorRule && !criteriaEval.passed
            ? 'Rationale must justify overriding the sector rule (min 10 characters).'
            : 'Rationale is required (min 10 characters).',
        );
      }

      // A regulator is inherent to the assessment; fall back to a manual pick
      // only when the assessment itself has no regulator attached.
      const resolvedRegulatorId = assessmentRegulatorId ?? (form.regulator_id.trim() || null);

      // Multi-regulator scoping: only supersede the current determination for
      // the SAME regulator (or the same "unscoped" bucket) — a different
      // regulator's current determination for this individual is untouched.
      const priorQuery = supabase
        .from('fp_determinations')
        .select('id')
        .eq('individual_id', form.individual_id)
        .eq('is_current', true);
      const { data: prior } = resolvedRegulatorId
        ? await priorQuery.eq('regulator_id', resolvedRegulatorId).maybeSingle()
        : await priorQuery.is('regulator_id', null).maybeSingle();

      if (prior) {
        await supabase.from('fp_determinations').update({ is_current: false }).eq('id', prior.id);
      }

      const payload: Record<string, any> = {
        individual_id: form.individual_id,
        assessment_id: form.assessment_id,
        outcome: form.outcome,
        rationale: form.rationale.trim(),
        is_current: true,
        determined_by: user.id,
        supersedes_id: prior?.id ?? null,
        regulator_id: resolvedRegulatorId,
      };
      if (form.effective_from) payload.effective_from = form.effective_from;
      if (form.effective_to) payload.effective_to = form.effective_to;

      const { data: inserted, error } = await supabase
        .from('fp_determinations')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;

      await logFpAction(`fp.determination.${form.outcome}`, 'fp_determination', inserted.id, {
        after: {
          outcome: form.outcome,
          rationale: form.rationale.trim(),
          regulator_id: resolvedRegulatorId,
          supersedes_id: prior?.id ?? null,
          sector_rule_passed: sectorRule ? criteriaEval.passed : null,
        },
        context: {
          individualId: form.individual_id,
          assessmentId: form.assessment_id,
          determinationId: inserted.id,
          regulatorId: resolvedRegulatorId ?? undefined,
        },
        justification: form.rationale.trim(),
      });
    },
    onSuccess: () => {
      toast.success('Determination recorded.');
      qc.invalidateQueries({ queryKey: ['fp_determinations'] });
      setOpen(false);
      setForm(EMPTY_FORM);
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to record determination.');
    },
  });

  const handleDialogOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) setForm(EMPTY_FORM);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <PageHeader
          title="Determinations"
          description="Fit & Proper determinations across multiple regulators — FPA-011"
          actions={
            <Dialog open={open} onOpenChange={handleDialogOpenChange}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Determination
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Record New Determination</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                  {/* Individual */}
                  <div>
                    <Label>
                      Individual <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={form.individual_id}
                      onValueChange={(v) =>
                        setForm((f) => ({ ...f, individual_id: v, assessment_id: '' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select individual…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(individuals ?? []).map((ind) => (
                          <SelectItem key={ind.id} value={ind.id}>
                            {ind.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Assessment */}
                  <div>
                    <Label>
                      Assessment <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={form.assessment_id}
                      onValueChange={(v) => setForm((f) => ({ ...f, assessment_id: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an assessment…" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredAssessments.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.assessment_type
                              ? `${a.assessment_type.replace(/_/g, ' ')} — ${a.status ?? 'unknown'}`
                              : a.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Outcome */}
                  <div>
                    <Label>
                      Outcome <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={form.outcome}
                      onValueChange={(v) => setForm((f) => ({ ...f, outcome: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select outcome…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fit">Fit</SelectItem>
                        <SelectItem value="not_fit">Not Fit</SelectItem>
                        <SelectItem value="conditional">Conditionally Fit</SelectItem>
                        <SelectItem value="deferred">Deferred</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Regulator — inherent to the assessment when it has one */}
                  <div>
                    <Label>Regulator</Label>
                    {assessmentRegulatorId ? (
                      <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/40 text-sm">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {regulatorMap[assessmentRegulatorId] ?? assessmentRegulatorId}
                        <span className="text-xs text-muted-foreground ml-auto">from assessment</span>
                      </div>
                    ) : (
                      <Select
                        value={form.regulator_id}
                        onValueChange={(v) => setForm((f) => ({ ...f, regulator_id: v }))}
                        disabled={!form.assessment_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={form.assessment_id ? 'No regulator set on assessment — pick one (optional)' : 'Select an assessment first'} />
                        </SelectTrigger>
                        <SelectContent>
                          {(regulators ?? []).map((r) => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Sector-specific decision logic */}
                  {sectorRule && (
                    <div className={`rounded-md border p-3 text-sm ${criteriaEval.passed ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                      <div className="font-medium flex items-center gap-2">
                        <ShieldAlert className="h-4 w-4" />
                        Sector rule: {sectorRule.name}
                      </div>
                      {criteriaEval.passed ? (
                        <p className="text-xs mt-1 text-emerald-800">All sector criteria satisfied.</p>
                      ) : (
                        <div className="text-xs mt-1 space-y-1 text-red-800">
                          {criteriaEval.failed.length > 0 && (
                            <p><strong>Missing mandatory checks:</strong> {criteriaEval.failed.join(', ')}</p>
                          )}
                          {criteriaEval.disqualifiers.length > 0 && (
                            <p><strong>Disqualifiers present:</strong> {criteriaEval.disqualifiers.join(', ')}</p>
                          )}
                          {criteriaEval.minScoreOk === false && <p><strong>Minimum confidence score not met.</strong></p>}
                          {criteriaEval.warned.length > 0 && (
                            <p className="text-amber-800"><strong>Warnings:</strong> {criteriaEval.warned.join(', ')}</p>
                          )}
                          <p className="text-muted-foreground">Record rationale below explaining the override.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Outcome */}
                  <div>
                    <Label>
                      Outcome <span className="text-red-500">*</span>
                    </Label>
                    <Select
                      value={form.outcome}
                      onValueChange={(v) => setForm((f) => ({ ...f, outcome: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select outcome…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fit">Fit</SelectItem>
                        <SelectItem value="not_fit">Not Fit</SelectItem>
                        <SelectItem value="conditional">Conditionally Fit</SelectItem>
                        <SelectItem value="deferred">Deferred</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Rationale */}
                  <div>
                    <Label>
                      Rationale <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      rows={3}
                      value={form.rationale}
                      onChange={(e) => setForm((f) => ({ ...f, rationale: e.target.value }))}
                      placeholder={
                        sectorRule && !criteriaEval.passed
                          ? 'Rationale (min 10 chars) — must justify overriding the sector rule…'
                          : 'Provide the basis for this determination (min 10 chars)…'
                      }
                    />
                  </div>

                  {/* Effective dates */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Effective From</Label>
                      <Input
                        type="date"
                        value={form.effective_from}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, effective_from: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>Effective To</Label>
                      <Input
                        type="date"
                        value={form.effective_to}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, effective_to: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addDetermination.mutate()}
                    disabled={
                      addDetermination.isPending ||
                      !form.individual_id ||
                      !form.assessment_id ||
                      !form.outcome ||
                      form.rationale.trim().length < 10
                    }
                  >
                    {addDetermination.isPending && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    Record Determination
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
        />

        {/* Query error alerts */}
        {determinationsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load determinations:{' '}
              {(determinationsError as any)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}
        {individualsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load individuals list:{' '}
              {(individualsError as any)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}
        {assessmentsError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load assessments list:{' '}
              {(assessmentsError as any)?.message ?? 'Unknown error'}
            </AlertDescription>
          </Alert>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <StatCard
            icon={GitBranch}
            label="Total"
            value={totalCount}
            accentClass="bg-slate-100 text-slate-600"
          />
          <StatCard
            icon={CheckCircle2}
            label="Fit"
            value={fitCount}
            accentClass="bg-emerald-50 text-emerald-600"
          />
          <StatCard
            icon={XCircle}
            label="Not Fit"
            value={notFitCount}
            accentClass="bg-red-50 text-red-600"
          />
          <StatCard
            icon={AlertTriangle}
            label="Conditional"
            value={conditionalCount}
            accentClass="bg-amber-50 text-amber-600"
          />
          <StatCard
            icon={ShieldCheck}
            label="Current"
            value={currentCount}
            accentClass="bg-blue-50 text-blue-600"
          />
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={view === 'list' ? 'default' : 'outline'}
            className="gap-1.5"
            onClick={() => setView('list')}
          >
            <LayoutList className="h-4 w-4" />
            List View
          </Button>
          <Button
            size="sm"
            variant={view === 'comparison' ? 'default' : 'outline'}
            className="gap-1.5"
            onClick={() => setView('comparison')}
          >
            <Columns2 className="h-4 w-4" />
            Comparison View
          </Button>
        </div>

        {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <CardTitle className="text-base">All Determinations</CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Outcome filter */}
                  <Select
                    value={outcomeFilter}
                    onValueChange={(v) => setOutcomeFilter(v as OutcomeFilter)}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs">
                      <SelectValue placeholder="Filter outcome" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All outcomes</SelectItem>
                      <SelectItem value="fit">Fit</SelectItem>
                      <SelectItem value="not_fit">Not Fit</SelectItem>
                      <SelectItem value="conditional">Conditional</SelectItem>
                      <SelectItem value="deferred">Deferred</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Current filter */}
                  <Select
                    value={currentFilter}
                    onValueChange={(v) => setCurrentFilter(v as CurrentFilter)}
                  >
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder="Filter current" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All records</SelectItem>
                      <SelectItem value="current">Current only</SelectItem>
                      <SelectItem value="superseded">Superseded only</SelectItem>
                    </SelectContent>
                  </Select>
                  {/* Regulator filter */}
                  <Select value={regulatorFilter} onValueChange={setRegulatorFilter}>
                    <SelectTrigger className="h-8 w-44 text-xs">
                      <SelectValue placeholder="Filter regulator" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All regulators</SelectItem>
                      <SelectItem value="__none__">No regulator set</SelectItem>
                      {(regulators ?? []).map((r) => (
                        <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Loading determinations…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-16 text-center text-sm text-muted-foreground">
                  No determinations match the selected filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Individual</TableHead>
                        <TableHead>Regulator</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="max-w-[220px]">Rationale</TableHead>
                        <TableHead>Effective From</TableHead>
                        <TableHead>Effective To</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Determined By</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((det) => (
                        <TableRow key={det.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {det.individual_name ?? '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {det.regulator_id
                              ? (regulatorMap[det.regulator_id] ?? <span className="font-mono">{det.regulator_id.slice(0, 8)}…</span>)
                              : <span className="italic">—</span>}
                          </TableCell>
                          <TableCell>
                            <OutcomeBadge outcome={det.outcome} />
                          </TableCell>
                          <TableCell className="max-w-[220px] text-xs text-muted-foreground">
                            {truncate(det.rationale, 80)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">
                            {formatDate(det.effective_from)}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap">
                            {formatDate(det.effective_to)}
                          </TableCell>
                          <TableCell>
                            <CurrentBadge isCurrent={det.is_current} />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {det.determined_by ? det.determined_by.slice(0, 8) + '…' : '—'}
                          </TableCell>
                          <TableCell className="text-xs tabular-nums whitespace-nowrap text-muted-foreground">
                            {formatDate(det.determined_at ?? det.created_at)}
                          </TableCell>
                          <TableCell>
                            {det.assessment_id && assessmentMap[det.assessment_id] && (
                              <DeterminationDetailDialog
                                determination={det}
                                assessment={assessmentMap[det.assessment_id]}
                                individualName={det.individual_name ?? det.individual_id}
                                regulatorName={det.regulator_id ? (regulatorMap[det.regulator_id] ?? null) : null}
                                trigger={
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="gap-1 h-7 px-2 text-xs"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    View
                                  </Button>
                                }
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── COMPARISON VIEW ───────────────────────────────────────────────── */}
        {view === 'comparison' && (
          <div className="space-y-4">
            {/* Explanation banner */}
            <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
              <GitBranch className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
              <div>
                <span className="font-semibold">FPA-011 — Multi-Regulator Coordination.</span>{' '}
                Each card shows the same individual's determinations side-by-side across different
                regulators. A yellow warning banner appears when regulators have issued conflicting
                outcomes for the same person.
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading determinations…</span>
              </div>
            ) : comparisonGroups.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                No individuals with multiple determinations found. Comparison view shows individuals
                assessed by more than one regulator.
              </div>
            ) : (
              comparisonGroups.map(([individualId, rows]) => {
                const name =
                  individualId === '__unknown__'
                    ? 'Unknown Individual'
                    : (individualMap[individualId] ?? individualId.slice(0, 8) + '…');
                return (
                  <ComparisonCard
                    key={individualId}
                    individualName={name}
                    determinations={rows}
                    regulatorMap={regulatorMap}
                  />
                );
              })
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
