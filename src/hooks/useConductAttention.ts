/**
 * MC-10 — Supervisory attention, planning and intervention records.
 *
 * The browser reads governed read models and asks the server to act. Every
 * change of state — confirming a deterministic priority, assigning ownership,
 * moving an attention item, submitting or approving a plan, initiating an
 * intervention, recording its outcome or reassessing the concern — goes through
 * a governed operation that derives the acting officer server-side, enforces the
 * supervisory remit, keeps maker and checker apart and writes the audit trail.
 * Nothing is prioritised, planned, approved or closed in the client.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { planningErrorMessage } from '@/hooks/useConductPlanning';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* -------------------------------------------------------------------- types */

export type AttentionStatus = 'OPEN' | 'PRIORITISED' | 'PLANNED' | 'IN_PROGRESS' | 'MONITORING' | 'CLOSED';
export type PriorityBand = 'IMMEDIATE' | 'HIGH' | 'PLANNED' | 'MONITOR';
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface AttentionRow {
  id: string;
  reference: string;
  title: string;
  status: AttentionStatus;
  source_type: string;
  source_module: string;
  source_reference: string | null;
  theme: string | null;
  sector_id: string | null;
  sector_name: string | null;
  entity_count: number;
  materiality: string;
  urgency: string;
  calculated_priority: PriorityBand | null;
  calculated_score: number | null;
  confirmed_priority: PriorityBand | null;
  priority_overridden: boolean;
  owner_id: string | null;
  target_review_date: string | null;
  identified_on: string | null;
  emerging_risk_id: string | null;
  plan_count: number;
  intervention_count: number;
  created_at: string;
}

export interface PlanRow {
  id: string;
  reference: string;
  title: string;
  status: PlanStatus;
  objective: string | null;
  objective_source: string;
  priority: PriorityBand | null;
  planning_period: string;
  period_label: string | null;
  theme: string | null;
  sector_id: string | null;
  sector_name: string | null;
  attention_id: string | null;
  attention_reference: string | null;
  start_date: string | null;
  target_completion: string | null;
  next_review_date: string | null;
  milestone_open: number;
  intervention_count: number;
  created_at: string;
}

export interface InterventionType {
  code: string;
  name: string;
  purpose: string;
  applicability: string;
  authority_action: string;
  canonical_module: string | null;
  canonical_route: string | null;
  requires_canonical_record: boolean;
}

export interface AttentionRegister {
  sectors_in_view: string[] | 'all';
  attention_items: AttentionRow[];
  plans: PlanRow[];
  intervention_catalogue: InterventionType[];
  method: string;
}

export interface CoverageGap { id: string; reference: string; title?: string | null }

export interface PlanningCoverage {
  high_priority_without_plan: CoverageGap[];
  approved_plan_without_intervention: CoverageGap[];
  overdue_intervention: Array<CoverageGap & { planned_end?: string | null }>;
  completed_without_outcome: CoverageGap[];
  outstanding_followup: Array<CoverageGap & { followup_due?: string | null }>;
  confirmed_risk_without_response: CoverageGap[];
  [key: string]: unknown;
}

export interface AttentionCase {
  attention: Record<string, unknown> & AttentionRow & {
    supervisory_basis: string;
    calculated_factors: Record<string, unknown>;
    confirmation_rationale: string | null;
    disposition: string | null;
    disposition_rationale: string | null;
    facts_signature: string | null;
    calculated_at: string | null;
    confirmed_at: string | null;
  };
  sector_name: string | null;
  entities: Array<{ id: string; name: string }>;
  owner_name: string | null;
  confirmed_by_name: string | null;
  emerging_risk: { id: string; reference: string; title: string; status: string; severity: string } | null;
  calculations: Array<{
    id: string; method: string; factors: Record<string, { value?: unknown; points?: number }>;
    score: number; band: PriorityBand; facts_signature: string;
    window_start: string; window_end: string; computed_at: string;
  }>;
  events: Array<{
    id: string; event_type: string; from_state: string | null; to_state: string | null;
    rationale: string | null; detail: unknown; actor_name: string | null; created_at: string;
  }>;
  reassessments: Array<{
    id: string; concern_state: string; assessment: string; next_step: string;
    next_review_date: string | null; intervention_id: string | null;
    assessed_by_name: string | null; assessed_at: string;
  }>;
  plans: Array<{ id: string; reference: string; title: string; status: PlanStatus; objective: string | null; target_completion: string | null }>;
  interventions: Array<{
    id: string; reference: string; catalogue_code: string; title: string; status: string;
    outcome_result: string | null; planned_start: string | null; planned_end: string | null;
    followup_due_date: string | null; followup_completed_at: string | null;
    canonical_route: string | null; canonical_reference: string | null; plan_id: string | null;
  }>;
  intervention_catalogue: InterventionType[];
  ai_suggestions: PlanningInsight[];
}

export interface PlanCase {
  plan: Record<string, unknown> & PlanRow & {
    scope: string | null; factual_basis: string; approval_rationale: string | null;
    outcome_summary: string | null; submitted_at: string | null; approved_at: string | null;
  };
  sector_name: string | null;
  lead_officer_name: string | null;
  submitted_by_name: string | null;
  approved_by_name: string | null;
  attention: { id: string; reference: string; title: string; status: AttentionStatus; confirmed_priority: PriorityBand | null; calculated_priority: PriorityBand | null; supervisory_basis: string } | null;
  entities: Array<{ id: string; name: string }>;
  milestones: Array<{ id: string; title: string; detail: string | null; due_date: string | null; status: string; completed_at: string | null }>;
  events: Array<{ id: string; event_type: string; from_status: string | null; to_status: string | null; rationale: string | null; actor_name: string | null; created_at: string }>;
  interventions: AttentionCase['interventions'];
  intervention_catalogue: InterventionType[];
  ai_suggestions: PlanningInsight[];
}

export interface PlanningInsight {
  id: string;
  use_case_code: string;
  ai_output: Record<string, unknown>;
  source_references: Array<{ section?: string; reference: string; label?: string }>;
  confidence: number | null;
  uncertainty: string | null;
  limitations: string[] | null;
  review_state: string | null;
  staleness_state: string | null;
  snapshot_fingerprint: string | null;
  model: string | null;
  model_version: string | null;
  prompt_template_code: string | null;
  prompt_template_version: string | null;
  generated_at: string;
}

/* ------------------------------------------------------------------- labels */

export const ATTENTION_STATUS_LABEL: Record<AttentionStatus, string> = {
  OPEN: 'Awaiting prioritisation',
  PRIORITISED: 'Prioritised',
  PLANNED: 'Planned',
  IN_PROGRESS: 'Response in progress',
  MONITORING: 'Under monitoring',
  CLOSED: 'Closed',
};

export const ATTENTION_NEXT_STATUS: Record<AttentionStatus, AttentionStatus[]> = {
  OPEN: ['PRIORITISED', 'CLOSED'],
  PRIORITISED: ['PLANNED', 'MONITORING', 'CLOSED'],
  PLANNED: ['IN_PROGRESS', 'MONITORING', 'CLOSED'],
  IN_PROGRESS: ['MONITORING', 'CLOSED'],
  MONITORING: ['IN_PROGRESS', 'CLOSED'],
  CLOSED: [],
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting approval',
  APPROVED: 'Approved',
  ACTIVE: 'In progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const PLAN_NEXT_STATUS: Record<PlanStatus, PlanStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'DRAFT', 'CANCELLED'],
  APPROVED: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const PRIORITY_BAND_LABEL: Record<PriorityBand, string> = {
  IMMEDIATE: 'Immediate attention',
  HIGH: 'High priority',
  PLANNED: 'Planned work',
  MONITOR: 'Monitor only',
};

export const MATERIALITY_LABEL: Record<string, string> = {
  low: 'Low', medium: 'Medium', high: 'High', severe: 'Severe',
};

export const URGENCY_LABEL: Record<string, string> = {
  routine: 'Routine', elevated: 'Elevated', urgent: 'Urgent',
};

export const ATTENTION_SOURCE_LABEL: Record<string, string> = {
  emerging_risk: 'Emerging conduct risk',
  cross_entity_theme: 'Cross-entity theme',
  conduct_360: 'Conduct 360 position',
  entity_signal: 'Conduct signal',
  complaint_pattern: 'Detected complaint pattern',
  finding: 'Supervisory finding',
  material_change: 'Material change',
  supervisory_assessment: 'Supervisory assessment',
  unresolved_remediation: 'Unresolved remediation',
  other: 'Other recorded basis',
};

export const CONCERN_STATE_LABEL: Record<string, string> = {
  unchanged: 'Unchanged', reduced: 'Reduced', increased: 'Increased', resolved: 'Resolved',
};

export const NEXT_STEP_LABEL: Record<string, string> = {
  continue_monitoring: 'Continue monitoring',
  further_intervention: 'Further intervention required',
  close: 'Close the concern',
  refer: 'Refer elsewhere',
};

export const OUTCOME_RESULT_LABEL: Record<string, string> = {
  no_further_action: 'No further action',
  continue_monitoring: 'Continue monitoring',
  information_required: 'Further information required',
  remediation_required: 'Remediation required',
  further_review_required: 'Further review required',
  investigation_required: 'Investigation required',
  finding_raised: 'Finding raised',
  escalation_required: 'Escalation required',
};

export const ATTENTION_EVENT_LABEL: Record<string, string> = {
  CREATED: 'Raised',
  PRIORITY_CALCULATED: 'Priority calculated',
  PRIORITY_CONFIRMED: 'Priority confirmed by supervisor',
  ASSIGNED: 'Ownership assigned',
  STATUS_CHANGE: 'Status changed',
  REASSESSED: 'Concern reassessed',
  PLAN_LINKED: 'Supervisory plan linked',
  INTERVENTION_LINKED: 'Intervention linked',
};

export const attentionErrorMessage = planningErrorMessage;

/* ------------------------------------------------------------------ queries */

export const attentionKeys = {
  register: (status: string | null, priority: string | null) => ['conduct-attention-register', status, priority] as const,
  coverage: () => ['conduct-planning-coverage'] as const,
  attentionCase: (id?: string) => ['conduct-attention-case', id] as const,
  planCase: (id?: string) => ['conduct-plan-case', id] as const,
};

export function useAttentionRegister(status: string | null = null, priority: string | null = null) {
  return useQuery({
    queryKey: attentionKeys.register(status, priority),
    retry: false,
    staleTime: 30_000,
    queryFn: () => rpc<AttentionRegister>('conduct_attention_register', {
      _status: status, _priority: priority, _sector_id: null, _regulator_id: null, _limit: 300,
    }),
  });
}

export function usePlanningCoverage() {
  return useQuery({
    queryKey: attentionKeys.coverage(),
    retry: false,
    staleTime: 30_000,
    queryFn: () => rpc<PlanningCoverage>('conduct_planning_coverage', { _sector_id: null, _regulator_id: null }),
  });
}

export function useAttentionCase(id: string | undefined) {
  return useQuery({
    queryKey: attentionKeys.attentionCase(id),
    enabled: Boolean(id),
    retry: false,
    queryFn: () => rpc<AttentionCase>('conduct_attention_case', { _id: id }),
  });
}

export function usePlanCase(id: string | undefined) {
  return useQuery({
    queryKey: attentionKeys.planCase(id),
    enabled: Boolean(id),
    retry: false,
    queryFn: () => rpc<PlanCase>('conduct_plan_case', { _id: id }),
  });
}

/* ---------------------------------------------------------------- mutations */

function useInvalidate() {
  const qc = useQueryClient();
  return (id?: string, planId?: string) => {
    void qc.invalidateQueries({ queryKey: ['conduct-attention-register'] });
    void qc.invalidateQueries({ queryKey: attentionKeys.coverage() });
    if (id) void qc.invalidateQueries({ queryKey: attentionKeys.attentionCase(id) });
    if (planId) void qc.invalidateQueries({ queryKey: attentionKeys.planCase(planId) });
  };
}

export interface CreateAttentionInput {
  title: string;
  sourceType: string;
  sourceModule: string;
  supervisoryBasis: string;
  sourceReference?: string | null;
  emergingRiskId?: string | null;
  theme?: string | null;
  sectorId?: string | null;
  materiality: string;
  urgency: string;
  targetReviewDate?: string | null;
}

export function useCreateAttention() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateAttentionInput) =>
      rpc<{ id: string; reference: string }>('conduct_attention_create', {
        _title: input.title,
        _source_type: input.sourceType,
        _source_module: input.sourceModule,
        _supervisory_basis: input.supervisoryBasis,
        _source_id: null,
        _source_reference: input.sourceReference ?? null,
        _emerging_risk_id: input.emergingRiskId ?? null,
        _theme: input.theme ?? null,
        _sector_id: input.sectorId ?? null,
        _materiality: input.materiality,
        _urgency: input.urgency,
        _target_review_date: input.targetReviewDate ?? null,
      }),
    onSuccess: () => invalidate(),
  });
}

export function useComputeAttentionPriority(id: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (windowDays: number) =>
      rpc<{ band: PriorityBand; score: number }>('conduct_attention_priority_compute', {
        _id: id, _window_days: windowDays,
      }),
    onSuccess: () => invalidate(id),
  });
}

export function useConfirmAttentionPriority(id: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { priority: PriorityBand; rationale: string }) =>
      rpc('conduct_attention_priority_confirm', {
        _id: id, _priority: args.priority, _rationale: args.rationale,
      }),
    onSuccess: () => invalidate(id),
  });
}

export function useAssignAttention(id: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { ownerId?: string | null; targetReviewDate?: string | null; rationale?: string }) =>
      rpc('conduct_attention_assign', {
        _id: id,
        _owner_id: args.ownerId ?? null,
        _team_id: null,
        _target_review_date: args.targetReviewDate ?? null,
        _rationale: args.rationale ?? null,
      }),
    onSuccess: () => invalidate(id),
  });
}

export function useTransitionAttention(id: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { toStatus: AttentionStatus; rationale: string; disposition?: string | null }) =>
      rpc('conduct_attention_transition', {
        _id: id, _to_status: args.toStatus, _rationale: args.rationale,
        _disposition: args.disposition ?? null,
      }),
    onSuccess: () => invalidate(id),
  });
}

export function useReassessAttention(id: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: {
      concernState: string; assessment: string; nextStep: string;
      interventionId?: string | null; nextReviewDate?: string | null;
    }) =>
      rpc('conduct_attention_reassess', {
        _id: id,
        _concern_state: args.concernState,
        _assessment: args.assessment,
        _next_step: args.nextStep,
        _intervention_id: args.interventionId ?? null,
        _next_review_date: args.nextReviewDate ?? null,
      }),
    onSuccess: () => invalidate(id),
  });
}

export interface CreatePlanInput {
  title: string;
  factualBasis: string;
  attentionId?: string | null;
  objective?: string | null;
  scope?: string | null;
  theme?: string | null;
  sectorId?: string | null;
  planningPeriod: string;
  periodLabel?: string | null;
  startDate?: string | null;
  targetCompletion?: string | null;
  nextReviewDate?: string | null;
  objectiveSource?: 'human' | 'ai_assisted_reviewed';
  objectiveAiInsightId?: string | null;
}

export function useCreatePlan() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreatePlanInput) =>
      rpc<{ id: string; reference: string }>('conduct_plan_create', {
        _title: input.title,
        _factual_basis: input.factualBasis,
        _attention_id: input.attentionId ?? null,
        _objective: input.objective ?? null,
        _scope: input.scope ?? null,
        _theme: input.theme ?? null,
        _sector_id: input.sectorId ?? null,
        _planning_period: input.planningPeriod,
        _period_label: input.periodLabel ?? null,
        _start_date: input.startDate ?? null,
        _target_completion: input.targetCompletion ?? null,
        _next_review_date: input.nextReviewDate ?? null,
        _objective_source: input.objectiveSource ?? 'human',
        _objective_ai_insight_id: input.objectiveAiInsightId ?? null,
      }),
    onSuccess: (_d, vars) => invalidate(vars.attentionId ?? undefined),
  });
}

export function useTransitionPlan(planId: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { toStatus: PlanStatus; rationale: string }) =>
      rpc('conduct_plan_transition', { _id: planId, _to_status: args.toStatus, _rationale: args.rationale }),
    onSuccess: () => invalidate(undefined, planId),
  });
}

export function useUpsertPlanMilestone(planId: string | undefined) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (args: { title: string; dueDate?: string | null; detail?: string | null; milestoneId?: string | null; status?: string | null }) =>
      rpc('conduct_plan_milestone_upsert', {
        _plan_id: planId,
        _title: args.title,
        _due_date: args.dueDate ?? null,
        _detail: args.detail ?? null,
        _milestone_id: args.milestoneId ?? null,
        _status: args.status ?? null,
      }),
    onSuccess: () => invalidate(undefined, planId),
  });
}

export interface InitiateInterventionInput {
  catalogueCode: string;
  title: string;
  basis: string;
  attentionId?: string | null;
  planId?: string | null;
  purpose?: string | null;
  expectedOutcome?: string | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  aiInsightId?: string | null;
}

export function useInitiateIntervention() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: InitiateInterventionInput) =>
      rpc<{ id: string; reference: string }>('conduct_intervention_initiate', {
        _catalogue_code: input.catalogueCode,
        _title: input.title,
        _basis: input.basis,
        _attention_id: input.attentionId ?? null,
        _plan_id: input.planId ?? null,
        _purpose: input.purpose ?? null,
        _expected_outcome: input.expectedOutcome ?? null,
        _planned_start: input.plannedStart ?? null,
        _planned_end: input.plannedEnd ?? null,
        _ai_insight_id: input.aiInsightId ?? null,
      }),
    onSuccess: (_d, vars) => invalidate(vars.attentionId ?? undefined, vars.planId ?? undefined),
  });
}
