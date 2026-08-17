/**
 * Closure & QA section wrapper: decides (presentation only) whether closure
 * work is relevant yet, based on the configured workflow actions, the complaint
 * status and any closure decision already recorded. The server remains
 * authoritative for what may actually be recorded.
 */
import { useEffect } from 'react';
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
  // Closure is gated on the configured actions, so never trust a cached empty
  // list when this section mounts — ask the server again.
  useEffect(() => {
    actionsQ.refetch();
    trackingQ.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaintId]);

  const closure = summariseClosure(closureQ.data as any);
  const actions = actionsQ.data ?? [];
  const relevant = isClosurePhaseRelevant(actions, status, closure);
  const steps = ((trackingQ.data as any)?.steps ?? []) as Array<{ step_key?: string; is_terminal?: boolean }>;
  const terminalStepKeys = steps.filter((s) => s.is_terminal).map((s) => s.step_key || '').filter(Boolean);
  return (
    <ClosureQaPanel
      complaintId={complaintId}
      readOnly={!relevant}
      currentStepLabel={(trackingQ.data as any)?.current_step_label ?? null}
      availableActionLabels={actions.map((a) => a.label).filter(Boolean)}
      availableActions={actions}
      terminalStepKeys={terminalStepKeys}
      actionsLoading={actionsQ.isLoading || actionsQ.isFetching}
      actionsError={actionsQ.isError}
      onRetryActions={() => actionsQ.refetch()}
      status={status ?? null}
      onGoToCurrentStep={onGoToCurrentStep}
    />
  );
}

export default ComplaintClosureSection;
