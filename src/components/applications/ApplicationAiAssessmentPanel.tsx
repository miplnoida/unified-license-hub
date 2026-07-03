import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Loader2, Sparkles, RefreshCw, AlertTriangle, Info,
  ThumbsUp, ThumbsDown, ShieldAlert, CheckCircle2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { formatEvidenceList } from '@/lib/evidenceLabel';
import { formatDistanceToNow } from 'date-fns';
import { OverrideReasonDialog } from '@/components/audit/OverrideReasonDialog';

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
const SECTION_STATUS_LABEL: Record<string, string> = {
  pass: 'Pass',
  concern: 'Concern',
  missing_info: 'Missing Info',
  high_risk: 'High Risk',
};

const ROUTE_LABELS: Record<string, string> = {
  standard_review: 'Continue current workflow',
  senior_analyst: 'Consider escalation to senior analyst',
  enhanced_due_diligence: 'Enhanced due diligence recommended',
  request_more_info: 'Consider requesting more information',
  reject_review: 'Review for possible rejection',
};

const SEVERITY_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  low: 'secondary',
  medium: 'outline',
  high: 'default',
  critical: 'destructive',
};

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low'];

function groupBySeverity(items: Finding[]) {
  const grouped: Record<string, Finding[]> = { critical: [], high: [], medium: [], low: [], other: [] };
  items.forEach((f) => {
    const sev = (f.severity || '').toLowerCase();
    if (grouped[sev]) grouped[sev].push(f);
    else grouped.other.push(f);
  });
  return grouped;
}

export function ApplicationAiAssessmentPanel({ applicationId, currentUserId }: Props) {
  const [loading, setLoading] = useState(true);
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [generating, setGenerating] = useState(false);

  const fetchLatest = useCallback(async () => {
    setLoading(true);
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

  // Poll while pending to surface completion without manual refresh.
  useEffect(() => {
    if (assessment?.status !== 'pending') return;
    const t = setInterval(() => {
      void fetchLatest();
    }, 5000);
    return () => clearInterval(t);
  }, [assessment?.status, fetchLatest]);

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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            AI Analyst Assessment
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">Advisory only</Badge>
            {assessment && assessment.status !== 'pending' && (
              <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-1">Regenerate</span>
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading AI assessment…
          </div>
        ) : !assessment ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              AI assessment has not been generated yet.
            </p>
            <Button size="sm" onClick={handleGenerate} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate assessment
            </Button>
          </div>
        ) : assessment.status === 'pending' ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> AI assessment is being generated…
          </div>
        ) : assessment.status === 'failed' ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>AI assessment failed</AlertTitle>
              <AlertDescription>
                {assessment.error_message || 'The AI provider could not produce a valid response.'}
              </AlertDescription>
            </Alert>
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
      </CardContent>
    </Card>
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
  const findings = Array.isArray(assessment.findings) ? assessment.findings : [];
  const risks = Array.isArray(assessment.risks) ? assessment.risks : [];
  const missing = Array.isArray(assessment.missing_information) ? assessment.missing_information : [];
  const routing = assessment.routing_recommendation || {};
  const sections: Section[] = Array.isArray(assessment.sections) ? assessment.sections : [];
  const groupedFindings = groupBySeverity(findings);

  return (
    <div className="space-y-5">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>AI-assisted and advisory only</AlertTitle>
        <AlertDescription>
          These results are suggestions. Analysts must still take all decisions through the Workflow panel below.
        </AlertDescription>
      </Alert>

      <AnalystDecisionBar
        assessment={assessment}
        applicationId={applicationId}
        currentUserId={currentUserId}
        onSaved={onDecisionSaved}
      />

      {assessment.summary && (
        <section>
          <div className="text-sm font-semibold mb-1">Summary</div>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{assessment.summary}</p>
        </section>
      )}

      {sections.length > 0 && (
        <>
          <Separator />
          <section className="space-y-2">
            <div className="text-sm font-semibold">Section-wise review</div>
            <div className="space-y-2">
              {sections.map((s, i) => {
                const status = (s.status || '').toLowerCase();
                return (
                  <div key={`sec-${i}`} className="rounded-md border p-3 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={SECTION_STATUS_VARIANT[status] || 'outline'}>
                        {SECTION_STATUS_LABEL[status] || s.status || 'unknown'}
                      </Badge>
                      <span className="text-sm font-medium">{s.label || s.key || 'Section'}</span>
                      {s.risk_level && (
                        <Badge variant="outline" className="text-xs">Risk: {s.risk_level}</Badge>
                      )}
                    </div>
                    {Array.isArray(s.observations) && s.observations.length > 0 && (
                      <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-0.5">
                        {s.observations.map((o, idx) => <li key={idx}>{o}</li>)}
                      </ul>
                    )}
                    {Array.isArray(s.evidence) && s.evidence.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">Evidence: </span>{formatEvidenceList(s.evidence).join('; ')}
                      </div>
                    )}
                    {s.suggested_action && (
                      <div className="text-xs">
                        <span className="font-medium">Suggested action: </span>{s.suggested_action}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <Separator />



      <section>
        <div className="text-sm font-semibold mb-2">Routing recommendation</div>
        {routing.recommended_route ? (
          <div className="rounded-md border p-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge>{ROUTE_LABELS[routing.recommended_route] || routing.recommended_route}</Badge>
              {routing.recommended_action && (
                <Badge variant="outline">Action: {routing.recommended_action}</Badge>
              )}
              {typeof routing.confidence === 'number' && (
                <Badge variant="secondary">Confidence: {(routing.confidence * 100).toFixed(0)}%</Badge>
              )}
            </div>
            {routing.reason && <p className="text-sm text-muted-foreground">{routing.reason}</p>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No routing recommendation provided.</p>
        )}
      </section>

      <section>
        <div className="text-sm font-semibold mb-2">Findings ({findings.length})</div>
        {findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings.</p>
        ) : (
          <div className="space-y-3">
            {SEVERITY_ORDER.map((sev) =>
              groupedFindings[sev]?.length ? (
                <div key={sev}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{sev}</div>
                  <div className="space-y-2">
                    {groupedFindings[sev].map((f, idx) => (
                      <div key={idx} className="rounded-md border p-3 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={SEVERITY_VARIANT[sev] || 'outline'}>{sev}</Badge>
                          {f.category && <Badge variant="outline">{f.category}</Badge>}
                          {f.title && <span className="text-sm font-medium">{f.title}</span>}
                        </div>
                        {f.description && (
                          <p className="text-sm text-muted-foreground">{f.description}</p>
                        )}
                        {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Evidence: </span>
                            {formatEvidenceList(f.evidence).join('; ')}
                          </div>
                        )}
                        {f.analyst_action && (
                          <div className="text-xs">
                            <span className="font-medium">Suggested action: </span>
                            {f.analyst_action}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null,
            )}
            {groupedFindings.other?.length > 0 && (
              <div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">other</div>
                <div className="space-y-2">
                  {groupedFindings.other.map((f, idx) => (
                    <div key={idx} className="rounded-md border p-3 text-sm">
                      {f.title || f.description || 'Finding'}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="text-sm font-semibold mb-2">Identified risks ({risks.length})</div>
        {risks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No risks identified.</p>
        ) : (
          <div className="space-y-2">
            {risks.map((r, idx) => (
              <div key={idx} className="rounded-md border p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={SEVERITY_VARIANT[(r.level || '').toLowerCase()] || 'outline'}>
                    {r.level || 'unknown'}
                  </Badge>
                  {r.risk_type && <Badge variant="outline">{r.risk_type}</Badge>}
                </div>
                {r.reason && <p className="text-sm text-muted-foreground">{r.reason}</p>}
                {Array.isArray(r.evidence) && r.evidence.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">Evidence: </span>
                    {formatEvidenceList(r.evidence).join('; ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {missing.length > 0 && (
        <section>
          <div className="text-sm font-semibold mb-2">Missing information</div>
          <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
            {missing.map((m, idx) => (
              <li key={idx}>{m}</li>
            ))}
          </ul>
        </section>
      )}

      <Separator />

      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        {assessment.generated_at && (
          <span>Generated: {new Date(assessment.generated_at).toLocaleString()}</span>
        )}
        {assessment.model_provider && <span>Provider: {assessment.model_provider}</span>}
        {assessment.model_name && <span>Model: {assessment.model_name}</span>}
        {assessment.prompt_version && <span>Prompt: {assessment.prompt_version}</span>}
        {typeof assessment.confidence_score === 'number' && (
          <span>Overall confidence: {(assessment.confidence_score * 100).toFixed(0)}%</span>
        )}
      </div>
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

      await supabase.from('audit_logs' as any).insert({
        user_id: currentUserId,
        action: `application.ai_assessment_${mode}`,
        table_name: 'applications',
        record_id: applicationId,
        new_values: {
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
              {formatDistanceToNow(new Date(assessment.analyst_decision_at), {
                addSuffix: true,
              })}
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
            <Button
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
            <Button size="sm" variant="secondary" onClick={() => startMode('accepted')}>
              <ThumbsUp className="h-4 w-4 mr-1" />
              Accept
            </Button>
            <Button size="sm" variant="destructive" onClick={() => startMode('overridden')}>
              <ThumbsDown className="h-4 w-4 mr-1" />
              Override
            </Button>
            <Button size="sm" variant="outline" onClick={() => startMode('escalated')}>
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
            <Button size="sm" onClick={submit} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Save {DECISION_LABEL[mode]?.toLowerCase() || mode}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ApplicationAiAssessmentPanel;
