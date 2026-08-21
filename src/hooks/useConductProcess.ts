/**
 * Phase B / P08 — Conduct process read models.
 *
 * The unified Conduct work queue, the investigation case workspace and the
 * Entity 360 conduct summary all read the governed `conduct_*` RPCs. Stage,
 * service-level state, waiting-on, next action, blockers and available actions
 * are computed server-side; this layer only types and caches them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { conductInvestigationStep } from '@/lib/conductProcessOps';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* --------------------------------------------------------------- types */

export type ConductSlaState = 'on_track' | 'due_soon' | 'breached' | 'paused';
export type ConductWorkKind = 'COMPLAINT' | 'ALERT' | 'INVESTIGATION' | 'ACTION';

export const CONDUCT_KIND_LABEL: Record<ConductWorkKind, string> = {
  COMPLAINT: 'Complaints',
  ALERT: 'Conduct alerts',
  INVESTIGATION: 'Investigations',
  ACTION: 'Supervisory actions',
};

export interface ConductBlocker { code: string; label: string; href?: string }

export interface ConductQueueRow {
  item_id: string;
  kind: ConductWorkKind;
  kind_label: string;
  reference: string | null;
  subject: string | null;
  entity_id: string | null;
  entity_name: string | null;
  stage: string | null;
  stage_label: string | null;
  status: string | null;
  priority: string;
  severity: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  sla_due_at: string | null;
  sla_state: ConductSlaState;
  waiting_on: string | null;
  next_action_label: string | null;
  blockers: ConductBlocker[] | null;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface ConductQueueFilters {
  kinds?: ConductWorkKind[] | null;
  slaStates?: ConductSlaState[] | null;
  entityId?: string | null;
  assignedTo?: string | null;
  unassigned?: boolean;
  search?: string | null;
  includeClosed?: boolean;
  sort?: 'sla' | 'priority';
  limit?: number;
  offset?: number;
}

export interface ConductQueueCounts {
  total_open: number;
  breached: number;
  due_soon: number;
  unassigned: number;
  by_kind: Partial<Record<ConductWorkKind, number>>;
}

export interface ConductActionInput {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'user' | 'select';
  required: boolean;
  min_length?: number;
  options?: string[];
}

export interface ConductAvailableAction {
  action_code: string;
  label: string;
  variant: 'default' | 'outline' | 'secondary';
  enabled: boolean;
  blocked_reason: string | null;
  inputs: ConductActionInput[];
}

export interface ConductInvestigationCase {
  id: string;
  reference: string;
  subject: string;
  entity_id: string | null;
  entity_name: string | null;
  entity_href: string | null;
  stage: string;
  stage_label: string;
  stage_seq: number;
  status: string;
  is_terminal: boolean;
  priority: string;
  severity: string;
  source_type: string | null;
  source_id: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  due_date: string | null;
  sla_due_at: string | null;
  sla_state: ConductSlaState;
  waiting_on: string | null;
  scope: string | null;
  legal_basis: string | null;
  investigation_plan: string | null;
  outcome: string | null;
  closure_status: string | null;
  evidence_count: number;
  interview_count: number;
  open_action_count: number;
  last_activity_at: string | null;
  blockers: ConductBlocker[];
  available_actions: ConductAvailableAction[];
  timeline: Array<{ at: string; code: string; label: string }>;
}

/* --------------------------------------------------------------- hooks */

export const conductProcessKeys = {
  queue: (f: ConductQueueFilters) => ['conduct_work_queue', f] as const,
  counts: () => ['conduct_work_queue_counts'] as const,
  investigationCase: (id: string) => ['conduct_investigation_case', id] as const,
};

export function useConductWorkQueue(filters: ConductQueueFilters = {}) {
  return useQuery({
    queryKey: conductProcessKeys.queue(filters),
    queryFn: () => rpc<ConductQueueRow[]>('conduct_work_queue', {
      _kinds: filters.kinds ?? null,
      _sla_states: filters.slaStates ?? null,
      _entity_id: filters.entityId ?? null,
      _assigned_to: filters.assignedTo ?? null,
      _unassigned: filters.unassigned ?? false,
      _search: filters.search ?? null,
      _include_closed: filters.includeClosed ?? false,
      _sort: filters.sort ?? 'sla',
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 30_000,
  });
}

export function useConductQueueCounts() {
  return useQuery({
    queryKey: conductProcessKeys.counts(),
    queryFn: () => rpc<ConductQueueCounts>('conduct_work_queue_counts'),
    staleTime: 30_000,
  });
}

export function useConductInvestigationCase(id?: string) {
  return useQuery({
    queryKey: conductProcessKeys.investigationCase(id ?? ''),
    queryFn: () => rpc<ConductInvestigationCase>('conduct_investigation_case', { _investigation_id: id }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useConductInvestigationStep(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ actionCode, payload }: { actionCode: string; payload?: Record<string, unknown> }) =>
      conductInvestigationStep(id, actionCode, payload ?? {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conductProcessKeys.investigationCase(id) });
      queryClient.invalidateQueries({ queryKey: ['conduct_work_queue'] });
      queryClient.invalidateQueries({ queryKey: conductProcessKeys.counts() });
      queryClient.invalidateQueries({ queryKey: ['market_conduct'] });
    },
  });
}
