/**
 * AML-06 calculation policy layers and assessment calculation runs.
 *
 * Every value here is authored by the regulator and computed by the server.
 * The browser only collects configuration input, invokes governed operations
 * and displays what the server returned. No score, weight, threshold, band,
 * matrix lookup, rounding or final rating is derived in TypeScript.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const POLICY_KEY = ['aml-calculation-policy'] as const;
const RUN_KEY = ['aml-calculation-run'] as const;

/* -------------------------------------------------------------- vocabulary --
 * Closed option lists that mirror the server's CHECK constraints exactly. They
 * are presentation vocabulary for <Select> inputs, not calculation policy: no
 * numeric score, weight, threshold or band edge appears in this file.
 */
export const PARTICIPATION_OPTIONS = ['SCORED', 'EXCLUDED', 'INFORMATIONAL'] as const;
export const CONTRIBUTES_TO_OPTIONS = ['INHERENT_RISK', 'CONTROL_EFFECTIVENESS'] as const;
export const DIMENSION_AGGREGATION_OPTIONS = ['UNWEIGHTED_MEAN', 'WEIGHTED_MEAN', 'WORST_RESPONSE'] as const;
export const FACT_DATA_TYPE_OPTIONS = ['NUMBER', 'PERCENTAGE', 'MONEY', 'RATIO', 'COUNT'] as const;
export const FACT_DIRECTION_OPTIONS = ['HIGHER_IS_RISKIER', 'LOWER_IS_RISKIER'] as const;
export const FACT_MISSING_OPTIONS = ['NOT_CALCULABLE', 'EXCLUDE', 'TREAT_AS_WORST'] as const;
export const MATERIALITY_COMPARATOR_OPTIONS = ['GTE', 'GT', 'LTE', 'LT', 'EQ'] as const;
export const MATERIALITY_ADJUSTMENT_OPTIONS = ['FLOOR_AT_BAND', 'FLAG_ONLY'] as const;

export const OVERRIDE_STATUS_LABEL: Record<string, string> = {
  PROPOSED: 'Awaiting an independent decision',
  PENDING_APPROVAL: 'Awaiting an independent decision',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  STALE: 'Stale — the challenged calculation was replaced',
};

/* ------------------------------------------------------------------- types -- */

export interface QuestionWeightRow {
  question_code: string;
  participation: string;
  weight: number | null;
  is_critical: boolean;
}

export interface DimensionWeightRow {
  dimension_code: string;
  contributes_to: string;
  weight: number | null;
  min_completeness_pct: number | null;
  aggregation_method: string | null;
}

export interface FactThresholdRow {
  band_code: string;
  min_value: number | null;
  max_value: number | null;
  score: number | null;
  sort_order: number;
}

export interface FactRuleRow {
  id?: string;
  fact_code: string;
  data_type: string;
  unit: string | null;
  direction: string;
  missing_handling: string;
  requires_period: boolean;
  requires_ratio_provenance: boolean;
  target_dimension_code: string | null;
  weight: number | null;
  notes: string | null;
  thresholds: FactThresholdRow[];
}

export interface MaterialityRuleRow {
  parameter_code: string;
  fact_code: string | null;
  comparator: string;
  threshold_value: number | null;
  unit: string | null;
  adjustment_kind: string;
  adjustment_band: string | null;
  rationale: string;
}

export interface CalculationRunSummary {
  id: string;
  run_seq: number;
  status: string;
  reason_code: string | null;
  recommended_rating: string | null;
  residual_rating: string | null;
  config_version: number | null;
  engine_version: string | null;
  calculated_at: string | null;
  event_reason: string | null;
  result_hash: string | null;
}

export interface CalculationRunDetail extends CalculationRunSummary {
  assessment_id: string;
  methodology_id: string | null;
  methodology_version: string | null;
  programme_id: string | null;
  programme_version: string | null;
  question_plan_version: string | null;
  config_id: string | null;
  as_of: string | null;
  reason: string | null;
  inherent_score: number | null;
  inherent_band: string | null;
  control_score: number | null;
  control_band: string | null;
  inputs: Record<string, unknown> | null;
  policy_snapshot: Record<string, unknown> | null;
  trace: Record<string, unknown> | null;
  inputs_hash: string | null;
}

export interface CalculationOverride {
  id: string;
  assessment_id: string;
  run_id: string | null;
  computed_residual_rating: string | null;
  computed_recommended_rating: string | null;
  computed_inherent_band: string | null;
  computed_control_band: string | null;
  computed_result_hash: string | null;
  proposed_rating: string;
  rationale: string;
  status: string;
  proposed_by: string | null;
  proposed_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
}

export interface AssessmentCalculationView {
  latest_run: CalculationRunDetail | null;
  runs: CalculationRunSummary[];
  overrides: CalculationOverride[];
}

/* ------------------------------------------------------------------ plumbing -- */

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

function useInvalidatePolicy() {
  const qc = useQueryClient();
  return () => { void qc.invalidateQueries({ queryKey: POLICY_KEY }); };
}

function useInvalidateRun() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: RUN_KEY });
    void qc.invalidateQueries({ queryKey: ['supervisory-calculation'] });
  };
}

/** Human copy for the governed calculation operations' known refusals. */
export function calcPolicyErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (raw.includes('maker_checker') || raw.includes('decider_must_differ') || raw.includes('different person')) {
    return 'An override must be decided by someone other than the person who proposed it.';
  }
  if (raw.includes('stale_override')) {
    return 'This override challenges an earlier calculation run. The assessment was recalculated, so a new override must be proposed.';
  }
  if (raw.includes('assessment_closed')) {
    return 'This assessment is approved, closed or superseded, so its judgement can no longer be changed.';
  }
  if (raw.includes('assessment_locked')) {
    return 'Only a draft assessment, or one returned for revision, can be recalculated.';
  }
  if (raw.includes('not_calculated') || raw.includes('no_calculation')) {
    return 'There is no calculated result to override. Unresolved information cannot be overridden into a rating.';
  }
  if (raw.includes('no_difference') || raw.includes('same_as_calculated')) {
    return 'The proposed rating is the same as the calculated result, so there is nothing to override.';
  }
  if (raw.includes('invalid_rating') || raw.includes('unknown_rating')) return 'That rating is not on the methodology scale.';
  if (raw.includes('override_pending')) return 'An override proposal is already awaiting a decision.';
  if (raw.includes('judgement_policy_movement_refused')) {
    return 'The judgement policy does not allow the rating to move that many steps from the calculated result.';
  }
  if (raw.includes('judgement_policy_direction_refused')) {
    return 'The judgement policy does not allow the rating to move in that direction.';
  }
  if (raw.includes('judgement_policy_target_prohibited')) return 'The judgement policy never allows that rating to be chosen.';
  if (raw.includes('judgement_policy_forbids_override')) return 'The judgement policy does not allow an override of this calculated rating.';
  if (raw.includes('judgement_policy_no_rule')) return 'The judgement policy has no rule for this calculated rating, so no override is allowed.';
  if (raw.includes('judgement_policy_unavailable')) return 'The judgement policy pinned to this assessment cannot be read, so no override is allowed.';
  if (raw.includes('judgement_policy_rating_unknown')) return 'That rating is not on the methodology scale.';
  if (raw.includes('rationale_required')) {
    return 'The judgement policy requires a longer written rationale for this override.';
  }
  if (raw.includes('note_required')) return 'Rejecting an override needs a written reason of at least 10 characters.';
  if (raw.includes('not_authorized_for_domain')) {
    return 'You do not hold configuration authority for this supervisory domain.';
  }
  if (raw.includes('not_authorized')) return 'You are not authorised to perform this calculation action.';
  if (raw.includes('rationale')) return 'A written supervisory rationale is required.';
  if (raw.includes('draft')) return 'Only a draft calculation policy may be edited. Create a new version instead.';
  return raw || 'The operation could not be completed.';
}

/* --------------------------------------------------- methodology structure -- */

/** Active questions of a methodology, for question participation policy. */
export function useMethodologyQuestionCatalogue(methodologyId?: string) {
  return useQuery({
    queryKey: [...POLICY_KEY, 'questions', methodologyId],
    enabled: !!methodologyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supervisory_methodology_question')
        .select('id, question_code, prompt, calculation_participation, methodology_dimension_id')
        .eq('methodology_id', methodologyId!)
        .eq('active', true)
        .order('question_code');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<{
        id: string; question_code: string; prompt: string | null;
        calculation_participation: string | null; methodology_dimension_id: string | null;
      }>;
    },
  });
}

/** Active dimensions of a methodology, for dimension policy. */
export function useMethodologyDimensionCatalogue(methodologyId?: string) {
  return useQuery({
    queryKey: [...POLICY_KEY, 'dimensions', methodologyId],
    enabled: !!methodologyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supervisory_methodology_dimension')
        .select('id, dimension_code, label, dimension_group')
        .eq('methodology_id', methodologyId!)
        .eq('active', true)
        .order('dimension_code');
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Array<{
        id: string; dimension_code: string; label: string | null; dimension_group: string | null;
      }>;
    },
  });
}

/**
 * Fact requirements a methodology declares, for fact transformation policy.
 * Read through the governed methodology fact register, never from the store.
 */
export function useMethodologyFactCatalogue(methodologyId?: string) {
  return useQuery({
    queryKey: [...POLICY_KEY, 'facts', methodologyId],
    enabled: !!methodologyId,
    queryFn: async () => {
      const result = await rpc<{ rows?: Array<Record<string, unknown>> } | Array<Record<string, unknown>>>(
        'supervisory_methodology_fact_register',
        {
          _methodology_id: methodologyId!,
          _search: null,
          _definition_status: null,
          _required: null,
          _sort: 'fact_code',
          _dir: 'asc',
          _limit: 500,
          _offset: 0,
        },
      );
      const rows = Array.isArray(result) ? result : (result?.rows ?? []);
      return rows.map((r) => ({
        id: String(r.id ?? r.fact_id ?? ''),
        fact_code: String(r.fact_code ?? ''),
        label: (r.label ?? null) as string | null,
        data_type: (r.data_type ?? null) as string | null,
        unit: (r.unit ?? null) as string | null,
      }));
    },
  });
}

/* ------------------------------------------------------------ policy layers -- */

export function useCalculationPolicyLayers(configId?: string) {
  return useQuery({
    queryKey: [...POLICY_KEY, 'layers', configId],
    enabled: !!configId,
    queryFn: async () => {
      const [qw, dw, fr, mat] = await Promise.all([
        supabase.from('supervisory_calculation_question_weight')
          .select('question_code, participation, weight, is_critical')
          .eq('config_id', configId!).order('question_code'),
        supabase.from('supervisory_calculation_dimension_weight')
          .select('dimension_code, contributes_to, weight, min_completeness_pct, aggregation_method')
          .eq('config_id', configId!).order('dimension_code'),
        supabase.from('supervisory_calculation_fact_rule')
          .select('id, fact_code, data_type, unit, direction, missing_handling, requires_period, requires_ratio_provenance, target_dimension_code, weight, notes')
          .eq('config_id', configId!).order('fact_code'),
        supabase.from('supervisory_calculation_materiality_rule')
          .select('parameter_code, fact_code, comparator, threshold_value, unit, adjustment_kind, adjustment_band, rationale')
          .eq('config_id', configId!).order('parameter_code'),
      ]);
      const err = qw.error ?? dw.error ?? fr.error ?? mat.error;
      if (err) throw new Error(err.message);

      const ruleIds = ((fr.data ?? []) as Array<{ id: string }>).map((r) => r.id);
      let thresholds: Array<FactThresholdRow & { fact_rule_id: string }> = [];
      if (ruleIds.length > 0) {
        const { data, error } = await supabase
          .from('supervisory_calculation_fact_threshold')
          .select('fact_rule_id, band_code, min_value, max_value, score, sort_order')
          .in('fact_rule_id', ruleIds)
          .order('sort_order');
        if (error) throw new Error(error.message);
        thresholds = (data ?? []) as unknown as Array<FactThresholdRow & { fact_rule_id: string }>;
      }

      return {
        questionWeights: (qw.data ?? []) as unknown as QuestionWeightRow[],
        dimensionWeights: (dw.data ?? []) as unknown as DimensionWeightRow[],
        factRules: ((fr.data ?? []) as unknown as FactRuleRow[]).map((r) => ({
          ...r,
          thresholds: thresholds
            .filter((t) => t.fact_rule_id === r.id)
            .map(({ band_code, min_value, max_value, score, sort_order }) => ({
              band_code, min_value, max_value, score, sort_order,
            })),
        })),
        materialityRules: (mat.data ?? []) as unknown as MaterialityRuleRow[],
      };
    },
  });
}

export function useSetQuestionWeights() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (input: { configId: string; rows: QuestionWeightRow[] }) =>
      rpc<number>('supervisory_calculation_question_weights_set', { _config_id: input.configId, _rows: input.rows }),
    onSuccess: invalidate,
  });
}

export function useSetDimensionWeights() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (input: { configId: string; rows: DimensionWeightRow[] }) =>
      rpc<number>('supervisory_calculation_dimension_weights_set', { _config_id: input.configId, _rows: input.rows }),
    onSuccess: invalidate,
  });
}

export function useSetFactRules() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (input: { configId: string; rows: FactRuleRow[] }) =>
      rpc<number>('supervisory_calculation_fact_rules_set', { _config_id: input.configId, _rows: input.rows }),
    onSuccess: invalidate,
  });
}

export function useSetMaterialityRules() {
  const invalidate = useInvalidatePolicy();
  return useMutation({
    mutationFn: (input: { configId: string; rows: MaterialityRuleRow[] }) =>
      rpc<number>('supervisory_calculation_materiality_set', { _config_id: input.configId, _rows: input.rows }),
    onSuccess: invalidate,
  });
}

/* -------------------------------------------------- assessment calculation -- */

/**
 * Server read model for one assessment: the latest numbered run with its full
 * trace, the run history and every override. Access is checked server-side, so
 * an assessment outside the caller's authority raises rather than returning a
 * partial result.
 */
export function useAssessmentCalculationView(assessmentId?: string) {
  return useQuery({
    queryKey: [...RUN_KEY, 'view', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      rpc<AssessmentCalculationView>('supervisory_assessment_calculation_view', { _assessment_id: assessmentId! }),
  });
}

/** Governed calculation: records a new numbered immutable run. */
export function useRecordCalculationRun() {
  const invalidate = useInvalidateRun();
  return useMutation({
    mutationFn: (input: { assessmentId: string; eventReason?: string }) =>
      rpc<{ run_id: string; run_seq: number; result: Record<string, unknown> }>(
        'supervisory_assessment_calculation_run_record',
        { _assessment_id: input.assessmentId, _event_reason: input.eventReason ?? 'MANUAL_RUN' },
      ),
    onSuccess: invalidate,
  });
}

export interface JudgementTarget { code: string; label?: string; steps: number; movement: string; permitted: boolean; reason?: string }
export interface JudgementEvaluation {
  status: 'EVALUATED' | 'NOT_GOVERNED' | 'UNAVAILABLE' | string;
  reason_code?: string;
  reason?: string;
  governed?: boolean;
  direction?: string;
  max_band_steps?: number | null;
  rationale_required?: boolean;
  rationale_min_length?: number | null;
  override_permitted?: boolean;
  prohibited_target_ratings?: string[];
  rule?: { rule_code?: string; label?: string } | null;
  policy?: { code?: string; version?: string; component_id?: string; status?: string } | null;
  policy_profile?: { code?: string; version?: string; profile_id?: string } | null;
  target_ratings?: JudgementTarget[];
}

/** Server evaluation of the judgement policy pinned to this assessment. */
export function useAssessmentJudgementPolicy(assessmentId?: string) {
  return useQuery({
    queryKey: [...RUN_KEY, 'judgement', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      rpc<{ evaluation: JudgementEvaluation; capabilities: { can_propose_override: boolean; can_decide_override: boolean } }>(
        'supervisory_assessment_judgement_policy_view', { _assessment_id: assessmentId! }),
  });
}

export function useProposeCalculationOverride() {
  const invalidate = useInvalidateRun();
  return useMutation({
    mutationFn: (input: { assessmentId: string; proposedRating: string; rationale: string }) =>
      rpc<string>('supervisory_calculation_override_propose', {
        _assessment_id: input.assessmentId,
        _proposed_rating: input.proposedRating,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

export function useDecideCalculationOverride() {
  const invalidate = useInvalidateRun();
  return useMutation({
    mutationFn: (input: { overrideId: string; decision: 'APPROVED' | 'REJECTED'; note?: string }) =>
      rpc<string>('supervisory_calculation_override_decide', {
        _override_id: input.overrideId,
        _decision: input.decision,
        _note: input.note ?? null,
      }),
    onSuccess: invalidate,
  });
}

/**
 * The rating vocabulary a methodology publishes, read straight from the
 * published methodology record. The browser never invents a rating code: an
 * override may only propose a code the methodology itself publishes, and the
 * server refuses anything else.
 */
export function useMethodologyRatingVocabulary(methodologyId?: string | null) {
  return useQuery({
    queryKey: [...POLICY_KEY, 'rating-vocabulary', methodologyId],
    enabled: !!methodologyId,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('supervisory_methodology')
        .select('scoring_scale')
        .eq('id', methodologyId!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const scale = ((data?.scoring_scale ?? []) as Array<{ code?: string; ordinal?: number }>) || [];
      return Array.isArray(scale)
        ? scale
            .filter((s) => !!s?.code)
            .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
            .map((s) => String(s.code))
        : [];
    },
  });
}
