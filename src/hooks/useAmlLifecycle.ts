/**
 * AML/CFT supervision write hooks.
 *
 * Every mutation is a call to a governed supervisory operation on the
 * canonical spine — no AML page ever writes to a table directly. Maker/checker
 * separation, entity scope, evidence and rationale discipline are enforced by
 * the database, so these hooks only shape arguments and surface the error.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  if (/mandatory_questions_incomplete/i.test(raw))
    return `Mandatory supervisory questions are outstanding, so this assessment cannot be submitted. ${raw.replace(/^.*mandatory_questions_incomplete:\s*/i, '')}`;
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
  /** Resolved by `supervisory_methodology_resolve` — never chosen by the officer. */
  methodologyId: string;
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
      if (!input.methodologyId) {
        throw new Error(
          'No AML/CFT methodology is applicable to this entity on this date. A methodology owner must publish an ' +
            'applicable active version before an assessment can be created.',
        );
      }
      return rpc('supervisory_assessment_create', {
        _entity_id: input.entityId,
        _domain_code: 'AML_CFT',
        _assessment_type: input.assessmentType,
        _period_start: input.periodStart ?? null,
        _period_end: input.periodEnd ?? null,
        _methodology_id: input.methodologyId,
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
  /** Governed references — normally registered documents from the register. */
  evidenceRefs?: Record<string, unknown>[] | null;

  trend?: string | null;
  confidence?: string | null;
  dataQuality?: string | null;
  calculatedInherentRating?: string | null;
  calculatedControlRating?: string | null;
  calculatedResidualRating?: string | null;
  overrideReason?: string | null;
  proposedExaminationScope?: boolean | null;
  /** The methodology dimension this working paper belongs to. */
  methodologyDimensionId?: string | null;
  exceptions?: string | null;
  isApplicable?: boolean | null;
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
        _methodology_dimension_id: input.methodologyDimensionId ?? null,
        _evidence_refs: input.evidenceRefs?.length ? input.evidenceRefs : null,
        _source_facts: input.sourceFacts ?? null,
        _supervisory_commentary: input.supervisoryCommentary ?? null,
        _exceptions: input.exceptions ?? null,
        _trend: input.trend ?? null,
        _confidence: input.confidence ?? null,
        _data_quality: input.dataQuality ?? null,
        _is_applicable: input.isApplicable ?? null,
        // Calculated values are only ever the methodology's own recommendation.
        // They are never mirrored from what the officer judged.
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

/* ------------------------------------------------- methodology resolution -- */

export interface ResolvedAmlMethodology {
  id: string;
  code: string;
  name: string;
  version: string;
  status: string;
  effective_from: string | null;
  sector_id: string | null;
}

/**
 * Resolves the methodology an AML/CFT assessment must be created on.
 *
 * Resolution is the database's, not the browser's: `supervisory_methodology_resolve`
 * considers domain, the entity's sector, the effective date window, status and
 * applicability. Officers never choose a version, and where nothing applies the
 * caller blocks creation rather than falling back to "latest active".
 */
export function useResolvedAmlMethodology(entityId?: string | null, asOf?: string | null) {
  return useQuery({
    queryKey: ['aml', 'methodology-resolve', entityId ?? null, asOf ?? null],
    queryFn: async (): Promise<{ methodology: ResolvedAmlMethodology | null; sectorId: string | null }> => {
      let sectorId: string | null = null;
      if (entityId) {
        const { data: ent } = await sb.from('licensees').select('sector_id').eq('id', entityId).maybeSingle();
        sectorId = ent?.sector_id ?? null;
      }
      const { data: id, error } = await sb.rpc('supervisory_methodology_resolve', {
        _domain_code: 'AML_CFT',
        _sector_id: sectorId,
        _as_of: asOf ?? null,
      });
      if (error) throw error;
      if (!id) return { methodology: null, sectorId };
      const { data: meth, error: mErr } = await sb
        .from('supervisory_methodology')
        .select('id, code, name, version, status, effective_from, sector_id')
        .eq('id', id)
        .maybeSingle();
      if (mErr) throw mErr;
      return { methodology: (meth ?? null) as ResolvedAmlMethodology | null, sectorId };
    },
  });
}

export interface AmlMethodologyDimension {
  id: string;
  dimension_code: string;
  dimension_group: string;
  label: string | null;
  description: string | null;
  weight: number | null;
  evidence_required: boolean | null;
  min_evidence_count: number | null;
  sort_order: number | null;
  dimension_kind: string | null;
  scoring_guidance: string | null;
  mandatory_questions: any;
  data_sources: any;
  evidence_requirements: string | null;
}

/** The configured dimensions of a methodology version — the only valid codes. */
export function useAmlMethodologyDimensions(methodologyId?: string | null) {
  return useQuery({
    queryKey: ['aml', 'methodology-dimensions', methodologyId ?? null],
    enabled: !!methodologyId,
    queryFn: async (): Promise<AmlMethodologyDimension[]> => {
      const { data, error } = await sb
        .from('supervisory_methodology_dimension')
        .select('*')
        .eq('methodology_id', methodologyId)
        .eq('active', true)
        .order('dimension_group', { ascending: true })
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AmlMethodologyDimension[];
    },
  });
}

/* ------------------------------- mandatory supervisory questions --------- */

export interface AmlMethodologyQuestion {
  id: string;
  methodology_id: string;
  methodology_dimension_id: string;
  question_code: string;
  prompt: string;
  guidance: string | null;
  response_options: string[] | null;
  mandatory: boolean;
  requires_observation: boolean;
  requires_evidence: boolean;
  min_evidence_count: number;
  allow_not_applicable: boolean;
  na_requires_rationale: boolean;
  question_version: number;
  sort_order: number;
}

export interface AmlQuestionResponse {
  id: string;
  assessment_id: string;
  methodology_question_id: string;
  methodology_dimension_id: string;
  dimension_code: string;
  question_code: string;
  question_text: string;
  question_version: number;
  response: string;
  observation: string | null;
  evidence_refs: unknown;
  recorded_by: string | null;
  recorded_at: string;
  updated_by: string | null;
  updated_at: string;
}

/**
 * The mandatory supervisory questions configured on a methodology version.
 *
 * Questions are never hardcoded in the client: they belong to the methodology
 * version attached to the assessment, and carry their own stable code and
 * version so a historical assessment can always be read back against the exact
 * wording that was effective when it was worked.
 */
export function useAmlMethodologyQuestions(methodologyId?: string | null) {
  return useQuery({
    queryKey: ['aml', 'methodology-questions', methodologyId ?? null],
    enabled: !!methodologyId,
    queryFn: async (): Promise<AmlMethodologyQuestion[]> => {
      const { data, error } = await sb
        .from('supervisory_methodology_question')
        .select('*')
        .eq('methodology_id', methodologyId)
        .eq('active', true)
        .order('sort_order', { ascending: true })
        .order('question_code', { ascending: true });
      if (error) throw error;
      return (data ?? []) as AmlMethodologyQuestion[];
    },
  });
}

/** The governed question responses already recorded on an assessment. */
export function useAmlQuestionResponses(assessmentId?: string | null) {
  return useQuery({
    queryKey: ['aml', 'question-responses', assessmentId ?? null],
    enabled: !!assessmentId,
    queryFn: async (): Promise<AmlQuestionResponse[]> => {
      const { data, error } = await sb
        .from('supervisory_assessment_question_response')
        .select('*')
        .eq('assessment_id', assessmentId);
      if (error) throw error;
      return (data ?? []) as AmlQuestionResponse[];
    },
  });
}

/** Records a response against one configured methodology question. */
export function useSaveAmlQuestionResponse() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      assessmentId: string;
      questionId: string;
      response: string;
      observation?: string | null;
      evidenceRefs?: unknown[] | null;
    }) =>
      rpc('supervisory_assessment_question_upsert', {
        _assessment_id: input.assessmentId,
        _question_id: input.questionId,
        _response: input.response,
        _observation: input.observation ?? null,
        _evidence_refs: input.evidenceRefs ?? null,
      }),
    onSuccess: invalidate,
  });
}



/* --------------------------------------- intervention → examination ------- */

export function useOpenAmlIntervention() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      planId: string;
      interventionType: string;
      title: string;
      basis: string;
      entityId: string;
      attentionId?: string | null;
      expectedOutcome?: string | null;
      plannedStart?: string | null;
      plannedEnd?: string | null;
    }) =>
      rpc('supervisory_intervention_open', {
        _plan_id: input.planId,
        _intervention_type: input.interventionType,
        _title: input.title,
        _basis: input.basis,
        _domain_code: 'AML_CFT',
        _licensee_id: input.entityId,
        _attention_id: input.attentionId ?? null,
        _expected_outcome: input.expectedOutcome ?? null,
        _planned_start: input.plannedStart ?? null,
        _planned_end: input.plannedEnd ?? null,
      }),
    onSuccess: invalidate,
  });
}

export function useDecideAmlIntervention() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { interventionId: string; decision: string; rationale: string }) =>
      rpc('supervisory_intervention_decide', {
        _intervention_id: input.interventionId,
        _decision: input.decision,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

export function useOpenAmlExamination() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      interventionId: string;
      title: string;
      engagementType: string;
      entityId: string;
      assessmentId?: string | null;
      riskFocusDimensionIds?: string[] | null;
      periodStart?: string | null;
      periodEnd?: string | null;
      leadExaminerId?: string | null;
      methodologyId?: string | null;
      triggerType?: string | null;
    }) =>
      rpc('supervisory_examination_open', {
        _intervention_id: input.interventionId,
        _title: input.title,
        _engagement_type: input.engagementType,
        _domain_code: 'AML_CFT',
        _entity_id: input.entityId,
        _origin_assessment_ids: input.assessmentId ? [input.assessmentId] : null,
        _risk_focus_dimension_ids: input.riskFocusDimensionIds?.length ? input.riskFocusDimensionIds : null,
        _period_start: input.periodStart ?? null,
        _period_end: input.periodEnd ?? null,
        _lead_examiner_id: input.leadExaminerId ?? null,
        _methodology_id: input.methodologyId ?? null,
        _trigger_type: input.triggerType ?? 'AML_RISK',
      }),
    onSuccess: invalidate,
  });
}

/** Carries exact assessment + dimension provenance into examination scope. */
export function useAmlExaminationScopeFromAssessment() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: {
      examinationId: string;
      assessmentId: string;
      dimensionIds: string[];
      rationale: string;
      includeAreas?: boolean;
    }) =>
      rpc('examination_scope_from_assessment', {
        _examination_id: input.examinationId,
        _assessment_id: input.assessmentId,
        _dimension_ids: input.dimensionIds,
        _rationale: input.rationale,
        _include_areas: input.includeAreas ?? true,
      }),
    onSuccess: invalidate,
  });
}

/** Examiner-amended scope area — recorded with its own rationale. */
export function useAmendAmlExaminationScope() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { examinationId: string; areaCode: string; areaLabel: string; rationale: string }) =>
      rpc('examination_scope_area_amend', {
        _examination_id: input.examinationId,
        _area_code: input.areaCode,
        _area_label: input.areaLabel,
        _rationale: input.rationale,
      }),
    onSuccess: invalidate,
  });
}

/* -------------------------------------------------- finding creation ------ */

export interface CreateAmlFindingInput {
  entityId: string;
  title: string;
  observation: string;
  findingCategory: string;
  severity: string;
  rootCause?: string | null;
  riskImpact?: string | null;
  regulatoryCriterion?: string | null;
  requiredAction?: string | null;
  recommendation?: string | null;
  dueDate?: string | null;
  confidentiality?: string | null;
  /** Provenance is supplied by the calling surface, never typed by the user. */
  assessmentId?: string | null;
  assessmentDimensionId?: string | null;
  attentionId?: string | null;
  planId?: string | null;
  interventionId?: string | null;
  examinationId?: string | null;
  workpaperId?: string | null;
}

export function useCreateAmlFinding() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: CreateAmlFindingInput) =>
      rpc('supervisory_finding_create', {
        _payload: {
          domain_code: 'AML_CFT',
          entity_id: input.entityId,
          title: input.title,
          observation: input.observation,
          finding_category: input.findingCategory,
          severity: input.severity,
          root_cause: input.rootCause ?? null,
          risk_impact: input.riskImpact ?? null,
          regulatory_criterion: input.regulatoryCriterion ?? null,
          required_action: input.requiredAction ?? null,
          recommendation: input.recommendation ?? null,
          due_date: input.dueDate ?? null,
          confidentiality: input.confidentiality ?? 'RESTRICTED',
          assessment_id: input.assessmentId ?? null,
          assessment_dimension_id: input.assessmentDimensionId ?? null,
          attention_id: input.attentionId ?? null,
          plan_id: input.planId ?? null,
          intervention_id: input.interventionId ?? null,
          examination_id: input.examinationId ?? null,
          workpaper_id: input.workpaperId ?? null,
        },
      }),
    onSuccess: invalidate,
  });
}

/* ---------------------------------------------- remediation escalation ---- */

export function useEscalateAmlRemediation() {
  const invalidate = useInvalidateAml();
  return useMutation({
    mutationFn: (input: { actionId: string; reason: string; materiality: string; urgency: string }) =>
      rpc('supervisory_remediation_escalate', {
        _action_id: input.actionId,
        _reason: input.reason,
        _materiality: input.materiality,
        _urgency: input.urgency,
      }),
    onSuccess: invalidate,
  });
}
