/**
 * AML-08 — post-publication supervisory consequence and action linkage.
 *
 * The browser is a reader. The server decides:
 *   • whether a published risk-of-record (or a legacy risk record) exists at all,
 *   • which supervisory consequences a given officer may take,
 *   • which permission each one requires,
 *   • which prerequisite record is missing,
 *   • whether a target already exists (duplicate),
 *   • and what lineage is bound to each recorded decision.
 *
 * There is deliberately NO rating→action mapping, no eligibility rule, no
 * prerequisite rule and no duplicate rule in TypeScript. The only local
 * vocabulary is display labelling for canonical codes the server returns.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const CONSEQUENCE_KEY = ['aml-supervisory-consequence'] as const;

/* ------------------------------------------------------------------ labels -- */

export const CONSEQUENCE_ACTION_LABEL: Record<string, string> = {
  OPEN_SUPERVISORY_PLAN: 'Open or link a supervisory plan',
  REQUIRE_REASSESSMENT: 'Require a reassessment',
  OPEN_INTERVENTION: 'Open or link a supervisory intervention',
  OPEN_EXAMINATION: 'Open or link an examination',
  RAISE_FINDING: 'Create or link a supervisory finding',
  REFER_TO_ENFORCEMENT: 'Refer to enforcement',
  RECORD_MONITORING: 'Record monitoring / no immediate action',
  RECORD_DEFERRED: 'Record a blocked or deferred decision',
};

export const CONSEQUENCE_REASON_LABEL: Record<string, string> = {
  OK: 'Available',
  PERMISSION_MISSING: 'You do not hold the required permission',
  NO_RISK_OF_RECORD: 'No current risk-of-record to act on',
  SOURCE_NOT_PUBLISHED: 'The approved assessment has not published its risk-of-record',
  PREREQUISITE_MISSING: 'A prerequisite supervisory record is missing',
  DUPLICATE_EXISTS: 'An equivalent linked record already exists',
};

export const CONSEQUENCE_BLOCKER_LABEL: Record<string, string> = {
  NO_RISK_OF_RECORD: 'No risk-of-record',
  SOURCE_NOT_PUBLISHED: 'Approved but not published',
  LEGACY_RISK_RECORD: 'Legacy risk record',
  NOT_CALCULABLE: 'No rating can be calculated',
  SOURCE_SUPERSEDED: 'A later publication now applies',
};

export const SOURCE_KIND_LABEL: Record<string, string> = {
  PUBLICATION: 'Published risk-of-record',
  LEGACY_RISK_RECORD: 'Legacy risk record (pre-publication)',
  NONE: 'No risk-of-record',
};

export const PROVENANCE_LABEL: Record<string, string> = {
  COMPUTED: 'Calculated result',
  APPROVED_OVERRIDE: 'Approved supervisory override',
  LEGACY_OFFICER_RATING: 'Legacy officer rating',
  NOT_CALCULABLE: 'Not calculable under current policy',
  UNAVAILABLE: 'Unavailable',
};

export const CALCULATION_AVAILABILITY_LABEL: Record<string, string> = {
  CALCULATED: 'Calculated',
  NOT_CALCULABLE: 'Not calculable — no approved calculation policy in force',
  NO_RUN: 'No calculation run yet',
  UNAVAILABLE: 'Unavailable',
};

export const TARGET_KIND_LABEL: Record<string, string> = {
  SUPERVISORY_PLAN: 'Supervisory plan',
  REASSESSMENT_REQUIREMENT: 'Reassessment requirement',
  SUPERVISORY_INTERVENTION: 'Supervisory intervention',
  EXAMINATION: 'Examination',
  SUPERVISORY_FINDING: 'Supervisory finding',
  ENFORCEMENT_ACTION: 'Enforcement case',
};

/** Server refusals are shown as they are, with a plain reading where known. */
export function consequenceErrorMessage(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? 'The server refused the request.');
  if (/action_blocked/.test(raw)) return `The server refused this action: ${raw}`;
  if (/rationale_required/.test(raw)) return 'A written supervisory rationale of at least 20 characters is required.';
  if (/not_authorized/.test(raw)) return `You are not authorised for this action: ${raw}`;
  if (/not_found/.test(raw)) return 'The server found no such record within your supervisory scope.';
  if (/unsupported_action|unsupported_mode/.test(raw)) return `The server does not govern this request: ${raw}`;
  return raw;
}

/* ------------------------------------------------------------------- types -- */

export interface ConsequenceTarget {
  kind: string;
  id: string;
  reference: string | null;
  title: string | null;
  status: string | null;
  entity_id: string | null;
  domain_code: string | null;
  route: string | null;
}

export interface ConsequenceAction {
  action: string;
  label: string;
  target_kind: string | null;
  linkage_modes: string[];
  required_permission: string;
  available: boolean;
  reason_code: string;
  reason: string;
  prerequisite: string | null;
  existing: Array<{ id: string; target_kind: string | null; target_id: string | null; target_reference: string | null; decided_at: string }>;
}

export interface ConsequenceBlocker {
  code: string;
  detail: string;
  blocking: boolean;
}

export interface ConsequenceSource {
  entity_id: string;
  domain_code: string;
  source_kind: string;
  eligible: boolean;
  publication: Record<string, any> | null;
  approval_decision: Record<string, any> | null;
  assessment: Record<string, any> | null;
  risk_state: Record<string, any> | null;
  calculation_run: Record<string, any> | null;
  approved_override: Record<string, any> | null;
  calculation_availability: string;
  rating_provenance: string;
  current_rating: string | null;
  effective_from: string | null;
  approved_not_published: boolean;
  blockers: ConsequenceBlocker[];
}

export interface ConsequenceDecision {
  id: string;
  action_type: string;
  linkage_mode: string;
  status: string;
  source_kind: string;
  publication_id: string | null;
  assessment_id: string | null;
  source_rating: string | null;
  rating_provenance: string;
  calculation_availability: string;
  rationale: string;
  supervisory_objective: string | null;
  priority: string | null;
  due_date: string | null;
  owner_id: string | null;
  decided_by: string | null;
  decided_at: string;
  withdrawal_reason: string | null;
  superseded_by_id: string | null;
  target_kind: string | null;
  target_id: string | null;
  target_reference: string | null;
  target: ConsequenceTarget | null;
  lineage: Record<string, unknown>;
}

export interface ConsequenceView {
  entity_id: string;
  domain_code: string;
  source: ConsequenceSource;
  actions: ConsequenceAction[];
  linked_records: Array<{ action_type: string; decision_id: string; target: ConsequenceTarget | null }>;
  link_candidates: Array<{ target_kind: string; id: string; reference: string | null; title: string | null; status: string | null }>;
  decisions: ConsequenceDecision[];
  prerequisites: { plan: boolean; intervention: boolean; finding: boolean };
  viewer: { user_id: string };
}

export interface RecordConsequenceInput {
  entityId: string;
  domainCode?: string;
  assessmentId?: string | null;
  actionType: string;
  linkageMode: 'CREATE' | 'LINK' | 'RECORD_ONLY';
  rationale: string;
  targetId?: string | null;
  title?: string | null;
  supervisoryObjective?: string | null;
  priority?: string | null;
  dueDate?: string | null;
  ownerId?: string | null;
  planId?: string | null;
  interventionId?: string | null;
  interventionType?: string | null;
  engagementType?: string | null;
  requestedType?: string | null;
  severity?: string | null;
  sourceFindingId?: string | null;
  idempotencyKey?: string | null;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------- read model -- */

export function useSupervisoryConsequenceView(
  entityId: string | undefined,
  domainCode = 'AML_CFT',
  assessmentId?: string | null,
) {
  return useQuery({
    queryKey: [...CONSEQUENCE_KEY, entityId, domainCode, assessmentId ?? null],
    enabled: !!entityId,
    queryFn: () => rpc<ConsequenceView>('supervisory_consequence_view', {
      _entity_id: entityId,
      _domain_code: domainCode,
      _assessment_id: assessmentId ?? null,
    }),
  });
}

/* -------------------------------------------------------------- operations -- */

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CONSEQUENCE_KEY });
    void qc.invalidateQueries({ queryKey: ['aml-assessment-review'] });
    void qc.invalidateQueries({ queryKey: ['aml-entity-risk-history'] });
    void qc.invalidateQueries({ queryKey: ['aml-entity-panel'] });
    void qc.invalidateQueries({ queryKey: ['aml-supervisory-activity'] });
  };
}

export function useRecordSupervisoryConsequence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: RecordConsequenceInput) => rpc<Record<string, unknown>>('supervisory_consequence_record', {
      _payload: {
        entity_id: input.entityId,
        domain_code: input.domainCode ?? 'AML_CFT',
        assessment_id: input.assessmentId ?? null,
        action_type: input.actionType,
        linkage_mode: input.linkageMode,
        rationale: input.rationale,
        target_id: input.targetId ?? null,
        title: input.title ?? null,
        supervisory_objective: input.supervisoryObjective ?? null,
        priority: input.priority ?? null,
        due_date: input.dueDate ?? null,
        owner_id: input.ownerId ?? null,
        plan_id: input.planId ?? null,
        intervention_id: input.interventionId ?? null,
        intervention_type: input.interventionType ?? null,
        engagement_type: input.engagementType ?? null,
        requested_type: input.requestedType ?? null,
        severity: input.severity ?? null,
        source_finding_id: input.sourceFindingId ?? null,
        idempotency_key: input.idempotencyKey ?? null,
      },
    }),
    onSuccess: invalidate,
  });
}

export function useWithdrawSupervisoryConsequence() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (a: { decisionId: string; rationale: string }) =>
      rpc<Record<string, unknown>>('supervisory_consequence_withdraw', {
        _decision_id: a.decisionId, _rationale: a.rationale,
      }),
    onSuccess: invalidate,
  });
}

/** Convenience reader: the server's own verdict for one action, or null. */
export function consequenceActionOf(view: ConsequenceView | undefined, action: string): ConsequenceAction | null {
  return view?.actions?.find((a) => a.action === action) ?? null;
}
