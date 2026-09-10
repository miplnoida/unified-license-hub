/**
 * AML-09 — risk surveillance, review-cycle status and governed reassessment.
 *
 * The browser is a reader. The server decides, and this file never re-decides:
 *   • the next review date and which canonical input produced it,
 *   • the monitoring state (current / due / overdue / event-triggered /
 *     unscheduled / blocked / legacy) and its reason code,
 *   • which canonical events require supervisor consideration,
 *   • whether a reassessment is already open,
 *   • which action is permitted, which permission it needs and what blocks it.
 *
 * There is deliberately no review interval, no due-date arithmetic, no state
 * derivation, no event threshold and no eligibility rule in TypeScript. The
 * only local vocabulary is display labelling for canonical server codes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const MONITORING_KEY = ['aml-risk-monitoring'] as const;
const DUE_LIST_KEY = ['aml-risk-monitoring-due-list'] as const;

/* ------------------------------------------------------------------ labels -- */

export const MONITORING_STATE_LABEL: Record<string, string> = {
  CURRENT: 'Review current',
  DUE: 'Review due',
  OVERDUE: 'Review overdue',
  EVENT_TRIGGERED: 'Event requires consideration',
  UNSCHEDULED: 'No review scheduled',
  BLOCKED: 'Cannot be scheduled',
  LEGACY: 'Legacy risk record',
};

export const MONITORING_REASON_LABEL: Record<string, string> = {
  REVIEW_NOT_YET_DUE: 'The next review date has not been reached',
  REVIEW_DUE_TODAY: 'The next review date is today',
  REVIEW_DATE_PASSED: 'The next review date has passed',
  EVENT_REQUIRES_CONSIDERATION: 'A canonical supervisory event needs supervisor consideration',
  NO_CANONICAL_REVIEW_SCHEDULE: 'No canonical review schedule exists',
  NO_RISK_OF_RECORD: 'No AML/CFT risk-of-record exists',
  LEGACY_RISK_RECORD: 'The risk-of-record predates governed publication',
};

export const DUE_DATE_BASIS_LABEL: Record<string, string> = {
  EXPLICIT_SCHEDULE_DECISION: 'Approved supervisory schedule decision',
  PROGRAMME_CYCLE: 'Bound assessment programme cycle',
  ASSESSMENT_REVIEW_PERIOD: 'Review period on the last completed assessment',
  RISK_STATE_REVIEW_DATE: 'Review date held on the risk-of-record',
  UNSCHEDULED: 'No canonical schedule — no default interval is assumed',
};

export const MONITORING_EVENT_LABEL: Record<string, string> = {
  FINDING_RAISED: 'Material supervisory finding',
  EXAMINATION_CONCLUDED: 'Examination concluded',
  ENFORCEMENT_OPENED: 'Enforcement case open',
};

export const MONITORING_ACTION_LABEL: Record<string, string> = {
  REQUIRE_REASSESSMENT: 'Require a reassessment',
  RESCHEDULE_REVIEW: 'Reschedule or defer the next review',
  WAIVE_REVIEW: 'Waive the review obligation',
};

export const MONITORING_BLOCKER_LABEL: Record<string, string> = {
  NO_RISK_OF_RECORD: 'No risk-of-record',
  PERMISSION_MISSING: 'You do not hold the required permission',
  REASSESSMENT_ALREADY_OPEN: 'A reassessment is already open',
  UNSUPPORTED_NO_CANONICAL_AUTHORITY: 'Not supported — no canonical authority exists',
  OK: 'Available',
};

export function monitoringErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'The server refused the request.');
  if (/rationale_required/.test(raw)) return 'A written supervisory rationale of at least 20 characters is required.';
  if (/unsupported_disposition/.test(raw)) return `The server does not govern this schedule decision: ${raw}`;
  if (/action_blocked/.test(raw)) return `The server refused this action: ${raw}`;
  if (/not_authorized/.test(raw)) return `You are not authorised for this action: ${raw}`;
  if (/not_found/.test(raw)) return 'The server found no such record within your supervisory scope.';
  return raw;
}

/* ------------------------------------------------------------------- types -- */

export interface MonitoringEvent {
  event_type: string;
  source_kind: string;
  source_id: string;
  reference: string | null;
  title: string | null;
  severity?: string | null;
  status?: string | null;
  event_date: string | null;
  reason: string;
  route: string | null;
  requires_consideration: boolean;
  reassessment_available: boolean;
  required_permission: string;
  existing_reassessment_id: string | null;
  blocker: string | null;
}

export interface MonitoringSchedule {
  next_review_date?: string | null;
  due_date_basis: string;
  due_date_basis_detail: string;
  basis_source_kind?: string | null;
  basis_source_id?: string | null;
  last_review_date?: string | null;
  risk_state_id?: string | null;
  schedule_decision?: {
    id: string; disposition: string | null;
    original_due_date: string | null; revised_due_date: string | null;
    rationale: string; decided_by: string | null; decided_at: string;
  } | null;
  last_completed_assessment?: {
    id: string; reference: string | null; status: string | null;
    assessment_type: string | null; assessment_date: string | null;
    approved_at: string | null; next_review_date: string | null;
    methodology_id: string | null; methodology_version: string | null; route: string;
  } | null;
  programme?: {
    id: string; programme_code: string | null; label: string | null;
    assessment_type: string | null; recurrence_months: number | null;
    provenance: string | null; set_id?: string | null;
    set_code?: string | null; set_version?: string | null; set_status?: string | null;
  } | null;
}

export interface MonitoringAction {
  action: string;
  label: string;
  required_permission: string | null;
  available: boolean;
  reason_code: string;
  reason: string;
}

export interface MonitoringHistoryEntry {
  id: string;
  decision_kind: string;
  monitoring_state: string | null;
  due_date_basis: string | null;
  original_due_date: string | null;
  revised_due_date: string | null;
  disposition: string | null;
  event_type: string | null;
  event_source_kind: string | null;
  event_source_id: string | null;
  reassessment_requirement_id: string | null;
  rationale: string;
  lineage: Record<string, unknown>;
  decided_by: string | null;
  decided_at: string;
}

export interface MonitoringView {
  entity: { id: string; name: string | null; regulator_id: string | null; sector_id: string | null };
  domain_code: string;
  as_of: string;
  generated_at: string;
  risk: {
    source_kind: string;
    current_rating: string | null;
    inherent_rating: string | null;
    control_rating: string | null;
    effective_from: string | null;
    rating_provenance: string | null;
    calculation_availability: string | null;
    publication_id: string | null;
    assessment_id: string | null;
    risk_state_id: string | null;
  };
  schedule: MonitoringSchedule;
  monitoring_state: string;
  reason_code: string;
  reason: string;
  blockers: Array<{ code: string; detail: string; blocking?: boolean }>;
  events: MonitoringEvent[];
  open_reassessment: {
    id: string; status: string; trigger_kind: string | null; requested_type: string | null;
    trigger_rationale: string | null; due_date: string | null; created_at: string;
    previous_assessment_id: string | null;
  } | null;
  permitted_actions: MonitoringAction[];
  history: MonitoringHistoryEntry[];
  lineage: Record<string, unknown>;
}

export interface MonitoringDueListItem {
  entity_id: string;
  entity_name: string | null;
  regulator_id: string | null;
  current_rating: string | null;
  rating_provenance: string | null;
  last_review_date: string | null;
  next_review_date: string | null;
  due_date_basis: string | null;
  monitoring_state: string;
  reason_code: string;
  event_count: number;
  open_reassessment_id: string | null;
  route: string;
}

export interface MonitoringDueList {
  domain_code: string;
  as_of: string;
  state_filter: string | null;
  count: number;
  items: MonitoringDueListItem[];
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------- read models -- */

export function useAmlRiskMonitoringView(entityId: string | undefined, domainCode = 'AML_CFT') {
  return useQuery({
    queryKey: [...MONITORING_KEY, entityId, domainCode],
    enabled: !!entityId,
    queryFn: () => rpc<MonitoringView>('supervisory_risk_monitoring_view', {
      _entity_id: entityId,
      _domain_code: domainCode,
    }),
  });
}

export function useAmlRiskMonitoringDueList(
  domainCode = 'AML_CFT',
  state: string | null = null,
  limit = 100,
  enabled = true,
) {
  return useQuery({
    queryKey: [...DUE_LIST_KEY, domainCode, state, limit],
    enabled,
    queryFn: () => rpc<MonitoringDueList>('supervisory_risk_monitoring_due_list', {
      _domain_code: domainCode,
      _state: state,
      _limit: limit,
    }),
  });
}

/* -------------------------------------------------------------- operations -- */

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: MONITORING_KEY });
    void qc.invalidateQueries({ queryKey: DUE_LIST_KEY });
    void qc.invalidateQueries({ queryKey: ['aml-supervisory-consequence'] });
    void qc.invalidateQueries({ queryKey: ['aml-entity-panel'] });
    void qc.invalidateQueries({ queryKey: ['aml-supervisory-activity'] });
  };
}

export interface RequireReassessmentInput {
  entityId: string;
  domainCode?: string;
  rationale: string;
  eventType?: string | null;
  eventSourceId?: string | null;
  requestedType?: string | null;
  dueDate?: string | null;
  idempotencyKey?: string | null;
}

export function useRequireAmlReassessment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RequireReassessmentInput) =>
      rpc<Record<string, unknown>>('supervisory_risk_monitoring_require_reassessment', {
        _payload: {
          entity_id: input.entityId,
          domain_code: input.domainCode ?? 'AML_CFT',
          rationale: input.rationale,
          event_type: input.eventType ?? null,
          event_source_id: input.eventSourceId ?? null,
          requested_type: input.requestedType ?? null,
          due_date: input.dueDate ?? null,
          idempotency_key: input.idempotencyKey ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

export interface RescheduleReviewInput {
  entityId: string;
  domainCode?: string;
  rationale: string;
  disposition: 'RESCHEDULED' | 'DEFERRED';
  revisedDueDate: string;
  idempotencyKey?: string | null;
}

export function useRescheduleAmlReview() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RescheduleReviewInput) =>
      rpc<Record<string, unknown>>('supervisory_risk_monitoring_reschedule', {
        _payload: {
          entity_id: input.entityId,
          domain_code: input.domainCode ?? 'AML_CFT',
          rationale: input.rationale,
          disposition: input.disposition,
          revised_due_date: input.revisedDueDate,
          idempotency_key: input.idempotencyKey ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

/** Convenience reader: the server's own verdict for one action, or null. */
export function monitoringActionOf(view: MonitoringView | undefined, action: string): MonitoringAction | null {
  return view?.permitted_actions?.find((a) => a.action === action) ?? null;
}
