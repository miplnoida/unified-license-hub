import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ClipboardCheck, Info, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { DocumentList } from '@/components/documents/DocumentList';
import { SlaProgressPanel } from '@/components/workflows/SlaIndicator';
import OverrideJustificationDialog from '@/components/audit/OverrideJustificationDialog';
import { logAudit } from '@/hooks/useAuditLog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  approve_with_conditions: 'Approve with conditions',
  request_more_information: 'Request more information',
  escalate: 'Escalate',
  reject: 'Reject',
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

  // RFI pairing
  const rfiEntries = useMemo(() => {
    const sorted = [...events].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const out: Array<{
      request: TimelineEvent;
      response: TimelineEvent | null;
    }> = [];
    for (let i = 0; i < sorted.length; i++) {
      const ev = sorted[i];
      if (!RFI_ACTIONS.has(ev.action)) continue;
      const response = sorted.slice(i + 1).find((e) => RESPONSE_ACTIONS.has(e.action)) || null;
      out.push({ request: ev, response });
    }
    return out;
  }, [events]);

  const noteEntries = useMemo(
    () =>
      events.filter(
        (e) => e.comments && e.comments.trim().length > 0 && !RFI_ACTIONS.has(e.action) && !RESPONSE_ACTIONS.has(e.action),
      ),
    [events],
  );

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

            {/* Case Snapshot */}

            <section className="rounded-md border p-3 space-y-2">
              <div className="text-sm font-semibold">Case Snapshot</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <Field label="Application #" value={application.application_number} />
                <Field label="Status" value={APPLICATION_STATUS_LABELS[application.status as keyof typeof APPLICATION_STATUS_LABELS] || application.status} />
                <Field label="Applicant" value={applicantLabel} />
                <Field label="Email" value={applicantEmail || '—'} />
                {entityName && <Field label="Entity" value={entityName} />}
                <Field label="License type" value={application.license_type || '—'} />
                {taxonomyLabel && <Field label="Taxonomy" value={taxonomyLabel} />}
                <Field label="Current step" value={currentStepName || '—'} />
                <Field label="Submitted" value={application.submitted_at ? new Date(application.submitted_at).toLocaleString() : '—'} />
                <Field label="Created" value={new Date(application.created_at).toLocaleString()} />
              </div>
            </section>

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

            {/* RFIs & Responses */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">RFIs &amp; Responses</div>
                <Badge variant="outline">{rfiEntries.length}</Badge>
              </div>
              {rfiEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No information requests recorded.</p>
              ) : (
                <div className="space-y-2">
                  {rfiEntries.map(({ request, response }) => (
                    <div key={request.id} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex flex-wrap gap-2 items-center">
                        <Badge variant="outline">{request.action.replace(/_/g, ' ')}</Badge>
                        <Badge variant={response ? 'default' : 'destructive'}>
                          {response ? 'Responded' : 'Open'}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(request.created_at).toLocaleString()} · by {request.actor_email || 'Unknown'}
                        </span>
                      </div>
                      {request.comments && <p className="text-muted-foreground">{request.comments}</p>}
                      {response && (
                        <div className="mt-1 pt-1 border-t">
                          <div className="flex flex-wrap gap-2 items-center">
                            <Badge variant="secondary">{response.action.replace(/_/g, ' ')}</Badge>
                            <span className="text-muted-foreground">
                              {new Date(response.created_at).toLocaleString()} · by {response.actor_email || 'Unknown'}
                            </span>
                          </div>
                          {response.comments && (
                            <p className="text-muted-foreground mt-1">{response.comments}</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Notes & Remarks */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Notes &amp; Remarks</div>
                <Badge variant="outline">{noteEntries.length}</Badge>
              </div>
              {noteEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No legal notes recorded.</p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-auto">
                  {noteEntries.map((e) => (
                    <div key={e.id} className="rounded border p-2 text-xs space-y-1">
                      <div className="flex gap-2 items-center flex-wrap">
                        <Badge variant="outline">{e.action.replace(/_/g, ' ')}</Badge>
                        <span className="text-muted-foreground">
                          {new Date(e.created_at).toLocaleString()} · {e.actor_email || 'Unknown'}
                        </span>
                      </div>
                      <p className="text-muted-foreground whitespace-pre-line">{e.comments}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Submitted Responses */}
            <section className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Submitted Responses</div>
                {onJumpToFormsTab && (
                  <Button size="sm" variant="ghost" onClick={onJumpToFormsTab}>
                    View full responses
                  </Button>
                )}
              </div>
              {formTemplateIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">No forms submitted.</p>
              ) : (
                <ul className="text-sm space-y-1">
                  {formTemplateIds.map((tid) => {
                    const fields = formsData?.[tid] || {};
                    const filled = Object.values(fields).filter(
                      (v) => v !== null && v !== undefined && v !== '',
                    ).length;
                    const total = Object.keys(fields).length;
                    return (
                      <li key={tid} className="flex items-center justify-between gap-2">
                        <span className="truncate">{templateNames[tid] || tid}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {filled}/{total} fields
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
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
  applicationId,
  onChange,
}: {
  assessment: any;
  applicationId: string;
  onChange: (next: any) => void;
}) {
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideAction, setOverrideAction] = useState<string>('request_more_information');
  const [saving, setSaving] = useState(false);

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
  const recommended = String(report.recommended_action || '').toLowerCase();
  const recommendedLabel = RECOMMENDED_ACTION_LABEL[recommended] || (recommended ? recommended : '—');
  const confidence = typeof assessment.confidence_score === 'number' ? assessment.confidence_score : null;
  const topRisks: string[] = Array.isArray(report.top_risks) ? report.top_risks : [];
  const compliance: string[] = Array.isArray(report.compliance_concerns) ? report.compliance_concerns : [];
  const missing: string[] = Array.isArray(assessment.missing_information) ? assessment.missing_information : [];
  const conditions: string[] = Array.isArray(report.suggested_conditions) ? report.suggested_conditions : [];
  const questions: string[] = Array.isArray(report.suggested_questions) ? report.suggested_questions : [];

  const hasReport = recommended || report.executive_summary || sections.length > 0;

  async function saveDecision(payload: {
    analyst_decision: 'accepted' | 'overridden';
    analyst_decision_action: string;
    analyst_justification?: string;
  }) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const now = new Date().toISOString();
      const update: any = {
        analyst_decision: payload.analyst_decision,
        analyst_decision_action: payload.analyst_decision_action,
        analyst_justification: payload.analyst_justification ?? null,
        analyst_decision_by: user?.id ?? null,
        analyst_decision_at: now,
      };
      const { error } = await (supabase as any)
        .from('application_ai_assessments')
        .update(update)
        .eq('id', assessment.id);
      if (error) throw error;
      await logAudit({
        action: payload.analyst_decision === 'accepted' ? 'ai_recommendation_accepted' : 'ai_recommendation_overridden',
        entityType: 'application_ai_assessment',
        entityId: assessment.id,
        metadata: {
          application_id: applicationId,
          recommended_action: recommended,
          chosen_action: payload.analyst_decision_action,
          justification: payload.analyst_justification ?? null,
        },
      });
      onChange({ ...assessment, ...update });
      toast.success(
        payload.analyst_decision === 'accepted'
          ? 'AI recommendation accepted'
          : 'AI recommendation overridden',
      );
    } catch (e) {
      toast.error('Failed to save decision', {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-md border border-primary/40 p-3 space-y-3 bg-primary/5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm font-semibold flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Decision-Ready Report
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {recommended && (
            <Badge variant={RECOMMENDED_ACTION_VARIANT[recommended] || 'outline'}>
              Recommended: {recommendedLabel}
            </Badge>
          )}
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
          Accepting or overriding records the analyst position. It does NOT change the application
          status. The final action must still happen through the Workflow panel below.
        </AlertDescription>
      </Alert>

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
                            <Badge variant="outline" className="text-[10px]">Risk: {s.risk_level}</Badge>
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

      {/* Analyst controls */}
      <div className="border-t pt-3 space-y-2">
        {assessment.analyst_decision ? (
          <div className="flex items-start gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary mt-0.5" />
            <div className="flex-1">
              <div className="font-medium">
                {assessment.analyst_decision === 'accepted'
                  ? 'AI recommendation accepted'
                  : 'AI recommendation overridden'}
                {assessment.analyst_decision_action && (
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    Action: {RECOMMENDED_ACTION_LABEL[assessment.analyst_decision_action] || assessment.analyst_decision_action}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {assessment.analyst_decision_at && new Date(assessment.analyst_decision_at).toLocaleString()}
              </div>
              {assessment.analyst_justification && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  "{assessment.analyst_justification}"
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="ghost"
              disabled={saving}
              onClick={() => setOverrideOpen(true)}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              size="sm"
              disabled={saving || !recommended}
              onClick={() =>
                saveDecision({
                  analyst_decision: 'accepted',
                  analyst_decision_action: recommended,
                })
              }
            >
              Accept recommendation
            </Button>
            <div className="flex items-center gap-2">
              <Select value={overrideAction} onValueChange={setOverrideAction}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RECOMMENDED_ACTION_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => setOverrideOpen(true)}
              >
                Override
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground basis-full">
              Recording your decision here does not change workflow status. Take the final action in the Workflow panel.
            </p>
          </div>
        )}
      </div>

      <OverrideJustificationDialog
        open={overrideOpen}
        onOpenChange={setOverrideOpen}
        title="Override AI recommendation"
        description={`AI recommended "${recommendedLabel}". Provide a justification for choosing a different course of action. This is recorded in the audit log.`}
        confirmLabel="Save override"
        onConfirm={async (justification) => {
          await saveDecision({
            analyst_decision: 'overridden',
            analyst_decision_action: overrideAction,
            analyst_justification: justification,
          });
        }}
      />
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
