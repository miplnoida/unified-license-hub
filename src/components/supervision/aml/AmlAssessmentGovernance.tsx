/**
 * Binds the assessment's methodology working file to its governed actions.
 *
 * Readiness is derived from the methodology version's own dimensions, so the
 * lifecycle panel and the working file can never disagree about what is
 * outstanding.
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  useAmlMethodologyDimensions,
  useAmlMethodologyQuestions,
  useAmlQuestionResponses,
} from '@/hooks/useAmlLifecycle';
import { AmlAssessmentActions } from '@/components/supervision/aml/AmlAssessmentActions';
import { AmlDimensionWorksheet } from '@/components/supervision/aml/AmlDimensionWorksheet';
import { AmlEvidencePolicyPanel } from '@/components/supervision/aml/AmlEvidencePolicyPanel';
import { AmlFactRegisterPanel } from '@/components/supervision/aml/AmlFactRegisterPanel';
import { AmlReadinessPanel } from '@/components/supervision/aml/AmlReadinessPanel';
import { computeAssessmentReadiness, type RecordedDimension } from '@/lib/amlAssessmentReadiness';


interface Props {
  assessmentId: string;
  entityId: string;
  entityName: string | null;
  status: string;
  methodologyId: string | null;
  dimensions: RecordedDimension[];
  attention: any[];
  plans: any[];
  onChanged: () => void;
  /** Render the working file (assessment tab) instead of the actions panel. */
  view: 'actions' | 'worksheet';
}

export function AmlAssessmentGovernance({
  assessmentId,
  entityId,
  entityName,
  status,
  methodologyId,
  dimensions,
  attention,
  plans,
  onChanged,
  view,
}: Props) {
  const { data: catalogue } = useAmlMethodologyDimensions(methodologyId);
  const { data: questions } = useAmlMethodologyQuestions(methodologyId);
  const { data: responses } = useAmlQuestionResponses(assessmentId);
  const readiness = computeAssessmentReadiness(
    catalogue ?? [],
    dimensions,
    questions ?? [],
    responses ?? [],
  );
  const st = (status ?? '').toLowerCase();
  const editable = st === 'draft' || st === 'returned_for_revision';


  if (view === 'worksheet') {
    return (
      <div className="space-y-4">
        {!editable ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Working file is read-only</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                This assessment is {st.replace(/_/g, ' ')}, so the working file can no longer be edited. It must be
                returned for revision before ratings can change.
              </p>
            </CardContent>
          </Card>
        ) : null}
        <AmlReadinessPanel assessmentId={assessmentId} />
        <AmlEvidencePolicyPanel assessmentId={assessmentId} />
        <AmlFactRegisterPanel assessmentId={assessmentId} editable={editable} />
        <AmlDimensionWorksheet
          assessmentId={assessmentId}
          entityId={entityId}
          methodologyId={methodologyId}
          recorded={dimensions}
          editable={editable}
          onChanged={onChanged}
        />
      </div>
    );
  }

  return (
    <AmlAssessmentActions
      assessmentId={assessmentId}
      entityId={entityId}
      entityName={entityName}
      status={status}
      dimensions={dimensions}
      attention={attention}
      plans={plans}
      readiness={readiness}
      onChanged={onChanged}
    />
  );
}
