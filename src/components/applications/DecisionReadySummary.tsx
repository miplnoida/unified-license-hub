import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RiskBadge } from '@/components/prudential/RiskBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClipboardCheck, Info, Loader2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { DocumentList } from '@/components/documents/DocumentList';
import { SlaProgressPanel } from '@/components/workflows/SlaIndicator';
import {
  getWorkflowSlaStepConfig,
  resolveCurrentStepStartedAt,
  resolveSlaInputFromInstance,
  type WorkflowInstanceRow,
  type WorkflowSlaActionRecord,
  type WorkflowSlaStepConfig,
} from '@/lib/workflowSlaResolver';
import { APPLICATION_STATUS_LABELS } from '@/types/platform';
import { formatTaxonomyLabel } from '@/lib/formatTaxonomyLabel';

const RECOMMENDED_ACTION_LABEL: Record<string, string> = {
  approve: 'Approve',
  approve_with_conditions: 'Approve with Conditions',
  request_more_information: 'Request More Information',
  request_more_info: 'Request More Information',
  escalate: 'Escalate',
  reject: 'Reject',
  review_for_rejection: 'Review for Rejection',
  reject_review: 'Review for Rejection',
  continue_review: 'Continue Review',
  standard_review: 'Continue Review',
  senior_analyst: 'Escalate to Senior Analyst',
  enhanced_due_diligence: 'Enhanced Due Diligence',
};

const RECOMMENDED_ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  approve: 'default',
  approve_with_conditions: 'secondary',
  request_more_information: 'outline',
  escalate: 'destructive',
  reject: 'destructive',
};
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

interface TimelineEvent {
  id: string;
  action: string;
  status: string;
  comments: string | null;
  actor_id: string;
  created_at: string;
  actor_email?: string;
}

interface Application {
  id: string;
  application_number: string;
  applicant_id: string;
  license_type: string;
  status: string;
  workflow_id: string | null;
  current_step_id: string | null;
  data: Record<string, unknown>;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

interface Props {
  application: Application;
  events: TimelineEvent[];
  templateNames: Record<string, string>;
  paymentComplete: boolean;
  onJumpToFormsTab?: () => void;
}

const RFI_ACTIONS = new Set([
  'resubmission_requested',
  'info_requested',
  'query_raised',
  'returned_for_correction',
  'edit_requested',
]);
const RESPONSE_ACTIONS = new Set(['resubmitted', 'edit_allowed']);

function formatAge(fromIso?: string | null): string {
  if (!fromIso) return '—';
  const from = new Date(fromIso).getTime();
  if (!Number.isFinite(from)) return '—';
  const ms = Date.now() - from;
  if (ms < 0) return '—';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))}m`;
  if (hours < 24) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

export function DecisionReadySummary({
  application,
  events,
  templateNames,
  paymentComplete,
  onJumpToFormsTab,
}: Props) {
  const appData = (application.data || {}) as Record<string, any>;
  const formTemplateIds: string[] = appData.form_template_ids || [];
  const formsData: Record<string, Record<string, any>> = appData.forms_data || {};

  const [applicant, setApplicant] = useState<{ full_name?: string; email?: string } | null>(null);
  const [docCount, setDocCount] = useState<number | null>(null);
  const [instance, setInstance] = useState<WorkflowInstanceRow | null>(null);
  const [currentStep, setCurrentStep] = useState<WorkflowSlaStepConfig | null>(null);
  const [currentStepStartedAt, setCurrentStepStartedAt] = useState<string | null>(null);
  const [assessment, setAssessment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        { data: profile },
        { data: preUser },
        { data: legacyDocs },
        { data: secureDocs },
        { data: wi },
        { data: aiRow },
      ] = await Promise.all([
        supabase.from('profiles').select('full_name, email').eq('id', application.applicant_id).maybeSingle(),
        supabase.from('pre_license_users').select('full_name, email').eq('id', application.applicant_id).maybeSingle(),
        supabase
          .from('documents')
          .select('id')
          .eq('entity_type', 'application')
          .eq('entity_id', application.id),
        supabase
          .from('file_uploads')
          .select('id')
          .eq('entity_type', 'application')
          .eq('entity_id', application.id),
        supabase
          .from('workflow_instances')
          .select('*')
          .eq('entity_type', 'application')
          .eq('entity_id', application.id)
          .in('status', ['active', 'paused'])
          .order('updated_at', { ascending: false }),
        supabase
          .from('application_ai_assessments' as never)
          .select('*')
          .eq('application_id', application.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const instanceRows = ((wi as any[]) || []);
      const instanceRow = instanceRows.find(row => row.status === 'active') || instanceRows.find(row => row.status === 'paused') || null;
      let liveCurrentStep: WorkflowSlaStepConfig | null = null;
      let workflowSteps: WorkflowSlaStepConfig[] = [];
      let actionHistory: WorkflowSlaActionRecord[] = [];
      if (instanceRow?.current_step_id) {
        const [stepRes, stepsRes, actionsRes] = await Promise.all([
          supabase
            .from('approval_steps')
            .select('id, workflow_id, name, step_order, sla_hours, sla_warning_threshold_percent, escalation_after_hours, sla_pause_on_rfi')
            .eq('id', instanceRow.current_step_id)
            .maybeSingle(),
          instanceRow.workflow_id
            ? supabase
              .from('approval_steps')
              .select('id, workflow_id, name, step_order')
              .eq('workflow_id', instanceRow.workflow_id)
            : Promise.resolve({ data: [] as any[], error: null } as any),
          supabase
            .from('approval_actions')
            .select('workflow_instance_id, step_id, action_type, action, created_at')
            .eq('application_id', application.id),
        ]);
        const stepRow = (stepRes as any).data;
        if (!cancelled) liveCurrentStep = (stepRow as any) || null;
        workflowSteps = ((stepsRes as any).data as WorkflowSlaStepConfig[]) || [];
        actionHistory = ((actionsRes as any).data as WorkflowSlaActionRecord[]) || [];
      }
      if (cancelled) return;
      const resolvedStep = instanceRow ? getWorkflowSlaStepConfig(instanceRow, liveCurrentStep) : null;
      const firstStepStart = application.submitted_at || application.created_at;
      const resolvedStepStart = resolveCurrentStepStartedAt(resolvedStep, workflowSteps, actionHistory, firstStepStart);
      setApplicant((profile as any) || (preUser as any) || null);
      setDocCount(((legacyDocs as any[]) || []).length + ((secureDocs as any[]) || []).length);
      setInstance(instanceRow);
      setCurrentStep(liveCurrentStep || resolvedStep);
      setCurrentStepStartedAt(resolvedStepStart);
      setAssessment((aiRow as any) || null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [application.id, application.applicant_id, application.submitted_at, application.created_at, application.updated_at, application.workflow_id, application.current_step_id]);

  const applicantLabel =
    applicant?.full_name ||
    applicant?.email ||
    (appData.applicant_name as string) ||
    (appData.full_name as string) ||
    (appData.email as string) ||
    'Unknown applicant';
  const applicantEmail = applicant?.email || (appData.email as string) || null;
  const entityName =
    (appData.company_name as string) ||
    (appData.entity_name as string) ||
    (appData.organization_name as string) ||
    null;

  const taxonomyLabel = formatTaxonomyLabel(
    [appData.sector_name, appData.sub_sector_name, appData.category_name, appData.service_name]
      .filter(Boolean)
      .join(' - '),
  );

  const currentStepName: string | null = useMemo(() => {
    if (currentStep?.name) return currentStep.name;
    const snap: any = instance?.version_snapshot;
    const steps = Array.isArray(snap?.steps) ? snap.steps : [];
    const key = instance?.current_step_key || instance?.current_step_id;
    if (!key) return null;
    const found = steps.find((s: any) => s.local_id === key || s.id === key);
    return found?.name || found?.label || null;
  }, [instance, currentStep]);

  const slaInput = instance ? resolveSlaInputFromInstance(instance, {
    currentStep,
    currentStepStartedAt,
    firstStepStartedAt: application.submitted_at || application.created_at,
  }) : null;




  const findings = Array.isArray(assessment?.findings) ? assessment.findings : [];
  const risks = Array.isArray(assessment?.risks) ? assessment.risks : [];
  const missing = Array.isArray(assessment?.missing_information) ? assessment.missing_information : [];
  const highCriticalCount = findings.filter((f: any) =>
    ['high', 'critical'].includes(String(f?.severity || '').toLowerCase()),
  ).length;
  const ruleSnapshot = (assessment?.rule_check_snapshot as any) || {};
  const missingDocsFlag = ruleSnapshot?.has_required_documents === false;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardCheck className="h-4 w-4 text-primary" />
            Decision-Ready Summary
          </CardTitle>
          <Badge variant="outline" className="text-xs">Read-only · Internal</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Consolidated view</AlertTitle>
          <AlertDescription>
            All information below is read-only. Final actions must be taken from the Workflow panel.
          </AlertDescription>
        </Alert>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading case snapshot…
          </div>
        ) : (
          <>
            <DecisionReportBlock
              assessment={assessment}
              applicationId={application.id}
              onChange={setAssessment}
            />

            {/* Case Snapshot moved to the Details tab to avoid duplicated data. */}


            {/* SLA & Status */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">SLA &amp; Status</div>
                <div className="text-xs text-muted-foreground">
                  Total age: {formatAge(application.submitted_at || application.created_at)}
                </div>
              </div>
              {slaInput ? (
                <>
                  <SlaProgressPanel input={slaInput} title="Current step SLA" />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No active workflow instance for SLA tracking.</p>
              )}
            </section>

            {/* AI / Risk Flags */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">AI / Risk Flags</div>
              <p className="text-[11px] text-muted-foreground">
                AI-assisted and advisory only. Final decision must be taken through the Workflow panel.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={paymentComplete ? 'default' : 'destructive'}>
                  Payment {paymentComplete ? 'complete' : 'pending'}
                </Badge>
                <Badge variant="outline">Forms: {formTemplateIds.length}</Badge>
                <Badge variant="outline">Documents: {docCount ?? '—'}</Badge>
                {missingDocsFlag && <Badge variant="destructive">Missing required documents</Badge>}
                {missing.length > 0 && <Badge variant="destructive">Missing info: {missing.length}</Badge>}
              </div>
              {assessment ? (
                assessment.status === 'completed' ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge>Status: {assessment.status}</Badge>
                      {assessment.routing_recommendation?.recommended_route && (
                        <Badge variant="outline">
                          Route: {assessment.routing_recommendation.recommended_route}
                        </Badge>
                      )}
                      {typeof assessment.confidence_score === 'number' && (
                        <Badge variant="secondary">
                          Confidence: {(assessment.confidence_score * 100).toFixed(0)}%
                        </Badge>
                      )}
                      <Badge variant={highCriticalCount > 0 ? 'destructive' : 'outline'}>
                        High/Critical findings: {highCriticalCount}
                      </Badge>
                      <Badge variant="outline">Risks: {risks.length}</Badge>
                    </div>
                    {assessment.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-3">{assessment.summary}</p>
                    )}
                    {(findings.length > 0 || risks.length > 0) && (
                      <Accordion type="single" collapsible>
                        <AccordionItem value="top">
                          <AccordionTrigger className="text-sm py-2">Top findings &amp; risks</AccordionTrigger>
                          <AccordionContent className="space-y-2">
                            {findings.slice(0, 3).map((f: any, i: number) => (
                              <div key={`f-${i}`} className="rounded border p-2 text-xs">
                                <div className="flex gap-2 items-center">
                                  <Badge variant="outline">{f.severity || 'finding'}</Badge>
                                  <span className="font-medium">{f.title || f.category || 'Finding'}</span>
                                </div>
                                {f.description && (
                                  <p className="text-muted-foreground mt-1">{f.description}</p>
                                )}
                              </div>
                            ))}
                            {risks.slice(0, 3).map((r: any, i: number) => (
                              <div key={`r-${i}`} className="rounded border p-2 text-xs">
                                <div className="flex gap-2 items-center">
                                  <Badge variant="outline">{r.level || 'risk'}</Badge>
                                  <span className="font-medium">{r.risk_type || 'Risk'}</span>
                                </div>
                                {r.reason && <p className="text-muted-foreground mt-1">{r.reason}</p>}
                              </div>
                            ))}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                    {assessment.generated_at && (
                      <p className="text-[11px] text-muted-foreground">
                        Generated: {new Date(assessment.generated_at).toLocaleString()}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    AI assessment status: {assessment.status}
                  </p>
                )
              ) : (
                <p className="text-sm text-muted-foreground">
                  No AI assessment generated yet. See the AI Analyst Assessment panel above.
                </p>
              )}
            </section>

            {/* Documents */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Documents</div>
                <Badge variant="outline">{docCount ?? 0} files</Badge>
              </div>
              <Accordion type="single" collapsible>
                <AccordionItem value="docs">
                  <AccordionTrigger className="text-sm py-2">View documents</AccordionTrigger>
                  <AccordionContent>
                    <DocumentList entityType="application" entityId={application.id} />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </section>




            <Separator />
            <p className="text-[11px] text-muted-foreground">
              This summary is read-only decision support. All approvals, rejections, escalations, and forwards remain in the Workflow panel below.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right truncate">{value}</span>
    </div>
  );
}

function DecisionReportBlock({
  assessment,
}: {
  assessment: any;
  applicationId: string;
  onChange: (next: any) => void;
}) {
  if (!assessment) {
    return (
      <section className="rounded-md border p-3 space-y-1 bg-muted/30">
        <div className="text-sm font-semibold">Decision-Ready Report</div>
        <p className="text-sm text-muted-foreground">
          No AI assessment generated yet. Use the AI Analyst Assessment panel above to generate one.
        </p>
      </section>
    );
  }

  const report = (assessment.decision_report || {}) as Record<string, any>;
  const sections: any[] = Array.isArray(assessment.sections) ? assessment.sections : [];
  const routing = (assessment.routing_recommendation || {}) as Record<string, any>;
  const recommendedRaw =
    report.recommended_action ||
    routing.recommended_action ||
    routing.recommended_route ||
    '';
  const recommended = String(recommendedRaw).toLowerCase();
  const hasRecommendation = Boolean(recommended && RECOMMENDED_ACTION_LABEL[recommended]);
  const recommendedLabel = hasRecommendation ? RECOMMENDED_ACTION_LABEL[recommended] : '';

  const confidence = typeof assessment.confidence_score === 'number' ? assessment.confidence_score : null;
  const topRisks: string[] = Array.isArray(report.top_risks) ? report.top_risks : [];
  const compliance: string[] = Array.isArray(report.compliance_concerns) ? report.compliance_concerns : [];
  const missing: string[] = Array.isArray(assessment.missing_information) ? assessment.missing_information : [];
  const conditions: string[] = Array.isArray(report.suggested_conditions) ? report.suggested_conditions : [];
  const questions: string[] = Array.isArray(report.suggested_questions) ? report.suggested_questions : [];

  const hasReport = hasRecommendation || report.executive_summary || sections.length > 0;

  return (
    <section className="rounded-md border border-primary/40 p-3 space-y-3 bg-primary/5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Decision-Ready Report
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {confidence !== null && (
            <Badge variant="secondary">Confidence: {(confidence * 100).toFixed(0)}%</Badge>
          )}
          {assessment.prompt_version && (
            <Badge variant="outline" className="text-[10px]">Prompt {assessment.prompt_version}</Badge>
          )}
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>AI advisory only</AlertTitle>
        <AlertDescription>
          The AI may suggest a next action below. This is advisory only. The final action must be taken from the Workflow panel.
        </AlertDescription>
      </Alert>

      {hasRecommendation ? (
        <div className="rounded-md border bg-background p-2.5 flex items-center gap-2 flex-wrap">
          <Badge variant={RECOMMENDED_ACTION_VARIANT[recommended] || 'outline'}>
            Suggested next action: {recommendedLabel}
          </Badge>
          <span className="text-xs text-muted-foreground">
            This is AI guidance only. Take the final action from the Workflow panel.
          </span>
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-background p-2.5">
          <p className="text-sm text-muted-foreground">
            No suggested next action is available. Regenerate the AI Analyst Assessment to get an updated recommendation.
          </p>
        </div>
      )}


      {!hasReport ? (
        <p className="text-sm text-muted-foreground">
          This assessment was generated before the decision-ready report was available. Regenerate from the AI Analyst panel to produce a section-wise report.
        </p>
      ) : (
        <>
          {report.executive_summary && (
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Executive summary</div>
              <p className="text-sm whitespace-pre-line">{report.executive_summary}</p>
            </div>
          )}

          {report.rationale && (
            <div>
              <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">Rationale</div>
              <p className="text-sm text-muted-foreground whitespace-pre-line">{report.rationale}</p>
            </div>
          )}

          {recommended === 'approve_with_conditions' && conditions.length > 0 && (
            <DetailList title="Suggested conditions" items={conditions} />
          )}
          {recommended === 'request_more_information' && questions.length > 0 && (
            <DetailList title="Suggested questions" items={questions} />
          )}
          {recommended === 'escalate' && report.escalation_reason && (
            <DetailParagraph title="Escalation reason" text={String(report.escalation_reason)} />
          )}
          {recommended === 'reject' && report.rejection_rationale && (
            <DetailParagraph title="Rejection rationale" text={String(report.rejection_rationale)} />
          )}

          {sections.length > 0 && (
            <Accordion type="single" collapsible>
              <AccordionItem value="sections">
                <AccordionTrigger className="text-sm py-2">
                  Section-wise findings ({sections.length})
                </AccordionTrigger>
                <AccordionContent className="space-y-2">
                  {sections.map((s, i) => {
                    const status = String(s.status || '').toLowerCase();
                    return (
                      <div key={`drs-sec-${i}`} className="rounded border p-2 text-xs space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={SECTION_STATUS_VARIANT[status] || 'outline'}>
                            {SECTION_STATUS_LABEL[status] || s.status || 'unknown'}
                          </Badge>
                          <span className="font-medium">{s.label || s.key}</span>
                          {s.risk_level && (
                            <RiskBadge level={s.risk_level} className="text-[10px]" />
                          )}
                        </div>
                        {Array.isArray(s.observations) && s.observations.length > 0 && (
                          <ul className="list-disc pl-4 text-muted-foreground space-y-0.5">
                            {s.observations.map((o: string, idx: number) => <li key={idx}>{o}</li>)}
                          </ul>
                        )}
                        {s.suggested_action && (
                          <div><span className="font-medium">Suggested action: </span>{s.suggested_action}</div>
                        )}
                      </div>
                    );
                  })}
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <div className="grid sm:grid-cols-3 gap-2">
            {topRisks.length > 0 && <DetailList title="Top risks" items={topRisks} dense />}
            {compliance.length > 0 && <DetailList title="Compliance concerns" items={compliance} dense />}
            {missing.length > 0 && <DetailList title="Missing information" items={missing} dense />}
          </div>

          {report.suggested_next_workflow_action && (
            <DetailParagraph
              title="Suggested next workflow action"
              text={String(report.suggested_next_workflow_action)}
            />
          )}
        </>
      )}
    </section>
  );
}


function DetailList({ title, items, dense }: { title: string; items: string[]; dense?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{title}</div>
      <ul className={`list-disc pl-5 ${dense ? 'text-xs' : 'text-sm'} text-muted-foreground space-y-0.5`}>
        {items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
    </div>
  );
}

function DetailParagraph({ title, text }: { title: string; text: string }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1">{title}</div>
      <p className="text-sm text-muted-foreground whitespace-pre-line">{text}</p>
    </div>
  );
}

export default DecisionReadySummary;
