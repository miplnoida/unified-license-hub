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
}: {
  complaintId: string;
  status: string | null | undefined;
}) {
  const { actionsQ, closureQ } = useComplaintCurrentStepData(complaintId);
  const closure = summariseClosure(closureQ.data as any);
  const relevant = isClosurePhaseRelevant(actionsQ.data ?? [], status, closure);
  return <ClosureQaPanel complaintId={complaintId} readOnly={!relevant} />;
}

export default ComplaintClosureSection;
