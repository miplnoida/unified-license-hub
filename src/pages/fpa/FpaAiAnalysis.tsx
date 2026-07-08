import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
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
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
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

function confidenceBadge(score: number | null) {
  if (score === null || score === undefined) {
    return (
      <Badge variant="outline" className="text-slate-500 border-slate-300 bg-slate-50 text-xs font-mono">
        AI SCORED
      </Badge>
    );
  }
  if (score >= 0.8) {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 text-xs font-mono">
        HIGH CONF · {(score * 100).toFixed(0)}%
      </Badge>
    );
  }
  if (score >= 0.5) {
    return (
      <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 text-xs font-mono">
        MED CONF · {(score * 100).toFixed(0)}%
      </Badge>
    );
  }
  return (
    <Badge className="bg-red-100 text-red-700 border-red-200 hover:bg-red-100 text-xs font-mono">
      LOW CONF · {(score * 100).toFixed(0)}%
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
  };
  const cls = colors[(checkType ?? '').toLowerCase()] ?? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-100';
  return <Badge className={`text-xs ${cls}`}>{label}</Badge>;
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

      const updatedPayload = {
        ...existingPayload,
        human_override: {
          decision: form.decision,
          reason: form.reason.trim(),
          by: user?.email ?? user?.id ?? 'unknown',
          at: now,
        },
      };

      // Use the typed supabase client directly (no 'as any' cast)
      const { error, count } = await supabase
        .from('fp_findings')
        .update({
          resolution_status: form.decision,
          review_note: form.reason.trim(),
          reviewed_at: now,
          raw_payload: updatedPayload,
        })
        .eq('id', finding.id)
        .select('id', { count: 'exact', head: true });

      if (error) throw error;

      // If no rows were updated, the finding was not found (deleted or mismatched id)
      if (count !== null && count === 0) {
        throw new Error('Finding not found or already deleted.');
      }
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
          <Button
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
  onOverride: (finding: AiFinding) => void;
  onViewIndividual: (individualId: string) => void;
}

function FindingCard({ finding, onOverride, onViewIndividual }: FindingCardProps) {
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
                <Button
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
            {confidenceBadge(finding.confidence_score)}
          </div>

          {/* Summary */}
          {finding.summary && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {finding.summary}
            </p>
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
                </p>
              )}
              {finding.review_note && !humanOverride && (
                <p className="text-xs text-muted-foreground mt-0.5 italic">
                  {finding.review_note}
                </p>
              )}
            </div>
            <Button
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
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string | null>(null);
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

  // Auto-select first assessment when data loads (useEffect replaces removed onSuccess)
  useEffect(() => {
    if (assessments && assessments.length > 0 && !selectedAssessmentId) {
      setSelectedAssessmentId(assessments[0].id);
    }
  }, [assessments, selectedAssessmentId]);

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
          'source.ilike.%ai%,check_type.in.(adverse_media,sanctions,pep)'
        )
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AiFinding[];
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
          description="AI-generated adverse media analysis with human override — FPA-009"
        />

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
                    : 'This assessment has no findings from AI check types (adverse media, sanctions, PEP, or AI-tagged sources).'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : loadingFindings ? (
          <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading AI findings…</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* LEFT — AI Findings */}
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
                  onOverride={(f) => setOverrideFinding(f)}
                  onViewIndividual={handleViewIndividual}
                />
              ))}
            </div>

            {/* RIGHT — Summary panel */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold text-foreground">Decision Summary</h2>
              </div>

              {/* Per-finding decision overview */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Finding Decisions</CardTitle>
                </CardHeader>
                <Separator />
                <CardContent className="pt-4 space-y-3">
                  {(findings ?? []).map((finding) => {
                    const humanOverride =
                      finding.raw_payload &&
                      typeof finding.raw_payload === 'object' &&
                      finding.raw_payload.human_override
                        ? finding.raw_payload.human_override
                        : null;

                    return (
                      <div key={finding.id} className="flex items-start justify-between gap-3 py-2 border-b last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate leading-snug">
                            {finding.title ?? 'Untitled'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {checkTypeBadge(finding.check_type)}
                            {humanOverride && (
                              <Badge className="bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-50 text-xs gap-1">
                                <UserCheck className="h-3 w-3" />
                                Override
                              </Badge>
                            )}
                          </div>
                          {humanOverride && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">
                              {humanOverride.reason}
                            </p>
                          )}
                          {finding.individual_id && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-5 px-1 text-xs gap-1 text-muted-foreground hover:text-foreground mt-1"
                              onClick={() => handleViewIndividual(finding.individual_id!)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View Individual
                            </Button>
                          )}
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          {resolutionBadge(finding.resolution_status)}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs gap-1"
                            onClick={() => setOverrideFinding(finding)}
                          >
                            <Pencil className="h-3 w-3" />
                            Override
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
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
