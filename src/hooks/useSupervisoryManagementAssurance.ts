/**
 * OS-02F — Supervisory Management Assurance & Control.
 *
 * Assurance is derived server-side from the canonical supervisory records
 * (`supervisory_signal` + `supervisory_signal_occurrence` for condition
 * identity and recurrence, `supervisory_signal_review` for the accountable
 * supervisory review/disposition, `supervisory_attention`,
 * `supervisory_finding`, `supervisory_remediation_action`,
 * `supervisory_reassessment_requirement` for supervisory response,
 * `entity_supervision_assignments` for ownership and
 * `supervisory_assurance_policy` for governed tolerances).
 *
 * The client never derives an assurance state, a due date, a severity or a
 * risk rating, and never creates or closes supervisory action.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type AssuranceCondition =
  | 'MATERIAL_AWAITING_REVIEW'
  | 'AWAITING_REVIEW_BEYOND_TOLERANCE'
  | 'REVIEWED_NO_DISPOSITION'
  | 'UNOWNED_MATTER'
  | 'RESPONSE_OVERDUE'
  | 'RESPONSE_STALE'
  | 'REPEATED_CONDITION'
  | 'RECURRENCE_AFTER_REVIEW'
  | 'RECURRENCE_AFTER_ACTION'
  | 'CONDITION_RESOLVED_ACTION_OPEN'
  | 'ACTION_CLOSED_CONDITION_PERSISTS'
  | 'ASSESSMENT_POTENTIALLY_STALE'
  | 'MISSING_TRACEABILITY';

export const ASSURANCE_CONDITION_LABELS: Record<string, string> = {
  MATERIAL_AWAITING_REVIEW: 'Material condition awaiting review',
  AWAITING_REVIEW_BEYOND_TOLERANCE: 'Awaiting review beyond tolerance',
  REVIEWED_NO_DISPOSITION: 'Reviewed, no disposition recorded',
  UNOWNED_MATTER: 'Unowned supervisory matter',
  RESPONSE_OVERDUE: 'Supervisory response overdue',
  RESPONSE_STALE: 'Stale supervisory response',
  REPEATED_CONDITION: 'Repeated condition',
  RECURRENCE_AFTER_REVIEW: 'Recurrence after review',
  RECURRENCE_AFTER_ACTION: 'Recurrence after supervisory action',
  CONDITION_RESOLVED_ACTION_OPEN: 'Condition resolved, action still open',
  ACTION_CLOSED_CONDITION_PERSISTS: 'Action closed, condition persists',
  ASSESSMENT_POTENTIALLY_STALE: 'Risk assessment potentially stale',
  MISSING_TRACEABILITY: 'Missing traceability',
};

export interface AssuranceMatter {
  signal_id: string;
  entity_id: string | null;
  entity_name: string | null;
  domain_code: string;
  detector_code: string | null;
  severity: string | null;
  is_material: boolean;
  summary: string | null;
  condition_state: 'OPEN' | 'RESOLVED';
  materiality_reason: string | null;
  first_detected_at: string | null;
  last_detected_at: string | null;
  last_occurrence_at: string | null;
  occurrence_count: number;
  occurrence_days: number;
  age_days: number | null;
  days_since_supervisory_activity: number | null;
  is_reviewed: boolean;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  disposition: string | null;
  disposition_rationale: string | null;
  owner_id: string | null;
  owner_name: string | null;
  owner_team_id: string | null;
  owner_team_name: string | null;
  ownership_scope: string | null;
  action_type: string | null;
  action_source_table: string | null;
  action_record_id: string | null;
  action_reference: string | null;
  action_status: string | null;
  action_opened_at: string | null;
  action_due_date: string | null;
  due_date_source: string | null;
  action_closed_at: string | null;
  action_is_open: boolean | null;
  source_table: string | null;
  source_id: string | null;
  source_reference: string | null;
  assessment_id: string | null;
  assessment_reference: string | null;
  assurance_conditions: string[];
  assurance_explanation: string;
  assurance_provenance: Record<string, any>;
}

export interface AssurancePolicy {
  policy_id: string;
  code: string;
  name: string;
  domain_code: string | null;
  config_owner: string;
  awaiting_review_tolerance_days: number;
  stale_activity_tolerance_days: number;
  repeat_occurrence_threshold: number;
  repeat_distinct_day_threshold: number;
  material_severities: string[];
  version: number;
  effective_from: string;
  resolution: string;
}

export interface AssuranceSummary {
  matters: number;
  awaiting_review: number;
  awaiting_review_beyond_tolerance: number;
  reviewed_no_disposition: number;
  unowned: number;
  overdue: number;
  stale: number;
  repeated: number;
  recurrence_after_review: number;
  recurrence_after_action: number;
  condition_resolved_action_open: number;
  action_closed_condition_persists: number;
  assessment_potentially_stale: number;
  missing_traceability: number;
}

export interface AssuranceRegister {
  generated_at: string;
  policy: AssurancePolicy | null;
  summary: AssuranceSummary;
  rows: AssuranceMatter[];
}

export interface AssuranceTrend {
  generated_at: string;
  window_days: number;
  new_material_matters: number;
  matters_reviewed: number;
  matters_dispositioned: number;
  responses_overdue: number;
  recurring_conditions: number;
  closed_actions_followed_by_recurrence: number;
  conditions_resolved_in_window: number;
}

export interface AssuranceFilters {
  domain?: string | null;
  condition?: string | null;
  entityId?: string | null;
  ownerId?: string | null;
  teamId?: string | null;
  severity?: string | null;
  overdue?: boolean | null;
  recurring?: boolean | null;
  actionStatus?: string | null;
  search?: string | null;
  limit?: number;
}

export function useAssuranceRegister(filters: AssuranceFilters = {}) {
  return useQuery({
    queryKey: ['supervisory_management_assurance_register', filters],
    queryFn: () => rpc<AssuranceRegister>('supervisory_management_assurance_register', {
      _domain: filters.domain ?? null,
      _condition: filters.condition ?? null,
      _entity_id: filters.entityId ?? null,
      _owner_id: filters.ownerId ?? null,
      _team_id: filters.teamId ?? null,
      _severity: filters.severity ?? null,
      _overdue: filters.overdue ?? null,
      _recurring: filters.recurring ?? null,
      _action_status: filters.actionStatus ?? null,
      _search: filters.search ?? null,
      _limit: filters.limit ?? 200,
    }),
    staleTime: 30_000,
  });
}

export function useAssuranceTrend(days = 30) {
  return useQuery({
    queryKey: ['supervisory_management_assurance_trend', days],
    queryFn: () => rpc<AssuranceTrend>('supervisory_management_assurance_trend', { _days: days }),
    staleTime: 60_000,
  });
}

export interface RecordReviewInput {
  signalId: string;
  reviewNote?: string | null;
  disposition?: string | null;
  dispositionRationale?: string | null;
  linkedModule?: string | null;
  linkedRecordId?: string | null;
  /** Governed correction: record a superseding review instead of editing history. */
  supersedesReviewId?: string | null;
  correctionReason?: string | null;
}

export function useRecordConditionReview() {
  const qc = useQueryClient();
  return useMutation({
    // NOTE: the linked reference is derived server-side from the canonical
    // record — the browser must never be able to invent it.
    mutationFn: (input: RecordReviewInput) => rpc<{ review_id: string }>(
      'supervisory_assurance_record_review', {
        _signal_id: input.signalId,
        _review_note: input.reviewNote ?? null,
        _disposition: input.disposition ?? null,
        _disposition_rationale: input.dispositionRationale ?? null,
        _linked_module: input.linkedModule ?? null,
        _linked_record_id: input.linkedRecordId ?? null,
        _supersedes_review_id: input.supersedesReviewId ?? null,
        _correction_reason: input.correctionReason ?? null,
      }),

    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supervisory_management_assurance_register'] });
      qc.invalidateQueries({ queryKey: ['supervisory_management_assurance_trend'] });
      qc.invalidateQueries({ queryKey: ['supervisory_detection_register'] });
    },
  });
}

export function formatAssuranceDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

/** Canonical drill-through route for the record behind an assurance matter. */
export function canonicalRouteFor(matter: AssuranceMatter): { label: string; route: string } | null {
  if (matter.action_source_table === 'supervisory_finding' && matter.action_record_id) {
    return { label: 'Open finding', route: `/supervision/findings?finding=${matter.action_record_id}` };
  }
  if (matter.action_source_table === 'supervisory_remediation_action' && matter.action_record_id) {
    return { label: 'Open remediation', route: `/supervision/findings?remediation=${matter.action_record_id}` };
  }
  if (matter.action_source_table === 'supervisory_attention' && matter.action_record_id) {
    return { label: 'Open supervisory attention', route: `/supervision/monitoring?attention=${matter.action_record_id}` };
  }
  if (matter.entity_id) {
    return { label: 'Open entity supervision', route: `/entities/${matter.entity_id}` };
  }
  return null;
}
