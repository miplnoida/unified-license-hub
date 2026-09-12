/**
 * MC-08 — one assurance review, with the AI evidence beside the assurance form.
 *
 * The reviewer assesses each of the seven criteria, records remediation where
 * needed and concludes. Nothing here writes to the AI record: the original
 * output, provenance and the supervisor's decision are untouched.
 */
import { useState } from 'react';
import { GuardedButton } from '@/components/auth/GuardedButton';
import { Link, useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeft, Loader2 } from 'lucide-react';
import {
  useAssuranceAssess, useAssuranceAssessments, useAssuranceConclude, useAssuranceRemediation,
  useAssuranceReview, useConductAiInsight, useAiUseCases,
} from '@/hooks/useAiGovernance';
import { GovernanceHistory } from '@/components/governance/ai/GovernanceHistory';
import {
  ASSESSMENT_LABEL, ASSESSMENT_VARIANT, ASSURANCE_CRITERIA, ASSURANCE_STATUS_LABEL,
  REMEDIATION_LABEL, REVIEW_STATE_LABEL, label,
} from '@/lib/aiGovernanceLabels';
import { advisoryPlainText } from '@/components/conduct/three-sixty/advisory/advisoryText';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { useCan } from '@/hooks/useCan';

const ASSESSMENTS = ['SATISFACTORY', 'OBSERVATION', 'IMPROVEMENT_REQUIRED', 'CONTROL_FAILURE', 'NOT_APPLICABLE'];
const CONCLUSIONS = ['SATISFACTORY', 'OBSERVATION', 'IMPROVEMENT_REQUIRED', 'CONTROL_FAILURE'];
const REMEDIATION_STATES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED'];

export default function AiAssuranceDetail() {
  const { id = '' } = useParams();
  // Hooks must run unconditionally: evaluate both permissions, then combine.
  const canAssurePrimary = useCan('ai_management', 'assure');
  const canAssureAlternate = useCan('ai_management', 'approve');
  const canAssure = canAssurePrimary || canAssureAlternate;
  const { data: review, isLoading } = useAssuranceReview(id);
  const { data: assessments = [] } = useAssuranceAssessments(id);
  const { data: insight } = useConductAiInsight(review?.conduct_ai_insight_id ?? null);
  const { data: useCases = [] } = useAiUseCases();

  const assess = useAssuranceAssess();
  const remediation = useAssuranceRemediation();
  const conclude = useAssuranceConclude();

  const [comments, setComments] = useState<Record<string, string>>({});
  const [rAction, setRAction] = useState('');
  const [rOwner, setROwner] = useState('');
  const [rDue, setRDue] = useState('');
  const [rStatus, setRStatus] = useState('OPEN');
  const [conclusion, setConclusion] = useState('');
  const [closureNote, setClosureNote] = useState('');

  if (isLoading) {
    return <DashboardLayout><p className="p-6 text-sm text-muted-foreground">Loading assurance review…</p></DashboardLayout>;
  }
  if (!review) {
    return (
      <DashboardLayout>
        <div className="space-y-4 p-2">
          <p className="text-sm text-muted-foreground">This assurance review could not be found, or you do not have rights to view it.</p>
          <Button asChild variant="outline"><Link to="/governance/ai/assurance">Back to assurance</Link></Button>
        </div>
      </DashboardLayout>
    );
  }

  const concluded = review.status === 'CONCLUDED' || !!review.closed_at;
  const editable = canAssure && !concluded;
  const useCase = useCases.find((u) => u.code === review.use_case_code);
  const citations = Array.isArray(insight?.source_references) ? insight?.source_references as unknown[] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/governance/ai/assurance"><ArrowLeft className="mr-1 h-4 w-4" /> All assurance reviews</Link>
        </Button>

        <PageHeader
          title={`Assurance review ${review.reference}`}
          description={useCase?.label ?? review.use_case_code ?? 'AI activity under review'}
          actions={
            <div className="flex items-center gap-2">
              <Badge variant="outline">{label(ASSURANCE_STATUS_LABEL, review.status)}</Badge>
              {review.conclusion && (
                <Badge variant={ASSESSMENT_VARIANT[review.conclusion] ?? 'outline'}>
                  {label(ASSESSMENT_LABEL, review.conclusion)}
                </Badge>
              )}
            </div>
          }
        />

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            This review records an assurance opinion only. It does not alter the AI output, its provenance, the
            supervisor's decision, or any regulatory record.
          </AlertDescription>
        </Alert>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">AI evidence under review</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <F l="Capability" v={useCase?.label ?? review.use_case_code ?? 'Not recorded'} />
                <F l="Regulated entity" v={insight?.entity_id ?? 'Not entity specific'} mono />
                <F l="Prepared at" v={insight ? formatDateTime(insight.generated_at) : 'Not recorded'} />
                <F l="Facts signature" v={insight?.snapshot_fingerprint ?? 'Not recorded'} mono />
                <F l="Facts window" v={insight?.window_start && insight?.window_end
                  ? `${formatDate(insight.window_start)} to ${formatDate(insight.window_end)}` : 'Not recorded'} />
                <F l="Confidence stated" v={insight?.confidence != null ? insight.confidence.toFixed(2) : 'Not stated'} />
                <F l="Records cited" v={String(citations.length)} />
                <F l="Human decision" v={label(REVIEW_STATE_LABEL, insight?.review_state ?? 'NOT_APPLICABLE')} />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  AI suggestion — requires human review
                </p>
                <div className="mt-1 max-h-52 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
                  {advisoryPlainText(insight?.ai_output ?? null) || 'No narrative recorded.'}
                </div>
              </div>

              {insight?.review_state === 'MODIFIED' && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supervisor wording</p>
                  <div className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border p-3 text-sm">
                    {advisoryPlainText(insight?.human_output ?? null) || 'Not recorded.'}
                  </div>
                </div>
              )}

              {insight?.human_rationale && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Supervisor rationale</p>
                  <p className="mt-1 text-sm whitespace-pre-wrap">{insight.human_rationale}</p>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Uncertainty stated</p>
                <p className="mt-1 text-sm">{insight?.uncertainty?.trim() || 'Not stated.'}</p>
              </div>

              {review.conduct_ai_insight_id && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/governance/ai/activity/INSIGHT/${review.conduct_ai_insight_id}`}>
                    Open the full AI activity record
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Criterion assessments</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {ASSURANCE_CRITERIA.map((c) => {
                const recorded = assessments.find((a) => a.criterion_code === c.code);
                return (
                  <div key={c.code} className="rounded-md border p-3">
                    <p className="text-sm font-medium">{c.label}</p>
                    <p className="text-xs text-muted-foreground">{c.help}</p>
                    {recorded && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant={ASSESSMENT_VARIANT[recorded.assessment] ?? 'outline'}>
                          {label(ASSESSMENT_LABEL, recorded.assessment)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDateTime(recorded.created_at)}</span>
                      </div>
                    )}
                    {recorded?.comment && <p className="mt-1 text-sm whitespace-pre-wrap">{recorded.comment}</p>}

                    {editable && (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          rows={2}
                          placeholder="Assessment note (optional)"
                          value={comments[c.code] ?? ''}
                          onChange={(e) => setComments({ ...comments, [c.code]: e.target.value })}
                        />
                        <div className="flex flex-wrap gap-2">
                          {ASSESSMENTS.map((a) => (
                            <Button
                              key={a} size="sm" variant="outline" disabled={assess.isPending}
                              onClick={() => assess.mutate({
                                reviewId: review.id, criterionCode: c.code, assessment: a,
                                comment: comments[c.code]?.trim() || undefined,
                              })}
                            >
                              {label(ASSESSMENT_LABEL, a)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!editable && assessments.length === 0 && (
                <p className="text-sm text-muted-foreground">No criterion assessment recorded.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Remediation</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <F l="Action" v={review.remediation_action ?? 'None recorded'} />
              <F l="Owner" v={review.remediation_owner ?? 'Not assigned'} />
              <F l="Due" v={review.remediation_due_date ? formatDate(review.remediation_due_date) : 'Not set'} />
              <F l="Status" v={review.remediation_status ? label(REMEDIATION_LABEL, review.remediation_status) : 'Not set'} />
            </div>

            {canAssure && (
              <>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="lg:col-span-2">
                    <Label htmlFor="r-action">Remediation action</Label>
                    <Input id="r-action" value={rAction} onChange={(e) => setRAction(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="r-owner">Owner</Label>
                    <Input id="r-owner" value={rOwner} onChange={(e) => setROwner(e.target.value)} />
                  </div>
                  <div>
                    <Label htmlFor="r-due">Due date</Label>
                    <Input id="r-due" type="date" value={rDue} onChange={(e) => setRDue(e.target.value)} />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={rStatus} onValueChange={setRStatus}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REMEDIATION_STATES.map((s) => (
                          <SelectItem key={s} value={s}>{label(REMEDIATION_LABEL, s)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button data-rbac="ai_management.edit"
                      size="sm"
                      disabled={!rAction.trim() || remediation.isPending}
                      onClick={() => remediation.mutate({
                        reviewId: review.id, action: rAction.trim(), owner: rOwner.trim() || null,
                        dueDate: rDue || null, status: rStatus,
                      })}
                    >
                      {remediation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record remediation
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Conclusion</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {concluded ? (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={ASSESSMENT_VARIANT[review.conclusion ?? ''] ?? 'outline'}>
                    {label(ASSESSMENT_LABEL, review.conclusion)}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    Concluded {review.closed_at ? formatDateTime(review.closed_at) : ''}
                  </span>
                </div>
                {review.closure_note && <p className="text-sm whitespace-pre-wrap">{review.closure_note}</p>}
                {review.notes && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review notes</p>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{review.notes}</p>
                  </div>
                )}
              </div>
            ) : canAssure ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label>Conclusion</Label>
                    <Select value={conclusion} onValueChange={setConclusion}>
                      <SelectTrigger><SelectValue placeholder="Select a conclusion" /></SelectTrigger>
                      <SelectContent>
                        {CONCLUSIONS.map((c) => (
                          <SelectItem key={c} value={c}>{label(ASSESSMENT_LABEL, c)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="closure">Basis for the conclusion <span className="text-destructive">*</span></Label>
                  <Textarea id="closure" rows={4} value={closureNote} onChange={(e) => setClosureNote(e.target.value)}
                    placeholder="Record the evidence and reasoning that support this conclusion." />
                </div>
                <GuardedButton module="ai_management" action="approve" data-rbac="ai_management.approve"
                  disabled={!conclusion || closureNote.trim().length < 10 || conclude.isPending}
                  onClick={() => conclude.mutate({ reviewId: review.id, conclusion, closureNote: closureNote.trim() })}
                >
                  {conclude.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Conclude review
                </GuardedButton>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                This review is open. Concluding it requires assurance rights.
              </p>
            )}
          </CardContent>
        </Card>

        <GovernanceHistory objectType="ASSURANCE_REVIEW" objectCode={review.reference} title="Review history" />
      </div>
    </DashboardLayout>
  );
}

function F({ l, v, mono }: { l: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{l}</p>
      <p className={`mt-0.5 text-sm font-medium ${mono ? 'break-all font-mono text-xs' : ''}`}>{v}</p>
    </div>
  );
}
