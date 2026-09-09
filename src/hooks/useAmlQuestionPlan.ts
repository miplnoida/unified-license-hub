/**
 * Assessment question plan (AML-04) — governed read/action layer.
 *
 * Every read goes through `supervisory_assessment_question_plan`,
 * `_plan_summary` and `_plan_context`; every write goes through
 * `supervisory_assessment_question_plan_materialize` or
 * `_plan_override_apply`. The browser never decides which questions apply: it
 * renders the server's snapshot, its reason codes and its counts.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const db = () => supabase as unknown as { rpc: (fn: string, args?: Record<string, unknown>) => any };

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().rpc(fn, args ?? {});
  if (error) throw new Error(error.message);
  return data as T;
}

export type QuestionPlanState =
  | 'INCLUDED_CORE' | 'INCLUDED_CONDITIONAL' | 'INCLUDED_ENHANCED'
  | 'NOT_TRIGGERED' | 'OUT_OF_SCOPE' | string;

export interface QuestionPlanSummary {
  assessment_id: string;
  mode: string;
  legacy_mode: boolean;
  methodology_total: number;
  planned_total: number;
  included_total: number;
  included_core: number;
  included_conditional: number;
  included_enhanced: number;
  not_triggered: number;
  out_of_scope: number;
  answered: number;
  unanswered_in_scope: number;
}

export interface QuestionPlanRow {
  question_id: string;
  question_code: string;
  prompt: string | null;
  dimension_id: string | null;
  dimension_code: string | null;
  dimension_label: string | null;
  question_class: string;
  plan_state: QuestionPlanState;
  effective_state: QuestionPlanState;
  overridden: boolean;
  override_reason: string | null;
  reason_code: string | null;
  reason_text: string | null;
  rule_summary: string | null;
  included: boolean;
  allow_not_applicable: boolean | null;
  na_requires_rationale: boolean | null;
  requires_evidence: boolean | null;
  response: string | null;
  response_status: 'ANSWERED' | 'UNANSWERED' | 'NOT_REQUIRED' | string;
  evaluated_inputs: Record<string, unknown> | null;
}

export interface QuestionPlanResult {
  summary: QuestionPlanSummary;
  rows: QuestionPlanRow[];
  row_count: number;
  legacy_mode: boolean;
  note: string;
}

export interface QuestionPlanFilters {
  search?: string;
  dimensionId?: string | null;
  questionClass?: string | null;
  planState?: string | null;
  limit?: number;
  offset?: number;
}

export const PLAN_STATES: QuestionPlanState[] = [
  'INCLUDED_CORE', 'INCLUDED_CONDITIONAL', 'INCLUDED_ENHANCED', 'NOT_TRIGGERED', 'OUT_OF_SCOPE',
];

/** States a supervisor may override an individual question to. Never NOT_APPLICABLE — that is a response. */
export const OVERRIDE_STATES: QuestionPlanState[] = [
  'INCLUDED_CONDITIONAL', 'INCLUDED_ENHANCED', 'OUT_OF_SCOPE',
];

export function useAmlQuestionPlan(assessmentId?: string | null, filters: QuestionPlanFilters = {}) {
  return useQuery({
    queryKey: ['supervisory_assessment_question_plan', assessmentId, filters],
    queryFn: () => rpc<QuestionPlanResult>('supervisory_assessment_question_plan', {
      _assessment_id: assessmentId,
      _search: filters.search?.trim() || null,
      _dimension_id: filters.dimensionId ?? null,
      _question_class: filters.questionClass ?? null,
      _plan_state: filters.planState ?? null,
      _limit: filters.limit ?? 500,
      _offset: filters.offset ?? 0,
    }),
    enabled: !!assessmentId,
    staleTime: 30_000,
    // Filtering must not blank the workspace: keep the previous snapshot on
    // screen while the server answers the narrowed query.
    placeholderData: keepPreviousData,
  });
}

export function useAmlQuestionPlanContext(assessmentId?: string | null) {
  return useQuery({
    queryKey: ['supervisory_assessment_question_plan_context', assessmentId],
    queryFn: () => rpc<Record<string, string | null>>('supervisory_assessment_question_plan_context', {
      _assessment_id: assessmentId,
    }),
    enabled: !!assessmentId,
    staleTime: 60_000,
  });
}

function usePlanInvalidator() {
  const qc = useQueryClient();
  return (assessmentId: string) => {
    void qc.invalidateQueries({ queryKey: ['supervisory_assessment_question_plan'] });
    void qc.invalidateQueries({ queryKey: ['supervisory_assessment_question_plan_context', assessmentId] });
    void qc.invalidateQueries({ queryKey: ['aml_assessment', assessmentId] });
  };
}

export function useMaterialiseQuestionPlan() {
  const invalidate = usePlanInvalidator();
  return useMutation({
    mutationFn: (vars: { assessmentId: string; rationale?: string | null }) =>
      rpc<QuestionPlanSummary>('supervisory_assessment_question_plan_materialize', {
        _assessment_id: vars.assessmentId,
        _rationale: vars.rationale?.trim() || null,
      }),
    onSuccess: (_r, vars) => invalidate(vars.assessmentId),
  });
}

export function useApplyQuestionPlanOverride() {
  const invalidate = usePlanInvalidator();
  return useMutation({
    mutationFn: (vars: { assessmentId: string; questionId: string; toState: string; reason: string }) =>
      rpc<unknown>('supervisory_assessment_question_plan_override_apply', {
        _assessment_id: vars.assessmentId,
        _question_id: vars.questionId,
        _to_state: vars.toState,
        _reason: vars.reason.trim(),
      }),
    onSuccess: (_r, vars) => invalidate(vars.assessmentId),
  });
}
