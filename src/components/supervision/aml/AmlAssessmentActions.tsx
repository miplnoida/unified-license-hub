/**
 * Governed AML/CFT assessment actions.
 *
 * Renders only the actions the current lifecycle state permits and executes
 * them through the canonical supervisory operations. The database remains the
 * authority on who may act: maker/checker separation, supervisory scope and
 * rationale/evidence discipline are enforced there, and a refusal is shown to
 * the officer verbatim.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AmlActionDialog,
  CONTROL_OPTIONS,
  GRADE_OPTIONS,
  RATING_OPTIONS,
  TREND_OPTIONS,
  type AmlField,
} from '@/components/supervision/aml/AmlActionDialog';
import {
  useAmlPlanLifecycle,
  useConfirmAmlAttentionPriority,
  useOpenAmlAttention,
  useOpenAmlPlan,
  useRequireAmlReassessment,
  useSaveAmlDimension,
  useTransitionAmlAssessment,
} from '@/hooks/useAmlLifecycle';

type DialogKind =
  | 'dimension'
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
  onChanged,
}: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [planTarget, setPlanTarget] = useState<{ id: string; toStatus: string } | null>(null);
  const [attentionTarget, setAttentionTarget] = useState<string | null>(null);

  const saveDimension = useSaveAmlDimension();
  const transition = useTransitionAmlAssessment();
  const openAttention = useOpenAmlAttention();
  const confirmPriority = useConfirmAmlAttentionPriority();
  const openPlan = useOpenAmlPlan();
  const planLifecycle = useAmlPlanLifecycle();
  const requireReassessment = useRequireAmlReassessment();

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

  const dimensionFields: AmlField[] = [
    {
      name: 'dimension_code',
      label: 'Risk or control area',
      kind: 'text',
      required: true,
      placeholder: 'TRANSACTION_MONITORING',
      helper: 'Use the methodology dimension code, for example CUSTOMER_RISK or CDD_KYC.',
    },
    {
      name: 'dimension_group',
      label: 'Dimension group',
      kind: 'select',
      required: true,
      defaultValue: 'INHERENT_RISK',
      options: [
        { value: 'INHERENT_RISK', label: 'Inherent risk' },
        { value: 'CONTROL_EFFECTIVENESS', label: 'Control effectiveness' },
      ],
    },
    { name: 'inherent_rating', label: 'Inherent rating', kind: 'select', options: RATING_OPTIONS },
    { name: 'control_rating', label: 'Control rating', kind: 'select', options: CONTROL_OPTIONS },
    {
      name: 'residual_rating',
      label: 'Residual rating (judged)',
      kind: 'select',
      required: true,
      options: RATING_OPTIONS,
    },
    { name: 'weight', label: 'Weight', kind: 'number', placeholder: '0.20' },
    { name: 'rationale', label: 'Supervisory rationale', kind: 'textarea', required: true },
    {
      name: 'source_facts',
      label: 'Source facts tested',
      kind: 'textarea',
      helper: 'The observed facts that support the rating.',
    },
    {
      name: 'evidence_ref',
      label: 'Evidence reference',
      kind: 'text',
      placeholder: 'AML-STAT-RETURN-Q4',
      helper: 'Return, workpaper or document reference held on file.',
    },
    { name: 'trend', label: 'Trend', kind: 'select', defaultValue: 'STABLE', options: TREND_OPTIONS },
    { name: 'confidence', label: 'Confidence', kind: 'select', defaultValue: 'MEDIUM', options: GRADE_OPTIONS },
    { name: 'data_quality', label: 'Data quality', kind: 'select', defaultValue: 'MEDIUM', options: GRADE_OPTIONS },
    {
      name: 'override_reason',
      label: 'Override rationale',
      kind: 'textarea',
      helper: 'Required only where the judged rating departs from the calculated rating.',
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Supervisory actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <Button size="sm" onClick={() => setDialog('dimension')}>
                Record risk or control rating
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('submit')} disabled={dimensions.length === 0}>
                Submit for supervisory review
              </Button>
            </>
          ) : null}

          {st === 'submitted' ? (
            <>
              <Button size="sm" onClick={() => setDialog('review')}>
                Mark reviewed
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('return')}>
                Return for revision
              </Button>
            </>
          ) : null}

          {st === 'reviewed' ? (
            <>
              <Button size="sm" onClick={() => setDialog('approve')}>
                Approve assessment
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('return')}>
                Return for revision
              </Button>
            </>
          ) : null}

          {st === 'approved' ? (
            <>
              <Button size="sm" onClick={() => setDialog('attention')}>
                Raise supervisory attention
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDialog('reassess')}>
                Require reassessment
              </Button>
            </>
          ) : null}

          {unconfirmedAttention.map((a) => (
            <Button
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
          ))}

          {confirmedAttention
            .filter((a) => !plans.some((p) => p.attention_id === a.id))
            .map((a) => (
              <Button
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
            ))}

          {plans.map((p) => {
            const s = String(p.status ?? '').toUpperCase();
            const next = s === 'DRAFT' ? 'SUBMITTED' : s === 'SUBMITTED' ? 'APPROVED' : s === 'APPROVED' ? 'ACTIVE' : null;
            if (!next) return null;
            return (
              <Button
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
          a plan or an examination.
        </p>
      </CardContent>

      {/* --------------------------------------------------------- dialogs -- */}
      <AmlActionDialog
        open={dialog === 'dimension'}
        onOpenChange={(o) => (o ? null : close())}
        title="Record a risk or control rating"
        description="Ratings are recorded against the AML/CFT methodology with the rationale and evidence that support them."
        fields={dimensionFields}
        submitLabel="Save rating"
        onSubmit={async (v) =>
          saveDimension.mutateAsync({
            assessmentId,
            dimensionCode: v.dimension_code.trim().toUpperCase().replace(/\s+/g, '_'),
            dimensionGroup: v.dimension_group,
            inherentRating: v.inherent_rating || null,
            controlRating: v.control_rating || null,
            residualRating: v.residual_rating,
            weight: v.weight ? Number(v.weight) : null,
            rationale: v.rationale,
            sourceFacts: v.source_facts || null,
            evidenceRefs: v.evidence_ref ? [{ kind: 'document', ref: v.evidence_ref }] : null,
            trend: v.trend || null,
            confidence: v.confidence || null,
            dataQuality: v.data_quality || null,
            calculatedInherentRating: v.inherent_rating || null,
            calculatedControlRating: v.control_rating || null,
            calculatedResidualRating: v.residual_rating || null,
            overrideReason: v.override_reason || null,
          })
        }
        onDone={() => done('Rating recorded on the assessment.')}
      />

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
        open={dialog === 'approve'}
        onOpenChange={(o) => (o ? null : close())}
        title="Approve assessment"
        description="The approved residual rating becomes the entity's authoritative AML/CFT risk of record."
        fields={[
          {
            name: 'residual_rating',
            label: 'Approved residual rating',
            kind: 'select',
            required: true,
            options: RATING_OPTIONS,
          },
          { name: 'next_review_date', label: 'Next review date', kind: 'date', defaultValue: plusDays(365) },
          { name: 'rationale', label: 'Approval rationale', kind: 'textarea', required: true },
        ]}
        submitLabel="Approve"
        onSubmit={async (v) =>
          transition.mutateAsync({
            assessmentId,
            toStatus: 'approved',
            rationale: v.rationale,
            residualRating: v.residual_rating,
            nextReviewDate: v.next_review_date || null,
          })
        }
        onDone={() => done('Assessment approved — the AML/CFT risk of record is updated.')}
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
