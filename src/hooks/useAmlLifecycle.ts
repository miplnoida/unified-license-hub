/**
 * AML/CFT supervision write hooks.
 *
 * Every mutation is a call to a governed supervisory operation on the
 * canonical spine — no AML page ever writes to a table directly. Maker/checker
 * separation, entity scope, evidence and rationale discipline are enforced by
 * the database, so these hooks only shape arguments and surface the error.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export function amlErrorMessage(error: unknown): string {
  const raw = (error as any)?.message ?? String(error ?? 'Unknown error');
  if (/not_authorized/i.test(raw))
    return 'You are not authorised for this action. Maker/checker separation and supervisory scope are enforced by the platform.';
  if (/override_reason_required/i.test(raw))
    return 'A rationale is required when the judged rating departs from the calculated rating.';
  if (/validation_required/i.test(raw))
    return 'Effectiveness can only be concluded through a governed independent validation.';
  if (/authoritative origin/i.test(raw))
    return 'A finding must originate from an approved assessment, examination or workpaper.';
  if (/internal only/i.test(raw)) return 'This information is restricted to supervisory users.';
  return raw;
}

function useInvalidateAml() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['aml'] });
  };
}

async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

/* ------------------------------------------------------- assessments ------ */

export interface CreateAmlAssessmentInput {
  entityId: string;
  assessmentType: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  triggerType?: string;
  summary?: string | null;
  supersedesId?: string | null;
}

export function useCreateAmlAssessment() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: async (input: CreateAmlAssessmentInput) => {
      const { data: meth, error: mErr } = await sb
        .from('supervisory_methodology')
        .select('id')
        .eq('domain_code', 'AML_CFT')
        .eq('status', 'ACTIVE')
        .order('effective_from', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (mErr) throw mErr;
      if (!meth?.id) throw new Error('No active AML/CFT methodology is configured.');
      return rpc('supervisory_assessment_create', {
        _entity_id: input.entityId,
        _domain_code: 'AML_CFT',
        _assessment_type: input.assessmentType,
        _period_start: input.periodStart ?? null,
        _period_end: input.periodEnd ?? null,
        _methodology_id: meth.id,
        _trigger_type: input.triggerType ?? 'PERIODIC',
        _summary: input.summary ?? null,
        _supersedes_id: input.supersedesId ?? null,
      });
    },
    onSuccess: invalidate,
  });
}

export interface SaveAmlDimensionInput {
  assessmentId: string;
  dimensionCode: string;
  dimensionGroup: string;
  inherentRating?: string | null;
  controlRating?: string | null;
  residualRating?: string | null;
  weight?: number | null;
  rationale: string;
  sourceFacts?: string | null;
  supervisoryCommentary?: string | null;
  evidenceRefs?: { kind: string; ref: string }[] | null;
  trend?: string | null;
  confidence?: string | null;
  dataQuality?: string | null;
  calculatedInherentRating?: string | null;
  calculatedControlRating?: string | null;
  calculatedResidualRating?: string | null;
  overrideReason?: string | null;
  proposedExaminationScope?: boolean | null;
}

export function useSaveAmlDimension() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: SaveAmlDimensionInput) =>
      rpc('supervisory_assessment_dimension_upsert', {
        _assessment_id: input.assessmentId,
        _dimension_code: input.dimensionCode,
        _dimension_group: input.dimensionGroup,
        _inherent_rating: input.inherentRating ?? null,
        _control_rating: input.controlRating ?? null,
        _residual_rating: input.residualRating ?? null,
        _weight: input.weight ?? null,
        _rationale: input.rationale,
        _evidence_refs: input.evidenceRefs?.length ? input.evidenceRefs : null,
        _source_facts: input.sourceFacts ?? null,
        _supervisory_commentary: input.supervisoryCommentary ?? null,
        _trend: input.trend ?? null,
        _confidence: input.confidence ?? null,
        _data_quality: input.dataQuality ?? null,
        _calculated_inherent_rating: input.calculatedInherentRating ?? null,
        _calculated_control_rating: input.calculatedControlRating ?? null,
        _calculated_residual_rating: input.calculatedResidualRating ?? null,
        _override_reason: input.overrideReason ?? null,
        _proposed_examination_scope: input.proposedExaminationScope ?? null,
      }),
    onSuccess: invalidate,
  });
}

export interface TransitionAmlAssessmentInput {
  assessmentId: string;
  toStatus: 'submitted' | 'reviewed' | 'returned_for_revision' | 'approved' | 'closed';
  rationale: string;
  residualRating?: string | null;
  nextReviewDate?: string | null;
}

export function useTransitionAmlAssessment() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: TransitionAmlAssessmentInput) =>
      rpc('supervisory_assessment_transition', {
        _assessment_id: input.assessmentId,
        _to_status: input.toStatus,
        _rationale: input.rationale,
        _residual_rating: input.residualRating ?? null,
        _next_review_date: input.nextReviewDate ?? null,
      }),
    onSuccess: invalidate,
  });
}

/* --------------------------------------------------- attention & plan ----- */

export interface OpenAmlAttentionInput {
  title: string;
  supervisoryBasis: string;
  entityId: string;
  assessmentId: string;
  assessmentDimensionId?: string | null;
  materiality?: string;
  urgency?: string;
  targetReviewDate?: string | null;
}

export function useOpenAmlAttention() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: OpenAmlAttentionInput) =>
      rpc('supervisory_attention_open', {
        _title: input.title,
        _domain_code: 'AML_CFT',
        _supervisory_basis: input.supervisoryBasis,
        _origin_kind: 'AML_RISK',
        _entity_ids: [input.entityId],
        _assessment_id: input.assessmentId,
        _assessment_dimension_id: input.assessmentDimensionId ?? null,
        _materiality: input.materiality ?? 'high',
        _urgency: input.urgency ?? 'high',
        _target_review_date: input.targetReviewDate ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useConfirmAmlAttentionPriority() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { attentionId: string; priority: string; rationale: string }) =>
      rpc('supervisory_attention_confirm_priority', {
        _attention_id: input.attentionId,
        _confirmed_priority: input.priority,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

export interface OpenAmlPlanInput {
  title: string;
  factualBasis: string;
  objective: string;
  attentionId: string;
  assessmentId: string;
  entityId: string;
  targetCompletion?: string | null;
}

export function useOpenAmlPlan() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: OpenAmlPlanInput) =>
      rpc('supervisory_plan_open', {
        _title: input.title,
        _domain_code: 'AML_CFT',
        _factual_basis: input.factualBasis,
        _objective: input.objective,
        _attention_id: input.attentionId,
        _assessment_ids: [input.assessmentId],
        _entity_ids: [input.entityId],
        _target_completion: input.targetCompletion ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useAmlPlanLifecycle() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { planId: string; toStatus: string; rationale: string }) =>
      rpc('supervisory_plan_lifecycle', {
        _plan_id: input.planId,
        _to_status: input.toStatus,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/* ------------------------------------------------------ findings ---------- */

export interface AmlFindingResponseInput {
  findingId: string;
  responseState: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'DISPUTED';
  managementResponse: string;
  proposedAction?: string | null;
  responsiblePerson?: string | null;
  targetDate?: string | null;
}

export function useRecordAmlFindingResponse() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: AmlFindingResponseInput) =>
      rpc('supervisory_finding_response', {
        _finding_id: input.findingId,
        _response_state: input.responseState,
        _management_response: input.managementResponse,
        _proposed_action: input.proposedAction ?? null,
        _responsible_person: input.responsiblePerson ?? null,
        _target_date: input.targetDate ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useAmlFindingLifecycle() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { findingId: string; toStatus: string; rationale: string }) =>
      rpc('supervisory_finding_lifecycle', {
        _finding_id: input.findingId,
        _to_status: input.toStatus,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/* --------------------------------------------------- remediation ---------- */

export function useOpenAmlRemediation() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      findingId: string;
      description: string;
      requiredOutcome?: string | null;
      responsibleParty?: string | null;
      targetDate?: string | null;
    }) =>
      rpc('supervisory_remediation_open', {
        _finding_id: input.findingId,
        _description: input.description,
        _required_outcome: input.requiredOutcome ?? null,
        _responsible_party: input.responsibleParty ?? null,
        _target_date: input.targetDate ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useTransitionAmlRemediation() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      actionId: string;
      toStatus: string;
      rationale: string;
      entityResponse?: string | null;
      evidence?: { kind: string; ref: string }[] | null;
    }) =>
      rpc('supervisory_remediation_transition', {
        _action_id: input.actionId,
        _to_status: input.toStatus,
        _rationale: input.rationale,
        _entity_response: input.entityResponse ?? null,
        _evidence: input.evidence?.length ? input.evidence : null,
      }),
    onSuccess: invalidate,
  });
}

export function useValidateAmlRemediation() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      actionId: string;
      conclusion: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE';
      evidenceReviewed: string;
      procedureApplied: string;
      rationale: string;
      nextStep?: string | null;
    }) =>
      rpc('supervisory_remediation_validate', {
        _action_id: input.actionId,
        _conclusion: input.conclusion,
        _evidence_reviewed: input.evidenceReviewed,
        _procedure_applied: input.procedureApplied,
        _rationale: input.rationale,
        _next_step: input.nextStep ?? null,
      }),
    onSuccess: invalidate,
  });
}

/* -------------------------------------------------- reassessment ---------- */

export function useRequireAmlReassessment() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      entityId: string;
      triggerKind: string;
      triggerRationale: string;
      requestedType?: string;
      dueDate?: string | null;
      previousAssessmentId?: string | null;
      findingId?: string | null;
      remediationActionId?: string | null;
    }) =>
      rpc('supervisory_reassessment_require', {
        _entity_id: input.entityId,
        _domain_code: 'AML_CFT',
        _trigger_kind: input.triggerKind,
        _trigger_rationale: input.triggerRationale,
        _requested_type: input.requestedType ?? 'FOLLOW_UP',
        _due_date: input.dueDate ?? null,
        _previous_assessment_id: input.previousAssessmentId ?? null,
        _finding_id: input.findingId ?? null,
        _remediation_action_id: input.remediationActionId ?? null,
      }),
    onSuccess: invalidate,
  });
}
