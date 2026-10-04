/**
 * Governed evidence basis, structured facts and server-authoritative readiness.
 *
 * Nothing in this module decides anything. The evidence basis, the typed facts,
 * what is still outstanding and whether an assessment may be submitted are all
 * computed by the platform and read from it: the officer's screen and the
 * submission check therefore always agree, because they read the same governed
 * contract. Every write goes through a governed operation which re-checks the
 * officer's authority, the entity scope, the editable state, the exact
 * methodology version and the question plan.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/* ------------------------------------------------------------------ types -- */

export interface EvidenceBasisType {
  code: string;
  label: string;
  description: string | null;
  requires_source_object: boolean;
  source_table: string | null;
  sort_order: number;
}

export interface EvidenceBasisRecord {
  id: string;
  evidence_type: string;
  type_label: string | null;
  source_object_type: string | null;
  source_object_id: string | null;
  source_reference: string | null;
  title: string | null;
  note: string | null;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  retrieved_at: string | null;
  source_timestamp: string | null;
  origin: string;
  created_at: string;
  source_accessible: boolean;
  questions: { link_id: string; question_id: string; question_code: string | null; relevance_note: string | null }[];
  dimensions: { link_id: string; dimension_id: string; dimension_code: string | null }[];
}

export interface AssessmentFactRow {
  fact_requirement_id: string;
  fact_code: string;
  label: string | null;
  description: string | null;
  data_type: string;
  unit: string | null;
  is_required: boolean;
  auto_prefill_allowed: boolean;
  officer_edit_allowed: boolean;
  numerator_basis: string | null;
  denominator_basis: string | null;
  source_type_expectation: string[] | null;
  definition_status: string | null;
  fact_id: string | null;
  recorded: boolean;
  value: string | null;
  numerator: number | null;
  denominator: number | null;
  period_start: string | null;
  period_end: string | null;
  as_of_date: string | null;
  source_type: string | null;
  source_reference: string | null;
  extraction_timestamp: string | null;
  auto_prefilled: boolean;
  system_value: Record<string, unknown> | null;
  officer_overridden: boolean;
  override_reason: string | null;
  overridden_at: string | null;
  note: string | null;
}

export interface ReadinessCheckRow {
  key: string;
  label: string;
  status: 'OK' | 'BLOCKING' | 'ATTENTION' | 'UNKNOWN';
  blocking: boolean;
  count: number;
  detail: string;
  items: Record<string, unknown>[];
}

export interface AssessmentReadinessContract {
  assessment_id: string;
  status: string;
  methodology_id: string | null;
  plan_mode: 'GOVERNED_PLAN' | 'LEGACY_ALL_MANDATORY';
  checks: ReadinessCheckRow[];
  blocking_check_count: number;
  outstanding_question_count: number;
  outstanding_fact_count: number;
  can_submit: boolean;
  submission_gate: 'READY' | 'BLOCKED';
  evaluated_at: string;
}

export interface QuestionExecutionRow {
  question_id: string;
  question_code: string;
  prompt: string;
  dimension_id: string;
  dimension_code: string;
  dimension_group: string;
  mandatory: boolean;
  requires_observation: boolean;
  requires_evidence: boolean;
  min_evidence_count: number;
  permitted_evidence_types: string[] | null;
  plan_state: string | null;
  response: string | null;
  observation: string | null;
  legacy_evidence_count: number;
  governed_evidence_count: number;
  evidence_count: number;
  answerable: boolean;
  required_facts: {
    fact_requirement_id: string;
    fact_code: string;
    label: string | null;
    data_type: string;
    unit: string | null;
    is_required: boolean;
    recorded: boolean;
    fact_id: string | null;
    value: string | null;
    officer_overridden: boolean | null;
  }[];
}

/* ------------------------------------------------------------------ reads -- */

export function useEvidenceBasisTypes() {
  return useQuery({
    queryKey: ['evidence-basis-types'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<EvidenceBasisType[]> => {
      const { data, error } = await (supabase as any)
        .from('supervisory_evidence_basis_type')
        .select('code,label,description,requires_source_object,source_table,sort_order')
        .eq('active', true)
        .order('sort_order');
      if (error) throw new Error(error.message);
      return (data ?? []) as EvidenceBasisType[];
    },
  });
}

export function useAssessmentReadiness(assessmentId?: string) {
  return useQuery({
    queryKey: ['assessment-readiness', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      call<AssessmentReadinessContract>('supervisory_assessment_readiness', { _assessment_id: assessmentId }),
  });
}

export function useAssessmentQuestionExecution(assessmentId?: string) {
  return useQuery({
    queryKey: ['assessment-question-execution', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      call<QuestionExecutionRow[]>('supervisory_assessment_question_execution', { _assessment_id: assessmentId }),
  });
}

export function useAssessmentEvidenceRegister(assessmentId?: string) {
  return useQuery({
    queryKey: ['assessment-evidence-register', assessmentId],
    enabled: !!assessmentId,
    queryFn: () =>
      call<EvidenceBasisRecord[]>('supervisory_assessment_evidence_register', { _assessment_id: assessmentId }),
  });
}

export function useAssessmentFactRegister(assessmentId?: string) {
  return useQuery({
    queryKey: ['assessment-fact-register', assessmentId],
    enabled: !!assessmentId,
    queryFn: () => call<AssessmentFactRow[]>('supervisory_assessment_fact_register', { _assessment_id: assessmentId }),
  });
}

/* ----------------------------------------------------------------- writes -- */

function useAssessmentInvalidation(assessmentId?: string) {
  const qc = useQueryClient();
  return () => {
    ['assessment-readiness', 'assessment-question-execution', 'assessment-evidence-register', 'assessment-fact-register',
      'supervisory_assessment_factor_authority']
      .forEach((key) => qc.invalidateQueries({ queryKey: [key, assessmentId] }));
    qc.invalidateQueries({ queryKey: ['aml', 'question-responses', assessmentId ?? null] });
  };
}

export interface EvidenceLinkInput {
  assessmentId: string;
  evidenceType: string;
  sourceObjectId?: string | null;
  sourceReference?: string | null;
  title?: string | null;
  note?: string | null;
  relevanceNote?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  asOfDate?: string | null;
  methodologyQuestionId?: string | null;
  methodologyDimensionId?: string | null;
}

export function useLinkAssessmentEvidence(assessmentId?: string) {
  const invalidate = useAssessmentInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: EvidenceLinkInput) =>
      call<{ evidence_id: string }>('supervisory_assessment_evidence_link', {
        _assessment_id: input.assessmentId,
        _payload: {
          evidence_type: input.evidenceType,
          source_object_id: input.sourceObjectId ?? null,
          source_reference: input.sourceReference ?? null,
          title: input.title ?? null,
          note: input.note ?? null,
          relevance_note: input.relevanceNote ?? null,
          period_start: input.periodStart ?? null,
          period_end: input.periodEnd ?? null,
          as_of_date: input.asOfDate ?? null,
          methodology_question_id: input.methodologyQuestionId ?? null,
          methodology_dimension_id: input.methodologyDimensionId ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

export function useUnlinkAssessmentEvidence(assessmentId?: string) {
  const invalidate = useAssessmentInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: { evidenceId: string; questionId?: string | null; dimensionId?: string | null }) =>
      call<{ links_remaining: number }>('supervisory_assessment_evidence_unlink', {
        _evidence_id: input.evidenceId,
        _question_id: input.questionId ?? null,
        _dimension_id: input.dimensionId ?? null,
      }),
    onSuccess: invalidate,
  });
}

export interface FactInput {
  assessmentId: string;
  factRequirementId?: string | null;
  factCode?: string | null;
  value: string;
  numerator?: string | null;
  denominator?: string | null;
  unit?: string | null;
  sourceType: string;
  sourceReference?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  asOfDate?: string | null;
  note?: string | null;
  autoPrefilled?: boolean;
}

export function useSetAssessmentFact(assessmentId?: string) {
  const invalidate = useAssessmentInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: FactInput) =>
      call<{ fact_id: string }>('supervisory_assessment_fact_set', {
        _assessment_id: input.assessmentId,
        _payload: {
          fact_requirement_id: input.factRequirementId ?? null,
          fact_code: input.factCode ?? null,
          value: input.value,
          numerator: input.numerator ?? null,
          denominator: input.denominator ?? null,
          unit: input.unit ?? null,
          source_type: input.sourceType,
          source_reference: input.sourceReference ?? null,
          period_start: input.periodStart ?? null,
          period_end: input.periodEnd ?? null,
          as_of_date: input.asOfDate ?? null,
          note: input.note ?? null,
          auto_prefilled: input.autoPrefilled ?? false,
        },
      }),
    onSuccess: invalidate,
  });
}

export function useOverrideAssessmentFact(assessmentId?: string) {
  const invalidate = useAssessmentInvalidation(assessmentId);
  return useMutation({
    mutationFn: (input: {
      factId: string;
      value: string;
      numerator?: string | null;
      denominator?: string | null;
      sourceType?: string | null;
      sourceReference?: string | null;
      reason: string;
    }) =>
      call<{ fact_id: string }>('supervisory_assessment_fact_override', {
        _fact_id: input.factId,
        _payload: {
          value: input.value,
          numerator: input.numerator ?? null,
          denominator: input.denominator ?? null,
          source_type: input.sourceType ?? null,
          source_reference: input.sourceReference ?? null,
        },
        _reason: input.reason,
      }),
    onSuccess: invalidate,
  });
}

/** A governed refusal is shown to the officer as the platform stated it. */
export function evidenceErrorMessage(e: unknown): string {
  const raw = String((e as { message?: string })?.message ?? e ?? '');
  const cleaned = raw.replace(/^[a-z_]+:\s*/i, '').trim();
  return cleaned || 'The platform refused this operation.';
}
