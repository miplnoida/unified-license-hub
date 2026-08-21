/**
 * Phase B / P08 — Conduct registers (remediation, alerts, findings) and the
 * conduct overview / Entity 360 conduct summary.
 *
 * Every list here is served, filtered, paged and counted by the governed
 * `conduct_*` RPCs. No screen loads a capped list and computes its own totals,
 * and no screen writes to a conduct table directly.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  conductActionStep,
  conductAlertDispose,
  conductAlertPromoteToInvestigation,
  conductFindingStep,
} from '@/lib/conductProcessOps';
import type { ConductAvailableAction, ConductBlocker, ConductSlaState } from './useConductProcess';

const sb = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------ remediation */

export interface RemediationRow {
  id: string;
  action_reference: string;
  title: string | null;
  description: string | null;
  action_type: string | null;
  source_type: string | null;
  source_id: string | null;
  source_reference: string | null;
  source_href: string | null;
  finding_id: string | null;
  finding_reference: string | null;
  entity_id: string | null;
  entity_name: string | null;
  status: string;
  stage_label: string;
  is_terminal: boolean;
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_team: string | null;
  due_date: string | null;
  sla_due_at: string | null;
  sla_state: ConductSlaState;
  is_overdue: boolean;
  evidence_status: 'outstanding' | 'received' | 'submitted';
  evidence_count: number;
  waiting_on: string | null;
  next_action_label: string | null;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface RemediationFilters {
  statuses?: string[] | null;
  sourceTypes?: string[] | null;
  entityId?: string | null;
  assignedTo?: string | null;
  unassigned?: boolean;
  overdueOnly?: boolean;
  search?: string | null;
  includeClosed?: boolean;
  limit?: number;
  offset?: number;
}

export function useRemediationRegister(filters: RemediationFilters = {}) {
  return useQuery({
    queryKey: ['conduct_action_register', filters],
    queryFn: () => rpc<RemediationRow[]>('conduct_action_register', {
      _statuses: filters.statuses ?? null,
      _source_types: filters.sourceTypes ?? null,
      _entity_id: filters.entityId ?? null,
      _assigned_to: filters.assignedTo ?? null,
      _unassigned: filters.unassigned ?? false,
      _overdue_only: filters.overdueOnly ?? false,
      _search: filters.search ?? null,
      _include_closed: filters.includeClosed ?? false,
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 30_000,
  });
}

export function useRemediationCounts(entityId?: string | null) {
  return useQuery({
    queryKey: ['conduct_action_register_counts', entityId ?? null],
    queryFn: () => rpc<Record<string, number | Record<string, number>>>('conduct_action_register_counts', {
      _entity_id: entityId ?? null,
    }),
    staleTime: 30_000,
  });
}

export interface RemediationCase extends Omit<RemediationRow, 'total_count'> {
  outcome: string | null;
  completion_notes: string | null;
  evidence_summary: string | null;
  review_outcome: string | null;
  return_reason: string | null;
  escalation_reason: string | null;
  waiver_reason: string | null;
  cancellation_reason: string | null;
  closed_at: string | null;
  created_at: string | null;
  entity_href: string | null;
  available_actions: ConductAvailableAction[];
  evidence: Array<{ id: string; title: string | null; evidence_type: string | null; restricted: boolean; uploaded_at: string | null }>;
  investigation_code: string | null;
  complaint_number: string | null;
}

export function useRemediationCase(id?: string) {
  return useQuery({
    queryKey: ['conduct_action_case', id ?? ''],
    queryFn: () => rpc<RemediationCase>('conduct_action_case', { _action_id: id }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

function useConductInvalidation() {
  const qc = useQueryClient();
  return () => {
    ['conduct_action_register', 'conduct_action_register_counts', 'conduct_action_case',
      'conduct_alert_register', 'conduct_alert_register_counts',
      'conduct_finding_register', 'conduct_finding_register_counts', 'conduct_finding_case',
      'conduct_work_queue', 'conduct_work_queue_counts', 'conduct_overview',
      'entity_conduct_summary', 'market_conduct'].forEach((key) =>
      qc.invalidateQueries({ queryKey: [key] }));
  };
}

export function useRemediationStep(id: string) {
  const invalidate = useConductInvalidation();
  return useMutation({
    mutationFn: ({ actionCode, payload }: { actionCode: string; payload?: Record<string, unknown> }) =>
      conductActionStep(id, actionCode, payload ?? {}),
    onSuccess: invalidate,
  });
}

/* ---------------------------------------------------------------- alerts */

export interface AlertRow {
  id: string;
  reference: string;
  kind: string | null;
  source: string | null;
  entity_id: string | null;
  entity_name: string | null;
  product_name: string | null;
  channel_name: string | null;
  risk_category_name: string | null;
  rule_id: string | null;
  rule_version: number | null;
  threshold_value: number | null;
  severity: string | null;
  status: string;
  disposition: string | null;
  disposition_reason: string | null;
  explanation: string | null;
  observation_start: string | null;
  observation_end: string | null;
  generated_at: string | null;
  acknowledged_by: string | null;
  acknowledged_by_name: string | null;
  acknowledged_at: string | null;
  complaint_id: string | null;
  complaint_href: string | null;
  investigation_id: string | null;
  investigation_href: string | null;
  title: string | null;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface AlertFilters {
  statuses?: string[] | null;
  severities?: string[] | null;
  entityId?: string | null;
  search?: string | null;
  includeClosed?: boolean;
  limit?: number;
  offset?: number;
}

export function useAlertRegister(filters: AlertFilters = {}) {
  return useQuery({
    queryKey: ['conduct_alert_register', filters],
    queryFn: () => rpc<AlertRow[]>('conduct_alert_register', {
      _statuses: filters.statuses ?? null,
      _severities: filters.severities ?? null,
      _entity_id: filters.entityId ?? null,
      _search: filters.search ?? null,
      _include_closed: filters.includeClosed ?? false,
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 30_000,
  });
}

export function useAlertCounts(entityId?: string | null) {
  return useQuery({
    queryKey: ['conduct_alert_register_counts', entityId ?? null],
    queryFn: () => rpc<Record<string, number>>('conduct_alert_register_counts', { _entity_id: entityId ?? null }),
    staleTime: 30_000,
  });
}

export function useAlertDispose() {
  const invalidate = useConductInvalidation();
  return useMutation({
    mutationFn: (args: {
      alertId: string;
      disposition: 'DISMISS' | 'LINK_TO_EXISTING_COMPLAINT' | 'LINK_TO_EXISTING_INVESTIGATION';
      reason: string;
      targetId?: string | null;
    }) => conductAlertDispose(args.alertId, args.disposition, args.reason, args.targetId),
    onSuccess: invalidate,
  });
}

export function useAlertPromote() {
  const invalidate = useConductInvalidation();
  return useMutation({
    mutationFn: (args: { alertId: string; rationale: string; allegation?: string | null; dueDate?: string | null }) =>
      conductAlertPromoteToInvestigation(args),
    onSuccess: invalidate,
  });
}

/* -------------------------------------------------------------- findings */

export interface FindingRow {
  id: string;
  finding_reference: string;
  title: string | null;
  source_type: string | null;
  source_id: string | null;
  source_href: string | null;
  investigation_id: string | null;
  complaint_id: string | null;
  entity_id: string | null;
  entity_name: string | null;
  category: string | null;
  severity: string | null;
  risk_rating: string | null;
  status: string;
  owner_id: string | null;
  owner_name: string | null;
  owner_team: string | null;
  remediation_required: boolean | null;
  open_remediation: number;
  evidence_count: number;
  enforcement_referred_at: string | null;
  opened_at: string | null;
  closed_at: string | null;
  last_activity_at: string | null;
  canonical_href: string;
  total_count: number;
}

export interface FindingFilters {
  statuses?: string[] | null;
  entityId?: string | null;
  sourceType?: string | null;
  investigationId?: string | null;
  complaintId?: string | null;
  search?: string | null;
  includeClosed?: boolean;
  limit?: number;
  offset?: number;
}

export function useFindingRegister(filters: FindingFilters = {}) {
  return useQuery({
    queryKey: ['conduct_finding_register', filters],
    queryFn: () => rpc<FindingRow[]>('conduct_finding_register', {
      _statuses: filters.statuses ?? null,
      _entity_id: filters.entityId ?? null,
      _source_type: filters.sourceType ?? null,
      _investigation_id: filters.investigationId ?? null,
      _complaint_id: filters.complaintId ?? null,
      _search: filters.search ?? null,
      _include_closed: filters.includeClosed ?? false,
      _limit: filters.limit ?? 50,
      _offset: filters.offset ?? 0,
    }),
    staleTime: 30_000,
  });
}

export function useFindingCounts(entityId?: string | null) {
  return useQuery({
    queryKey: ['conduct_finding_register_counts', entityId ?? null],
    queryFn: () => rpc<Record<string, number>>('conduct_finding_register_counts', { _entity_id: entityId ?? null }),
    staleTime: 30_000,
  });
}

export interface FindingCase extends Omit<FindingRow, 'total_count'> {
  description: string | null;
  regulatory_reference: string | null;
  root_cause: string | null;
  customer_impact: string | null;
  determination_rationale: string | null;
  blockers?: ConductBlocker[];
  available_actions: ConductAvailableAction[];
  timeline?: Array<{ at: string; code: string; label: string }>;
  [key: string]: unknown;
}

export function useFindingCase(id?: string) {
  return useQuery({
    queryKey: ['conduct_finding_case', id ?? ''],
    queryFn: () => rpc<FindingCase>('conduct_finding_case', { _finding_id: id }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}

export function useFindingStep(id: string) {
  const invalidate = useConductInvalidation();
  return useMutation({
    mutationFn: ({ actionCode, payload }: { actionCode: string; payload?: Record<string, unknown> }) =>
      conductFindingStep(id, actionCode, payload ?? {}),
    onSuccess: invalidate,
  });
}

/* ---------------------------------------------- overview / entity summary */

export interface ConductOverview {
  work: {
    open_total: number; breached: number; due_soon: number; unassigned: number;
    complaints_open: number; alerts_open: number; investigations_open: number;
    findings_open: number; remediation_open: number;
  };
  remediation: { overdue: number; under_review: number; escalated: number; evidence_outstanding: number };
  findings: { confirmed: number; under_analysis: number; dismissed: number; remediation_required: number };
  top_entities: Array<{ entity_id: string; entity_name: string | null; open_items: number; breached_items: number; entity_href: string }>;
}

export function useConductOverview() {
  return useQuery({
    queryKey: ['conduct_overview'],
    queryFn: () => rpc<ConductOverview>('conduct_overview'),
    staleTime: 30_000,
  });
}

export interface EntityConductSummary {
  open_items: number;
  breached_items: number;
  complaints_open: number;
  complaints_total: number;
  alerts_open: number;
  investigations_open: number;
  findings_open: number;
  remediation_open: number;
  items: Array<{
    kind: string; kind_label: string; reference: string | null; subject: string | null;
    stage_label: string | null; sla_state: ConductSlaState; assigned_to_name: string | null;
    last_activity_at: string | null; canonical_href: string;
  }>;
}

export function useEntityConductSummary(entityId?: string) {
  return useQuery({
    queryKey: ['entity_conduct_summary', entityId ?? ''],
    queryFn: () => rpc<EntityConductSummary>('entity_conduct_summary', { _entity_id: entityId }),
    enabled: Boolean(entityId),
    staleTime: 30_000,
  });
}

/* ------------------------------------------------------- complaint case */

export interface ComplaintCase {
  id: string;
  reference: string;
  subject: string | null;
  case_type: string;
  entity_id: string | null;
  entity_name: string | null;
  entity_href: string | null;
  stage: string;
  stage_label: string;
  status: string;
  status_label: string;
  owner_id: string | null;
  owner_name: string | null;
  team: string | null;
  priority: string;
  severity: string;
  sla_due_at: string | null;
  sla_state: ConductSlaState;
  is_terminal: boolean;
  waiting_on: string | null;
  next_action_label: string | null;
  blockers: ConductBlocker[];
  vulnerability_indicator: boolean | null;
  repeat_complaint_count: number | null;
  opened_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  last_activity_at: string | null;
  counts: {
    evidence: number; rfis: number; open_rfis: number; tasks: number; open_tasks: number;
    findings: number; remediation_open: number; linked_alerts: number;
  };
}

export function useComplaintCase(id?: string) {
  return useQuery({
    queryKey: ['complaint_case', id ?? ''],
    queryFn: () => rpc<ComplaintCase>('complaint_case', { _complaint_id: id }),
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
