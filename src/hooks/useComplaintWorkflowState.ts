/**
 * Canonical Market Conduct complaint phase.
 *
 * The complaint no longer carries a step-action workflow: progression is driven
 * server-side by domain events (jurisdiction decision, triage confirmation,
 * plan approval, outcome readiness) through `mc_complaint_workflow_sync`.
 * `complaint_workflow_state` is the read model for where the case sits, what
 * blocks it and what happens next. The UI is read-only over it.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export type ComplaintPhaseKey =
  | 'mc_jurisdiction_assessment'
  | 'mc_triage_review'
  | 'mc_investigation_setup'
  | 'mc_investigation_casework'
  | 'mc_outcome_review'
  | 'mc_closure_qa'
  | 'mc_closed'
  | 'mc_referred_pending_outcome';

export interface ComplaintWorkflowState {
  has_instance: boolean;
  workflow_id?: string;
  instance_id?: string;
  workflow_version_id?: string | null;
  status?: string;
  phase_key?: ComplaintPhaseKey;
  phase?: string;
  phase_description?: string | null;
  public_label?: string | null;
  with_whom?: string | null;
  assigned_user_id?: string | null;
  started_at?: string | null;
  phase_updated_at?: string | null;
  operational_target?: string | null;
  sla_status?: string | null;
  blockers?: string[] | null;
  next_action?: string | null;
  what_happens_next?: string | null;
  is_terminal?: boolean;
}

/** Case-work section each phase's work is done in, for guided deep-linking. */
export const PHASE_SECTION: Record<string, 'jurisdiction' | 'triage' | 'investigation' | 'rfis' | 'closure'> = {
  mc_jurisdiction_assessment: 'jurisdiction',
  mc_triage_review: 'triage',
  mc_investigation_setup: 'investigation',
  mc_investigation_casework: 'investigation',
  mc_outcome_review: 'closure',
  mc_closure_qa: 'closure',
  mc_referred_pending_outcome: 'jurisdiction',
};

export function useComplaintWorkflowState(complaintId?: string) {
  return useQuery({
    queryKey: ['complaint_workflow_state', complaintId],
    enabled: Boolean(complaintId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await sb.rpc('complaint_workflow_state', { _complaint_id: complaintId });
      if (error) throw new Error(error.message);
      return (data ?? { has_instance: false }) as ComplaintWorkflowState;
    },
  });
}
