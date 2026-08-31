import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Loader2, Sparkles, RefreshCw, AlertTriangle, Info, CircleDot,
  ThumbsUp, ThumbsDown, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  categoryLabel, confidenceLabel, riskLevelLabel, sectionStatusLabel,
  severityLabel, severityTone, toEvidenceFacts, type EvidenceFact,
} from '@/lib/licensing/aiAssessmentLabels';
import { formatDistanceToNow } from 'date-fns';
import { formatDateTime, humanizeTimestamps } from '@/lib/datetime';
import { actorLabel, useUserDisplayNames } from '@/hooks/useUserDisplayNames';
import { cleanTaxonomyText, isTaxonomyNamingNoise } from '@/lib/licensing/taxonomyNoise';

import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';
import { aiServiceLabel } from '@/lib/ai/aiServiceLabel';
import {
  AiReportEmptyState,

  AiReportMetaChip,
  AiReportNotice,
  AiReportSection,
  AiReportShell,
  AiReportSkeleton,
  AiReportSummary,
} from '@/components/ai/report/AiReportKit';

interface Props {
  applicationId: string;
  currentUserId?: string;
}

interface Finding {
  severity?: string;
  category?: string;
  title?: string;
  description?: string;
  evidence?: string[];
  analyst_action?: string;
}

interface Risk {
  risk_type?: string;
  level?: string;
  reason?: string;
  evidence?: string[];
}

interface Routing {
  recommended_route?: string;
  recommended_action?: string;
  reason?: string;
  confidence?: number;
}

interface Section {
  key?: string;
  label?: string;
  status?: string;
  risk_level?: string;
  observations?: string[];
  evidence?: string[];
  suggested_action?: string;
  links?: Array<{ type?: string; id?: string; label?: string }>;
}

interface BusinessDimension {
  key?: string;
  label?: string;
  rating?: string;
  assessment?: string;
  evidence?: string[];
  business_implication?: string;
}

interface BusinessAssessment {
  overall_rating?: string;
  overall_rationale?: string;
  dimensions?: BusinessDimension[];
  commercial_conditions?: string[];
  business_questions?: string[];
  public_interest_considerations?: string[];
}

interface IntegrityCheck {
  key?: string;
  label?: string;
  group?: string;
  status?: string;
  detail?: string;
  values?: Array<{ label?: string; value?: string }>;
}

interface IntegrityCommentaryIssue {
  check_key?: string;
  severity?: string;
  what_it_means?: string;
  evidence?: string[];
  suggested_verification?: string;
}

interface DataIntegrity {
  computed_at?: string;
  counts?: { pass?: number; warning?: number; fail?: number; not_applicable?: number };
  checks?: IntegrityCheck[];
  commentary?: {
    overall_confidence?: string;
    summary?: string;
    material_issues?: IntegrityCommentaryIssue[];
    decision_impact?: string;
  } | null;
}


interface Assessment {
  id: string;
  application_id?: string;
  status: string;
  summary: string | null;
  findings: Finding[];
  risks: Risk[];
  routing_recommendation: Routing | null;
  missing_information: string[];
  confidence_score: number | null;
  model_provider: string | null;
  model_name: string | null;
  prompt_version: string | null;
  generated_at: string | null;
  error_message: string | null;
  created_at: string;
  sections?: Section[];
  decision_report?: Record<string, unknown> | null;
  business_assessment?: BusinessAssessment | null;
  data_integrity?: DataIntegrity | null;
  analyst_decision?: string | null;
  analyst_decision_action?: string | null;
  analyst_justification?: string | null;
  analyst_decision_by?: string | null;
  analyst_decision_at?: string | null;
  proposed_routing_step_id?: string | null;
  proposed_routing_rationale?: string | null;
  routing_decision?: 'accepted' | 'overridden' | null;
  routing_decision_reason?: string | null;
  routing_decision_by?: string | null;
  routing_decision_at?: string | null;
}

const SECTION_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pass: 'secondary',
  concern: 'outline',
  missing_info: 'default',
  high_risk: 'destructive',
};

const ROUTE_LABELS: Record<string, string> = {
  standard_review: 'Continue current workflow',
  senior_analyst: 'Consider escalation to senior analyst',
  enhanced_due_diligence: 'Enhanced due diligence recommended',
  request_more_info: 'Consider requesting more information',
  reject_review: 'Review for possible rejection',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

const BUSINESS_RATING_LABEL: Record<string, string> = {
  favourable: 'Favourable',
  acceptable: 'Acceptable',
  needs_strengthening: 'Needs strengthening',
  adverse: 'Adverse',
  insufficient_data: 'Insufficient data',
};

const BUSINESS_RATING_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  favourable: 'secondary',
  acceptable: 'secondary',
  needs_strengthening: 'default',
  adverse: 'destructive',
  insufficient_data: 'outline',
};

const INTEGRITY_STATUS_LABEL: Record<string, string> = {
  pass: 'Verified',
  warning: 'Check',
  fail: 'Discrepancy',
  not_applicable: 'Not applicable',
};

const INTEGRITY_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pass: 'secondary',
  warning: 'default',
  fail: 'destructive',
  not_applicable: 'outline',
};

const INTEGRITY_GROUP_LABEL: Record<string, string> = {
  fees_payment: 'Fees and payment',
  cross_form_consistency: 'Cross-form consistency',
  arithmetic: 'Totals and percentages',
  date_logic: 'Date logic',
  completeness: 'Completeness',
  lifecycle: 'Case lifecycle',
};

const INTEGRITY_STATUS_ORDER = ['fail', 'warning', 'pass', 'not_applicable'];

/** Business point-of-view assessment — advisory commercial reading of the case. */
function BusinessAssessmentBlock({ business }: { business: BusinessAssessment }) {
  const dimensions = Array.isArray(business.dimensions) ? business.dimensions : [];
  const conditions = Array.isArray(business.commercial_conditions) ? business.commercial_conditions : [];
  const questions = Array.isArray(business.business_questions) ? business.business_questions : [];
  const publicInterest = Array.isArray(business.public_interest_considerations)
    ? business.public_interest_considerations
    : [];

  return (
    <AiReportSection label="Business assessment" sectionKey="key_observations" count={dimensions.length}>
      <div className="space-y-3">
        {(business.overall_rating || business.overall_rationale) && (
          <div className="space-y-1.5 rounded-md border bg-card/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={BUSINESS_RATING_VARIANT[String(business.overall_rating || '').toLowerCase()] || 'outline'}>
                {BUSINESS_RATING_LABEL[String(business.overall_rating || '').toLowerCase()] || 'Overall view'}
              </Badge>
              <span className="text-sm font-medium">Overall business view</span>
            </div>
            {business.overall_rationale && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {humanizeTimestamps(business.overall_rationale)}
              </p>
            )}
          </div>
        )}

        {dimensions.map((d, i) => {
          const rating = String(d.rating || '').toLowerCase();
          return (
            <div
              key={`bus-${i}`}
              className="space-y-1.5 rounded-md border bg-card/60 p-3 transition-colors hover:border-primary/30"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={BUSINESS_RATING_VARIANT[rating] || 'outline'}>
                  {BUSINESS_RATING_LABEL[rating] || 'Not rated'}
                </Badge>
                <span className="text-sm font-medium">{d.label || categoryLabel(d.key) || 'Business dimension'}</span>
              </div>
              {d.assessment && (
                <p className="text-sm leading-relaxed">{humanizeTimestamps(d.assessment)}</p>
              )}
              <EvidenceFacts evidence={d.evidence} />
              {d.business_implication && (
                <div className="rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-xs">
                  <span className="font-medium text-primary">Business implication: </span>
                  {humanizeTimestamps(d.business_implication)}
                </div>
              )}
            </div>
          );
        })}

        {conditions.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Suggested commercial conditions
            </div>
            <ul className="space-y-1">
              {conditions.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <CircleDot className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {questions.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Business questions to put to the applicant
            </div>
            <ul className="space-y-1">
              {questions.map((q, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <CircleDot className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {publicInterest.length > 0 && (
          <div className="space-y-1.5 rounded-md border border-dashed p-3">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Consumer and public interest considerations
            </div>
            <ul className="space-y-1">
              {publicInterest.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  <CircleDot className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AiReportSection>
  );
}

/** Deterministic data-integrity checks plus the AI's reading of their impact. */
function DataIntegrityBlock({ integrity }: { integrity: DataIntegrity }) {
  const checks = Array.isArray(integrity.checks) ? integrity.checks : [];
  const commentary = integrity.commentary || null;
  const issues = (Array.isArray(commentary?.material_issues) ? commentary!.material_issues! : []).filter(
    (x) => !isTaxonomyNamingNoise([x.what_it_means, x.suggested_verification, ...(x.evidence || [])]),
  );
  const counts = integrity.counts || {};
  const sorted = [...checks].sort(
    (a, b) =>
      INTEGRITY_STATUS_ORDER.indexOf(String(a.status || '')) -
      INTEGRITY_STATUS_ORDER.indexOf(String(b.status || '')),
  );

  return (
    <AiReportSection label="Data integrity checks" sectionKey="issues" count={checks.length}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {typeof counts.fail === 'number' && counts.fail > 0 && (
            <Badge variant="destructive">{counts.fail} discrepancy{counts.fail === 1 ? '' : 'ies'}</Badge>
          )}
          {typeof counts.warning === 'number' && counts.warning > 0 && (
            <Badge>{counts.warning} to check</Badge>
          )}
          {typeof counts.pass === 'number' && counts.pass > 0 && (
            <Badge variant="secondary">{counts.pass} verified</Badge>
          )}
          {commentary?.overall_confidence && (
            <Badge variant="outline">Data confidence: {commentary.overall_confidence}</Badge>
          )}
        </div>

        {commentary?.summary && (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {cleanTaxonomyText(humanizeTimestamps(commentary.summary))}
          </p>
        )}

        {sorted.length > 0 && (
          <div className="space-y-2">
            {sorted.map((c, i) => {
              const status = String(c.status || '').toLowerCase();
              const related = issues.find((x) => x.check_key && x.check_key === c.key);
              return (
                <div key={`chk-${i}`} className="space-y-1.5 rounded-md border bg-card/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={INTEGRITY_STATUS_VARIANT[status] || 'outline'}>
                      {INTEGRITY_STATUS_LABEL[status] || 'Checked'}
                    </Badge>
                    <span className="text-sm font-medium">{c.label || categoryLabel(c.key) || 'Check'}</span>
                    {c.group && (
                      <Badge variant="outline" className="text-xs">
                        {INTEGRITY_GROUP_LABEL[c.group] || categoryLabel(c.group)}
                      </Badge>
                    )}
                  </div>
                  {c.detail && <p className="text-sm leading-relaxed">{c.detail}</p>}
                  {Array.isArray(c.values) && c.values.length > 0 && (
                    <ul className="space-y-1 rounded-md bg-muted/40 p-2">
                      {c.values.map((v, idx) => (
                        <li key={idx} className="text-xs leading-relaxed">
                          <span className="font-medium">{v.label}: </span>
                          <span className="font-mono">{v.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {related && (
                    <div className="space-y-1 rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-xs">
                      {related.what_it_means && (
                        <div>
                          <span className="font-medium text-primary">What this means: </span>
                          {humanizeTimestamps(related.what_it_means)}
                        </div>
                      )}
                      {related.suggested_verification && (
                        <div>
                          <span className="font-medium text-primary">Suggested verification: </span>
                          {related.suggested_verification}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {commentary?.decision_impact && (
          <div className="rounded-md border border-dashed p-3 text-sm leading-relaxed">
            <span className="font-medium">Impact on the decision: </span>
            {cleanTaxonomyText(humanizeTimestamps(commentary.decision_impact))}
          </div>
        )}
      </div>
    </AiReportSection>
  );
}


function groupBySeverity(items: Finding[]) {
  const grouped: Record<string, Finding[]> = { critical: [], high: [], medium: [], low: [], other: [] };
  items.forEach((f) => {
    const sev = (f.severity || '').toLowerCase();
    if (grouped[sev]) grouped[sev].push(f);
    else grouped.other.push(f);
  });
  return grouped;
}

/**
 * Evidence shown as labelled business facts; the raw data paths stay available
 * behind a "Technical details" toggle for anyone who needs them.
 */
function EvidenceFacts({ evidence }: { evidence: unknown }) {
  const [showRaw, setShowRaw] = useState(false);
  const facts: EvidenceFact[] = toEvidenceFacts(evidence);
  if (!facts.length) return null;
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium">What this is based on</div>
      <ul className="list-disc pl-5 text-xs text-muted-foreground space-y-0.5">
        {facts.map((fact, i) => (
          <li key={i}>
            {fact.label}
            {fact.value ? <>: <span className="font-medium text-foreground">{fact.value}</span></> : null}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="text-xs underline text-muted-foreground"
        onClick={() => setShowRaw((v) => !v)}
      >
        {showRaw ? 'Hide technical details' : 'Technical details'}
      </button>
      {showRaw && (
        <ul className="list-disc pl-5 text-xs font-mono text-muted-foreground break-all space-y-0.5">
          {facts.map((fact, i) => <li key={`raw-${i}`}>{fact.raw}</li>)}
        </ul>
      )}
    </div>
  );
}

const STALE_PENDING_MS = 10 * 60 * 1000;

export function ApplicationAiAssessmentPanel({ applicationId, currentUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
    // Flip abandoned `pending` rows (generation died mid-flight) to `failed`
    // so the panel never spins forever without a recovery path.
    try {
      await supabase.rpc('reconcile_stale_ai_assessments' as never, {
        _application_id: applicationId,
      } as never);
    } catch {
      // non-fatal: read-only fallback below still renders the stale state
    }
    const { data, error } = await supabase
      .from('application_ai_assessments' as never)
      .select('*')
      .eq('application_id', applicationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error) {
      setAssessment((data as unknown as Assessment) || null);
    }
    setLoading(false);
  }, [applicationId]);

  useEffect(() => {
    void fetchLatest();
  }, [fetchLatest]);

  const isStalePending =
    assessment?.status === 'pending' &&
    Date.now() - new Date(assessment.created_at).getTime() > STALE_PENDING_MS;

  // Poll while pending to surface completion without manual refresh.
  // Bounded: once the row is considered stale, polling stops.
  useEffect(() => {
    if (assessment?.status !== 'pending' || isStalePending) return;
    const t = setInterval(() => {
      void fetchLatest();
    }, 5000);
    return () => clearInterval(t);
  }, [assessment?.status, isStalePending, fetchLatest]);


  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('generate-application-ai-assessment', {
        body: { application_id: applicationId },
      });
      if (error) throw error;
      toast.success('AI assessment generation started');
      await fetchLatest();
    } catch (e) {
      toast.error('Failed to start AI assessment', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setGenerating(false);
    }
  };

  const shellActions = (
    <div className="flex items-center gap-2">
      {assessment && (
        <Button data-rbac="application_management.edit" size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-1">Regenerate</span>
        </Button>
      )}
    </div>
  );

  const shellMeta = assessment?.status === 'completed' ? (
    <>
      {assessment.generated_at && (
        <AiReportMetaChip>Prepared {formatDateTime(assessment.generated_at)}</AiReportMetaChip>
      )}
      {typeof assessment.confidence_score === 'number' && (
        <AiReportMetaChip>{confidenceLabel(assessment.confidence_score)} overall</AiReportMetaChip>
      )}
    </>
  ) : null;

  return (
    <AiReportShell
      title="AI Analyst Assessment"
      description="Interprets the information already recorded on this application. Analysts still take every decision through the Workflow panel."
      actions={shellActions}
      meta={shellMeta}
    >
      {loading ? (
        <AiReportSkeleton message="Loading AI assessment…" />
      ) : !assessment ? (
        <div className="space-y-3">
          <AiReportEmptyState message="No AI assessment has been prepared for this application yet." />
          <div className="flex justify-center">
            <Button data-rbac="application_management.edit" size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate assessment
            </Button>
          </div>
        </div>
      ) : assessment.status === 'pending' && !isStalePending ? (
        <AiReportSkeleton message="AI assessment is being prepared…" />
      ) : assessment.status === 'pending' ? (
        <div className="space-y-3">
          <AiReportNotice tone="warning">
            <span className="font-medium">Generation did not complete.</span>{' '}
            This assessment was started on {formatDateTime(assessment.created_at)} and never finished. You can retry
            the generation.
          </AiReportNotice>
          <Button data-rbac="application_management.edit" size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry generation
          </Button>
        </div>
      ) : assessment.status === 'failed' ? (
        <div className="space-y-3">
          <AiReportNotice tone="warning">
            <span className="font-medium">AI assessment failed.</span>{' '}
            {assessment.error_message || 'The AI provider could not produce a valid response.'}
          </AiReportNotice>
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Retry generation
          </Button>
        </div>
      ) : (
        <CompletedView
          assessment={assessment}
          applicationId={applicationId}
          currentUserId={currentUserId}
          onDecisionSaved={fetchLatest}
        />
      )}
    </AiReportShell>
  );
}

function CompletedView({
  assessment,
  applicationId,
  currentUserId,
  onDecisionSaved,
}: {
  assessment: Assessment;
  applicationId: string;
  currentUserId?: string;
  onDecisionSaved: () => void | Promise<void>;
}) {
  const findings = (Array.isArray(assessment.findings) ? assessment.findings : []).filter(
    (f) => !isTaxonomyNamingNoise([f.title, f.description, ...(f.evidence || [])]),
  );
  const risks = (Array.isArray(assessment.risks) ? assessment.risks : []).filter(
    (r) => !isTaxonomyNamingNoise([r.reason, ...(r.evidence || [])]),
  );
  const missing = (Array.isArray(assessment.missing_information) ? assessment.missing_information : [])
    .filter((m) => !isTaxonomyNamingNoise([m]));
  const routing = assessment.routing_recommendation || {};
  const sections: Section[] = Array.isArray(assessment.sections) ? assessment.sections : [];
  const groupedFindings = groupBySeverity(findings);

  return (
    <div className="space-y-5">
      <AiReportNotice>
        These results are suggestions. Analysts must still take all decisions through the Workflow panel.
      </AiReportNotice>

      <AnalystDecisionBar
        assessment={assessment}
        applicationId={applicationId}
        currentUserId={currentUserId}
        onSaved={onDecisionSaved}
      />

      {assessment.summary && <AiReportSummary text={cleanTaxonomyText(assessment.summary)} />}

      {sections.length > 0 && (
        <AiReportSection label="Section-wise review" sectionKey="key_observations" count={sections.length}>
          <div className="space-y-2">
            {sections.map((s, i) => {
              const status = (s.status || '').toLowerCase();
              return (
                <div
                  key={`sec-${i}`}
                  className="space-y-1.5 rounded-md border bg-card/60 p-3 transition-colors hover:border-primary/30"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SECTION_STATUS_VARIANT[status] || 'outline'}>
                      {sectionStatusLabel(s.status)}
                    </Badge>
                    <span className="text-sm font-medium">{s.label || categoryLabel(s.key) || 'Section'}</span>
                    {s.risk_level && (
                      <Badge variant="outline" className="text-xs">{riskLevelLabel(s.risk_level)}</Badge>
                    )}
                  </div>
                  {Array.isArray(s.observations) && s.observations.length > 0 && (
                    <ul className="space-y-1">
                      {s.observations.map((o, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm leading-relaxed">
                          <CircleDot className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <EvidenceFacts evidence={s.evidence} />
                  {s.suggested_action && (
                    <div className="rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-xs">
                      <span className="font-medium text-primary">Suggested action: </span>{s.suggested_action}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </AiReportSection>
      )}

      <AiReportSection label="Routing recommendation" sectionKey="chronology">
        {routing.recommended_route ? (
          <div className="space-y-2 rounded-md border bg-card/60 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{ROUTE_LABELS[routing.recommended_route] || routing.recommended_route}</Badge>
              {routing.recommended_action && (
                <Badge variant="outline">Suggested next step: {categoryLabel(routing.recommended_action)}</Badge>
              )}
              {typeof routing.confidence === 'number' && (
                <Badge variant="secondary">{confidenceLabel(routing.confidence)}</Badge>
              )}
            </div>
            {routing.reason && <p className="text-sm leading-relaxed text-muted-foreground">{routing.reason}</p>}
            <AIRoutingDecisionActions
              assessment={assessment}
              currentUserId={currentUserId}
              onSaved={onDecisionSaved}
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No routing recommendation provided.</p>
        )}
      </AiReportSection>

      {assessment.business_assessment &&
        (assessment.business_assessment.overall_rationale ||
          (assessment.business_assessment.dimensions?.length ?? 0) > 0) && (
          <BusinessAssessmentBlock business={assessment.business_assessment} />
        )}

      {assessment.data_integrity && (assessment.data_integrity.checks?.length ?? 0) > 0 && (
        <DataIntegrityBlock integrity={assessment.data_integrity} />
      )}

      <AiReportSection label="Findings" sectionKey="issues" count={findings.length}>

        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings.</p>
        ) : (
          <div className="space-y-3">
            {SEVERITY_ORDER.map((sev) =>
              groupedFindings[sev]?.length ? (
                <div key={sev} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {severityLabel(sev)}
                  </div>
                  <div className="space-y-2">
                    {groupedFindings[sev].map((f, idx) => (
                      <div key={idx} className="space-y-1.5 rounded-md border bg-card/60 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={severityTone(sev)}>{severityLabel(sev)}</Badge>
                          {f.category && <Badge variant="outline">{categoryLabel(f.category)}</Badge>}
                          {f.title && <span className="text-sm font-medium">{f.title}</span>}
                        </div>
                        {f.description && (
                          <p className="text-sm leading-relaxed text-muted-foreground">{cleanTaxonomyText(humanizeTimestamps(f.description))}</p>
                        )}
                        <EvidenceFacts evidence={f.evidence} />
                        {f.analyst_action && (
                          <div className="rounded-md bg-primary/[0.06] px-2.5 py-1.5 text-xs">
                            <span className="font-medium text-primary">Suggested action: </span>
                            {humanizeTimestamps(f.analyst_action)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {groupedFindings.other?.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Other observations
                </div>
                <div className="space-y-2">
                  {groupedFindings.other.map((f, idx) => (
                    <div key={idx} className="rounded-md border bg-card/60 p-3 text-sm">
                      {f.title || f.description || 'Finding'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AiReportSection>

      <AiReportSection label="Identified risks" sectionKey="risks" count={risks.length}>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risks identified.</p>
        ) : (
          <div className="space-y-2">
            {risks.map((r, idx) => (
              <div key={idx} className="space-y-1.5 rounded-md border bg-card/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={severityTone(r.level)}>
                    {riskLevelLabel(r.level) || 'Not rated'}
                  </Badge>
                  {r.risk_type && <Badge variant="outline">{categoryLabel(r.risk_type)}</Badge>}
                </div>
                {r.reason && <p className="text-sm leading-relaxed text-muted-foreground">{humanizeTimestamps(r.reason)}</p>}
                <EvidenceFacts evidence={r.evidence} />
              </div>
            ))}
          </div>
        )}
      </AiReportSection>

      {missing.length > 0 && (
        <AiReportSection label="Missing information" sectionKey="gaps" count={missing.length}>
          <div className="grid gap-2 sm:grid-cols-2">
            {missing.map((m, idx) => (
              <div key={idx} className="rounded-md border border-dashed p-3 text-sm leading-relaxed">
                {m}
              </div>
            ))}
          </div>
        </AiReportSection>
      )}

      <AssessmentFooter assessment={assessment} />
    </div>
  );
}

/** Business summary line; provider/model/prompt build info stays collapsed. */
function AssessmentFooter({ assessment }: { assessment: Assessment }) {
  const [showTech, setShowTech] = useState(false);
  return (
    <div className="text-xs text-muted-foreground space-y-1">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {assessment.generated_at && <span>Prepared {formatDateTime(assessment.generated_at)}</span>}
        {typeof assessment.confidence_score === 'number' && (
          <span>{confidenceLabel(assessment.confidence_score)} overall</span>
        )}
        <button type="button" className="underline" onClick={() => setShowTech((v) => !v)}>
          {showTech ? 'Hide technical details' : 'Technical details'}
        </button>
      </div>
      {showTech && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono">
          {assessment.model_provider && <span>Provider: {aiServiceLabel(assessment.model_provider)}</span>}
          {assessment.model_name && <span>Model: {assessment.model_name}</span>}
          {assessment.prompt_version && <span>Prompt: {assessment.prompt_version}</span>}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Analyst Decision Bar — Accept / Override / Escalate                        */
/* -------------------------------------------------------------------------- */

const DECISION_LABEL: Record<string, string> = {
  accepted: 'Accepted AI recommendation',
  overridden: 'Overridden AI recommendation',
  escalated: 'Escalated for senior review',
};

const DECISION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  accepted: 'secondary',
  overridden: 'destructive',
  escalated: 'default',
};

function AnalystDecisionBar({
  assessment,
  applicationId,
  currentUserId,
  onSaved,
}: {
  assessment: Assessment;
  applicationId: string;
  currentUserId?: string;
  onSaved: () => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'accepted' | 'overridden' | 'escalated' | null>(null);
  const {
    data: decisionNames,
    isLoading: decisionNamesLoading,
    isError: decisionNamesError,
  } = useUserDisplayNames([assessment.analyst_decision_by]);
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);

  const existing = assessment.analyst_decision;

  const startMode = (m: 'accepted' | 'overridden' | 'escalated') => {
    setMode(m);
    setJustification('');
  };

  const cancel = () => {
    setMode(null);
    setJustification('');
  };

  const submit = async () => {
    if (!mode || !currentUserId) return;
    if ((mode === 'overridden' || mode === 'escalated') && justification.trim().length < 10) {
      toast.error('Please provide a justification of at least 10 characters');
      return;
    }
    setSaving(true);
    try {
      const routingAction =
        (assessment.routing_recommendation as any)?.recommended_action ?? null;
      const now = new Date().toISOString();

      const { error } = await supabase
        .from('application_ai_assessments' as never)
        .update({
          analyst_decision: mode,
          analyst_decision_action: routingAction,
          analyst_justification: justification.trim() || null,
          analyst_decision_by: currentUserId,
          analyst_decision_at: now,
        } as never)
        .eq('id', assessment.id);
      if (error) throw error;

      await supabase.from('audit_logs').insert({
        user_id: currentUserId,
        action: `application.ai_assessment_${mode}`,
        entity_type: 'applications',
        entity_id: applicationId,
        new_value: {
          assessment_id: assessment.id,
          decision: mode,
          justification: justification.trim() || null,
          ai_recommended_action: routingAction,
          ai_confidence: assessment.confidence_score,
          model: assessment.model_name,
        },
      });

      // Fire notification event on override (per plan). Non-blocking.
      if (mode === 'overridden' || mode === 'escalated') {
        supabase.functions
          .invoke('dispatch-notification-event', {
            body: {
              event_key: 'application.ai_overridden',
              entity_type: 'applications',
              entity_id: applicationId,
              payload: {
                assessment_id: assessment.id,
                decision: mode,
                justification: justification.trim(),
                ai_recommended_action: routingAction,
              },
            },
          })
          .catch(() => {
            /* best-effort */
          });
      }

      toast.success('Decision recorded');
      setMode(null);
      setJustification('');
      await onSaved();
    } catch (e: any) {
      toast.error(e.message || 'Failed to record decision');
    } finally {
      setSaving(false);
    }
  };

  if (existing) {
    return (
      <Alert className="border-primary/40">
        <CheckCircle2 className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          <Badge variant={DECISION_VARIANT[existing] || 'outline'}>
            {DECISION_LABEL[existing] || existing}
          </Badge>
          {assessment.analyst_decision_at && (
            <span className="text-xs font-normal text-muted-foreground">
              Recorded by{' '}
              {actorLabel(assessment.analyst_decision_by, decisionNames, {
                isLoading: decisionNamesLoading,
                isError: decisionNamesError,
              })}{' '}
              on {formatDateTime(assessment.analyst_decision_at)}
            </span>
          )}
        </AlertTitle>
        {assessment.analyst_justification && (
          <AlertDescription>
            <span className="font-medium">Justification: </span>
            {assessment.analyst_justification}
          </AlertDescription>
        )}
        {currentUserId && (
          <div className="mt-2">
            <Button data-rbac="application_management.edit"
              size="sm"
              variant="ghost"
              onClick={() => {
                setMode(null);
                supabase
                  .from('application_ai_assessments' as never)
                  .update({
                    analyst_decision: null,
                    analyst_decision_action: null,
                    analyst_justification: null,
                    analyst_decision_by: null,
                    analyst_decision_at: null,
                  } as never)
                  .eq('id', assessment.id)
                  .then(() => onSaved());
              }}
            >
              Clear decision
            </Button>
          </div>
        )}
      </Alert>
    );
  }

  if (!currentUserId) return null;

  return (
    <div className="rounded-md border p-3 space-y-3 bg-muted/40">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Analyst decision on AI recommendation
        </div>
        {!mode && (
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" data-rbac="application_management.approve" onClick={() => startMode('accepted')}>
              <ThumbsUp className="h-4 w-4 mr-1" />
              Accept
            </Button>
            <Button size="sm" variant="destructive" data-rbac="application_management.reject" onClick={() => startMode('overridden')}>
              <ThumbsDown className="h-4 w-4 mr-1" />
              Override
            </Button>
            <Button size="sm" variant="outline" data-rbac="application_management.escalate" onClick={() => startMode('escalated')}>
              <ShieldAlert className="h-4 w-4 mr-1" />
              Escalate
            </Button>
          </div>
        )}
      </div>
      {mode && (
        <div className="space-y-2">
          <Label className="text-xs">
            Justification{' '}
            {(mode === 'overridden' || mode === 'escalated') && (
              <span className="text-destructive">*</span>
            )}
            <span className="text-muted-foreground ml-1">
              ({mode === 'accepted' ? 'optional' : 'required, min 10 characters'})
            </span>
          </Label>
          <Textarea
            rows={3}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            placeholder={
              mode === 'accepted'
                ? 'Optional note about accepting the AI recommendation'
                : 'Explain why the AI recommendation is being overridden or escalated'
            }
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
            <Button data-rbac="application_management.edit" size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save {DECISION_LABEL[mode]?.toLowerCase() || mode}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function AIRoutingDecisionActions({
  assessment,
  currentUserId,
  onSaved,
}: {
  assessment: Assessment;
  currentUserId?: string;
  onSaved: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const routing = assessment.routing_recommendation || {};
  const decision = assessment.routing_decision;

  async function persistDecision(next: 'accepted' | 'overridden', reason?: string) {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('application_ai_assessments' as never)
        .update({
          routing_decision: next,
          routing_decision_reason: reason ?? null,
          routing_decision_by: currentUserId ?? null,
          routing_decision_at: new Date().toISOString(),
        } as never)
        .eq('id', assessment.id);
      if (error) throw error;
      toast.success(next === 'accepted' ? 'AI routing accepted' : 'AI routing overridden');
      await onSaved();
    } catch (e: any) {
      toast.error('Could not save routing decision', { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  if (decision) {
    return (
      <div className="flex items-center gap-2 text-xs pt-1 border-t">
        <Badge variant={decision === 'accepted' ? 'secondary' : 'destructive'}>
          {decision === 'accepted' ? 'Analyst accepted' : 'Analyst overrode'}
        </Badge>
        {assessment.routing_decision_at && (
          <span className="text-muted-foreground">
            {formatDistanceToNow(new Date(assessment.routing_decision_at), { addSuffix: true })}
          </span>
        )}
        {assessment.routing_decision_reason && (
          <span className="text-muted-foreground italic">— {assessment.routing_decision_reason}</span>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2 pt-1 border-t">
        <Button size="sm" variant="secondary" data-rbac="application_management.approve" disabled={saving} onClick={() => persistDecision('accepted')}>
          <ThumbsUp className="h-3.5 w-3.5 mr-1" /> Accept AI routing
        </Button>
        <Button size="sm" variant="outline" data-rbac="application_management.edit" disabled={saving} onClick={() => setOverrideOpen(true)}>
          <ThumbsDown className="h-3.5 w-3.5 mr-1" /> Override with reason
        </Button>
      </div>
      <OverrideReasonDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        module="ai_assessments"
        entityType="application_ai_assessment"
        entityId={assessment.id}
        ruleKey="ai.routing_recommendation"
        title="Override AI routing recommendation"
        originalValue={routing}
        overriddenValue={{ recommended_route: 'analyst_directed' }}
        metadata={{
          application_id: assessment.application_id,
          screen: 'ApplicationAiAssessmentPanel',
        }}
        onOverridden={async (_id) => {
          await persistDecision('overridden', 'See rule_overrides for full justification');
        }}
      />
    </>
  );
}

export default ApplicationAiAssessmentPanel;
