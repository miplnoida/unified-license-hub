/**
 * Package A4 — canonical supervisory read models.
 *
 * Every supervisory read surface (Supervisor dashboard, Entity 360 supervisory
 * state, Team Performance) is served by the governed `sup_*` RPCs. The RPCs are
 * SECURITY INVOKER and internal-only, so RLS and permission gating still apply;
 * the client never assembles supervisory truth from ad-hoc table queries.
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

export type SupDomain = 'prudential' | 'conduct' | 'licensing' | 'returns';

export interface SupDashboardSummary {
  generated_at: string;
  domains: Partial<Record<'prudential' | 'conduct' | 'licensing', boolean>>;
  returns?: {
    awaiting_review: number;
    overdue: number;
    accepted_last_30_days: number;
    due_next_30_days: number;
  };
  prudential?: {
    current_breaches: number;
    current_ewis: number;
    awaiting_acknowledgement: number;
    entities_with_signals: number;
    open_plan_actions: number;
  };
  conduct?: {
    open_complaints: number;
    complaints_sla_breached: number;
    open_alerts: number;
    open_investigations: number;
    open_thematic_reviews: number;
    open_thematic_actions: number;
    overdue_conduct_actions: number;
    open_enforcement: number;
  };
  licensing?: {
    in_flight_applications: number;
    artifacts_total: number;
    decided_last_30_days: number;
  };
}

export interface SupWorkItem {
  kind: 'prudential_signal' | 'return_filing' | 'conduct_investigation'
    | 'conduct_action' | 'thematic_action' | 'application';
  domain: SupDomain;
  id: string;
  entity_id: string | null;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | string;
  status: string;
  due_at: string | null;
  href: string;
}

export interface SupEntitySupervisoryState {
  entity_id: string;
  generated_at: string;
  sections: { prudential: boolean; conduct: boolean; licensing: boolean };
  returns?: {
    obligations_active: number;
    filings_total: number;
    filings_awaiting_review: number;
    filings_overdue: number;
    next_due: { period_label: string; due_date: string } | null;
    latest_accepted_filing: { id: string; reference: string | null; accepted_at: string; version: number | null } | null;
  };
  prudential?: {
    current_breaches: number;
    current_ewis: number;
    unacknowledged: number;
    signals: Array<{
      id: string; metric_key: string; level: string; value: number | null;
      threshold_value: number | null; comparator: string | null; detected_at: string;
      detection_source: string | null; detection_run_id: string | null;
      return_filing_id: string | null; acknowledged_at: string | null;
      escalated_enforcement_id: string | null;
    }>;
    latest_approved_assessment: { id: string; period_end: string | null; overall_rating: string | null; status: string; approved_at: string } | null;
    open_plan_actions: number;
  };
  conduct?: {
    open_complaints: number;
    open_alerts: number;
    alerts: Array<{ id: string; title: string; kind: string | null; severity: string | null; status: string; created_at: string; investigation_id: string | null }>;
    open_investigations: number;
    investigations: Array<{ id: string; code: string | null; status: string; severity: string | null; outcome: string | null; closed_at: string | null }>;
    open_conduct_actions: number;
    conduct_actions: Array<{ id: string; title: string; action_type: string | null; status: string; due_date: string | null }>;
    thematic_reviews_in_scope: number;
    thematic_findings: number;
    open_thematic_actions: number;
    thematic: Array<{ review_id: string; code: string | null; title: string; status: string; closure_state: string | null; closed_at: string | null; findings: number; actions_open: number }>;
    open_enforcement: number;
  };
  licensing?: {
    open_applications: number;
    decision_artifacts: number;
    artifacts: Array<{ id: string; artifact_type: string; version: number | null; decision: string | null; issued_at: string | null; checksum: string | null; application_id: string }>;
    latest_decision_artifact: { id: string; artifact_type: string; version: number | null; decision: string | null; issued_at: string | null } | null;
  };
}

export interface SupTeamPerformanceOfficer {
  officer_id: string | null;
  officer_name: string | null;
  department: string | null;
  open_items: number;
  overdue_items: number;
  due_soon_items: number;
  completed_in_period: number;
  by_domain: Partial<Record<SupDomain, number>>;
}

export interface SupTeamPerformance {
  domains: Partial<Record<'prudential' | 'conduct' | 'licensing', boolean>>;
  period: { from: string; to: string };
  officers: SupTeamPerformanceOfficer[];
  unassigned: {
    breaches_awaiting_acknowledgement: number;
    complaints_unassigned_team: number;
    filings_unassigned: number;
  };
}

/* ------------------------------------------------------------------ hooks */

export function useSupDashboardSummary(enabled = true) {
  return useQuery({
    queryKey: ['sup_dashboard_summary'],
    queryFn: () => rpc<SupDashboardSummary>('sup_dashboard_summary'),
    enabled,
    staleTime: 60_000,
  });
}

export function useSupPriorityWorkQueue(limit = 25, domain: SupDomain | null = null, enabled = true) {
  return useQuery({
    queryKey: ['sup_priority_work_queue', limit, domain],
    queryFn: () => rpc<SupWorkItem[]>('sup_priority_work_queue', { _limit: limit, _domain: domain }),
    enabled,
    staleTime: 30_000,
  });
}

export function useSupEntitySupervisoryState(entityId?: string | null) {
  return useQuery({
    queryKey: ['sup_entity_supervisory_state', entityId],
    queryFn: () => rpc<SupEntitySupervisoryState>('sup_entity_supervisory_state', { _entity_id: entityId }),
    enabled: !!entityId,
    staleTime: 60_000,
  });
}

export function useSupTeamPerformance(enabled = true) {
  return useQuery({
    queryKey: ['sup_team_performance'],
    queryFn: () => rpc<SupTeamPerformance>('sup_team_performance'),
    enabled,
    staleTime: 60_000,
  });
}
