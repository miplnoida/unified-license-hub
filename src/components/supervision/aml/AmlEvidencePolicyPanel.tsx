/**
 * PCOMP-R2A — evidence policy of the governing policy profile, on the assessment.
 *
 * Every state, count and reason on this panel is the one the platform returned
 * from the exact evidence policy version pinned in this assessment's immutable
 * policy basis. The browser does not evaluate evidence, cannot mark a
 * requirement satisfied, and cannot decide an exception: it requests and it
 * displays. An approved exception is never shown as satisfied evidence — the
 * recorded deficiency stays visible beside it.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, FileLock2, Info, ShieldAlert } from 'lucide-react';
import {
  useAssessmentEvidencePolicy,
  useDecideEvidenceException,
  useRequestEvidenceException,
  type EvidencePolicyDecision,
  type EvidencePolicyException,
} from '@/hooks/useAssessmentEvidencePolicy';
import { evidenceErrorMessage } from '@/hooks/useAssessmentEvidenceBasis';
import {
  decisionLabel, decisionTone, evaluationSummary, isExceptionPending, kindList,
  outstandingText, overallStatus, overallTone,
} from '@/lib/evidencePolicyPresentation';
import { NEUTRAL, fmtDate } from '@/lib/amlLabels';

const Stat = ({ label, value, testId }: { label: string; value: React.ReactNode; testId?: string }) => (
  <div>
    <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 text-sm" data-testid={testId}>{value}</div>
  </div>
);

const requirementText = (d: EvidencePolicyDecision) => {
  const req = (d as { evidence_requirement?: string | null }).evidence_requirement;
  if (req === 'NOT_REQUIRED') return 'Not required';
  if (req === 'OPTIONAL') return 'Optional';
  return 'Required';
};

function RuleCard({
  d, exceptions, canRequest, canDecide, onRequest, onDecide,
}: {
  d: EvidencePolicyDecision;
  exceptions: EvidencePolicyException[];
  canRequest: boolean;
  canDecide: boolean;
  onRequest: (d: EvidencePolicyDecision) => void;
  onDecide: (e: EvidencePolicyException, decision: 'APPROVED' | 'REJECTED') => void;
}) {
  const pending = isExceptionPending(d);
  const linked = exceptions.find((e) => e.id === d.exception_id);
  const outstanding = outstandingText(d);
  const showRequest = canRequest && d.decision === 'EXCEPTION_REQUIRED' && !pending;
  const showDecide = canDecide && pending && linked && !linked.is_own_request;

  return (
    <div className="rounded-md border p-3" data-testid={`evidence-policy-rule-${d.rule_code}-${d.target_code ?? 'ASSESSMENT'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {d.rule_label || d.rule_code}
            <span className="ml-2 font-mono text-xs text-muted-foreground">{d.rule_code}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {d.scope_type === 'ASSESSMENT'
              ? 'Applies to the assessment as a whole'
              : `${d.scope_type === 'QUESTION' ? 'Question' : 'Dimension'} ${d.target_code ?? ''}`}
          </p>
        </div>
        <Badge variant="outline" className={decisionTone(d.decision)} data-testid={`evidence-policy-decision-${d.rule_code}`}>
          {decisionLabel(d.decision)}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Evidence requirement" value={requirementText(d)} />
        <Stat label="Minimum items" value={d.required_items > 0 ? d.required_items : '—'} />
        <Stat label="Permitted kinds" value={kindList(d.permitted_source_kinds)} />
        <Stat label="Required kinds" value={kindList(d.required_source_kinds, 'None specified')} />
        <Stat
          label="Freshness"
          value={d.maximum_age_days ? `No older than ${d.maximum_age_days} days` : 'No age limit'}
        />
        <Stat
          label="Independent sources"
          value={d.independent_sources_required ? `${d.independent_sources_required} required` : 'Not required'}
        />
        <Stat label="Written rationale" value={d.rationale_required ? 'Required' : 'Not required'} />
        <Stat
          label="Current evidence"
          value={`${d.qualifying_items} qualifying item${d.qualifying_items === 1 ? '' : 's'} · ${d.distinct_sources} source${d.distinct_sources === 1 ? '' : 's'}`}
          testId={`evidence-policy-qualifying-${d.rule_code}`}
        />
      </dl>

      {outstanding ? (
        <p className="mt-3 text-sm" data-testid={`evidence-policy-outstanding-${d.rule_code}`}>
          <span className="font-medium">Outstanding: </span>
          <span className="text-muted-foreground">{outstanding}</span>
        </p>
      ) : null}

      {d.decision === 'EXCEPTION_APPROVED' ? (
        <Alert className="mt-3" data-testid={`evidence-policy-exception-approved-${d.rule_code}`}>
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Evidence requirement not satisfied. The assessment may proceed under an approved exception.
            {linked?.decision_rationale ? ` Decision: ${linked.decision_rationale}` : ''}
          </AlertDescription>
        </Alert>
      ) : null}

      {pending ? (
        <Alert className="mt-3" data-testid={`evidence-policy-exception-pending-${d.rule_code}`}>
          <Info className="h-4 w-4" />
          <AlertDescription>
            EXCEPTION PENDING — requested by {linked?.requested_by_name ?? 'a supervisory officer'} on{' '}
            {fmtDate(linked?.requested_at)}. The deficiency stands until an independent officer decides it.
          </AlertDescription>
        </Alert>
      ) : null}

      {showRequest || showDecide ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {showRequest ? (
            <Button size="sm" variant="outline" data-rbac="aml_supervision.execute_assessment"
              data-testid={`evidence-policy-request-${d.rule_code}`} onClick={() => onRequest(d)}>
              Request exception
            </Button>
          ) : null}
          {showDecide && linked ? (
            <>
              <Button size="sm" data-rbac="aml_supervision.approve_assessment"
                data-testid={`evidence-policy-approve-${d.rule_code}`}
                onClick={() => onDecide(linked, 'APPROVED')}>
                Approve exception
              </Button>
              <Button size="sm" variant="outline" data-rbac="aml_supervision.approve_assessment"
                data-testid={`evidence-policy-reject-${d.rule_code}`}
                onClick={() => onDecide(linked, 'REJECTED')}>
                Reject exception
              </Button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function AmlEvidencePolicyPanel({ assessmentId }: { assessmentId: string }) {
  const { data, isLoading, error } = useAssessmentEvidencePolicy(assessmentId);
  const request = useRequestEvidenceException(assessmentId);
  const decide = useDecideEvidenceException(assessmentId);

  const [requesting, setRequesting] = useState<EvidencePolicyDecision | null>(null);
  const [deciding, setDeciding] = useState<{ exception: EvidencePolicyException; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [rationale, setRationale] = useState('');

  const evaluation = data?.evaluation;
  const summary = useMemo(() => evaluationSummary(evaluation), [evaluation]);
  const status = overallStatus(evaluation);

  const shell = (badge: React.ReactNode, body: React.ReactNode) => (
    <Card data-testid="evidence-policy-panel">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Evidence policy</CardTitle>
          {badge}
        </div>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );

  if (isLoading) return shell(null, <Skeleton className="h-24 w-full" />);

  if (error || !data || !evaluation) {
    return shell(
      <Badge variant="outline" className={NEUTRAL} data-testid="evidence-policy-status">EVIDENCE POLICY UNAVAILABLE</Badge>,
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="evidence-policy-error">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        The evidence policy decision could not be read, so nothing is shown rather than an assumed position
        {error ? `: ${evidenceErrorMessage(error)}` : '.'}
      </p>,
    );
  }

  if (evaluation.status !== 'EVALUATED') {
    return shell(
      <Badge variant="outline" className={NEUTRAL} data-testid="evidence-policy-status">NOT GOVERNED BY AN EVIDENCE POLICY</Badge>,
      <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="evidence-policy-not-governed">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        {evaluation.reason}
      </p>,
    );
  }

  const submitRequest = async () => {
    if (!requesting) return;
    try {
      await request.mutateAsync({
        assessmentId,
        ruleCode: requesting.rule_code,
        scopeType: requesting.scope_type,
        questionId: requesting.question_id,
        dimensionId: requesting.dimension_id,
        rationale,
      });
      toast.success('Exception requested. It must be decided by an independent officer.');
      setRequesting(null); setRationale('');
    } catch (e) {
      toast.error(evidenceErrorMessage(e));
    }
  };

  const submitDecision = async () => {
    if (!deciding) return;
    try {
      await decide.mutateAsync({
        exceptionId: deciding.exception.id,
        decision: deciding.decision,
        rationale,
      });
      toast.success(deciding.decision === 'APPROVED' ? 'Exception approved.' : 'Exception rejected.');
      setDeciding(null); setRationale('');
    } catch (e) {
      toast.error(evidenceErrorMessage(e));
    }
  };

  return (
    <>
      {shell(
        <Badge variant="outline" className={overallTone(status)} data-testid="evidence-policy-status">{status}</Badge>,
        <div className="space-y-4">
          <p className="flex items-start gap-2 text-sm text-muted-foreground" data-testid="evidence-policy-note">
            <FileLock2 className="mt-0.5 h-4 w-4 shrink-0" />
            {evaluation.reason}
          </p>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Policy"
              value={
                <span data-testid="evidence-policy-code">
                  {evaluation.policy_component_code ?? '—'}{' '}
                  <span className="font-mono text-xs">v{evaluation.policy_component_version ?? '—'}</span>
                </span>
              }
            />
            <Stat
              label="Policy basis"
              value={
                <span data-testid="evidence-policy-basis">
                  {evaluation.policy_profile_code ?? '—'} v{evaluation.policy_profile_version ?? '—'}
                </span>
              }
            />
            <Stat label="Assessed as at" value={fmtDate(evaluation.reference_date)} />
            <Stat label="Rules applicable" value={summary.applicable} testId="evidence-policy-applicable" />
            <Stat label="Rules satisfied" value={summary.satisfied} testId="evidence-policy-satisfied" />
            <Stat label="Rules outstanding" value={summary.outstanding} testId="evidence-policy-outstanding-count" />
            <Stat label="Approved exceptions" value={summary.exceptionApproved} testId="evidence-policy-approved-exceptions" />
            <Stat label="Pending exceptions" value={summary.exceptionPending} testId="evidence-policy-pending-exceptions" />
          </div>

          <div className="space-y-2">
            {evaluation.decisions.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="evidence-policy-no-rules">
                The bound evidence policy holds no rule that applies to this assessment.
              </p>
            ) : (
              evaluation.decisions.map((d) => (
                <RuleCard
                  key={`${d.rule_code}-${d.scope_type}-${d.question_id ?? d.dimension_id ?? 'assessment'}`}
                  d={d}
                  exceptions={data.exceptions}
                  canRequest={data.capabilities.can_request_exception}
                  canDecide={data.capabilities.can_decide_exception}
                  onRequest={(x) => { setRequesting(x); setRationale(''); }}
                  onDecide={(e, decision) => { setDeciding({ exception: e, decision }); setRationale(''); }}
                />
              ))
            )}
          </div>
        </div>,
      )}

      <Dialog open={!!requesting} onOpenChange={(o) => (o ? null : (setRequesting(null), setRationale('')))}>
        <DialogContent data-testid="evidence-exception-request-dialog">
          <DialogHeader>
            <DialogTitle>Request an evidence policy exception</DialogTitle>
            <DialogDescription>
              An exception does not create or replace evidence. It requests permission to proceed despite the
              recorded evidence deficiency.
            </DialogDescription>
          </DialogHeader>
          {requesting ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Stat label="Rule" value={`${requesting.rule_label || requesting.rule_code} (${requesting.rule_code})`} />
              <Stat label="Scope" value={`${requesting.scope_type} ${requesting.target_code ?? ''}`} />
              <Stat label="Evidence status" value={decisionLabel(requesting.decision)} />
              <Stat label="Evidence policy version" value={`v${evaluation.policy_component_version ?? '—'}`} />
              <div className="sm:col-span-2">
                <Stat label="Recorded deficiency" value={outstandingText(requesting) ?? '—'} />
              </div>
            </dl>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="ep-rationale">Written justification</Label>
            <Textarea id="ep-rationale" rows={4} value={rationale}
              placeholder="Why the required evidence cannot be obtained, and what was done instead."
              onChange={(e) => setRationale(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              At least 20 characters. The platform records this against the exact policy version and deficiency.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRequesting(null); setRationale(''); }}>Cancel</Button>
            <Button onClick={submitRequest} disabled={rationale.trim().length < 20 || request.isPending}
              data-testid="evidence-exception-request-submit">
              {request.isPending ? 'Submitting…' : 'Request exception'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deciding} onOpenChange={(o) => (o ? null : (setDeciding(null), setRationale('')))}>
        <DialogContent data-testid="evidence-exception-decision-dialog">
          <DialogHeader>
            <DialogTitle>
              {deciding?.decision === 'APPROVED' ? 'Approve' : 'Reject'} this evidence policy exception
            </DialogTitle>
            <DialogDescription>
              Approving does not record evidence. The deficiency remains on the assessment record.
            </DialogDescription>
          </DialogHeader>
          {deciding ? (
            <dl className="grid gap-3 sm:grid-cols-2">
              <Stat label="Rule" value={deciding.exception.rule_code} />
              <Stat label="Scope" value={`${deciding.exception.scope_type} ${deciding.exception.question_code ?? deciding.exception.dimension_code ?? ''}`} />
              <Stat label="Policy version" value={`v${deciding.exception.policy_component_version ?? '—'}`} />
              <Stat label="Requested by" value={deciding.exception.requested_by_name ?? deciding.exception.requested_by ?? '—'} />
              <Stat label="Requested at" value={fmtDate(deciding.exception.requested_at)} />
              <div className="sm:col-span-2">
                <Stat label="Request rationale" value={deciding.exception.rationale} />
              </div>
              <div className="sm:col-span-2">
                <Stat
                  label="Unresolved deficiency"
                  value={
                    Array.isArray((deciding.exception.deficiency as { reasons?: { message: string }[] })?.reasons)
                      ? ((deciding.exception.deficiency as { reasons: { message: string }[] }).reasons)
                          .map((r) => r.message).join(' ')
                      : '—'
                  }
                />
              </div>
            </dl>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="ep-decision-rationale">Decision rationale</Label>
            <Textarea id="ep-decision-rationale" rows={4} value={rationale}
              onChange={(e) => setRationale(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              At least 20 characters. The platform refuses a decision by the officer who requested it.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeciding(null); setRationale(''); }}>Cancel</Button>
            <Button onClick={submitDecision} disabled={rationale.trim().length < 20 || decide.isPending}
              data-testid="evidence-exception-decision-submit">
              {decide.isPending ? 'Recording…' : deciding?.decision === 'APPROVED' ? 'Approve exception' : 'Reject exception'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
