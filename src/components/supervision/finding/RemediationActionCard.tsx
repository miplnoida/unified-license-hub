/**
 * One corrective action, with its own governed lifecycle.
 *
 * Every action on this card carries the EXACT `action.id` of the corrective
 * action the supervisor is looking at. There is deliberately no "current" or
 * "first" remediation action anywhere in this component: a validation, an
 * escalation, an enforcement referral or a reassessment requirement always
 * targets the record it was launched from.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowUpRight, CheckCircle2, Clock, FileCheck2, Gavel, RefreshCw,
} from 'lucide-react';
import { AmlEvidenceLinker, type AmlEvidenceRef } from '@/components/supervision/aml/AmlEvidenceLinker';
import {
  remediationTiming, useAcceptResidualDeficiency, useEnforcementReferral, useEscalateRemediation,
  useRequireReassessment, useTransitionRemediation, useValidateRemediation,
  type RemediationAction, type SupervisoryFindingModel,
} from '@/hooks/useSupervisoryFinding';
import { AMBER, EMERALD, NEUTRAL, RED, fmtDate, statusTone, titleCase } from '@/lib/amlLabels';


/** Mirrors the governed transition table in `supervisory_remediation_transition`. */
const NEXT_STATUSES: Record<string, string[]> = {
  OPEN: ['ACTION_PLAN_SUBMITTED', 'UNDER_REVIEW'],
  ACTION_PLAN_SUBMITTED: ['UNDER_REVIEW', 'OPEN'],
  UNDER_REVIEW: ['ACCEPTED', 'OPEN'],
  ACCEPTED: ['IMPLEMENTING'],
  IMPLEMENTING: ['EVIDENCE_SUBMITTED'],
  EVIDENCE_SUBMITTED: ['VALIDATION'],
  VALIDATION: [],
  EFFECTIVE: ['CLOSED', 'REOPENED'],
  PARTIALLY_EFFECTIVE: ['IMPLEMENTING', 'REOPENED', 'CLOSED'],
  INEFFECTIVE: ['IMPLEMENTING', 'REOPENED'],
  REOPENED: ['IMPLEMENTING', 'UNDER_REVIEW'],
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Open',
  ACTION_PLAN_SUBMITTED: 'Action plan submitted',
  UNDER_REVIEW: 'Action plan under review',
  ACCEPTED: 'Action plan accepted',
  IMPLEMENTING: 'Implementing',
  EVIDENCE_SUBMITTED: 'Evidence submitted',
  VALIDATION: 'Awaiting independent validation',
  EFFECTIVE: 'Effective',
  PARTIALLY_EFFECTIVE: 'Partially effective',
  INEFFECTIVE: 'Ineffective',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
};

const REQUESTED_RESPONSES = [
  'Enhanced monitoring',
  'Supervisory meeting',
  'Follow-up examination',
  'Formal direction',
  'Enforcement referral',
];

interface Props {
  action: RemediationAction;
  model: SupervisoryFindingModel;
  canManage: boolean;
  canRefer: boolean;
}

export function RemediationActionCard({ action, model, canManage, canRefer }: Props) {
  const findingId = model.finding.id as string;
  const status = (action.status ?? '').toUpperCase();
  const timing = remediationTiming(action);

  const transition = useTransitionRemediation(findingId);
  const validate = useValidateRemediation(findingId);
  const escalate = useEscalateRemediation(findingId);
  const refer = useEnforcementReferral(findingId);
  const reassess = useRequireReassessment(findingId);
  const acceptResidual = useAcceptResidualDeficiency(findingId);

  const [dialog, setDialog] = useState<
    null | 'transition' | 'validate' | 'escalate' | 'refer' | 'reassess' | 'residual'
  >(null);
  const [toStatus, setToStatus] = useState('');
  const [rationale, setRationale] = useState('');
  const [entityResponse, setEntityResponse] = useState('');
  const [evidence, setEvidence] = useState<AmlEvidenceRef[]>([]);
  const [conclusion, setConclusion] = useState<'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE'>('EFFECTIVE');
  const [evidenceReviewed, setEvidenceReviewed] = useState('');
  const [procedureApplied, setProcedureApplied] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [materiality, setMateriality] = useState('high');
  const [urgency, setUrgency] = useState('high');
  const [requestedResponse, setRequestedResponse] = useState(REQUESTED_RESPONSES[0]);
  const [legalBasis, setLegalBasis] = useState('');
  const [requestedType, setRequestedType] = useState('FOLLOW_UP');
  const [dueDate, setDueDate] = useState('');
  const [remainingDeficiency, setRemainingDeficiency] = useState('');
  const [followUpRequirement, setFollowUpRequirement] = useState('');
  const [residualMateriality, setResidualMateriality] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM');
  const [nextReviewDate, setNextReviewDate] = useState('');

  const reset = () => {
    setDialog(null); setToStatus(''); setRationale(''); setEntityResponse(''); setEvidence([]);
    setEvidenceReviewed(''); setProcedureApplied(''); setNextStep(''); setLegalBasis(''); setDueDate('');
    setRemainingDeficiency(''); setFollowUpRequirement(''); setNextReviewDate('');
  };

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      toast.success(`${label} recorded against ${action.reference}`);
      reset();
    } catch (e: any) {
      toast.error(e?.message ?? `${label} was refused`);
    }
  };

  const escalationAvailable =
    !action.escalated_attention_id
    && (timing.state === 'overdue' || ['INEFFECTIVE', 'PARTIALLY_EFFECTIVE', 'REOPENED'].includes(status));

  /** The governed residual acceptance for THIS corrective action, if one exists. */
  const residual = model.residualAcceptances.find((r) => r.action_id === action.id) ?? null;
  const residualOutstanding = status === 'PARTIALLY_EFFECTIVE' && !residual;

  const lastValidation = action.validations[action.validations.length - 1];

  // A partially effective action cannot be closed until the residual weakness is accepted.
  const options = (NEXT_STATUSES[status] ?? []).filter((s) => !(s === 'CLOSED' && residualOutstanding));


  return (
    <Card className="border-l-4" style={{ borderLeftColor: status === 'EFFECTIVE' ? 'hsl(var(--primary))' : undefined }}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm font-semibold">{action.reference}</span>
              <Badge variant="outline" className={statusTone(status)}>{STATUS_LABEL[status] ?? titleCase(status)}</Badge>
              {action.effectiveness ? (
                <Badge variant="outline" className={action.effectiveness === 'EFFECTIVE' ? EMERALD : AMBER}>
                  {titleCase(action.effectiveness)}
                </Badge>
              ) : null}
              {action.escalated_attention_id ? (
                <Badge variant="outline" className={RED}>Escalated</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm">{action.description}</p>
            {action.required_outcome ? (
              <p className="mt-1 text-xs text-muted-foreground">Required outcome: {action.required_outcome}</p>
            ) : null}
          </div>
          <div className="text-right text-xs">
            <div className="text-muted-foreground">Target</div>
            <div className="font-mono">{fmtDate(action.target_date)}</div>
            {timing.state === 'overdue' ? (
              <Badge variant="outline" className={`${RED} mt-1`}>
                <Clock className="mr-1 h-3 w-3" />{timing.days} day{timing.days === 1 ? '' : 's'} overdue
              </Badge>
            ) : timing.state === 'due_today' ? (
              <Badge variant="outline" className={`${AMBER} mt-1`}>Due today</Badge>
            ) : timing.state === 'due_soon' ? (
              <Badge variant="outline" className={`${AMBER} mt-1`}>Due in {timing.days} days</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3">
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Responsible party</div>
            <div>{action.responsible_party || action.owner_name || '—'}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Validations</div>
            <div>{action.validations.length === 0 ? 'None' : `${action.validations.length} recorded`}</div>
          </div>
          <div>
            <div className="uppercase tracking-wide text-muted-foreground">Last conclusion</div>
            <div>{lastValidation ? `${titleCase(lastValidation.conclusion)} · ${fmtDate(lastValidation.validated_at)}` : '—'}</div>
          </div>
        </div>

        {action.escalation_reason ? (
          <div className={`rounded-md border p-2 text-xs ${RED}`}>
            <span className="font-semibold">Escalated {fmtDate(action.escalated_at)}: </span>
            {action.escalation_reason}
          </div>
        ) : null}

        {action.validations.length > 0 ? (
          <ul className="space-y-1.5 border-t pt-2">
            {action.validations.map((v) => (
              <li key={v.id} className="text-xs">
                <Badge variant="outline" className={v.conclusion === 'EFFECTIVE' ? EMERALD : v.conclusion === 'INEFFECTIVE' ? RED : AMBER}>
                  {titleCase(v.conclusion)}
                </Badge>{' '}
                <span className="text-muted-foreground">
                  {fmtDate(v.validated_at)} · {v.validator_name || 'Validator'} · {v.procedure_applied}
                </span>
                {v.rationale ? <div className="mt-0.5">{v.rationale}</div> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {residual ? (
          <div className={`rounded-md border p-2 text-xs ${AMBER}`}>
            <span className="font-semibold">
              Residual deficiency accepted {fmtDate(residual.accepted_at)} · {titleCase(residual.residual_materiality)} materiality
              {residual.accepted_by_name ? ` · ${residual.accepted_by_name}` : ''}
            </span>
            <div className="mt-0.5">Remaining: {residual.remaining_deficiency}</div>
            <div>Follow-up: {residual.follow_up_requirement}</div>
            {residual.next_review_date ? <div>Next review {fmtDate(residual.next_review_date)}</div> : null}
          </div>
        ) : residualOutstanding ? (
          <div className={`rounded-md border p-2 text-xs ${AMBER}`}>
            <span className="font-semibold">Partially effective — a residual decision is outstanding. </span>
            {action.reference} cannot be closed, and neither can the finding, until the remaining deficiency is either
            remediated further or formally accepted with a follow-up supervisory requirement.
          </div>
        ) : null}

        {canManage ? (
          <div className="flex flex-wrap gap-2 border-t pt-3">

            {options.length > 0 ? (
              <Button size="sm" variant="outline" onClick={() => { setToStatus(options[0]); setDialog('transition'); }}>
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />Progress {action.reference}
              </Button>
            ) : null}
            {status === 'VALIDATION' ? (
              <Button size="sm" onClick={() => setDialog('validate')}>
                <FileCheck2 className="mr-1.5 h-3.5 w-3.5" />Validate {action.reference}
              </Button>
            ) : null}
            {residualOutstanding ? (
              <Button data-rbac="supervisory_spine.edit" size="sm" onClick={() => setDialog('residual')}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Accept residual deficiency on {action.reference}
              </Button>
            ) : null}

            {escalationAvailable ? (
              <Button size="sm" variant="outline" onClick={() => setDialog('escalate')}>
                <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Escalate {action.reference}
              </Button>
            ) : null}
            {canRefer ? (
              <Button size="sm" variant="outline" onClick={() => setDialog('refer')}>
                <Gavel className="mr-1.5 h-3.5 w-3.5" />Refer to enforcement
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => setDialog('reassess')}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Require reassessment from {action.reference}
            </Button>
          </div>
        ) : null}

        {/* ------------------------------------------------------- progress --- */}
        <Dialog open={dialog === 'transition'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Progress {action.reference}</DialogTitle>
              <DialogDescription>
                This decision applies only to {action.reference}. The governed lifecycle decides which states are available.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>New state</Label>
                <Select value={toStatus} onValueChange={setToStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {options.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s] ?? titleCase(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rationale</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div>
                <Label>Entity submission notes (optional)</Label>
                <Textarea rows={2} value={entityResponse} onChange={(e) => setEntityResponse(e.target.value)} />
              </div>
              <AmlEvidenceLinker
                entityId={action.entity_id}
                value={evidence}
                onChange={setEvidence}
                label="Governed evidence for this state change"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={!toStatus || rationale.trim().length < 5 || transition.isPending}
                onClick={() => run('State change', () => transition.mutateAsync({
                  actionId: action.id, toStatus, rationale,
                  entityResponse: entityResponse || null,
                  evidence: evidence.length ? evidence : null,
                }))}
              >
                Record
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ----------------------------------------------------- validation --- */}
        <Dialog open={dialog === 'validate'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Independent validation of {action.reference}</DialogTitle>
              <DialogDescription>
                The remediation owner cannot validate their own material corrective action — independence is enforced by the platform.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Conclusion</Label>
                <Select value={conclusion} onValueChange={(v) => setConclusion(v as typeof conclusion)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EFFECTIVE">Effective</SelectItem>
                    <SelectItem value="PARTIALLY_EFFECTIVE">Partially effective</SelectItem>
                    <SelectItem value="INEFFECTIVE">Ineffective</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Evidence reviewed</Label>
                <Textarea rows={2} value={evidenceReviewed} onChange={(e) => setEvidenceReviewed(e.target.value)} />
              </div>
              <div>
                <Label>Validation procedure applied (including sample or reperformance)</Label>
                <Textarea rows={2} value={procedureApplied} onChange={(e) => setProcedureApplied(e.target.value)} />
              </div>
              <div>
                <Label>Rationale</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div>
                <Label>Next step</Label>
                <Input value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
              </div>
              <AmlEvidenceLinker
                entityId={action.entity_id}
                value={evidence}
                onChange={setEvidence}
                requiredCount={1}
                label="Governed evidence reviewed"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={
                  evidenceReviewed.trim().length < 5 || procedureApplied.trim().length < 5
                  || rationale.trim().length < 10 || validate.isPending
                }
                onClick={() => run('Validation', () => validate.mutateAsync({
                  actionId: action.id, conclusion, evidenceReviewed, procedureApplied, rationale,
                  nextStep: nextStep || null,
                  workpaperId: model.provenance.workpaper?.id ?? null,
                  documentId: evidence[0]?.document_id ?? null,
                }))}
              >
                Record validation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ---------------------------------------------------- escalation ---- */}
        <Dialog open={dialog === 'escalate'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Escalate {action.reference}</DialogTitle>
              <DialogDescription>
                Escalation opens governed supervisory attention on this exact corrective action. It does not create enforcement.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Escalation basis (minimum 20 characters)</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Materiality</Label>
                  <Select value={materiality} onValueChange={setMateriality}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['critical', 'high', 'medium', 'low'].map((v) => (
                        <SelectItem key={v} value={v}>{titleCase(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Urgency</Label>
                  <Select value={urgency} onValueChange={setUrgency}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['critical', 'high', 'medium', 'low'].map((v) => (
                        <SelectItem key={v} value={v}>{titleCase(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Requested supervisory response</Label>
                <Select value={requestedResponse} onValueChange={setRequestedResponse}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUESTED_RESPONSES.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">
                  Recorded as part of the escalation basis. Enforcement is only ever opened by an explicit referral.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={rationale.trim().length < 20 || escalate.isPending}
                onClick={() => run('Escalation', () => escalate.mutateAsync({
                  actionId: action.id,
                  reason: `${rationale.trim()} Requested supervisory response: ${requestedResponse}.`,
                  materiality, urgency,
                }))}
              >
                Escalate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ------------------------------------------- enforcement referral --- */}
        <Dialog open={dialog === 'refer'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refer {action.reference} to Enforcement</DialogTitle>
              <DialogDescription>
                A referral is a deliberate regulatory judgment. Provenance — entity, finding, this corrective action,
                examination and assessment — is derived by the platform from the referred record.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Referral rationale (minimum 20 characters)</Label>
                <Textarea rows={4} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div>
                <Label>Legal / regulatory basis</Label>
                <Input value={legalBasis} onChange={(e) => setLegalBasis(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={rationale.trim().length < 20 || refer.isPending}
                onClick={() => run('Enforcement referral', () => refer.mutateAsync({
                  sourceKind: 'SUPERVISORY_REMEDIATION',
                  sourceId: action.id,
                  referralReason: rationale,
                  legalBasis: legalBasis || null,
                }))}
              >
                Refer to enforcement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ------------------------------------------------- reassessment ----- */}
        <Dialog open={dialog === 'reassess'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Require reassessment from {action.reference}</DialogTitle>
              <DialogDescription>
                The requirement records this exact corrective action as its trigger. Authoritative risk is unchanged until a
                new assessment is submitted, reviewed and approved.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Trigger rationale</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Requested assessment type</Label>
                  <Select value={requestedType} onValueChange={setRequestedType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FOLLOW_UP">Follow-up</SelectItem>
                      <SelectItem value="EVENT_DRIVEN">Event driven</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Due date</Label>
                  <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={rationale.trim().length < 10 || reassess.isPending}
                onClick={() => run('Reassessment requirement', () => reassess.mutateAsync({
                  entityId: action.entity_id,
                  domainCode: action.domain_code,
                  triggerKind: 'REMEDIATION_OUTCOME',
                  triggerRationale: rationale,
                  requestedType,
                  dueDate: dueDate || null,
                  previousAssessmentId: model.finding.assessment_id ?? null,
                  remediationActionId: action.id,
                  examinationId: model.finding.examination_id ?? null,
                  validationId: lastValidation?.id ?? null,
                }))}
              >
                Require reassessment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ------------------------------------------- residual acceptance --- */}
        <Dialog open={dialog === 'residual'} onOpenChange={(o) => (o ? null : reset())}>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Accept the residual deficiency on {action.reference}</DialogTitle>
              <DialogDescription>
                A partially effective outcome is not a resolved matter. Accepting the residual weakness is an explicit
                supervisory decision that names what remains outstanding and what the regulator will do about it. The
                officer who concluded the validation cannot also accept the residual risk.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Remaining deficiency (minimum 20 characters)</Label>
                <Textarea rows={3} value={remainingDeficiency} onChange={(e) => setRemainingDeficiency(e.target.value)} />
              </div>
              <div>
                <Label>Follow-up supervisory requirement (minimum 20 characters)</Label>
                <Textarea rows={3} value={followUpRequirement} onChange={(e) => setFollowUpRequirement(e.target.value)} />
              </div>
              <div>
                <Label>Acceptance rationale (minimum 20 characters)</Label>
                <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Residual materiality</Label>
                  <Select value={residualMateriality} onValueChange={(v) => setResidualMateriality(v as typeof residualMateriality)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['LOW', 'MEDIUM', 'HIGH'] as const).map((v) => (
                        <SelectItem key={v} value={v}>{titleCase(v)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Next review date</Label>
                  <Input type="date" value={nextReviewDate} onChange={(e) => setNextReviewDate(e.target.value)} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
              <Button
                disabled={
                  remainingDeficiency.trim().length < 20 || followUpRequirement.trim().length < 20
                  || rationale.trim().length < 20 || acceptResidual.isPending
                }
                onClick={() => run('Residual acceptance', () => acceptResidual.mutateAsync({
                  actionId: action.id,
                  remainingDeficiency,
                  followUpRequirement,
                  rationale,
                  residualMateriality,
                  nextReviewDate: nextReviewDate || null,
                }))}
              >
                Record residual acceptance
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        {status === 'EFFECTIVE' ? (
          <p className={`rounded-md border p-2 text-xs ${NEUTRAL}`}>
            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
            {action.reference} is effective. This does not make the finding remediated — closure is computed from every
            corrective action.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
