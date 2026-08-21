/**
 * EPR-03 — Enforcement process read models (P11).
 *
 * The Enforcement work queue, case workspace and the Entity 360 enforcement
 * summary all read from the governed `enforcement_*` SECURITY INVOKER RPCs.
 * Stage, status, priority, SLA state, waiting-on, next action and blockers are
 * computed by the server from the configured stage model — this layer only
 * types and caches them.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  enforcementCaseAction,
  enforcementReferralCreate,
  type EnforcementReferralInput,
} from '@/lib/enforcementProcessOps';

const db = () => supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => any };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ types */

export type EnforcementStage =
  | 'REFERRAL' | 'ASSESSMENT' | 'NOTICE' | 'REPRESENTATIONS' | 'DECISION'
  | 'SANCTION' | 'REMEDIATION_MONITORING' | 'APPEAL' | 'CLOSED' | 'WITHDRAWN';

export type SlaState = 'on_track' | 'due_soon' | 'breached' | 'paused';

export interface EnforcementBlocker { code: string; label: string; href?: string }

export interface EnforcementQueueRow {
  case_id: string;
  case_number: string;
  entity_id: string | null;
  entity_name: string | null;
  enforcement_type: string | null;
  stage: EnforcementStage;
  stage_label: string | null;
  status: string | null;
  source_kind: string | null;
  source_reference: string | null;
  source_href: string | null;
  priority: string;
  severity: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_team: string | null;
  sla_due_at: string | null;
  sla_state: SlaState;
  waiting_on: string | null;
  next_action_code: string | null;
  next_action_label: string | null;
  blockers: EnforcementBlocker[] | null;
  penalty_amount: number | null;
  penalty_currency: string | null;
  open_obligations: number;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface EnforcementQueueFilters {
  stages?: EnforcementStage[] | null;
  sourceKinds?: string[] | null;
  slaStates?: SlaState[] | null;
  entityId?: string | null;
  assignedTo?: string | null;
  search?: string | null;
  includeClosed?: boolean;
  sort?: 'sla' | 'priority' | 'stage';
  limit?: number;
  offset?: number;
}

export interface EnforcementQueueCounts {
  total_open: number;
  breached: number;
  due_soon: number;
  unassigned: number;
  awaiting_entity: number;
  closed: number;
  by_stage: Record<string, number>;
  by_source: Record<string, number>;
  penalty_outstanding: number;
}

export interface EnforcementStageConfig {
  stage: EnforcementStage;
  label: string;
  seq: number;
  is_terminal: boolean;
  description: string | null;
  waiting_on: string | null;
  sla_days: number;
}

export interface EnforcementAvailableAction {
  action_code: string;
  label: string;
  to_stage: EnforcementStage;
  description: string | null;
  permission_action: string;
  requires_rationale: boolean;
  min_rationale_length: number;
  requires_evidence: boolean;
  requires_maker_checker: boolean;
  advances_stage: boolean;
  permitted: boolean;
}

export interface EnforcementCaseRecord {
  id: string;
  case_number: string;
  entity_id: string | null;
  entity_name: string | null;
  enforcement_type: string | null;
  stage: EnforcementStage;
  stage_label: string | null;
  stage_seq: number | null;
  is_terminal: boolean | null;
  status: string | null;
  severity: string | null;
  source_kind: string | null;
  source_reference: string | null;
  referred_by_name: string | null;
  referred_at: string | null;
  referral_reason: string | null;
  legal_basis: string | null;
  findings: string | null;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_team: string | null;
  notice_issued_at: string | null;
  notice_reference: string | null;
  representation_deadline: string | null;
  decision_at: string | null;
  decision_outcome: string | null;
  sanction_type: string | null;
  sanction_imposed_at: string | null;
  penalty_amount: number | null;
  penalty_currency: string | null;
  penalty_paid_amount: number | null;
  penalty_waived_amount: number | null;
  appeal_deadline: string | null;
  monitoring_state: string | null;
  non_compliance_flag: boolean | null;
  closed_at: string | null;
  closure_rationale: string | null;
  withdrawn_at: string | null;
  sla_due_at: string | null;
  sla_state: SlaState;
  waiting_on: string | null;
  priority: string;
  open_obligations: number;
  open_appeals: number;
  representation_count: number;
  last_activity_at: string | null;
  canonical_href: string;
  entity_href: string | null;
  source_href: string | null;
}

export interface EnforcementCaseView {
  case: EnforcementCaseRecord;
  blockers: EnforcementBlocker[];
  stage_model: EnforcementStageConfig[];
  available_actions: EnforcementAvailableAction[];
  obligations: Array<Record<string, any>>;
  representations: Array<Record<string, any>>;
  appeals: Array<Record<string, any>>;
  payments: Array<Record<string, any>>;
  timeline: Array<{
    id: string; event_type: string; actor_id: string | null; actor_name: string | null;
    note: string | null; detail: Record<string, any> | null; created_at: string;
  }>;
}

export interface EnforcementEntitySummary {
  open_cases: number;
  closed_cases: number;
  breached_sla: number;
  penalty_imposed: number;
  penalty_outstanding: number;
  open_obligations: number;
  cases: Array<{
    case_id: string; case_number: string; stage: EnforcementStage; stage_label: string | null;
    status: string | null; source_kind: string | null; source_reference: string | null;
    severity: string | null; sla_state: SlaState; sla_due_at: string | null;
    penalty_amount: number | null; penalty_currency: string | null;
    decision_outcome: string | null; closed_at: string | null; canonical_href: string;
  }>;
}

/* ------------------------------------------------------------------ hooks */

export function useEnforcementWorkQueue(filters: EnforcementQueueFilters) {
  return useQuery({
    queryKey: ['enforcement_work_queue', filters],
    queryFn: () => rpc<EnforcementQueueRow[]>('enforcement_work_queue', {
      _stages: filters.stages?.length ? filters.stages : null,
      _source_kinds: filters.sourceKinds?.length ? filters.sourceKinds : null,
      _sla_states: filters.slaStates?.length ? filters.slaStates : null,
      _entity_id: filters.entityId ?? null,
      _assigned_to: filters.assignedTo ?? null,
      _search: filters.search?.trim() ? filters.search.trim() : null,
      _include_closed: filters.includeClosed ?? false,
      _sort: filters.sort ?? 'sla',
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 15_000,
  });
}

export function useEnforcementQueueCounts() {
  return useQuery({
    queryKey: ['enforcement_work_queue_counts'],
    queryFn: () => rpc<EnforcementQueueCounts>('enforcement_work_queue_counts'),
    staleTime: 15_000,
  });
}

export function useEnforcementCase(caseId?: string) {
  return useQuery({
    queryKey: ['enforcement_case_view', caseId],
    queryFn: () => rpc<EnforcementCaseView | null>('enforcement_case', { _case_id: caseId }),
    enabled: !!caseId,
    staleTime: 10_000,
  });
}

export function useEnforcementEntitySummary(entityId?: string) {
  return useQuery({
    queryKey: ['enforcement_entity_summary', entityId],
    queryFn: () => rpc<EnforcementEntitySummary>('enforcement_entity_summary', { _entity_id: entityId }),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

/* -------------------------------------------------------------- mutations */

export function useEnforcementCaseAction(caseId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ action, payload }: { action: string; payload?: Record<string, unknown> }) =>
      enforcementCaseAction(caseId!, action, payload ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enforcement_case_view', caseId] });
      qc.invalidateQueries({ queryKey: ['enforcement_work_queue'] });
      qc.invalidateQueries({ queryKey: ['enforcement_work_queue_counts'] });
      qc.invalidateQueries({ queryKey: ['enforcement_entity_summary'] });
    },
  });
}

export function useEnforcementReferral() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EnforcementReferralInput) => enforcementReferralCreate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['enforcement_work_queue'] });
      qc.invalidateQueries({ queryKey: ['enforcement_work_queue_counts'] });
      qc.invalidateQueries({ queryKey: ['enforcement_entity_summary'] });
    },
  });
}
