import { useState, useEffect } from 'react';
import {
  FP_PROVIDER_STATE_META,
  isConclusive,
  normalizeProviderState,
} from '@/lib/fp/providerStates';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { fpFindingDisposition, fpFindingSetFalsePositive } from '@/lib/fpGovernedOps';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logFpAction } from '@/lib/fpAudit';
import { FpScreeningProviderBanner } from '@/components/fit-and-proper/FpScreeningProviderBanner';
import {
  Loader2,
  Brain,
  ShieldAlert,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  UserCheck,
  Link2,
  MessageSquare,
  BarChart3,
  Pencil,
  ExternalLink,
  History,
  ListChecks,
  Radio,
  FlaskConical,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AssessmentOption {
  id: string;
  individual_id: string;
  assessment_type: string | null;
  status: string | null;
  created_at: string;
  individual_name: string;
}

interface AiFinding {
  id: string;
  assessment_id: string | null;
  individual_id: string | null;
  title: string | null;
  summary: string | null;
  severity: string | null;
  resolution_status: string | null;
  check_type: string | null;
  source: string | null;
  confidence_score: number | null;
  raw_payload: any;
  is_false_positive: boolean | null;
  review_note: string | null;
  citations: any;
  evidence_url: string | null;
  evidence_urls: any;
  created_at: string;
}

interface OverrideForm {
  decision: 'false_positive' | 'confirmed' | 'under_review' | '';
  reason: string;
}

interface ScreeningRunInfo {
  id: string;
  run_type: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  total_checks: number | null;
  total_hits: number | null;
  config_snapshot: any;
  /** Per-check external provider outcome written by fp-screening-run. */
  provider_outcomes: any;
}


// Mirrors the self-declaration keys fp-screening-run itself checks per
// check_type (see supabase/functions/fp-screening-run/index.ts) — used here to
// flag when the declarant answered "No" but an AI/automated finding of the
// same category exists on the assessment.
const DECLARATION_KEYS_BY_CHECK_TYPE: Record<string, string[]> = {
  criminal_history: ['criminal_conviction', 'criminal_pending', 'director_disqualified', 'civil_judgment'],
  regulator_watchlist: ['license_refused', 'license_revoked', 'disciplinary_proceedings'],
  credit_history: ['bankruptcy', 'insolvent_director'],
  pep: ['other_regulated_roles'],
};

function findInconsistency(finding: AiFinding, questionnaire: Record<string, { answer?: string }>): string | null {
  if (finding.is_false_positive || finding.resolution_status === 'false_positive') return null;
  const keys = DECLARATION_KEYS_BY_CHECK_TYPE[finding.check_type ?? ''];
  if (!keys) return null;
  const deniedKeys = keys.filter((k) => questionnaire?.[k]?.answer === 'no');
  if (deniedKeys.length === 0) return null;
  return `Self-declaration answered "No" to ${deniedKeys.join(', ').replace(/_/g, ' ')}, but this ${(finding.check_type ?? '').replace(/_/g, ' ')} finding is still active.`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function severityBadge(severity: string | null) {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1">
          <XCircle className="h-3 w-3" />
          Critical
        </Badge>
      );
    case 'high':
      return (
        <Badge className="bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">
          High
        </Badge>
      );
    case 'medium':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
          Medium
        </Badge>
      );
    case 'low':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
          Low
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {severity ?? 'Unknown'}
        </Badge>
      );
  }
}

// confidence_score is stored 0-100 (see fp-ai-media-ingest and fp-screening-run
// edge functions) — do not treat it as a 0-1 fraction.
function confidenceBadge(score: number | null) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50 text-xs font-mono">
        AI SCORED
      </Badge>
    );
  }
  const pct = Math.round(score);
  if (pct >= 80) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs font-mono">
        HIGH CONF · {pct}%
      </Badge>
    );
  }
  if (pct >= 50) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs font-mono">
        MED CONF · {pct}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs font-mono">
      LOW CONF · {pct}%
    </Badge>
  );
}

function resolutionBadge(status: string | null) {
  switch ((status ?? '').toLowerCase()) {
    case 'false_positive':
      return (
        <Badge className="bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          False Positive
        </Badge>
      );
    case 'confirmed':
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 gap-1">
          <AlertTriangle className="h-3 w-3" />
          Confirmed
        </Badge>
      );
    case 'under_review':
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 gap-1">
          <Loader2 className="h-3 w-3" />
          Under Review
        </Badge>
      );
    case 'open':
      return (
        <Badge className="bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
          Open
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {status ?? 'Pending'}
        </Badge>
      );
  }
}

function checkTypeBadge(checkType: string | null) {
  const label = (checkType ?? 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const colors: Record<string, string> = {
    adverse_media: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100',
    sanctions: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-100',
    pep: 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100',
    criminal_history: 'bg-rose-100 text-rose-700 border-rose-200 hover:bg-rose-100',
  };
  const cls = colors[(checkType ?? '').toLowerCase()] ?? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100';
  return <Badge className={`text-xs ${cls}`}>{label}</Badge>;
}

/**
 * Provenance badge — makes it unambiguous whether a finding came from an
 * external screening provider, an AI model, a keyword scan / self-declaration,
 * or a human. A provider hit and an LLM lead carry very different evidential
 * weight, so they must never look alike on the review screen.
 */
function sourceBadge(finding: { source: string | null; raw_payload: any }) {
  const src = (finding.source ?? '').toLowerCase();
  const rp = finding.raw_payload && typeof finding.raw_payload === 'object' ? finding.raw_payload : {};
  if (src.startsWith('provider:')) {
    const sandbox = Boolean(rp.sandbox);
    const provider = String(rp.provider ?? src.slice('provider:'.length));
    return (
      <Badge
        className={`text-xs gap-1 ${
          sandbox
            ? 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
            : 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
        }`}
        title={`External screening provider: ${provider}${sandbox ? ' (sandbox — simulated result)' : ''}`}
      >
        <Radio className="h-3 w-3" />
        {sandbox ? 'Sandbox provider' : 'Provider'}
      </Badge>
    );
  }
  if (src.includes('ai')) {
    return (
      <Badge className="text-xs gap-1 bg-violet-100 text-violet-700 border-violet-200 hover:bg-violet-100" title="Generated by an AI model — treat as a lead, not a confirmed hit">
        <Brain className="h-3 w-3" />
        AI
      </Badge>
    );
  }
  if (src.includes('manual') || src.includes('analyst')) {
    return (
      <Badge className="text-xs gap-1 bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-100" title="Entered manually by an analyst">
        <UserCheck className="h-3 w-3" />
        Manual
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-muted-foreground" title={`Source: ${finding.source ?? 'internal'}`}>
      {finding.source || 'internal'}
    </Badge>
  );
}

/** Match score reported by the external provider, when present. */
function matchScoreBadge(rawPayload: any) {
  const rp = rawPayload && typeof rawPayload === 'object' ? rawPayload : {};
  const score = Number(rp.match_score_pct);
  if (!Number.isFinite(score) || score <= 0) return null;
  return (
    <Badge variant="outline" className="text-xs font-mono text-muted-foreground" title="Provider name-match score">
      match {score}%
    </Badge>
  );
}



function parseCitations(citations: any): string[] {
  if (!citations) return [];
  if (Array.isArray(citations)) return citations.filter((c) => typeof c === 'string');
  if (typeof citations === 'string') {
    try {
      const parsed = JSON.parse(citations);
      if (Array.isArray(parsed)) return parsed.filter((c) => typeof c === 'string');
    } catch {
      return [citations];
    }
  }
  return [];
}

function formatAssessmentLabel(a: AssessmentOption): string {
  const type = (a.assessment_type ?? 'Assessment')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const status = a.status ? ` · ${a.status}` : '';
  return `${a.individual_name} — ${type}${status}`;
}

// ── Override Dialog ───────────────────────────────────────────────────────────

interface OverrideDialogProps {
  finding: AiFinding;
  open: boolean;
  onClose: () => void;
}

function OverrideDialog({ finding, open, onClose }: OverrideDialogProps) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<OverrideForm>({ decision: '', reason: '' });

  const overrideMutation = useMutation({
    mutationFn: async () => {
      if (!form.decision) throw new Error('Please select a decision.');
      if (!form.reason.trim()) throw new Error('Override reason is required.');

      // Guard: ensure finding has a valid id before attempting the update
      if (!finding.id) throw new Error('Finding not found or already deleted.');

      const now = new Date().toISOString();
      const existingPayload =
        finding.raw_payload && typeof finding.raw_payload === 'object'
          ? finding.raw_payload
          : {};

      // Preserve prior overrides instead of replacing them, so a second
      // override doesn't erase the trail of what the AI originally said and
      // what earlier reviewers decided.
      const priorHistory: unknown[] = Array.isArray((existingPayload as any).override_history)
        ? (existingPayload as any).override_history
        : [];
      const previousOverride = (existingPayload as any).human_override ?? null;

      const newOverride = {
        decision: form.decision,
        reason: form.reason.trim(),
        by: user?.email ?? user?.id ?? 'unknown',
        at: now,
      };

      const updatedPayload = {
        ...existingPayload,
        human_override: newOverride,
        override_history: previousOverride ? [...priorHistory, previousOverride] : priorHistory,
      };

      if (form.decision === 'false_positive') {
        await fpFindingSetFalsePositive(finding.id, true, form.reason.trim());
      }
      await fpFindingDisposition(
        finding.id,
        form.decision as any,
        form.reason.trim(),
        updatedPayload as Record<string, unknown>,
      );
    },
    onSuccess: () => {
      toast.success('AI decision overridden.');
      qc.invalidateQueries({ queryKey: ['fp_ai_findings'] });
      onClose();
      setForm({ decision: '', reason: '' });
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Failed to override decision.');
    },
  });

  const handleClose = () => {
    if (!overrideMutation.isPending) {
      setForm({ decision: '', reason: '' });
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="h-4 w-4 text-primary" />
            Override AI Decision
          </DialogTitle>
        </DialogHeader>

        {/* Original AI finding summary */}
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5">
            AI Finding
          </p>
          <p className="font-medium text-foreground leading-snug">{finding.title ?? 'Untitled finding'}</p>
          {finding.summary && (
            <p className="text-muted-foreground text-xs leading-relaxed line-clamp-3">
              {finding.summary}
            </p>
          )}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            {severityBadge(finding.severity)}
            {confidenceBadge(finding.confidence_score)}
            {checkTypeBadge(finding.check_type)}
            {sourceBadge(finding)}
            {matchScoreBadge(finding.raw_payload)}
          </div>
        </div>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>
              Override Decision <span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.decision}
              onValueChange={(v) => setForm((f) => ({ ...f, decision: v as OverrideForm['decision'] }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select decision…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="false_positive">False Positive — dismiss this finding</SelectItem>
                <SelectItem value="confirmed">Confirmed — mark as a genuine finding</SelectItem>
                <SelectItem value="under_review">Under Review — flag for further investigation</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Override Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              rows={3}
              placeholder="Explain why you are overriding the AI decision…"
              value={form.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={overrideMutation.isPending}>
            Cancel
          </Button>
          <Button data-rbac="fit_and_proper.edit"
            onClick={() => overrideMutation.mutate()}
            disabled={overrideMutation.isPending || !form.decision || !form.reason.trim()}
          >
            {overrideMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply Override
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Finding Card ──────────────────────────────────────────────────────────────

interface FindingCardProps {
  finding: AiFinding;
  inconsistency: string | null;
  onOverride: (finding: AiFinding) => void;
  onViewIndividual: (individualId: string) => void;
}

function FindingCard({ finding, inconsistency, onOverride, onViewIndividual }: FindingCardProps) {
  const citations = parseCitations(finding.citations);
  const assessorNote =
    finding.raw_payload &&
    typeof finding.raw_payload === 'object' &&
    finding.raw_payload.assessor_note
      ? String(finding.raw_payload.assessor_note)
      : null;

  const humanOverride =
    finding.raw_payload &&
    typeof finding.raw_payload === 'object' &&
    finding.raw_payload.human_override
      ? finding.raw_payload.human_override
      : null;

  const overrideHistory: any[] =
    finding.raw_payload &&
    typeof finding.raw_payload === 'object' &&
    Array.isArray(finding.raw_payload.override_history)
      ? finding.raw_payload.override_history
      : [];

  const isOverridden = !!humanOverride;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Left severity stripe */}
      <div className="flex">
        <div
          className={`w-1 shrink-0 ${
            (finding.severity ?? '').toLowerCase() === 'critical'
              ? 'bg-red-500'
              : (finding.severity ?? '').toLowerCase() === 'high'
              ? 'bg-orange-400'
              : (finding.severity ?? '').toLowerCase() === 'medium'
              ? 'bg-amber-400'
              : 'bg-blue-400'
          }`}
        />
        <div className="flex-1 p-4 space-y-3">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground leading-snug">
                {finding.title ?? 'Untitled Finding'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isOverridden && (
                <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-100 text-xs gap-1">
                  <UserCheck className="h-3 w-3" />
                  Overridden
                </Badge>
              )}
              {finding.individual_id && (
                <Button data-rbac="fit_and_proper.view"
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                  onClick={() => onViewIndividual(finding.individual_id!)}
                  title="View individual record"
                >
                  <ExternalLink className="h-3 w-3" />
                  Individual
                </Button>
              )}
            </div>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5">
            {severityBadge(finding.severity)}
            {checkTypeBadge(finding.check_type)}
            {sourceBadge(finding)}
            {matchScoreBadge(finding.raw_payload)}
            {confidenceBadge(finding.confidence_score)}
          </div>

          {/* Summary */}
          {finding.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {finding.summary}
            </p>
          )}

          {/* Inconsistency flag: self-declaration vs. finding */}
          {inconsistency && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
              <span className="leading-relaxed">
                <span className="font-semibold">Inconsistency detected.</span> {inconsistency}
              </span>
            </div>
          )}

          {/* Citations */}
          {citations.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Link2 className="h-3 w-3" />
                Citations
              </p>
              <ul className="space-y-0.5">
                {citations.map((c, i) => (
                  <li key={i} className="text-xs text-blue-600 truncate">
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Assessor note from raw_payload */}
          {assessorNote && (
            <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 flex gap-2">
              <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
              <span className="leading-relaxed">{assessorNote}</span>
            </div>
          )}

          {/* Divider + Human decision section */}
          <Separator />

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                Human Decision
              </p>
              <div className="flex items-center gap-2">
                {resolutionBadge(finding.resolution_status)}
              </div>
              {humanOverride && (
                <p className="text-xs text-muted-foreground mt-1">
                  by {humanOverride.by ?? 'reviewer'} &mdash; {humanOverride.reason ?? ''}
                  <span className="ml-1 text-muted-foreground/70">
                    ({new Date(humanOverride.at).toLocaleString()})
                  </span>
                </p>
              )}
              {finding.review_note && !humanOverride && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  {finding.review_note}
                </p>
              )}
              {overrideHistory.length > 0 && (
                <details className="mt-1.5">
                  <summary className="text-xs text-muted-foreground cursor-pointer inline-flex items-center gap-1 hover:text-foreground">
                    <History className="h-3 w-3" />
                    {overrideHistory.length} prior override{overrideHistory.length !== 1 ? 's' : ''}
                  </summary>
                  <ul className="mt-1 space-y-1 pl-4 border-l">
                    {overrideHistory.map((h: any, i: number) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        <span className="font-medium">{h.decision}</span> by {h.by ?? 'reviewer'} &mdash; {h.reason ?? ''}{' '}
                        <span className="text-muted-foreground/70">({h.at ? new Date(h.at).toLocaleString() : '—'})</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <Button data-rbac="fit_and_proper.edit"
              size="sm"
              variant="outline"
              className="gap-1.5 text-xs h-8"
              onClick={() => onOverride(finding)}
            >
              <Pencil className="h-3 w-3" />
              Override
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FpaAiAnalysis() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // A caller can deep-link straight to the assessment it just screened (e.g.
  // from the Screening Hub or an individual's Screening tab) via
  // ?assessment_id=... — without this, the picker below always defaulted to
  // whichever assessment across the WHOLE system was created most recently,
  // which is very often a different individual than the one just screened.
  const deepLinkedAssessmentId = searchParams.get('assessment_id');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(deepLinkedAssessmentId);
  const [overrideFinding, setOverrideFinding] = useState<AiFinding | null>(null);

  // ── Assessments list ────────────────────────────────────────────────────────

  // Use a join to eliminate the N+1 sub-query and avoid potential .in() URL-length limits
  const { data: assessments, isLoading: loadingAssessments } = useQuery({
    queryKey: ['fp_assessments_for_ai'],
    queryFn: async () => {
      const { data: asmts, error: aErr } = await supabase
        .from('fp_assessments')
        .select('id, individual_id, assessment_type, status, created_at, fp_individuals(id, full_name)')
        .order('created_at', { ascending: false })
        .limit(100);
      if (aErr) throw aErr;

      const rows = (asmts ?? []) as any[];
      return rows.map((r: any): AssessmentOption => ({
        id: r.id,
        individual_id: r.individual_id,
        assessment_type: r.assessment_type,
        status: r.status,
        created_at: r.created_at,
        individual_name: r.fp_individuals?.full_name ?? 'Unknown Individual',
      }));
    },
  });

  // Without a deep-linked assessment_id, default to whichever assessment was
  // MOST RECENTLY SCREENED, not just most recently created — the previous
  // "pick assessments[0]" default meant landing on an unrelated case (created
  // by anyone, for any reason) whenever it happened to be newer than the one
  // you actually just ran screening on, which made a real result look like
  // "nothing here."
  const { data: mostRecentlyScreenedAssessmentId } = useQuery({
    queryKey: ['fp_most_recent_screening_run'],
    enabled: !deepLinkedAssessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_screening_runs')
        .select('assessment_id')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.assessment_id ?? null;
    },
  });

  // Auto-select once we know what to default to (useEffect replaces removed onSuccess)
  useEffect(() => {
    if (selectedAssessmentId) return;
    if (mostRecentlyScreenedAssessmentId === undefined) return; // still loading
    if (mostRecentlyScreenedAssessmentId) {
      setSelectedAssessmentId(mostRecentlyScreenedAssessmentId);
    } else if (assessments && assessments.length > 0) {
      setSelectedAssessmentId(assessments[0].id);
    }
  }, [assessments, mostRecentlyScreenedAssessmentId, selectedAssessmentId]);

  // ── AI Findings ─────────────────────────────────────────────────────────────

  const { data: findings, isLoading: loadingFindings } = useQuery({
    queryKey: ['fp_ai_findings', selectedAssessmentId],
    enabled: !!selectedAssessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_findings')
        .select('*')
        .eq('assessment_id', selectedAssessmentId!)
        .or(
          // criminal_history sits alongside sanctions/pep here on purpose —
          // none of the three are actually AI-model output (sanctions/pep are
          // keyword scans, criminal_history is usually a self-declaration
          // trigger), but this screen's real scope has always been "automated
          // findings that need a human review/override," not "AI-generated
          // only." A criminal_history hit produced by the adverse-media AI
          // check itself is also covered by source.ilike.%ai% below.
          // source.ilike.%provider% picks up findings produced by the external
          // sanctions/PEP/AML screening providers via invokeIntegration().
          'source.ilike.%ai%,source.ilike.%provider%,check_type.in.(adverse_media,sanctions,pep,criminal_history)'
        )

        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiFinding[];
    },
  });

  // ── Self-declaration data (for inconsistency detection) ─────────────────────

  const { data: declarationQuestionnaire } = useQuery({
    queryKey: ['fp_assessment_declaration', selectedAssessmentId],
    enabled: !!selectedAssessmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fp_assessments')
        .select('declaration_data')
        .eq('id', selectedAssessmentId!)
        .maybeSingle();
      if (error) throw error;
      const decl = (data?.declaration_data as any) ?? {};
      return (decl.questionnaire ?? {}) as Record<string, { answer?: string }>;
    },
  });

  // ── Latest screening run (AI output log / data sources evidence) ────────────

  const { data: latestRun } = useQuery({
    queryKey: ['fp_ai_latest_run', selectedAssessmentId],
    enabled: !!selectedAssessmentId,
    queryFn: async (): Promise<ScreeningRunInfo | null> => {
      const { data, error } = await supabase
        .from('fp_screening_runs')
        .select('id, run_type, status, started_at, completed_at, total_checks, total_hits, config_snapshot, provider_outcomes')
        .eq('assessment_id', selectedAssessmentId!)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as ScreeningRunInfo) ?? null;
    },
  });

  // ── Computed stats ──────────────────────────────────────────────────────────

  const totalFindings = findings?.length ?? 0;
  const reviewedFindings = (findings ?? []).filter(
    (f) =>
      f.resolution_status &&
      f.resolution_status !== 'open' &&
      f.resolution_status !== 'pending'
  ).length;
  const overriddenFindings = (findings ?? []).filter(
    (f) =>
      f.raw_payload &&
      typeof f.raw_payload === 'object' &&
      f.raw_payload.human_override
  ).length;
  const overrideRate =
    totalFindings > 0 ? Math.round((overriddenFindings / totalFindings) * 100) : 0;

  const selectedAssessment = (assessments ?? []).find(
    (a: AssessmentOption) => a.id === selectedAssessmentId
  );

  // Navigate to the individual's FPA record (stays within /fpa/* namespace)
  const handleViewIndividual = (individualId: string) => {
    navigate(`/fpa/individuals/${individualId}`);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const showEmpty =
    !selectedAssessmentId ||
    (!loadingFindings && (!findings || findings.length === 0));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <PageHeader
          title="AI Analysis"
          description="External sanctions/PEP/AML screening and AI adverse-media analysis with human override — FPA-009"
        />

        {/* Where the findings below actually came from, and whether the
            external screening path is live, sandboxed or unavailable. */}
        <FpScreeningProviderBanner />

        {/* Assessment Selector */}
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2 shrink-0">
                <Brain className="h-4 w-4 text-primary" />
                <Label className="text-sm font-medium">Assessment</Label>
              </div>
              <div className="flex-1 max-w-md">
                {loadingAssessments ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading assessments…
                  </div>
                ) : (
                  <Select
                    value={selectedAssessmentId ?? ''}
                    onValueChange={(v) => setSelectedAssessmentId(v || null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an assessment…" />
                    </SelectTrigger>
                    <SelectContent>
                      {(assessments ?? []).map((a: AssessmentOption) => (
                        <SelectItem key={a.id} value={a.id}>
                          {formatAssessmentLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedAssessment && (
                <div className="flex items-center gap-1.5">
                  {resolutionBadge(selectedAssessment.status)}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => handleViewIndividual(selectedAssessment.individual_id)}
                    title="View individual's full FPA record"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Individual
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Screening Run evidence — durable record of what ran and against which data sources */}
        {latestRun && (
          <Card className="border-slate-200 bg-slate-50/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Screening Run Log
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>Run type: <span className="font-medium text-foreground">{latestRun.run_type ?? '—'}</span></span>
                <span>Status: <span className="font-medium text-foreground">{latestRun.status ?? '—'}</span></span>
                <span>Checks: <span className="font-medium text-foreground tabular-nums">{latestRun.total_checks ?? '—'}</span></span>
                <span>Hits: <span className="font-medium text-foreground tabular-nums">{latestRun.total_hits ?? '—'}</span></span>
                <span>
                  Started:{' '}
                  <span className="font-medium text-foreground">
                    {latestRun.started_at ? new Date(latestRun.started_at).toLocaleString() : '—'}
                  </span>
                </span>
              </div>
              {Array.isArray(latestRun.provider_outcomes) && latestRun.provider_outcomes.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    External provider calls in this run
                  </p>
                  {latestRun.provider_outcomes.some(
                    (o: any) => !isConclusive(normalizeProviderState(o.state ?? o.outcome)),
                  ) && (
                    <p className="mb-1.5 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning-foreground">
                      One or more checks in this run did not complete against a live provider. This run
                      is NOT evidence of a clean subject — verify manually before relying on it.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {latestRun.provider_outcomes.map((o: any, i: number) => {
                      const state = normalizeProviderState(o.state ?? o.outcome);
                      const meta = FP_PROVIDER_STATE_META[state];
                      return (
                        <Badge
                          key={i}
                          variant="outline"
                          className={`text-xs font-mono ${meta.className}`}
                          title={[
                            meta.help,
                            `provider: ${o.integration_key}`,
                            `mode: ${o.execution_mode ?? '—'}`,
                            o.environment ? `environment: ${o.environment}` : null,
                            o.provider_reference ? `reference: ${o.provider_reference}` : null,
                            o.error_message ? `error: ${o.error_message}` : null,
                            o.correlation_id ? `correlation: ${o.correlation_id}` : null,
                          ].filter(Boolean).join('\n')}
                        >
                          {o.check_type} · {meta.label}
                          {state === 'SUCCESS_HIT' ? ` (${o.hits ?? 0})` : ''}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
              {Array.isArray(latestRun.config_snapshot) && latestRun.config_snapshot.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Data sources / screening processes used in this run</p>
                  <div className="flex flex-wrap gap-1.5">
                    {latestRun.config_snapshot.map((c: any, i: number) => (
                      <Badge key={i} variant="outline" className="text-xs font-mono">
                        {(c.key ?? c.check_type ?? 'config')}
                        {c.check_type ? ` · ${c.check_type}` : ''}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Main content */}
        {showEmpty ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <Brain className="h-8 w-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="font-medium text-foreground">No AI findings to review</p>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {!selectedAssessmentId
                    ? 'Select an assessment to review its AI-screened findings.'
                    : 'This assessment has no findings from AI check types (adverse media, sanctions, PEP, criminal history, or AI-tagged sources).'}
                </p>
                {/* The Screening Run Log's "Hits" count reflects every check
                    type that ran (credit history, regulator watchlist, etc.)
                    — this screen only reviews the checks above, so a hit can
                    be real and correctly excluded here at the same time.
                    Point at where it actually lives. */}
                {selectedAssessmentId && latestRun && (latestRun.total_hits ?? 0) > 0 && (
                  <p className="text-sm text-muted-foreground max-w-sm">
                    This run recorded {latestRun.total_hits} hit{latestRun.total_hits === 1 ? '' : 's'} in total — it's
                    from a check type this screen doesn't cover (e.g. credit history or regulator
                    watchlist). See it on the{' '}
                    <Link
                      to={selectedAssessment?.individual_id ? `/fpa/findings?individual_id=${selectedAssessment.individual_id}` : '/fpa/findings'}
                      className="text-primary underline"
                    >
                      Findings Console
                    </Link>.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ) : loadingFindings ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading AI findings…</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">AI Findings</h2>
              <Badge variant="secondary" className="text-xs tabular-nums">
                {totalFindings}
              </Badge>
            </div>

            {(findings ?? []).map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                inconsistency={findInconsistency(finding, declarationQuestionnaire ?? {})}
                onOverride={(f) => setOverrideFinding(f)}
                onViewIndividual={handleViewIndividual}
              />
            ))}
          </div>
        )}

        {/* AI Analysis Summary card */}
        {!showEmpty && !loadingFindings && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                AI Analysis Summary
              </CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{totalFindings}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">Total AI Findings</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{reviewedFindings}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">Reviewed</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-foreground">{overriddenFindings}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">Overridden</p>
                </div>
                <div className="text-center">
                  <p
                    className={`text-2xl font-bold tabular-nums ${
                      overrideRate > 50
                        ? 'text-red-600'
                        : overrideRate > 20
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }`}
                  >
                    {overrideRate}%
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">Override Rate</p>
                </div>
              </div>

              {/* Note */}
              <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 px-3 py-2.5 flex gap-2 text-xs text-blue-700">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-blue-500" />
                <span>
                  AI findings include check types:{' '}
                  <span className="font-medium">adverse_media</span>,{' '}
                  <span className="font-medium">sanctions</span>,{' '}
                  <span className="font-medium">pep</span>, or any source tagged with{' '}
                  <span className="font-medium">&ldquo;ai&rdquo;</span>. Human overrides are recorded with decision, reason, reviewer identity, and timestamp.
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Override Dialog */}
      {overrideFinding && (
        <OverrideDialog
          finding={overrideFinding}
          open={!!overrideFinding}
          onClose={() => setOverrideFinding(null)}
        />
      )}
    </DashboardLayout>
  );
}
