/**
 * EPR-02 — Prudential process read models.
 *
 * Every operational Prudential surface (dashboard portfolio, one work queue,
 * Entity 360 prudential state, assessment case workspace) reads from the
 * governed `prudential_*` SECURITY INVOKER RPCs. Business guidance — priority,
 * SLA state, stage, blockers, next action — is supplied by the server; the
 * client only formats it.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ types */

export type PrudentialWorkItemType =
  | 'BREACH' | 'EWI' | 'ASSESSMENT' | 'SUPERVISORY_ACTION'
  | 'ESCALATION' | 'STRESS_EVENT' | 'PLAN_ACTION' | 'EXAMINATION';

export type SlaState = 'on_track' | 'due_soon' | 'breached' | 'paused';

export interface PrudentialWorkItem {
  work_item_type: PrudentialWorkItemType;
  work_item_id: string;
  entity_id: string | null;
  entity_name: string | null;
  reference: string | null;
  title: string;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  owner_user_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priority_reason: string | null;
  sla_due_at: string | null;
  sla_state: SlaState;
  waiting_on: string | null;
  blocker_count: number;
  blockers: Array<{ code: string; label: string; href?: string }> | null;
  next_action_code: string | null;
  next_action_label: string | null;
  next_action_href: string | null;
  next_action_permission: string | null;
  source_type: string | null;
  source_id: string | null;
  last_activity_at: string | null;
  canonical_href: string | null;
  detail: Record<string, any> | null;
  total_count: number;
}

export interface PrudentialWorkQueueFilters {
  types?: PrudentialWorkItemType[] | null;
  entityId?: string | null;
  sectorId?: string | null;
  owner?: string | null;
  unassigned?: boolean;
  sla?: 'overdue' | 'due_soon' | 'on_track' | null;
  severity?: string[] | null;
  stage?: string | null;
  search?: string | null;
  limit?: number;
  offset?: number;
}

function queueArgs(f: PrudentialWorkQueueFilters) {
  return {
    _types: f.types && f.types.length ? f.types : null,
    _entity_id: f.entityId ?? null,
    _sector_id: f.sectorId ?? null,
    _owner: f.owner ?? null,
    _unassigned: f.unassigned ?? false,
    _sla: f.sla ?? null,
    _severity: f.severity && f.severity.length ? f.severity : null,
    _stage: f.stage ?? null,
    _search: f.search?.trim() ? f.search.trim() : null,
  };
}

export interface PrudentialWorkQueueCounts {
  generated_at: string;
  total: number;
  mine: number;
  unassigned: number;
  overdue: number;
  due_soon: number;
  critical: number;
  by_type: Record<string, number>;
  by_stage: Record<string, number>;
  by_priority: Record<string, number>;
}

export interface PrudentialPortfolio {
  generated_at: string;
  portfolio: { entities_in_scope: number; entities_with_signals: number; entities_with_breaches: number; entities_with_ewis: number };
  signals: { current_breaches: number; unacknowledged_breaches: number; open_ewis: number; stress_events: number };
  work: {
    total: number; mine: number; unassigned: number; overdue: number; due_soon: number;
    open_actions: number; overdue_actions: number; open_escalations: number;
    assessments_in_progress: number; plan_actions: number; examinations_active: number;
  };
  by_type: Record<string, number>;
  by_priority: Record<string, number>;
  workload: Array<{ owner_user_id: string | null; owner_name: string; team: string | null; items: number; overdue: number }>;
  deteriorating: Array<{ entity_id: string; entity_name: string; signals: number; open_work: number }>;
  upcoming: Array<{ work_item_type: string; title: string; entity_name: string | null; sla_due_at: string; sla_state: SlaState; href: string | null }>;
}

export interface PrudentialEntityState {
  entity_id: string;
  generated_at: string;
  allowed: boolean;
  overall_rating: string | null;
  latest_accepted_period: { period_label: string | null; period_end: string | null; filing_id: string | null; reference: string | null } | null;
  signals: { breaches: number; unacknowledged_breaches: number; ewis: number; stress_events: number };
  actions: { open: number; overdue: number; awaiting_review: number };
  escalations_open: number;
  plan_actions_open: number;
  examinations_active: number;
  current_assessment: { id: string; status: string; overall_rating: string | null; period_end: string | null; approved_at: string | null } | null;
  supervisor: { user_id: string | null; name: string | null; team: string | null; cycle: string | null; cycle_start: string | null; cycle_end: string | null } | null;
  next_required_action: {
    work_item_type: string; work_item_id: string; label: string | null; href: string | null;
    permission: string | null; title: string; sla_due_at: string | null; sla_state: SlaState; priority: string;
  } | null;
  work_items: Array<Partial<PrudentialWorkItem>>;
}

export interface CaseAction {
  code: string;
  label: string;
  to_status?: string;
  requires_reason?: boolean;
  permission?: string;
  enabled?: boolean;
}

export interface PrudentialAssessmentCase {
  found: boolean;
  generated_at?: string;
  header?: {
    reference: string; subject: string; entity_id: string; entity_href: string;
    assessment_type: string; period_start: string | null; period_end: string | null;
    stage: string; stage_label: string; status: string; status_label: string;
    overall_rating: string | null; owner_user_id: string | null; owner_name: string | null;
    team: string | null; priority: string; sla_due_at: string | null; sla_state: SlaState;
    waiting_on: string | null; last_activity_at: string | null;
  };
  blockers?: Array<{ code: string; label: string; href?: string }>;
  /** Canonical EPR-01 filing the assessment is evidenced on (null when none). */
  filing?: {
    return_filing_id: string; filing_reference: string | null; status: string | null;
    period_label: string | null; period_end: string | null;
    accepted_version_id: string | null; accepted_version_number: number | null;
    accepted_at: string | null; href: string;
  } | null;
  linked_actions?: Array<{
    id: string; reference: string | null; title: string; status: string;
    severity: string | null; due_date: string | null; href: string;
  }>;
  /**
   * Server-owned supervisory rating policy. `has_methodology: false` means the
   * platform has NO configured rating methodology, so the workspace must show
   * `message` verbatim rather than deriving a rating in the browser.
   */
  rating_guidance?: {
    has_methodology: boolean;
    suggested_rating: string | null;
    basis: string | null;
    message: string;
    detail: string | null;
  };
  evidence?: { return_filing_id: string | null; return_filing_version_id: string | null; available: boolean };
  completed_steps?: Array<{ label: string; at: string | null }>;
  available_actions?: CaseAction[];
  next_action?: { code: string; label: string };
  review_notes?: string | null;
  related_cases?: Array<{ kind: string; label: string; detail: string | null; href: string }>;
}


/* ------------------------------------------------------------------ hooks */

export function usePrudentialPortfolio() {
  return useQuery({
    queryKey: ['prudential_portfolio'],
    queryFn: () => rpc<PrudentialPortfolio>('prudential_dashboard_portfolio'),
    staleTime: 30_000,
  });
}

export function usePrudentialWorkQueue(filters: PrudentialWorkQueueFilters) {
  return useQuery({
    queryKey: ['prudential_work_queue', filters],
    queryFn: () => rpc<PrudentialWorkItem[]>('prudential_work_queue', {
      ...queueArgs(filters),
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 15_000,
  });
}

export function usePrudentialWorkQueueCounts(filters: PrudentialWorkQueueFilters) {
  const { limit: _l, offset: _o, ...rest } = filters;
  return useQuery({
    queryKey: ['prudential_work_queue_counts', rest],
    queryFn: () => rpc<PrudentialWorkQueueCounts>('prudential_work_queue_counts', queueArgs(rest)),
    staleTime: 15_000,
  });
}

export function usePrudentialEntityState(entityId?: string) {
  return useQuery({
    queryKey: ['prudential_entity_state', entityId],
    queryFn: () => rpc<PrudentialEntityState>('prudential_entity_state', { _entity_id: entityId }),
    enabled: !!entityId,
    staleTime: 30_000,
  });
}

export function usePrudentialAssessmentCase(assessmentId?: string) {
  return useQuery({
    queryKey: ['prudential_assessment_case', assessmentId],
    queryFn: () => rpc<PrudentialAssessmentCase>('prudential_assessment_case', { _assessment_id: assessmentId }),
    enabled: !!assessmentId,
    staleTime: 15_000,
  });
}
