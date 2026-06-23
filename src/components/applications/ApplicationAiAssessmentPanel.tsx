import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  applicationId: string;
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

interface Assessment {
  id: string;
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
}

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

export function ApplicationAiAssessmentPanel({ applicationId }: Props) {
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
          <CompletedView assessment={assessment} />
        )}
      </CardContent>
    </Card>
  );
}

function CompletedView({ assessment }: { assessment: Assessment }) {
  const findings = Array.isArray(assessment.findings) ? assessment.findings : [];
  const risks = Array.isArray(assessment.risks) ? assessment.risks : [];
  const missing = Array.isArray(assessment.missing_information) ? assessment.missing_information : [];
  const routing = assessment.routing_recommendation || {};
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

      {assessment.summary && (
        <section>
          <div className="text-sm font-semibold mb-1">Summary</div>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{assessment.summary}</p>
        </section>
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
                            {f.evidence.join('; ')}
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
                    {r.evidence.join('; ')}
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

export default ApplicationAiAssessmentPanel;
