/**
 * MC-08 — AI Governance & Supervisory Assurance read/write hooks.
 *
 * Every figure and list here is produced by a governed server operation. The
 * browser never writes an AI governance table directly, never sends model or
 * instruction text that could execute, and never alters recorded AI output or
 * its provenance.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sb = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  from: (t: string) => any;
};

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

/** Turn a database error into something a supervisor can act on. */
export function governanceMessage(e: unknown): string {
  const raw = String((e as Error)?.message ?? e ?? '');
  if (/ai_governance_not_permitted|42501/.test(raw) && /not_permitted/.test(raw)) {
    return 'You do not have AI governance rights for this action.';
  }
  if (/separation_of_duties/.test(raw)) {
    return 'The person who authored this AI configuration cannot approve it for production. A second authorised approver is required.';
  }
  if (/immutable_released_configuration|immutable_released_instruction/.test(raw)) {
    return 'A released model or instruction version cannot be edited. Register a new version instead so the historical record stays truthful.';
  }
  if (/transition_not_permitted/.test(raw)) return 'That status change is not permitted from the current status.';
  if (/rationale_required/.test(raw)) return 'A written reason is required.';
  if (/reason_required/.test(raw)) return 'A written reason is required.';
  if (/closure_note_required/.test(raw)) return 'A written basis for the conclusion is required.';
  if (/model_not_approved/.test(raw)) return 'Only an approved model can be bound to a capability.';
  if (/instruction_not_released/.test(raw)) return 'Only a released instruction version can be bound to a capability.';
  if (/no_state_change/.test(raw)) return 'That is already the current status.';
  return raw.replace(/^[a-z_]+:\s*/i, '') || 'The action could not be completed.';
}

// ---------------------------------------------------------------- overview
export interface GovernanceOverview {
  prepared: number; awaiting_review: number; accepted: number; modified: number;
  rejected: number; superseded: number; stale: number; low_confidence: number;
  no_citations: number; failures: number; refusals: number; scope_refusals: number;
  governance_refusals: number; attempts_total: number;
  suspended_use_cases: number; suspended_models: number; suspended_instructions: number;
  active_use_cases: number; open_assurance: number; assurance_control_failures: number;
  open_remediation: number;
  thresholds: {
    unreviewed_hours: number; low_confidence_below: number;
    high_modification_rate: number; high_rejection_rate: number; min_volume_for_analysis: number;
  } | null;
  governance_caveat: string;
}

export interface OverviewFilters {
  from?: string | null; to?: string | null; useCaseCode?: string | null; module?: string | null;
}

export function useAiGovernanceOverview(f: OverviewFilters = {}) {
  return useQuery({
    queryKey: ['ai-gov-overview', f],
    queryFn: () => rpc<GovernanceOverview>('ai_governance_overview', {
      _from: f.from || null, _to: f.to || null,
      _use_case_code: f.useCaseCode || null, _module: f.module || null,
    }),
    staleTime: 30_000,
  });
}

// ---------------------------------------------------------------- activity
export interface ActivityRow {
  activity_id: string;
  activity_kind: 'INSIGHT' | 'ATTEMPT';
  occurred_at: string;
  owning_module: string | null;
  use_case_code: string | null;
  use_case_label: string | null;
  advisory_classification: string | null;
  use_case_lifecycle: string | null;
  entity_id: string | null;
  requested_by: string | null;
  requested_role: string | null;
  outcome: string;
  reason_code: string | null;
  /** Vendor-neutral governance identity shown on regulator-facing screens. */
  governance_service_label: string | null;
  governance_model_label: string | null;
  governance_version_label: string | null;
  /** True only for authorised technical/audit users; the three fields below are null otherwise. */
  technical_provenance_available: boolean;
  provider: string | null;
  model: string | null;
  model_version: string | null;

  prompt_template_code: string | null;
  prompt_template_version: string | null;
  snapshot_fingerprint: string | null;
  window_start: string | null;
  window_end: string | null;
  confidence: number | null;
  uncertainty: string | null;
  limitations: string[] | null;
  staleness_state: string | null;
  staleness_checked_at: string | null;
  review_state: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  human_rationale: string | null;
  has_human_wording: boolean;
  citation_count: number;
  latency_ms: number | null;
  conduct_ai_insight_id: string | null;
}

export interface ActivityFilters {
  from?: string | null; to?: string | null; useCaseCode?: string | null;
  outcome?: string | null; reviewState?: string | null; module?: string | null;
  modelVersion?: string | null; instructionVersion?: string | null;
  limit?: number; offset?: number;
}

export function useAiActivity(f: ActivityFilters = {}) {
  return useQuery({
    queryKey: ['ai-gov-activity', f],
    queryFn: async () => {
      let q = sb.from('ai_governance_activity_presentation_v').select('*').order('occurred_at', { ascending: false });
      if (f.from) q = q.gte('occurred_at', f.from);
      if (f.to) q = q.lte('occurred_at', f.to);
      if (f.useCaseCode) q = q.eq('use_case_code', f.useCaseCode);
      if (f.outcome) q = q.eq('outcome', f.outcome);
      if (f.reviewState) q = q.eq('review_state', f.reviewState);
      if (f.module) q = q.eq('owning_module', f.module);
      if (f.modelVersion) q = q.eq('model_version', f.modelVersion);
      if (f.instructionVersion) q = q.eq('prompt_template_version', f.instructionVersion);
      const { data, error } = await q.range(f.offset ?? 0, (f.offset ?? 0) + (f.limit ?? 50) - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as ActivityRow[];
    },
    staleTime: 20_000,
  });
}

export interface ExceptionRow {
  exception_code: string; severity: string; activity_id: string; activity_kind: string;
  occurred_at: string; use_case_code: string | null; entity_id: string | null; detail: string;
}

export function useAiGovernanceExceptions(limit = 200) {
  return useQuery({
    queryKey: ['ai-gov-exceptions', limit],
    queryFn: () => rpc<ExceptionRow[]>('ai_governance_exceptions', { _limit: limit }),
    staleTime: 30_000,
  });
}

export interface VersionImpactRow {
  cohort: string; volume: number; accepted: number; modified: number; rejected: number;
  superseded: number; not_reviewed: number; stale: number; low_confidence: number;
  no_citation: number; avg_confidence: number | null; avg_review_hours: number | null;
  sufficient_volume: boolean;
}

export function useVersionImpact(dimension: 'MODEL' | 'INSTRUCTION' | 'USE_CASE') {
  return useQuery({
    queryKey: ['ai-gov-impact', dimension],
    queryFn: () => rpc<VersionImpactRow[]>('ai_governance_version_impact', { _dimension: dimension }),
    staleTime: 60_000,
  });
}

// --------------------------------------------------------------- registers
export interface UseCaseRow {
  code: string; label: string; description: string | null; owning_module: string;
  lifecycle_state: string; advisory_classification: string | null; risk_classification: string | null;
  governance_level: string | null; governance_owner: string | null;
  human_review_required: boolean; is_enabled: boolean;
  required_permission_actions: string[] | null; approved_roles: string[] | null;
  allowed_output_classes: string[] | null; prohibited_output_classes: string[] | null;
  limitation_policy: string | null; allowed_source: string | null;
  workflow_mutation_allowed: boolean;
  prompt_template_code: string | null; prompt_template_version: string | null;
  approved_model_id: string | null; approved_instruction_id: string | null;
  use_case_version: number; effective_from: string | null; effective_to: string | null;
  approved_at: string | null; suspended_at: string | null; suspension_reason: string | null;
  updated_at: string | null;
}

export function useAiUseCases() {
  return useQuery({
    queryKey: ['ai-gov-use-cases'],
    queryFn: async () => {
      const { data, error } = await sb.from('conduct_ai_use_cases').select('*').order('label');
      if (error) throw new Error(error.message);
      return (data ?? []) as UseCaseRow[];
    },
  });
}

export interface ModelRow {
  id: string; provider: string; model_key: string; technical_identifier: string;
  model_version: string | null; display_name: string; regulatory_purpose: string | null;
  known_limitations: string | null; data_handling_class: string | null;
  external_data_capable: boolean; lifecycle_state: string;
  approved_at: string | null; effective_from: string | null; retired_at: string | null;
  suspended_at: string | null; suspension_reason: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

export function useAiModels() {
  return useQuery({
    queryKey: ['ai-gov-models'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_models_presentation_v').select('*').order('governance_display_name');
      if (error) throw new Error(error.message);
      return (data ?? []) as ModelRow[];
    },
  });
}

export interface InstructionRow {
  id: string; template_code: string; version: string; title: string; purpose: string | null;
  use_case_code: string | null; instruction_body: string | null; allowed_fact_scope: string | null;
  prohibited_behaviours: string[] | null; required_caveats: string[] | null;
  citation_expectation: string | null; confidence_expectation: string | null;
  lifecycle_state: string; released_at: string | null; effective_from: string | null;
  suspended_at: string | null; suspension_reason: string | null;
  created_by: string | null; created_at: string; updated_at: string;
}

export function useAiInstructions() {
  return useQuery({
    queryKey: ['ai-gov-instructions'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_instructions')
        .select('*').order('template_code').order('version');
      if (error) throw new Error(error.message);
      return (data ?? []) as InstructionRow[];
    },
  });
}

export interface GovernanceEventRow {
  id: string; object_type: string; object_id: string | null; object_code: string | null;
  event_type: string; from_state: string | null; to_state: string | null;
  actor_id: string | null; rationale: string | null; metadata: Record<string, unknown> | null;
  created_at: string;
}

export function useGovernanceEvents(objectType?: string, objectCode?: string, limit = 100) {
  return useQuery({
    queryKey: ['ai-gov-events', objectType, objectCode, limit],
    queryFn: async () => {
      let q = sb.from('ai_governance_events').select('*').order('created_at', { ascending: false });
      if (objectType) q = q.eq('object_type', objectType);
      if (objectCode) q = q.eq('object_code', objectCode);
      const { data, error } = await q.limit(limit);
      if (error) throw new Error(error.message);
      return (data ?? []) as GovernanceEventRow[];
    },
  });
}

export interface KillSwitchRow {
  scope_key: string; scope_label: string; is_engaged: boolean;
  engaged_at: string | null; engaged_by: string | null; engaged_reason: string | null;
  released_at: string | null; released_note: string | null; updated_at: string;
}

export function useAiStopControls() {
  return useQuery({
    queryKey: ['ai-gov-stop'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_kill_switches').select('*').order('scope_key');
      if (error) throw new Error(error.message);
      return (data ?? []) as KillSwitchRow[];
    },
    staleTime: 10_000,
  });
}

export interface ProhibitedActionRow {
  code: string; label: string; enforcement: string; sort_order: number | null;
}

export function useProhibitedActions() {
  return useQuery({
    queryKey: ['ai-gov-prohibited'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_prohibited_actions')
        .select('*').order('sort_order', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as ProhibitedActionRow[];
    },
  });
}


// -------------------------------------------------------------- assurance
export interface AssuranceRow {
  id: string; reference: string; conduct_ai_insight_id: string | null; use_case_code: string | null;
  status: string; conclusion: string | null; reviewer_id: string | null; notes: string | null;
  remediation_action: string | null; remediation_owner: string | null;
  remediation_due_date: string | null; remediation_status: string | null;
  closure_note: string | null; closed_at: string | null; closed_by: string | null;
  created_at: string; updated_at: string;
}

export function useAssuranceReviews() {
  return useQuery({
    queryKey: ['ai-gov-assurance'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_assurance_reviews')
        .select('*').order('created_at', { ascending: false }).limit(300);
      if (error) throw new Error(error.message);
      return (data ?? []) as AssuranceRow[];
    },
  });
}

export interface AssuranceAssessmentRow {
  id: string; review_id: string; criterion_code: string; assessment: string;
  comment: string | null; assessed_by: string | null; created_at: string;
}

export function useAssuranceAssessments(reviewId?: string) {
  return useQuery({
    queryKey: ['ai-gov-assurance-criteria', reviewId],
    enabled: !!reviewId,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_assurance_criteria_assessments')
        .select('*').eq('review_id', reviewId).order('criterion_code');
      if (error) throw new Error(error.message);
      return (data ?? []) as AssuranceAssessmentRow[];
    },
  });
}

// ------------------------------------------------------------------ writes
function useGovernedMutation<TArgs>(
  fn: string,
  toArgs: (a: TArgs) => Record<string, unknown>,
  successMessage: string,
  invalidate: string[],
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: TArgs) => rpc<unknown>(fn, toArgs(a)),
    onSuccess: () => {
      toast.success(successMessage);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => toast.error(governanceMessage(e)),
  });
}

export const useAiTransition = () => useGovernedMutation<{
  objectType: 'USE_CASE' | 'MODEL' | 'INSTRUCTION'; objectKey: string; toState: string; rationale?: string;
}>(
  'ai_governance_transition',
  (a) => ({ _object_type: a.objectType, _object_key: a.objectKey, _to_state: a.toState, _rationale: a.rationale ?? null }),
  'Status updated and recorded in the governance history.',
  ['ai-gov-use-cases', 'ai-gov-models', 'ai-gov-instructions', 'ai-gov-events', 'ai-gov-overview'],
);

export const useAiStopControlSet = () => useGovernedMutation<{
  scopeKey: string; engage: boolean; reason: string;
}>(
  'ai_governance_kill_switch_set',
  (a) => ({ _scope_key: a.scopeKey, _engage: a.engage, _reason: a.reason }),
  'AI stop control updated with immediate effect.',
  ['ai-gov-stop', 'ai-gov-events', 'ai-gov-overview'],
);

export const useAiModelSave = () => useGovernedMutation<{
  id?: string | null; provider: string; technicalIdentifier: string; modelKey: string;
  displayName: string; regulatoryPurpose: string; modelVersion?: string | null;
  knownLimitations?: string | null; dataHandlingClass?: string; externalDataCapable?: boolean;
}>(
  'ai_governance_model_save',
  (a) => ({
    _id: a.id ?? null, _provider: a.provider, _technical_identifier: a.technicalIdentifier,
    _model_key: a.modelKey, _display_name: a.displayName, _regulatory_purpose: a.regulatoryPurpose,
    _model_version: a.modelVersion ?? null, _known_limitations: a.knownLimitations ?? null,
    _data_handling_class: a.dataHandlingClass ?? 'INTERNAL_REGULATORY_FACTS',
    _external_data_capable: a.externalDataCapable ?? false,
  }),
  'Model record saved as a draft.',
  ['ai-gov-models', 'ai-gov-events'],
);

export const useAiInstructionSave = () => useGovernedMutation<{
  id?: string | null; templateCode: string; version: string; title: string; purpose: string;
  useCaseCode?: string | null; instructionBody?: string | null; allowedFactScope?: string;
  prohibitedBehaviours?: string[]; requiredCaveats?: string[];
}>(
  'ai_governance_instruction_save',
  (a) => ({
    _id: a.id ?? null, _template_code: a.templateCode, _version: a.version, _title: a.title,
    _purpose: a.purpose, _use_case_code: a.useCaseCode ?? null,
    _instruction_body: a.instructionBody ?? null,
    _allowed_fact_scope: a.allowedFactScope ?? 'conduct_360_snapshot',
    _prohibited_behaviours: a.prohibitedBehaviours ?? [],
    _required_caveats: a.requiredCaveats ?? [],
  }),
  'Instruction version saved as a draft.',
  ['ai-gov-instructions', 'ai-gov-events'],
);

export const useAiUseCaseBind = () => useGovernedMutation<{
  useCaseCode: string; modelId?: string | null; instructionId?: string | null; rationale?: string;
}>(
  'ai_governance_use_case_bind',
  (a) => ({
    _use_case_code: a.useCaseCode, _model_id: a.modelId ?? null,
    _instruction_id: a.instructionId ?? null, _rationale: a.rationale ?? null,
  }),
  'Approved model and instruction version bound to the capability.',
  ['ai-gov-use-cases', 'ai-gov-events'],
);

export const useAiThresholdsSave = () => useGovernedMutation<{
  unreviewedHours: number; lowConfidenceBelow: number; highModificationRate: number;
  highRejectionRate: number; minVolumeForAnalysis: number;
}>(
  'ai_governance_thresholds_save',
  (a) => ({
    _unreviewed_hours: a.unreviewedHours, _low_confidence_below: a.lowConfidenceBelow,
    _high_modification_rate: a.highModificationRate, _high_rejection_rate: a.highRejectionRate,
    _min_volume_for_analysis: a.minVolumeForAnalysis,
  }),
  'Governance thresholds updated.',
  ['ai-gov-overview', 'ai-gov-exceptions', 'ai-gov-events'],
);

export const useAssuranceCreate = () => useGovernedMutation<{ insightId: string; notes?: string }>(
  'ai_assurance_review_create',
  (a) => ({ _insight_id: a.insightId, _notes: a.notes ?? null }),
  'Assurance review opened.',
  ['ai-gov-assurance', 'ai-gov-overview'],
);

export const useAssuranceAssess = () => useGovernedMutation<{
  reviewId: string; criterionCode: string; assessment: string; comment?: string;
}>(
  'ai_assurance_assess',
  (a) => ({ _review_id: a.reviewId, _criterion_code: a.criterionCode, _assessment: a.assessment, _comment: a.comment ?? null }),
  'Assessment recorded.',
  ['ai-gov-assurance-criteria', 'ai-gov-assurance'],
);

export const useAssuranceRemediation = () => useGovernedMutation<{
  reviewId: string; action: string; owner?: string | null; dueDate?: string | null; status: string; note?: string;
}>(
  'ai_assurance_remediation_set',
  (a) => ({
    _review_id: a.reviewId, _action: a.action, _owner: a.owner ?? null,
    _due_date: a.dueDate ?? null, _status: a.status, _note: a.note ?? null,
  }),
  'Remediation updated.',
  ['ai-gov-assurance', 'ai-gov-overview'],
);

export const useAssuranceConclude = () => useGovernedMutation<{
  reviewId: string; conclusion: string; closureNote: string;
}>(
  'ai_assurance_review_conclude',
  (a) => ({ _review_id: a.reviewId, _conclusion: a.conclusion, _closure_note: a.closureNote }),
  'Assurance review concluded. The AI record itself is unchanged.',
  ['ai-gov-assurance', 'ai-gov-overview', 'ai-gov-events'],
);

// ------------------------------------------------- detail reads (MC-08 part 6)
export interface InsightDetail {
  id: string; insight_id: string; use_case_code: string; entity_id: string | null;
  window_start: string | null; window_end: string | null; snapshot_fingerprint: string | null;
  source_references: unknown; provider: string | null; model: string | null;
  model_version: string | null; prompt_template_code: string | null; prompt_template_version: string | null;
  generated_at: string; generated_by: string | null; ai_output: Record<string, unknown> | null;
  confidence: number | null; uncertainty: string | null; limitations: string[] | null;
  staleness_state: string | null; staleness_checked_at: string | null;
  review_state: string; human_output: Record<string, unknown> | null; human_rationale: string | null;
  reviewed_by: string | null; reviewed_at: string | null; superseded_by_id: string | null;
}

export function useConductAiInsight(id?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-insight', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from('conduct_ai_insights_presentation_v').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as InsightDetail | null;
    },
  });
}

export interface InsightReviewEvent {
  id: string; conduct_ai_insight_id: string; action: string; rationale: string | null;
  from_state: string | null; to_state: string | null; actor_id: string | null; created_at: string;
}

export function useConductAiReviewEvents(insightId?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-insight-events', insightId],
    enabled: !!insightId,
    queryFn: async () => {
      const { data, error } = await sb.from('conduct_ai_review_events')
        .select('*').eq('conduct_ai_insight_id', insightId).order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as InsightReviewEvent[];
    },
  });
}

export interface AttemptDetail {
  id: string; use_case_code: string | null; owning_module: string | null; entity_id: string | null;
  requested_by: string | null; requested_role: string | null; outcome: string; reason_code: string | null;
  detail: string | null; provider: string | null; model: string | null; model_version: string | null;
  instruction_template_code: string | null; instruction_version: string | null;
  snapshot_fingerprint: string | null; window_start: string | null; window_end: string | null;
  latency_ms: number | null; conduct_ai_insight_id: string | null;
  requested_at: string; completed_at: string | null; metadata: Record<string, unknown> | null;
}

export function useAiAttempt(id?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-attempt', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_attempts_presentation_v')
        .select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as AttemptDetail | null;
    },
  });
}

/** Every recorded attempt tied to one advisory item — the full execution trail. */
export function useAttemptsForInsight(insightId?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-attempts-insight', insightId],
    enabled: !!insightId,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_attempts_presentation_v')
        .select('*').eq('conduct_ai_insight_id', insightId).order('requested_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as AttemptDetail[];
    },
  });
}

export function useAssuranceForInsight(insightId?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-assurance-insight', insightId],
    enabled: !!insightId,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_assurance_reviews')
        .select('*').eq('conduct_ai_insight_id', insightId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as AssuranceRow[];
    },
  });
}

export function useAssuranceReview(id?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-assurance-one', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_assurance_reviews').select('*').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as AssuranceRow | null;
    },
  });
}

export function useGovernanceEventsForObject(objectType: string, objectId?: string | null) {
  return useQuery({
    queryKey: ['ai-gov-events-object', objectType, objectId],
    enabled: !!objectId,
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_events')
        .select('*').eq('object_type', objectType).eq('object_id', objectId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as GovernanceEventRow[];
    },
  });
}

export function useAiThresholds() {
  return useQuery({
    queryKey: ['ai-gov-thresholds'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_thresholds').select('*').maybeSingle();
      if (error) throw new Error(error.message);
      return data as { unreviewed_hours: number; low_confidence_below: number; updated_at: string } | null;
    },
  });
}

/** Platform-wide AI capability inventory beyond Conduct 360 (MC-08 item 10). */
export interface SurfaceRow {
  code: string; label: string; owning_module: string; business_purpose: string;
  advisory_classification: string; lifecycle_state: string; approved_model_id: string | null;
  instruction_governance: string; human_review: string; authoritative_write_path: string;
  production_status: string; suspended_at: string | null; suspension_reason: string | null;
  approved_at: string | null; created_at: string; updated_at: string;
}

export function useAiSurfaces() {
  return useQuery({
    queryKey: ['ai-gov-surfaces'],
    queryFn: async () => {
      const { data, error } = await sb.from('ai_governance_surfaces').select('*').order('label');
      if (error) throw new Error(error.message);
      return (data ?? []) as SurfaceRow[];
    },
  });
}

export const useAiSurfaceTransition = () => useGovernedMutation<{
  code: string; toState: string; rationale?: string;
}>(
  'ai_governance_surface_set_state',
  (a) => ({ _code: a.code, _to_state: a.toState, _rationale: a.rationale ?? null }),
  'AI capability status updated and recorded in the governance history.',
  ['ai-gov-surfaces', 'ai-gov-events'],
);
