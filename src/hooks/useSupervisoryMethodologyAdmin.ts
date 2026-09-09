/**
 * Supervisory methodology administration — governed read/action layer.
 *
 * EVERY read on this screen family goes through the governed `supervisory_methodology_*`
 * RPCs. No page, component or hook in this feature reads `supervisory_methodology`,
 * `supervisory_methodology_question`, `supervisory_methodology_fact_requirement`
 * or `supervisory_methodology_regulator_approval` directly: the RPCs are
 * SECURITY INVOKER, so RLS, regulator scope and permission gating remain the
 * only authority, and the browser never assembles methodology truth itself.
 *
 * Every mutation calls an existing governed action RPC
 * (`supervisory_methodology_adopt_reference`, `supervisory_methodology_lifecycle`).
 * Nothing here decides authority — `supervisory_methodology_action_capabilities`
 * does, server-side.
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

/* --------------------------------------------------------------- types */

export type MethodologyOrigin = 'MIPL_REFERENCE' | 'REGULATOR_ADOPTED' | 'REGULATOR_AUTHORED' | string;
export type MethodologyStatus = 'DRAFT' | 'REVIEW' | 'APPROVED' | 'ACTIVE' | 'SUPERSEDED' | 'RETIRED' | string;

export interface MethodologyRegisterRow {
  id: string;
  code: string;
  name: string | null;
  version: string;
  status: MethodologyStatus;
  origin: MethodologyOrigin;
  origin_label: string;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  regulator_name: string | null;
  sector_summary: string | null;
  sector_count: number;
  entity_types: string[];
  dimension_count: number;
  question_count: number;
  effective_from: string | null;
  effective_to: string | null;
  approval_state: string;
  approval_decided_at: string | null;
  has_lineage: boolean;
  updated_at: string;
}

export interface MethodologyRegisterResult {
  total_count: number;
  rows: MethodologyRegisterRow[];
  page: { limit: number; offset: number; sort: string; dir: string };
}

export interface MethodologyRegisterOptions {
  domains: string[];
  origins: Array<{ value: string; label: string }>;
  statuses: string[];
  regulators: Array<{ id: string; code: string; name: string; status?: string }>;
  /** Canonical effective-regulator contract (active + authorised only). */
  selectable_regulator_count?: number;
  cross_regulator_allowed?: boolean;
  active_regulator?: { id: string; code: string; name: string } | null;
  regulator_scope_reason?: string | null;
  sectors: Array<{ id: string; name: string }>;
  approval_states: string[];
}

export interface MethodologyDetail {
  id: string;
  code: string;
  name: string | null;
  version: string;
  status: MethodologyStatus;
  origin: MethodologyOrigin;
  origin_label: string;
  domain_code: string;
  domain_module: string | null;
  regulator: { id: string; code: string; name: string } | null;
  sector_summary: string | null;
  entity_types: string[];
  effective_from: string | null;
  effective_to: string | null;
  assessment_frequency_months: number | null;
  approval_required: boolean | null;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  activated_at: string | null;
  retired_at: string | null;
  supersedes: { id: string; code: string; version: string; status: string; origin: string } | null;
  adopted_from: { id: string; code: string; version: string; status: string; origin: string; origin_label: string } | null;
  superseded_by: Array<{ id: string; version: string; status: string; origin: string }>;
  adoptions: Array<{ id: string; version: string; status: string; regulator_id: string | null; regulator_name: string | null }>;
  counts: Record<string, number>;
  composition: {
    by_class: Record<string, number>;
    by_axis: Record<string, number>;
    by_focus: Record<string, number>;
    by_participation: Record<string, number>;
    by_change: Record<string, number>;
    scored_inherent: number;
    contextual_inherent: number;
    evidence_required: number;
    na_allowed: number;
    auto_prefill_possible: number;
    judgement_required: number;
  };
}

export interface MethodologyDimension {
  id: string;
  dimension_code: string;
  label: string;
  description: string | null;
  dimension_kind: 'INHERENT' | 'CONTROL' | string;
  dimension_group: string | null;
  weight: number | null;
  evidence_required: boolean | null;
  sort_order: number | null;
  question_count: number;
  /** Reported by the register so the Studio can show retired structure honestly. */
  active?: boolean;
  /** Used for optimistic concurrency when reordering or editing. */
  updated_at?: string | null;
}

export interface MethodologyQuestionRow {
  id: string;
  question_code: string;
  prompt: string;
  dimension_id: string;
  dimension_code: string;
  dimension_label: string;
  dimension_kind: string;
  question_class: string | null;
  axis: string | null;
  effectiveness_focus: string | null;
  calculation_participation: string | null;
  response_semantics_code: string | null;
  requires_evidence: boolean | null;
  min_evidence_count: number | null;
  allow_not_applicable: boolean | null;
  sector_classification: string | null;
  sector_applicability: string | null;
  change_classification: string | null;
  trigger_condition: string | null;
  fact_count: number;
}

export interface MethodologyQuestionDetail extends Record<string, unknown> {
  id: string;
  question_code: string;
  prompt: string;
  supervisory_intent: string | null;
  guidance: string | null;
  question_class: string | null;
  mandatory: boolean | null;
  axis: string | null;
  effectiveness_focus: string | null;
  calculation_participation: string | null;
  response_semantics_code: string | null;
  response_options: string[];
  allow_not_applicable: boolean | null;
  na_conditions: string | null;
  na_requires_rationale: boolean | null;
  requires_observation: boolean | null;
  requires_evidence: boolean | null;
  min_evidence_count: number | null;
  minimum_evidence_note: string | null;
  evidence_basis_types: string[];
  supervisory_judgement_required: boolean | null;
  factual_auto_prefill_possible: boolean | null;
  sector_classification: string | null;
  sector_applicability: string | null;
  sector_notes: string | null;
  trigger_condition: string | null;
  applicability_rule: string | null;
  standards_reference: string | null;
  standards_reference_strength: string | null;
  standards_reference_review: string | null;
  predecessor_mapping: string | null;
  change_classification: string | null;
  question_version: number | null;
  dimension: { id: string; dimension_code: string; label: string; dimension_kind: string };
  semantic_profile: MethodologySemanticProfile | null;
  fact_requirements: Array<{
    id: string; fact_code: string; label: string | null; data_type: string | null;
    unit: string | null; definition_status: string | null; is_required: boolean | null;
  }>;
}

export interface MethodologySemanticProfile {
  id: string;
  semantic_code: string;
  label: string | null;
  description: string | null;
  profile_version: string | null;
  response_meaning: Record<string, unknown> | null;
  owner?: { methodology_id: string; code: string; version: string; origin: string; origin_label: string };
  question_count?: number;
}

export interface MethodologyFactRow {
  id: string;
  fact_code: string;
  label: string | null;
  data_type: string | null;
  unit: string | null;
  is_required: boolean | null;
  auto_prefill_allowed: boolean | null;
  officer_edit_allowed: boolean | null;
  definition_status: string | null;
  materiality_parameter_code: string | null;
  question_count: number;
}

export interface MethodologyFactResult {
  total_count: number;
  rows: MethodologyFactRow[];
  status_summary: Record<string, number>;
}

export interface MethodologyParameterRow {
  id: string;
  parameter_code: string;
  label: string | null;
  parameter_kind: string | null;
  data_type: string | null;
  unit: string | null;
  approval_status: string;
  value_numeric: number | null;
  value_text: string | null;
  has_value: boolean;
  referenced_by: string[];
  referenced_by_count: number;
}

export interface MethodologyParameterResult {
  total_count: number;
  unapproved_count: number;
  valued_count: number;
  rows: MethodologyParameterRow[];
}

export interface MethodologyReferenceDecisionRow {
  id: string;
  decision_code: string;
  title: string | null;
  decision_text: string | null;
  rationale: string | null;
  approval_scope: string | null;
  decision_source: string | null;
  status: string;
  regulator_approval_recorded: boolean;
  customer_adoption_recorded: boolean;
  recorded_at: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  methodology_code: string | null;
  methodology_version: string | null;
}

export interface MethodologyReferenceDecisionResult {
  total_count: number;
  regulator_approved_count: number;
  rows: MethodologyReferenceDecisionRow[];
}

export interface MethodologyApprovalRow {
  id: string;
  methodology_id: string;
  methodology_code: string;
  methodology_name: string | null;
  methodology_version: string;
  domain_code: string;
  regulator_id: string | null;
  regulator_code: string | null;
  regulator_name: string | null;
  decision: string;
  rationale: string | null;
  submitted_by: string | null;
  submitted_by_name: string | null;
  decided_by: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  is_current: boolean;
}

export interface MethodologyAuditRow {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string | null;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface MethodologyCompareQuestion {
  id?: string;
  question_code: string;
  prompt: string;
  question_class?: string | null;
  axis?: string | null;
  dimension_code: string;
  dimension_label: string;
  predecessors: Array<{ question_code: string; prompt: string; dimension_code: string; dimension_label: string }>;
  dimension_changed: boolean;
}

export interface MethodologyCompare {
  comparable: boolean;
  reason?: string;
  baseline?: {
    id: string; code: string; name: string | null; version: string; status: string;
    origin: string; origin_label: string; dimension_count: number; question_count: number;
  };
  target: {
    id: string; code?: string; name?: string | null; version: string; status?: string;
    origin?: string; origin_label?: string; dimension_count?: number; question_count?: number;
  };
  summary?: Record<string, number>;
  groups?: Array<{ change_classification: string; count: number; questions: MethodologyCompareQuestion[] }>;
  note?: string;
}

export interface MethodologyReadinessLayer {
  key: string;
  label: string;
  state: string;
  headline: string;
  blocks_approval?: boolean;
  metrics: Record<string, unknown>;
}

export interface MethodologyReadiness {
  methodology_id: string;
  generated_at: string;
  layers: MethodologyReadinessLayer[];
  note: string;
}

export interface MethodologyCapability {
  allowed: boolean;
  reason: string | null;
  requires_rationale?: boolean;
  target_count?: number;
}

export interface MethodologyCapabilities {
  methodology_id: string;
  status: MethodologyStatus;
  origin: MethodologyOrigin;
  domain_code: string;
  is_platform_administrator: boolean;
  can_edit: MethodologyCapability;
  can_adopt: MethodologyCapability;
  can_submit_review: MethodologyCapability;
  can_return_to_draft: MethodologyCapability;
  can_approve: MethodologyCapability;
  can_activate: MethodologyCapability;
  maker_checker: {
    author_id: string | null;
    author_name: string | null;
    submitted_by: string | null;
    submitted_by_name: string | null;
    submitted_at: string | null;
    actor_is_author: boolean;
    actor_is_submitter: boolean;
  };
}

export interface MethodologyAdoptionTargets {
  rows: Array<{ id: string; code: string; name: string; already_adopted: boolean; resulting_version: string }>;
  total_count: number;
  reference?: { id: string; code: string; version: string; origin: string; origin_label: string };
  reason: string | null;
}

/* --------------------------------------------------------------- reads */

export interface MethodologyRegisterArgs {
  search?: string;
  domainCode?: string | null;
  origin?: string | null;
  status?: string | null;
  regulatorId?: string | null;
  sectorId?: string | null;
  approvalState?: string | null;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function useSupervisoryMethodologies(args: MethodologyRegisterArgs) {
  return useQuery({
    queryKey: ['supervisory_methodology_register', args],
    queryFn: () => rpc<MethodologyRegisterResult>('supervisory_methodology_register', {
      _search: args.search?.trim() || null,
      _domain_code: args.domainCode ?? null,
      _origin: args.origin ?? null,
      _status: args.status ?? null,
      _regulator_id: args.regulatorId ?? null,
      _sector_id: args.sectorId ?? null,
      _approval_state: args.approvalState ?? null,
      _sort: args.sortKey ?? 'domain',
      _dir: args.sortDirection ?? 'asc',
      _limit: args.pageSize,
      _offset: (args.page - 1) * args.pageSize,
    }),
    staleTime: 30_000,
  });
}

export function useSupervisoryMethodologyRegisterOptions() {
  return useQuery({
    queryKey: ['supervisory_methodology_register_options'],
    queryFn: () => rpc<MethodologyRegisterOptions>('supervisory_methodology_register_options'),
    staleTime: 300_000,
  });
}

export function useSupervisoryMethodology(methodologyId?: string) {
  return useQuery({
    queryKey: ['supervisory_methodology_detail', methodologyId],
    queryFn: () => rpc<MethodologyDetail>('supervisory_methodology_detail', { _methodology_id: methodologyId }),
    enabled: !!methodologyId,
    staleTime: 30_000,
  });
}

export function useSupervisoryMethodologyDimensions(
  methodologyId?: string, enabled = true, includeRetired = false,
) {
  return useQuery({
    queryKey: ['supervisory_methodology_dimension_list', methodologyId, includeRetired],
    queryFn: () => rpc<MethodologyDimension[]>('supervisory_methodology_dimension_list', {
      _methodology_id: methodologyId,
      _include_retired: includeRetired,
    }),
    enabled: !!methodologyId && enabled,
    staleTime: 60_000,
  });
}

export interface MethodologyQuestionArgs {
  methodologyId?: string;
  search?: string;
  dimensionId?: string | null;
  questionClass?: string | null;
  axis?: string | null;
  effectivenessFocus?: string | null;
  participation?: string | null;
  sectorClassification?: string | null;
  changeClassification?: string | null;
  naAllowed?: boolean | null;
  evidenceRequired?: boolean | null;
  autoPrefill?: boolean | null;
  judgementRequired?: boolean | null;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function useSupervisoryMethodologyQuestions(args: MethodologyQuestionArgs, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_question_register', args],
    queryFn: () => rpc<{ total_count: number; rows: MethodologyQuestionRow[] }>(
      'supervisory_methodology_question_register', {
        _methodology_id: args.methodologyId,
        _search: args.search?.trim() || null,
        _dimension_id: args.dimensionId ?? null,
        _question_class: args.questionClass ?? null,
        _axis: args.axis ?? null,
        _effectiveness_focus: args.effectivenessFocus ?? null,
        _participation: args.participation ?? null,
        _sector_classification: args.sectorClassification ?? null,
        _change_classification: args.changeClassification ?? null,
        _na_allowed: args.naAllowed ?? null,
        _evidence_required: args.evidenceRequired ?? null,
        _auto_prefill: args.autoPrefill ?? null,
        _judgement_required: args.judgementRequired ?? null,
        _sort: args.sortKey ?? 'code',
        _dir: args.sortDirection ?? 'asc',
        _limit: args.pageSize,
        _offset: (args.page - 1) * args.pageSize,
      }),
    enabled: !!args.methodologyId && enabled,
    staleTime: 30_000,
  });
}

export function useSupervisoryMethodologyQuestion(questionId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_methodology_question_detail', questionId],
    queryFn: () => rpc<MethodologyQuestionDetail>('supervisory_methodology_question_detail', { _question_id: questionId }),
    enabled: !!questionId,
    staleTime: 60_000,
  });
}

export function useSupervisoryMethodologySemantics(methodologyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_semantic_register', methodologyId],
    queryFn: () => rpc<MethodologySemanticProfile[]>('supervisory_methodology_semantic_register', { _methodology_id: methodologyId }),
    enabled: !!methodologyId && enabled,
    staleTime: 60_000,
  });
}

export interface MethodologyFactArgs {
  methodologyId?: string;
  search?: string;
  definitionStatus?: string | null;
  required?: boolean | null;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function useSupervisoryMethodologyFacts(args: MethodologyFactArgs, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_fact_register', args],
    queryFn: () => rpc<MethodologyFactResult>('supervisory_methodology_fact_register', {
      _methodology_id: args.methodologyId,
      _search: args.search?.trim() || null,
      _definition_status: args.definitionStatus ?? null,
      _required: args.required ?? null,
      _sort: args.sortKey ?? 'fact_code',
      _dir: args.sortDirection ?? 'asc',
      _limit: args.pageSize,
      _offset: (args.page - 1) * args.pageSize,
    }),
    enabled: !!args.methodologyId && enabled,
    staleTime: 30_000,
  });
}

export function useSupervisoryMethodologyFact(factId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_methodology_fact_detail', factId],
    queryFn: () => rpc<Record<string, any>>('supervisory_methodology_fact_detail', { _fact_id: factId }),
    enabled: !!factId,
    staleTime: 60_000,
  });
}

export function useSupervisoryMethodologyParameters(methodologyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_parameter_register', methodologyId],
    queryFn: () => rpc<MethodologyParameterResult>('supervisory_methodology_parameter_register', { _methodology_id: methodologyId }),
    enabled: !!methodologyId && enabled,
    staleTime: 60_000,
  });
}

export function useSupervisoryMethodologyReferenceDecisions(methodologyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_reference_decision_register', methodologyId],
    queryFn: () => rpc<MethodologyReferenceDecisionResult>('supervisory_methodology_reference_decision_register', { _methodology_id: methodologyId }),
    enabled: !!methodologyId && enabled,
    staleTime: 60_000,
  });
}

export interface MethodologyApprovalArgs {
  methodologyId?: string | null;
  regulatorId?: string | null;
  decision?: string | null;
  currentOnly?: boolean | null;
  sortKey?: string;
  sortDirection?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function useSupervisoryMethodologyApprovals(args: MethodologyApprovalArgs, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_approval_register', args],
    queryFn: () => rpc<{ total_count: number; rows: MethodologyApprovalRow[] }>(
      'supervisory_methodology_approval_register', {
        _methodology_id: args.methodologyId ?? null,
        _regulator_id: args.regulatorId ?? null,
        _decision: args.decision ?? null,
        _current_only: args.currentOnly ?? null,
        _sort: args.sortKey ?? 'decided_at',
        _dir: args.sortDirection ?? 'desc',
        _limit: args.pageSize,
        _offset: (args.page - 1) * args.pageSize,
      }),
    enabled,
    staleTime: 30_000,
  });
}

export function useSupervisoryMethodologyAudit(methodologyId?: string, page = 1, pageSize = 25, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_audit_register', methodologyId, page, pageSize],
    queryFn: () => rpc<{ total_count: number; rows: MethodologyAuditRow[] }>(
      'supervisory_methodology_audit_register', {
        _methodology_id: methodologyId,
        _limit: pageSize,
        _offset: (page - 1) * pageSize,
      }),
    enabled: !!methodologyId && enabled,
    staleTime: 15_000,
  });
}

export function useSupervisoryMethodologyCompare(methodologyId?: string, baselineId?: string | null, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_compare', methodologyId, baselineId],
    queryFn: () => rpc<MethodologyCompare>('supervisory_methodology_compare', {
      _methodology_id: methodologyId,
      _baseline_id: baselineId ?? null,
    }),
    enabled: !!methodologyId && enabled,
    staleTime: 60_000,
  });
}

/**
 * Governance bundle: layered readiness, server capability contract and the
 * server-scoped adoption targets. The UI never infers any of these.
 */
export function useSupervisoryMethodologyGovernance(methodologyId?: string) {
  const readiness = useQuery({
    queryKey: ['supervisory_methodology_review_readiness', methodologyId],
    queryFn: () => rpc<MethodologyReadiness>('supervisory_methodology_review_readiness', { _methodology_id: methodologyId }),
    enabled: !!methodologyId,
    staleTime: 15_000,
  });
  const capabilities = useQuery({
    queryKey: ['supervisory_methodology_action_capabilities', methodologyId],
    queryFn: () => rpc<MethodologyCapabilities>('supervisory_methodology_action_capabilities', { _methodology_id: methodologyId }),
    enabled: !!methodologyId,
    staleTime: 15_000,
  });
  return { readiness, capabilities };
}

export function useSupervisoryMethodologyAdoptionTargets(methodologyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_adoption_targets', methodologyId],
    queryFn: () => rpc<MethodologyAdoptionTargets>('supervisory_methodology_adoption_targets', { _methodology_id: methodologyId }),
    enabled: !!methodologyId && enabled,
    staleTime: 30_000,
  });
}

/* ----------------------------------------------------------- mutations */

function useMethodologyInvalidator() {
  const qc = useQueryClient();
  return (methodologyId?: string) => {
    [
      'supervisory_methodology_register',
      'supervisory_methodology_detail',
      'supervisory_methodology_review_readiness',
      'supervisory_methodology_action_capabilities',
      'supervisory_methodology_adoption_targets',
      'supervisory_methodology_approval_register',
      'supervisory_methodology_audit_register',
      'supervisory_methodology_compare',
    ].forEach((key) => void qc.invalidateQueries({ queryKey: [key] }));
    if (methodologyId) void qc.invalidateQueries({ queryKey: ['supervisory_methodology_detail', methodologyId] });
  };
}

/** Governed adoption of a MIPL reference for one authorised regulator. */
export function useAdoptMethodologyReference() {
  const invalidate = useMethodologyInvalidator();
  return useMutation({
    mutationFn: (vars: { referenceId: string; regulatorId: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_adopt_reference', {
        _reference_methodology_id: vars.referenceId,
        _regulator_id: vars.regulatorId,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => invalidate(vars.referenceId),
  });
}

/** Governed lifecycle transition. Authority is decided server-side. */
export function useMethodologyLifecycleTransition() {
  const invalidate = useMethodologyInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; toStatus: 'REVIEW' | 'DRAFT' | 'APPROVED'; rationale: string }) =>
      rpc<Record<string, unknown>>('supervisory_methodology_lifecycle', {
        _methodology_id: vars.methodologyId,
        _to_status: vars.toStatus,
        _rationale: vars.rationale,
      }),
    onSuccess: (_r, vars) => invalidate(vars.methodologyId),
  });
}

/* ------------------------------------------------------- studio (AML-02) */

export interface MethodologyStudioCapabilities extends MethodologyCapabilities {
  can_author: MethodologyCapability;
  can_edit_metadata: MethodologyCapability;
  can_author_dimensions: MethodologyCapability;
  can_author_questions: MethodologyCapability;
  can_author_semantics: MethodologyCapability;
  can_author_facts: MethodologyCapability;
  can_author_parameters: MethodologyCapability;
  can_author_reference_decisions: MethodologyCapability;
  can_create_version: MethodologyCapability;
  can_submit: MethodologyCapability;
  can_validate: MethodologyCapability;
  can_set_parameter_values: MethodologyCapability;
  blocking_validation_count: number;
  requires_retirement_rationale: boolean;
}

export interface MethodologyValidationFinding {
  code: string;
  severity: 'BLOCKING' | 'ADVISORY' | string;
  object: string;
  subject: string | null;
  count: number;
  message: string;
}

export interface MethodologyValidation {
  methodology_id: string;
  status: MethodologyStatus;
  origin: MethodologyOrigin;
  generated_at: string;
  blocking_count: number;
  advisory_count: number;
  findings: MethodologyValidationFinding[];
  note: string;
}

/** Server-authoritative authoring capabilities. The screen never infers these. */
export function useSupervisoryMethodologyStudioCapabilities(methodologyId?: string) {
  return useQuery({
    queryKey: ['supervisory_methodology_studio_capabilities', methodologyId],
    queryFn: () => rpc<MethodologyStudioCapabilities>('supervisory_methodology_studio_capabilities', { _methodology_id: methodologyId }),
    enabled: !!methodologyId,
    staleTime: 15_000,
  });
}

export function useSupervisoryMethodologyValidation(methodologyId?: string, enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_validate', methodologyId],
    queryFn: () => rpc<MethodologyValidation>('supervisory_methodology_validate', { _methodology_id: methodologyId }),
    enabled: !!methodologyId && enabled,
    staleTime: 10_000,
  });
}

function useStudioInvalidator() {
  const qc = useQueryClient();
  const invalidateGovernance = useMethodologyInvalidator();
  return (methodologyId?: string) => {
    invalidateGovernance(methodologyId);
    [
      'supervisory_methodology_dimension_list',
      'supervisory_methodology_question_register',
      'supervisory_methodology_question_detail',
      'supervisory_methodology_fact_register',
      'supervisory_methodology_fact_detail',
      'supervisory_methodology_parameter_register',
      'supervisory_methodology_semantic_register',
      'supervisory_methodology_validate',
      'supervisory_methodology_studio_capabilities',
      'supervisory_methodology_reference_decision_register',
      'supervisory_methodology_vocabulary',
    ].forEach((key) => void qc.invalidateQueries({ queryKey: [key] }));
  };
}

export interface QuestionSavePayload {
  question_code: string;
  dimension_code: string;
  prompt: string;
  guidance?: string | null;
  supervisory_intent?: string | null;
  question_class?: string | null;
  mandatory?: boolean;
  requires_observation?: boolean;
  requires_evidence?: boolean;
  min_evidence_count?: number;
  allow_not_applicable?: boolean;
  na_requires_rationale?: boolean;
  sort_order?: number;
  response_options?: string[];
  expected_updated_at?: string | null;
}

/** Governed creation or update of one question. */
export function useSaveMethodologyQuestion() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; payload: QuestionSavePayload; rationale?: string }) =>
      rpc<string>('supervisory_methodology_question_save', {
        _methodology_id: vars.methodologyId,
        _payload: vars.payload,
        _rationale: vars.rationale ?? null,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useRetireMethodologyQuestion() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; questionCode: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_question_retire', {
        _methodology_id: vars.methodologyId,
        _question_code: vars.questionCode,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useSaveMethodologyDimension() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; payload: Record<string, unknown> }) =>
      rpc<string>('supervisory_methodology_dimension_save', {
        _methodology_id: vars.methodologyId,
        _payload: vars.payload,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useRetireMethodologyDimension() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; dimensionCode: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_dimension_retire', {
        _methodology_id: vars.methodologyId,
        _dimension_code: vars.dimensionCode,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useLinkQuestionFact() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; questionCode: string; factCode: string; isRequired?: boolean }) =>
      rpc<string>('supervisory_methodology_question_fact_link', {
        _methodology_id: vars.methodologyId,
        _question_code: vars.questionCode,
        _fact_code: vars.factCode,
        _is_required: vars.isRequired ?? true,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useUnlinkQuestionFact() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; questionCode: string; factCode: string }) =>
      rpc<number>('supervisory_methodology_question_fact_unlink', {
        _methodology_id: vars.methodologyId,
        _question_code: vars.questionCode,
        _fact_code: vars.factCode,
      }),
    onSuccess: (_n, vars) => invalidate(vars.methodologyId),
  });
}

export function useDeleteMethodologyFactRequirement() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; factCode: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_fact_requirement_delete', {
        _methodology_id: vars.methodologyId,
        _fact_code: vars.factCode,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}


/* --------------------------------------- AML-02 completion: authoring layer */

export interface MethodologyVocabulary {
  question_class: string[];
  axis: string[];
  effectiveness_focus: string[];
  calculation_participation: string[];
  change_classification: string[];
  evidence_basis: string[];
  dimension_group: string[];
  dimension_kind: string[];
  fact_data_type: string[];
  fact_definition_status: string[];
  fact_attribute_source: string[];
  parameter_kind: string[];
  parameter_data_type: string[];
}

/** Governed vocabulary. No supervisory classification list is hard-coded in the browser. */
export function useSupervisoryMethodologyVocabulary(enabled = true) {
  return useQuery({
    queryKey: ['supervisory_methodology_vocabulary'],
    queryFn: () => rpc<MethodologyVocabulary>('supervisory_methodology_vocabulary'),
    enabled,
    staleTime: 300_000,
  });
}

/** Governed creation of a new methodology version. Always produces a DRAFT. */
export function useCreateMethodology() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      rpc<string>('supervisory_methodology_create', { _payload: payload }),
    onSuccess: (id) => invalidate(id),
  });
}

export function useSaveMethodologyMetadata() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; payload: Record<string, unknown> }) =>
      rpc<string>('supervisory_methodology_metadata_save', {
        _methodology_id: vars.methodologyId,
        _payload: vars.payload,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useSaveMethodologySemanticProfile() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; profiles: Array<Record<string, unknown>> }) =>
      rpc<number>('supervisory_methodology_semantic_profile_set', {
        _methodology_id: vars.methodologyId,
        _payload: vars.profiles,
      }),
    onSuccess: (_n, vars) => invalidate(vars.methodologyId),
  });
}

export function useRetireMethodologySemanticProfile() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; semanticCode: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_semantic_profile_retire', {
        _methodology_id: vars.methodologyId,
        _semantic_code: vars.semanticCode,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => invalidate(vars.methodologyId),
  });
}

export function useSaveMethodologyFactRequirement() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; facts: Array<Record<string, unknown>> }) =>
      rpc<number>('supervisory_methodology_fact_requirement_set', {
        _methodology_id: vars.methodologyId,
        _payload: vars.facts,
      }),
    onSuccess: (_n, vars) => invalidate(vars.methodologyId),
  });
}

/** Definition authoring only — a policy value is never sent from this screen. */
export function useSaveMethodologyParameter() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; parameters: Array<Record<string, unknown>> }) =>
      rpc<number>('supervisory_methodology_parameter_set', {
        _methodology_id: vars.methodologyId,
        _payload: vars.parameters,
      }),
    onSuccess: (_n, vars) => invalidate(vars.methodologyId),
  });
}

export function useRecordMethodologyReferenceDecision() {
  const invalidate = useStudioInvalidator();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; decisions: Array<Record<string, unknown>> }) =>
      rpc<number>('supervisory_methodology_reference_decision_record', { _payload: vars.decisions }),
    onSuccess: (_n, vars) => invalidate(vars.methodologyId),
  });
}

/* ------------------------------------------- question applicability rules (AML-04)
 * The rule vocabulary, the rule validator and the rule summary are all owned by
 * the server (`supervisory_question_rule_vocabulary`, `_rule_check`,
 * `supervisory_methodology_question_rule_save`). The browser only renders what
 * the vocabulary offers and shows the findings the server returns; it never
 * evaluates or interprets a rule.
 */

export interface RuleVocabularySource {
  code: string;
  label: string;
  data_type: string;
  available: boolean;
  unavailable_reason?: string | null;
  allowed_values?: (string | { label: string; value: string })[] | null;
}

export interface RuleVocabularyOperator {
  code: string;
  label: string;
  arity: 'NONE' | 'VALUE' | 'VALUES' | string;
  types: string[];
}

export interface RuleVocabulary {
  note: string;
  groups: string[];
  sources: RuleVocabularySource[];
  operators: RuleVocabularyOperator[];
}

export interface MethodologyQuestionRule {
  id: string;
  rule_kind: 'APPLICABILITY' | 'TRIGGER' | string;
  rule_version: number;
  rule_definition: Record<string, unknown>;
  rule_summary: string | null;
  provenance: string | null;
  active: boolean;
  created_at: string;
  readiness: 'EXECUTABLE' | 'NOT_EXECUTABLE' | string;
  findings: { code: string; message: string }[];
}

export function useQuestionRuleVocabulary() {
  return useQuery({
    queryKey: ['supervisory_question_rule_vocabulary'],
    queryFn: () => rpc<RuleVocabulary>('supervisory_question_rule_vocabulary'),
    staleTime: 300_000,
  });
}

export function useMethodologyQuestionRules(questionId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_methodology_question_rules', questionId],
    queryFn: () => rpc<MethodologyQuestionRule[]>('supervisory_methodology_question_rules', { _question_id: questionId }),
    enabled: !!questionId,
    staleTime: 30_000,
  });
}

export function useSaveQuestionRule() {
  const invalidate = useStudioInvalidator();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      methodologyId: string;
      questionId: string;
      ruleKind: string;
      ruleDefinition: Record<string, unknown>;
      rationale: string;
      provenance?: string | null;
    }) =>
      rpc<string>('supervisory_methodology_question_rule_save', {
        _methodology_id: vars.methodologyId,
        _question_id: vars.questionId,
        _rule_kind: vars.ruleKind,
        _rule_definition: vars.ruleDefinition,
        _rationale: vars.rationale,
        _provenance: vars.provenance ?? null,
      }),
    onSuccess: (_id, vars) => {
      invalidate(vars.methodologyId);
      void qc.invalidateQueries({ queryKey: ['supervisory_methodology_question_rules', vars.questionId] });
    },
  });
}

export function useRemoveQuestionRule() {
  const invalidate = useStudioInvalidator();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { methodologyId: string; questionId: string; ruleId: string; rationale: string }) =>
      rpc<string>('supervisory_methodology_question_rule_remove', {
        _rule_id: vars.ruleId,
        _rationale: vars.rationale,
      }),
    onSuccess: (_id, vars) => {
      invalidate(vars.methodologyId);
      void qc.invalidateQueries({ queryKey: ['supervisory_methodology_question_rules', vars.questionId] });
    },
  });
}
