import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * EPIC 4 — canonical enterprise supervisory work model.
 *
 * Every queue in the platform reads the single governed model
 * `supervisory_work_item` through `supervisory_work_queue`. The model is
 * derived from the authoritative supervisory records (assessments, attention,
 * plans, interventions, examinations, findings, remediation, reassessment
 * requirements, escalations, enforcement referrals) plus the module work an
 * officer owns. No business status is duplicated client-side and no counting
 * happens here: state, priority, due dates and counts all come from the read
 * model, so a queue can never disagree with the case file it points at.
 */
export const WORK_SCOPES = [
  'MY_WORK',
  'MY_TEAM',
  'UNASSIGNED',
  'DUE_SOON',
  'OVERDUE',
  'HIGH_PRIORITY',
  'AWAITING_MY_APPROVAL',
  'ALL',
] as const;

export type WorkScope = (typeof WORK_SCOPES)[number];

export const WORK_SCOPE_LABELS: Record<WorkScope, string> = {
  MY_WORK: 'My work',
  MY_TEAM: 'My team',
  UNASSIGNED: 'Unassigned',
  DUE_SOON: 'Due soon',
  OVERDUE: 'Overdue',
  HIGH_PRIORITY: 'High priority',
  AWAITING_MY_APPROVAL: 'Awaiting my approval',
  ALL: 'All work',
};

export interface SupervisoryWorkItem {
  work_key: string;
  work_type: string;
  work_type_label: string;
  decision_point: boolean;
  source_object: string;
  source_id: string;
  reference: string | null;
  title: string | null;
  domain_code: string | null;
  entity_id: string | null;
  entity_name: string | null;
  source_status: string | null;
  work_state: string;
  opened_at: string | null;
  due_date: string | null;
  is_overdue: boolean;
  is_due_soon: boolean;
  priority: string;
  maker_id: string | null;
  record_owner_id: string | null;
  record_team_id: string | null;
  effective_owner_id: string | null;
  effective_team_id: string | null;
  is_unassigned: boolean;
  assignment_note: string | null;
  route: string;
}

export interface SupervisoryWorkQueue {
  scope: WorkScope;
  generated_at: string;
  counts: Partial<Record<WorkScope, number>>;
  items: SupervisoryWorkItem[];
}

export interface WorkQueueFilters {
  scope?: WorkScope;
  domain?: string | null;
  entityId?: string | null;
  workType?: string | null;
  limit?: number;
}

export function useSupervisoryWorkQueue(filters: WorkQueueFilters = {}) {
  const { scope = 'MY_WORK', domain = null, entityId = null, workType = null, limit = 200 } = filters;
  return useQuery({
    queryKey: ['supervisory-work-queue', scope, domain, entityId, workType, limit],
    staleTime: 30_000,
    queryFn: async (): Promise<SupervisoryWorkQueue> => {
      const { data, error } = await (supabase.rpc as any)('supervisory_work_queue', {
        _scope: scope,
        _domain: domain,
        _entity_id: entityId,
        _work_type: workType,
        _limit: limit,
      });
      if (error) throw error;
      return data as SupervisoryWorkQueue;
    },
  });
}

/** Governed assignment of a work item. Assignment only — never business status. */
export function useAssignSupervisoryWork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      workKey: string;
      assignedTo?: string | null;
      assignedTeam?: string | null;
      note?: string | null;
    }) => {
      const { data, error } = await (supabase.rpc as any)('supervisory_work_item_assign', {
        _work_key: input.workKey,
        _assigned_to: input.assignedTo ?? null,
        _assigned_team: input.assignedTeam ?? null,
        _note: input.note ?? null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supervisory-work-queue'] }),
  });
}
