/**
 * Closure & QA section wrapper: decides (presentation only) whether closure
 * work is relevant yet, based on the configured workflow actions, the complaint
 * status and any closure decision already recorded. The server remains
 * authoritative for what may actually be recorded.
 */
import { ClosureQaPanel } from '@/components/complaints/ClosureQaPanel';
import { useComplaintCurrentStepData } from '@/components/complaints/ComplaintCurrentStepPanel';
import { isClosurePhaseRelevant, summariseClosure } from '@/lib/complaintWorkflow';

export function ComplaintClosureSection({
  complaintId,
  status,
  onGoToCurrentStep,
}: {
  complaintId: string;
  status: string | null | undefined;
  onGoToCurrentStep?: () => void;
}) {
  const { actionsQ, closureQ, trackingQ } = useComplaintCurrentStepData(complaintId);
  const closure = summariseClosure(closureQ.data as any);
  const actions = actionsQ.data ?? [];
  const relevant = isClosurePhaseRelevant(actions, status, closure);
  return (
    <ClosureQaPanel
      complaintId={complaintId}
      readOnly={!relevant}
      currentStepLabel={(trackingQ.data as any)?.current_step_label ?? null}
      availableActionLabels={actions.map((a) => a.label).filter(Boolean)}
      availableActions={actions}
      status={status ?? null}
      onGoToCurrentStep={onGoToCurrentStep}
    />
  );
}

export default ComplaintClosureSection;
