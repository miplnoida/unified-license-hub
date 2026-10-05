/**
 * Governed AML/CFT assessment actions.
 *
 * Renders only the actions the current lifecycle state AND the officer's
 * `aml_supervision` capabilities permit — capabilities, never role names, so a
 * regulator can re-map who does what without a code change. The database
 * remains the authority: maker/checker separation, supervisory scope and
 * rationale/evidence discipline are enforced there, and a refusal is shown to
 * the officer verbatim.
 *
 * Ratings themselves are not captured here. They are recorded in the working
 * file against the configured methodology dimensions, so this panel governs
 * only the movement of the assessment through its lifecycle.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle2, Lock, XCircle } from 'lucide-react';
import {
  AmlActionDialog,
} from '@/components/supervision/aml/AmlActionDialog';
import {
  useAmlPlanLifecycle,
  useConfirmAmlAttentionPriority,
  useOpenAmlAttention,
  useOpenAmlPlan,
  useRequireAmlReassessment,
  useTransitionAmlAssessment,
} from '@/hooks/useAmlLifecycle';
import { useCan } from '@/hooks/useCan';
import { useAssessmentReadiness } from '@/hooks/useAssessmentEvidenceBasis';
import type { AssessmentReadiness } from '@/lib/amlAssessmentReadiness';

type DialogKind =
  | 'submit'
  | 'review'
  | 'return'
  | 'approve'
  | 'attention'
  | 'priority'
  | 'plan'
  | 'plan_lifecycle'
  | 'reassess'
  | null;

interface Props {
  assessmentId: string;
  entityId: string;
  entityName: string | null;
  status: string;
  dimensions: any[];
  attention: any[];
  plans: any[];
  readiness: AssessmentReadiness;
  onChanged: () => void;
}


const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export function AmlAssessmentActions({
  assessmentId,
  entityId,
  entityName,
  status,
  dimensions,
  attention,
  plans,
  readiness,
  onChanged,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [planTarget, setPlanTarget] = useState<{ id: string; toStatus: string } | null>(null);
  const [attentionTarget, setAttentionTarget] = useState<string | null>(null);

  const transition = useTransitionAmlAssessment();
  const openAttention = useOpenAmlAttention();
  const confirmPriority = useConfirmAmlAttentionPriority();
  const openPlan = useOpenAmlPlan();
  const planLifecycle = useAmlPlanLifecycle();
  const requireReassessment = useRequireAmlReassessment();

  /* Capability-based gating. The database re-checks each of these. */
  const canSubmit = useCan('aml_supervision', 'submit');
  const canReview = useCan('aml_supervision', 'review');
  const canApprove = useCan('aml_supervision', 'approve');
  const canCreate = useCan('aml_supervision', 'create');

  /* Submission readiness is the platform's decision, not this screen's. */
  const serverReadiness = useAssessmentReadiness(assessmentId);
  const submissionReady = serverReadiness.data ? serverReadiness.data.can_submit : false;

  const st = (status ?? '').toLowerCase();
  const editable = st === 'draft' || st === 'returned_for_revision';
  const highDimensions = dimensions.filter((d) =>
    ['high', 'medium_high'].includes(String(d.residual_rating ?? '').toLowerCase()),
  );
  const unconfirmedAttention = attention.filter((a) => !a.confirmed_priority);
  const confirmedAttention = attention.filter((a) => a.confirmed_priority);

  const close = () => setDialog(null);
  const done = (message: string) => {
    toast.success(message);
    onChanged();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Supervisory actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {editable ? (
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Submission readiness</span>
              <span className="font-mono text-xs text-muted-foreground">
                {readiness.assessedDimensions} / {readiness.totalDimensions} dimensions assessed
              </span>
            </div>
            <ul className="mt-2 space-y-1">
              {readiness.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-sm">
                  {c.satisfied ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  )}
                  <span>
                    {c.label}
                    <span className="ml-1 text-xs text-muted-foreground">— {c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {editable ? (
            canSubmit ? (
              <Button
                data-rbac="aml_supervision.submit"
                size="sm"
                onClick={() => setDialog('submit')}
                disabled={!submissionReady}
                title={submissionReady ? undefined : 'The platform still lists outstanding items for this assessment.'}
              >
                Submit for supervisory review
              </Button>
            ) : (
              <Button data-rbac="aml_supervision.submit" size="sm" variant="outline" disabled>
                <Lock className="mr-1.5 h-3.5 w-3.5" />
                Submission requires the AML/CFT submit capability
              </Button>
            )
          ) : null}

          {st === 'submitted' && canReview ? (
            <>
              <Button data-rbac="aml_supervision.review" size="sm" onClick={() => setDialog('review')}>
                Mark reviewed
              </Button>
              <Button data-rbac="aml_supervision.review" size="sm" variant="outline" onClick={() => setDialog('return')}>
                Return for revision
              </Button>
            </>
          ) : null}

          {st === 'reviewed' && canApprove ? (
            <>
              <p className="text-sm text-muted-foreground" data-testid="aml-approve-via-review">
                Approve from the Review tab. The approved rating is the calculated result, or an override approved by a second person.
              </p>
              <Button data-rbac="aml_supervision.approve" size="sm" variant="outline" onClick={() => setDialog('return')}>
                Return for revision
              </Button>
            </>
          ) : null}

          {st === 'approved' && canCreate ? (
            <>
              <Button data-rbac="aml_supervision.create" size="sm" onClick={() => setDialog('attention')}>
                Raise supervisory attention
              </Button>
              <Button data-rbac="aml_supervision.create" size="sm" variant="outline" onClick={() => setDialog('reassess')}>
                Require reassessment
              </Button>
            </>
          ) : null}

          {(st === 'submitted' && !canReview) || (st === 'reviewed' && !canApprove) ? (
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                This assessment is awaiting a decision from an officer holding the AML/CFT{' '}
                {st === 'submitted' ? 'review' : 'approval'} capability.
              </AlertDescription>
            </Alert>
          ) : null}

          {canCreate
            ? unconfirmedAttention.map((a) => (
                <Button data-rbac="aml_supervision.create"
                  key={`p-${a.id}`}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAttentionTarget(a.id);
                    setDialog('priority');
                  }}
                >
                  Confirm priority — {a.reference}
                </Button>
              ))
            : null}

          {canCreate
            ? confirmedAttention
                .filter((a) => !plans.some((p) => p.attention_id === a.id))
                .map((a) => (
                  <Button data-rbac="aml_supervision.create"
                    key={`pl-${a.id}`}
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setAttentionTarget(a.id);
                      setDialog('plan');
                    }}
                  >
                    Create supervisory plan — {a.reference}
                  </Button>
                ))
            : null}

          {plans.map((p) => {
            const s = String(p.status ?? '').toUpperCase();
            const next = s === 'DRAFT' ? 'SUBMITTED' : s === 'SUBMITTED' ? 'APPROVED' : s === 'APPROVED' ? 'ACTIVE' : null;
            if (!next) return null;
            const permitted = next === 'SUBMITTED' ? canSubmit : next === 'APPROVED' ? canApprove : canCreate;
            if (!permitted) return null;
            return (
              <Button data-rbac={`aml_supervision.${next === 'SUBMITTED' ? 'submit' : next === 'APPROVED' ? 'approve' : 'create'}`}
                key={`pls-${p.id}`}
                size="sm"
                variant="outline"
                onClick={() => {
                  setPlanTarget({ id: p.id, toStatus: next });
                  setDialog('plan_lifecycle');
                }}
              >
                {next === 'SUBMITTED' ? 'Submit plan' : next === 'APPROVED' ? 'Approve plan' : 'Activate plan'} — {p.reference}
              </Button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Actions available to you depend on the lifecycle state and on maker/checker separation: the officer who
          records the ratings cannot approve them, and the assessment must be approved before it can drive attention,
          a plan or an examination. Ratings are recorded in the working file against the methodology's own dimensions.
        </p>
      </CardContent>

      {/* --------------------------------------------------------- dialogs -- */}


      <AmlActionDialog
        open={dialog === 'submit'}
        onOpenChange={(o) => (o ? null : close())}
        title="Submit for supervisory review"
        fields={[{ name: 'rationale', label: 'Submission note', kind: 'textarea', required: true }]}
        submitLabel="Submit"
        onSubmit={async (v) =>
          transition.mutateAsync({ assessmentId, toStatus: 'submitted', rationale: v.rationale })
        }
        onDone={() => done('Assessment submitted for supervisory review.')}
      />

      <AmlActionDialog
        open={dialog === 'review'}
        onOpenChange={(o) => (o ? null : close())}
        title="Mark reviewed"
        description="Confirm that the ratings are supported by the evidence on file."
        fields={[{ name: 'rationale', label: 'Review conclusion', kind: 'textarea', required: true }]}
        submitLabel="Mark reviewed"
        onSubmit={async (v) => transition.mutateAsync({ assessmentId, toStatus: 'reviewed', rationale: v.rationale })}
        onDone={() => done('Assessment marked as reviewed.')}
      />

      <AmlActionDialog
        open={dialog === 'return'}
        onOpenChange={(o) => (o ? null : close())}
        title="Return for revision"
        fields={[{ name: 'rationale', label: 'What must be revised', kind: 'textarea', required: true }]}
        submitLabel="Return"
        onSubmit={async (v) =>
          transition.mutateAsync({ assessmentId, toStatus: 'returned_for_revision', rationale: v.rationale })
        }
        onDone={() => done('Assessment returned to the officer for revision.')}
      />

      <AmlActionDialog
        open={dialog === 'attention'}
        onOpenChange={(o) => (o ? null : close())}
        title="Raise supervisory attention"
        description={`Attention is raised on ${entityName ?? 'this entity'} from the approved assessment, carrying its evidence forward.`}
        fields={[
          {
            name: 'title',
            label: 'Attention title',
            kind: 'text',
            required: true,
            defaultValue: 'AML/CFT control weakness requiring supervisory attention',
          },
          {
            name: 'dimension_id',
            label: 'Driving risk area',
            kind: 'select',
            options: [
              { value: 'none', label: 'Whole assessment' },
              ...highDimensions.map((d) => ({ value: d.id, label: String(d.dimension_code) })),
            ],
            defaultValue: highDimensions[0]?.id ?? 'none',
          },
          { name: 'basis', label: 'Supervisory basis', kind: 'textarea', required: true },
          {
            name: 'materiality',
            label: 'Materiality',
            kind: 'select',
            defaultValue: 'high',
            options: [
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ],
          },
          {
            name: 'urgency',
            label: 'Urgency',
            kind: 'select',
            defaultValue: 'high',
            options: [
              { value: 'high', label: 'High' },
              { value: 'medium', label: 'Medium' },
              { value: 'low', label: 'Low' },
            ],
          },
          { name: 'target_review_date', label: 'Target review date', kind: 'date', defaultValue: plusDays(30) },
        ]}
        submitLabel="Raise attention"
        onSubmit={async (v) =>
          openAttention.mutateAsync({
            title: v.title,
            supervisoryBasis: v.basis,
            entityId,
            assessmentId,
            assessmentDimensionId: v.dimension_id && v.dimension_id !== 'none' ? v.dimension_id : null,
            materiality: v.materiality,
            urgency: v.urgency,
            targetReviewDate: v.target_review_date || null,
          })
        }
        onDone={() => done('Supervisory attention raised from this assessment.')}
      />

      <AmlActionDialog
        open={dialog === 'priority'}
        onOpenChange={(o) => (o ? null : close())}
        title="Confirm supervisory priority"
        description="A human decision is required before the platform's calculated priority drives supervisory work."
        fields={[
          {
            name: 'priority',
            label: 'Confirmed priority',
            kind: 'select',
            required: true,
            defaultValue: 'IMMEDIATE',
            options: [
              { value: 'IMMEDIATE', label: 'Immediate' },
              { value: 'HIGH', label: 'High' },
              { value: 'PLANNED', label: 'Planned' },
              { value: 'MONITOR', label: 'Monitor' },
            ],
          },
          { name: 'rationale', label: 'Confirmation rationale', kind: 'textarea', required: true },
        ]}
        submitLabel="Confirm priority"
        onSubmit={async (v) =>
          confirmPriority.mutateAsync({
            attentionId: attentionTarget as string,
            priority: v.priority,
            rationale: v.rationale,
          })
        }
        onDone={() => done('Priority confirmed.')}
      />

      <AmlActionDialog
        open={dialog === 'plan'}
        onOpenChange={(o) => (o ? null : close())}
        title="Create supervisory plan"
        fields={[
          {
            name: 'title',
            label: 'Plan title',
            kind: 'text',
            required: true,
            defaultValue: 'AML/CFT supervisory plan — targeted review',
          },
          { name: 'basis', label: 'Factual basis', kind: 'textarea', required: true },
          { name: 'objective', label: 'Supervisory objective', kind: 'textarea', required: true },
          { name: 'target_completion', label: 'Target completion', kind: 'date', defaultValue: plusDays(120) },
        ]}
        submitLabel="Create plan"
        onSubmit={async (v) =>
          openPlan.mutateAsync({
            title: v.title,
            factualBasis: v.basis,
            objective: v.objective,
            attentionId: attentionTarget as string,
            assessmentId,
            entityId,
            targetCompletion: v.target_completion || null,
          })
        }
        onDone={() => done('Supervisory plan created.')}
      />

      <AmlActionDialog
        open={dialog === 'plan_lifecycle'}
        onOpenChange={(o) => (o ? null : close())}
        title={`Move plan to ${planTarget?.toStatus ?? ''}`}
        fields={[{ name: 'rationale', label: 'Decision rationale', kind: 'textarea', required: true }]}
        submitLabel="Record decision"
        onSubmit={async (v) =>
          planLifecycle.mutateAsync({
            planId: planTarget!.id,
            toStatus: planTarget!.toStatus,
            rationale: v.rationale,
          })
        }
        onDone={() => done('Plan decision recorded.')}
      />

      <AmlActionDialog
        open={dialog === 'reassess'}
        onOpenChange={(o) => (o ? null : close())}
        title="Require an AML/CFT reassessment"
        description="A reassessment requirement schedules a fresh assessment; it does not itself change the risk of record."
        fields={[
          {
            name: 'trigger_kind',
            label: 'Trigger',
            kind: 'select',
            required: true,
            defaultValue: 'MATERIAL_CHANGE',
            options: [
              { value: 'REMEDIATION_COMPLETED', label: 'Remediation completed' },
              { value: 'MATERIAL_CHANGE', label: 'Material change' },
              { value: 'EXAMINATION_OUTCOME', label: 'Examination outcome' },
              { value: 'PERIODIC_CYCLE', label: 'Periodic cycle' },
            ],
          },
          { name: 'rationale', label: 'Trigger rationale', kind: 'textarea', required: true },
          { name: 'due_date', label: 'Due date', kind: 'date', defaultValue: plusDays(30) },
        ]}
        submitLabel="Require reassessment"
        onSubmit={async (v) =>
          requireReassessment.mutateAsync({
            entityId,
            triggerKind: v.trigger_kind,
            triggerRationale: v.rationale,
            dueDate: v.due_date || today(),
            previousAssessmentId: assessmentId,
          })
        }
        onDone={() => done('Reassessment requirement recorded.')}
      />
    </Card>
  );
}
