/**
 * OS-02 — Continuous Offsite Supervision monitoring register (read only).
 *
 * ONE OBJECT — MANY VIEWS. There is no monitoring case, no monitoring table and
 * no monitoring risk model: every figure on the register is derived live by the
 * governed read contract `supervisory_monitoring_register` from the canonical
 * supervisory objects (entity risk state, approved assessments, reassessment
 * requirements, reporting obligations/periods/filings, signals, attention,
 * examinations/plans/interventions, findings, remediation, work items and
 * supervision assignments).
 *
 * The browser never assembles supervisory truth: it never reads those tables
 * directly, never computes a risk rating, never derives a due date and never
 * scores an entity. Domain visibility, entity/regulator scope and the internal
 * authority boundary are enforced server-side (`sup_read_guard` /
 * `sup_domain_readable`), so an unauthorised domain is simply never returned.
 *
 * One aggregated server call per page — never one query per row.
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

/* --------------------------------------------------------------- types */

export interface MonitoringSourceRef {
  id?: string | null;
  reference?: string | null;
  route?: string | null;
  source_object?: string | null;
}

export interface MonitoringRiskBlock extends MonitoringSourceRef {
  residual_rating: string | null;
  inherent_rating: string | null;
  control_rating: string | null;
  trend: string | null;
  previous_rating: string | null;
  effective_from: string | null;
  last_review_date: string | null;
  driving_assessment_id: string | null;
  driving_assessment_approved_at: string | null;
}

export interface MonitoringAssessmentBlock extends MonitoringSourceRef {
  assessment_type: string | null;
  assessment_date: string | null;
  methodology_id: string | null;
  methodology_version: string | null;
  approved_at: string | null;
  period_end: string | null;
}

export interface MonitoringReassessmentBlock {
  id: string;
  status: string | null;
  due_date: string | null;
  trigger_kind: string | null;
  requested_type: string | null;
  created_at: string | null;
  is_overdue: boolean;
  due_basis: 'CANONICAL_REQUIREMENT_DUE_DATE' | 'NOT_SCHEDULED' | string;
}

export type MonitoringReturnsState = 'CLEAN' | 'LATE' | 'MISSING' | 'NOT_AVAILABLE' | string;

export interface MonitoringReturnsBlock {
  state: MonitoringReturnsState;
  reason?: string | null;
  domain_linkage: 'NONE' | 'ENTITY_LEVEL_ONLY' | string;
  periods_due?: number;
  filed?: number;
  late?: number;
  missing?: number;
  accepted?: number;
  latest_period_label?: string | null;
  latest_period_end?: string | null;
  latest_submission_at?: string | null;
  source_object?: string | null;
}

export interface MonitoringSignalsBlock {
  count: number;
  material: number;
  latest_detected_at: string | null;
  top_signal_id: string | null;
  top_severity: string | null;
  source_object: string;
}

export interface MonitoringAttentionBlock extends MonitoringSourceRef {
  open_count: number;
  priority: string | null;
  status: string | null;
  updated_at: string | null;
}

export interface MonitoringEngagementBlock extends MonitoringSourceRef {
  title: string | null;
  stage: string | null;
  engagement_type: string | null;
  updated_at: string | null;
}

export interface MonitoringFindingsBlock {
  open: number;
  material: number;
  highest_severity: string | null;
  oldest_open_at: string | null;
  oldest_open_age_days: number | null;
  top_finding_id: string | null;
  source_object: string;
}

export interface MonitoringRemediationBlock {
  open: number;
  overdue: number;
  earliest_target_date: string | null;
  top_remediation_id: string | null;
  source_object: string;
}

export interface MonitoringWorkBlock {
  open_items: number;
  next_item: {
    work_key: string;
    work_type: string;
    work_type_label: string;
    reference: string | null;
    due_date: string | null;
    is_overdue: boolean;
    owner_id: string | null;
    team_id: string | null;
    route: string;
  } | null;
  source_object: string;
}

export interface MonitoringOwnerBlock {
  lead_supervisor_id: string | null;
  lead_supervisor_name: string | null;
  team_id: string | null;
  team_name: string | null;
  assignment_effective_from: string | null;
  source_object: string;
}

export interface MonitoringFlag {
  code: string;
  label: string;
  source_object: string;
  source_id: string | null;
  source_date: string | null;
  reason: string;
}

export interface MonitoringFreshness {
  risk_effective_at: string | null;
  risk_updated_at: string | null;
  assessment_approved_at: string | null;
  assessment_period_end: string | null;
  returns_reporting_period_end: string | null;
  returns_latest_submission_at: string | null;
  signal_latest_detected_at: string | null;
  attention_updated_at: string | null;
  findings_updated_at: string | null;
  remediation_updated_at: string | null;
  engagement_updated_at: string | null;
  entity_updated_at: string | null;
}

export type MonitoringDuePosition = 'DUE' | 'OVERDUE' | 'NOT_SCHEDULED' | 'NO_DUE_POLICY' | string;

export interface MonitoringRow {
  row_key: string;
  entity_id: string;
  entity_name: string;
  business_reference: string | null;
  entity_status: string | null;
  sector_id: string | null;
  sector_name: string | null;
  sector_code: string | null;
  regulator_id: string | null;
  regulator_name: string | null;
  domain_code: string;
  risk: MonitoringRiskBlock | null;
  assessment: MonitoringAssessmentBlock | null;
  reassessment: MonitoringReassessmentBlock | null;
  due_position: MonitoringDuePosition;
  returns: MonitoringReturnsBlock;
  signals: MonitoringSignalsBlock | null;
  attention: MonitoringAttentionBlock | null;
  engagement: MonitoringEngagementBlock | null;
  plan: MonitoringSourceRef & { status?: string | null } | null;
  intervention: (MonitoringSourceRef & { intervention_type?: string | null; status?: string | null }) | null;
  findings: MonitoringFindingsBlock;
  remediation: MonitoringRemediationBlock;
  work: MonitoringWorkBlock;
  owner: MonitoringOwnerBlock;
  freshness: MonitoringFreshness;
  attention_required: boolean;
  flags: MonitoringFlag[];
  route: string;
}

export interface MonitoringCoverageRow {
  domain_code: string;
  risk: string;
  assessment: string;
  reassessment: string;
  returns: string;
  signals: string;
  attention: string;
  engagement: string;
  findings: string;
  remediation: string;
  work: string;
}

export interface MonitoringSummary {
  rows_in_scope: number;
  entities_in_scope: number;
  reassessment_required: number;
  reassessment_overdue: number;
  returns_late: number;
  returns_missing: number;
  returns_not_available: number;
  open_attention: number;
  material_signals: number;
  active_engagements: number;
  active_offsite_reviews: number;
  open_findings: number;
  overdue_remediation: number;
  unassessed: number;
}

export interface MonitoringRegisterResult {
  generated_at: string;
  authorised_domains: string[];
  total_count: number;
  page: number;
  page_size: number;
  sort: { key: string; direction: 'asc' | 'desc' };
  summary: MonitoringSummary;
  rows: MonitoringRow[];
  coverage: MonitoringCoverageRow[];
  sources: Record<string, string>;
}

export interface MonitoringOptions {
  generated_at: string;
  domains: string[];
  regulators: Array<{ id: string; name: string }>;
  sectors: Array<{ id: string; name: string; code: string | null }>;
  risk_ratings: string[];
  engagement_types: string[];
  attention_states: string[];
  reassessment_states: string[];
  returns_states: string[];
  sort_keys: string[];
  teams: Array<{ id: string; name: string | null }>;
}

export interface MonitoringRegisterParams {
  domain?: string | null;
  regulatorId?: string | null;
  sectorId?: string | null;
  risk?: string | null;
  attentionState?: string | null;
  reassessmentState?: string | null;
  returnsState?: string | null;
  engagementType?: string | null;
  openFinding?: boolean | null;
  overdueRemediation?: boolean | null;
  ownerId?: string | null;
  teamId?: string | null;
  search?: string | null;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/* --------------------------------------------------------------- reads */

export function useSupervisoryMonitoringRegister(params: MonitoringRegisterParams) {
  const args = {
    _domain: params.domain ?? null,
    _regulator_id: params.regulatorId ?? null,
    _sector_id: params.sectorId ?? null,
    _risk: params.risk ?? null,
    _attention_state: params.attentionState ?? null,
    _reassessment_state: params.reassessmentState ?? null,
    _returns_state: params.returnsState ?? null,
    _engagement_type: params.engagementType ?? null,
    _open_finding: params.openFinding ?? null,
    _overdue_remediation: params.overdueRemediation ?? null,
    _owner_id: params.ownerId ?? null,
    _team_id: params.teamId ?? null,
    _search: params.search?.trim() || null,
    _sort_key: params.sortKey ?? 'entity',
    _sort_direction: params.sortDirection ?? 'asc',
    _page: params.page ?? 1,
    _page_size: params.pageSize ?? 25,
  };
  return useQuery({
    queryKey: ['supervisory-monitoring-register', args],
    staleTime: 30_000,
    queryFn: () => rpc<MonitoringRegisterResult>('supervisory_monitoring_register', args),
  });
}

export function useSupervisoryMonitoringOptions() {
  return useQuery({
    queryKey: ['supervisory-monitoring-register-options'],
    staleTime: 5 * 60_000,
    queryFn: () => rpc<MonitoringOptions>('supervisory_monitoring_register_options'),
  });
}

/* --------------------------------------------------------------- labels */

/** Presentation only — the ordinal used by the server for risk sorting. */
export const RISK_ORDER = ['LOW', 'MEDIUM', 'MEDIUM_HIGH', 'HIGH', 'SEVERE', 'CRITICAL'];

export function humanize(value?: string | null): string {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

export function formatDate(value?: string | null): string {
  if (!value) return 'Not available';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not available';
  return d.toISOString().slice(0, 10);
}
