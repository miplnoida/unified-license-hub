/**
 * Governed AML/CFT finding and remediation actions.
 *
 * Covers the closing half of the supervisory loop: issue a finding after
 * independent review, record the entity's management response, open a
 * corrective action, move it through its states, and conclude effectiveness
 * only through a governed independent validation.
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { AmlActionDialog } from '@/components/supervision/aml/AmlActionDialog';
import {
  useAmlFindingLifecycle,
  useOpenAmlRemediation,
  useRecordAmlFindingResponse,
  useRequireAmlReassessment,
  useTransitionAmlRemediation,
  useValidateAmlRemediation,
} from '@/hooks/useAmlLifecycle';

type DialogKind = 'lifecycle' | 'response' | 'remediation' | 'remediation_state' | 'validate' | 'reassess' | null;

const plusDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const NEXT_REMEDIATION_STATE: Record<string, string | null> = {
  OPEN: 'ACTION_PLAN_SUBMITTED',
  ACTION_PLAN_SUBMITTED: 'UNDER_REVIEW',
  UNDER_REVIEW: 'ACCEPTED',
  ACCEPTED: 'IMPLEMENTING',
  IMPLEMENTING: 'EVIDENCE_SUBMITTED',
  EVIDENCE_SUBMITTED: 'VALIDATION',
  REOPENED: 'IMPLEMENTING',
};

const STATE_LABEL: Record<string, string> = {
  ACTION_PLAN_SUBMITTED: 'Record action plan received',
  UNDER_REVIEW: 'Start review of the action plan',
  ACCEPTED: 'Accept the action plan',
  IMPLEMENTING: 'Mark implementation underway',
  EVIDENCE_SUBMITTED: 'Record completion evidence',
  VALIDATION: 'Send for independent validation',
};

interface Props {
  finding: any;
  onChanged: () => void;
}

export function AmlFindingActions({ finding, onChanged }: Props) {
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [lifecycleTo, setLifecycleTo] = useState<string>('REVIEW');
  const [action, setAction] = useState<any>(null);
  const [nextState, setNextState] = useState<string>('');

  const lifecycle = useAmlFindingLifecycle();
  const response = useRecordAmlFindingResponse();
  const openRemediation = useOpenAmlRemediation();
  const transitionRemediation = useTransitionAmlRemediation();
  const validate = useValidateAmlRemediation();
  const requireReassessment = useRequireAmlReassessment();

  const status = String(finding.status ?? '').toUpperCase();
  const actions: any[] = finding.remediation ?? [];
  const validatedEffective = actions.some((a) => String(a.effectiveness ?? '').toUpperCase() === 'EFFECTIVE');
  const close = () => setDialog(null);
  const done = (msg: string) => {
    toast.success(msg);
    onChanged();
  };

  const startLifecycle = (to: string) => {
    setLifecycleTo(to);
    setDialog('lifecycle');
  };

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
      {status === 'DRAFT' ? (
        <Button size="sm" variant="outline" onClick={() => startLifecycle('REVIEW')}>
          Submit for supervisory review
        </Button>
      ) : null}
      {status === 'REVIEW' ? (
        <Button size="sm" onClick={() => startLifecycle('ISSUED')}>
          Issue to the entity
        </Button>
      ) : null}
      {['ISSUED', 'MANAGEMENT_RESPONSE'].includes(status) && !finding.response_state ? (
        <Button size="sm" onClick={() => setDialog('response')}>
          Record management response
        </Button>
      ) : null}
      {['ISSUED', 'MANAGEMENT_RESPONSE', 'REMEDIATION_REQUIRED', 'REOPENED'].includes(status) ? (
        <Button size="sm" variant="outline" onClick={() => setDialog('remediation')}>
          Open corrective action
        </Button>
      ) : null}

      {actions.map((a) => {
        const st = String(a.status ?? '').toUpperCase();
        const next = NEXT_REMEDIATION_STATE[st] ?? null;
        return (
          <span key={a.id} className="flex flex-wrap gap-2">
            {next ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setAction(a);
                  setNextState(next);
                  setDialog('remediation_state');
                }}
              >
                {STATE_LABEL[next] ?? next} — {a.reference}
              </Button>
            ) : null}
            {st === 'VALIDATION' ? (
              <Button
                size="sm"
                onClick={() => {
                  setAction(a);
                  setDialog('validate');
                }}
              >
                Record independent validation — {a.reference}
              </Button>
            ) : null}
          </span>
        );
      })}

      {validatedEffective && status !== 'CLOSED' ? (
        <>
          <Button size="sm" variant="outline" onClick={() => setDialog('reassess')}>
            Require reassessment
          </Button>
          <Button size="sm" variant="outline" onClick={() => startLifecycle('CLOSED')}>
            Close finding
          </Button>
        </>
      ) : null}

      {/* ------------------------------------------------------- dialogs -- */}
      <AmlActionDialog
        open={dialog === 'lifecycle'}
        onOpenChange={(o) => (o ? null : close())}
        title={
          lifecycleTo === 'ISSUED'
            ? 'Issue finding to the entity'
            : lifecycleTo === 'CLOSED'
              ? 'Close finding'
              : 'Submit finding for supervisory review'
        }
        description={
          lifecycleTo === 'ISSUED'
            ? 'A finding is issued by a supervisor other than its author.'
            : undefined
        }
        fields={[{ name: 'rationale', label: 'Rationale', kind: 'textarea', required: true }]}
        submitLabel="Record"
        onSubmit={async (v) =>
          lifecycle.mutateAsync({ findingId: finding.id, toStatus: lifecycleTo, rationale: v.rationale })
        }
        onDone={() => done('Finding updated.')}
      />

      <AmlActionDialog
        open={dialog === 'response'}
        onOpenChange={(o) => (o ? null : close())}
        title="Record management response"
        description="Record the regulated entity's written response to the issued finding."
        fields={[
          {
            name: 'response_state',
            label: 'Response position',
            kind: 'select',
            required: true,
            defaultValue: 'ACCEPTED',
            options: [
              { value: 'ACCEPTED', label: 'Accepted' },
              { value: 'PARTIALLY_ACCEPTED', label: 'Partially accepted' },
              { value: 'DISPUTED', label: 'Disputed' },
            ],
          },
          { name: 'management_response', label: 'Management response', kind: 'textarea', required: true },
          { name: 'proposed_action', label: 'Proposed action', kind: 'textarea' },
          { name: 'responsible_person', label: 'Responsible person', kind: 'text', placeholder: 'Head of Compliance' },
          { name: 'target_date', label: 'Entity target date', kind: 'date', defaultValue: plusDays(60) },
        ]}
        submitLabel="Record response"
        onSubmit={async (v) =>
          response.mutateAsync({
            findingId: finding.id,
            responseState: v.response_state as any,
            managementResponse: v.management_response,
            proposedAction: v.proposed_action || null,
            responsiblePerson: v.responsible_person || null,
            targetDate: v.target_date || null,
          })
        }
        onDone={() => done('Management response recorded.')}
      />

      <AmlActionDialog
        open={dialog === 'remediation'}
        onOpenChange={(o) => (o ? null : close())}
        title="Open corrective action"
        fields={[
          { name: 'description', label: 'Required corrective action', kind: 'textarea', required: true },
          { name: 'required_outcome', label: 'Required outcome', kind: 'textarea' },
          { name: 'responsible_party', label: 'Responsible party', kind: 'text', placeholder: 'Head of Compliance' },
          { name: 'target_date', label: 'Target date', kind: 'date', required: true, defaultValue: plusDays(45) },
        ]}
        submitLabel="Open action"
        onSubmit={async (v) =>
          openRemediation.mutateAsync({
            findingId: finding.id,
            description: v.description,
            requiredOutcome: v.required_outcome || null,
            responsibleParty: v.responsible_party || null,
            targetDate: v.target_date || null,
          })
        }
        onDone={() => done('Corrective action opened against the finding.')}
      />

      <AmlActionDialog
        open={dialog === 'remediation_state'}
        onOpenChange={(o) => (o ? null : close())}
        title={STATE_LABEL[nextState] ?? 'Update corrective action'}
        description={
          nextState === 'EVIDENCE_SUBMITTED'
            ? 'Recording evidence does not conclude effectiveness — that requires an independent validation.'
            : undefined
        }
        fields={[
          { name: 'rationale', label: 'Rationale', kind: 'textarea', required: true },
          {
            name: 'entity_response',
            label: 'Entity submission',
            kind: 'textarea',
            helper: 'What the entity submitted at this step, where applicable.',
          },
          { name: 'evidence_ref', label: 'Evidence reference', kind: 'text', placeholder: 'TM-TUNING-2026' },
        ]}
        submitLabel="Record"
        onSubmit={async (v) =>
          transitionRemediation.mutateAsync({
            actionId: action.id,
            toStatus: nextState,
            rationale: v.rationale,
            entityResponse: v.entity_response || null,
            evidence: v.evidence_ref ? [{ kind: 'document', ref: v.evidence_ref }] : null,
          })
        }
        onDone={() => done('Corrective action updated.')}
      />

      <AmlActionDialog
        open={dialog === 'validate'}
        onOpenChange={(o) => (o ? null : close())}
        title="Record independent validation"
        description="Effectiveness is concluded only by re-performing a supervisory procedure on the submitted evidence."
        fields={[
          {
            name: 'conclusion',
            label: 'Conclusion',
            kind: 'select',
            required: true,
            defaultValue: 'EFFECTIVE',
            options: [
              { value: 'EFFECTIVE', label: 'Effective' },
              { value: 'PARTIALLY_EFFECTIVE', label: 'Partially effective' },
              { value: 'INEFFECTIVE', label: 'Ineffective' },
            ],
          },
          { name: 'evidence_reviewed', label: 'Evidence reviewed', kind: 'textarea', required: true },
          { name: 'procedure_applied', label: 'Procedure re-performed', kind: 'textarea', required: true },
          { name: 'rationale', label: 'Validation rationale', kind: 'textarea', required: true },
          { name: 'next_step', label: 'Next supervisory step', kind: 'textarea' },
        ]}
        submitLabel="Record validation"
        onSubmit={async (v) =>
          validate.mutateAsync({
            actionId: action.id,
            conclusion: v.conclusion as any,
            evidenceReviewed: v.evidence_reviewed,
            procedureApplied: v.procedure_applied,
            rationale: v.rationale,
            nextStep: v.next_step || null,
          })
        }
        onDone={() => done('Independent validation recorded.')}
      />

      <AmlActionDialog
        open={dialog === 'reassess'}
        onOpenChange={(o) => (o ? null : close())}
        title="Require an AML/CFT reassessment"
        description="Validated remediation means the entity's AML/CFT risk of record must be reassessed."
        fields={[
          { name: 'rationale', label: 'Trigger rationale', kind: 'textarea', required: true },
          { name: 'due_date', label: 'Due date', kind: 'date', defaultValue: plusDays(30) },
        ]}
        submitLabel="Require reassessment"
        onSubmit={async (v) =>
          requireReassessment.mutateAsync({
            entityId: finding.entity_id,
            triggerKind: 'REMEDIATION_COMPLETED',
            triggerRationale: v.rationale,
            dueDate: v.due_date || null,
            previousAssessmentId: finding.assessment_id ?? null,
            findingId: finding.id,
            remediationActionId: actions[0]?.id ?? null,
          })
        }
        onDone={() => done('Reassessment requirement recorded.')}
      />
    </div>
  );
}
