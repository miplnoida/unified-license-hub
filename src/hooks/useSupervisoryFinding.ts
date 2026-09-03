/**
 * Canonical supervisory finding & remediation hooks (domain-neutral).
 *
 * Every read is of the canonical spine (`supervisory_finding`,
 * `supervisory_remediation_action`, `supervisory_remediation_validation`,
 * `supervisory_finding_event`, `supervisory_remediation_event`,
 * `supervisory_reassessment_requirement`) and every write is a governed
 * operation. Nothing here is AML-specific: the workspace serves whatever
 * domain the finding itself declares.
 *
 * The exact record identity matters: mutations always take the precise
 * `actionId` the user selected. No hook ever falls back to "the first
 * remediation action" — that would silently apply a supervisory decision to
 * the wrong corrective action.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

const sb = supabase as any;

export const FINDING_KEY = 'supervisory-finding';

export interface RemediationValidation {
  id: string;
  action_id: string;
  conclusion: string;
  evidence_reviewed: string | null;
  procedure_applied: string | null;
  rationale: string | null;
  next_step: string | null;
  validated_by: string | null;
  validated_at: string;
  validator_name?: string | null;
}

export interface RemediationAction {
  id: string;
  reference: string;
  finding_id: string;
  entity_id: string;
  domain_code: string;
  description: string | null;
  required_outcome: string | null;
  entity_response: string | null;
  owner_id: string | null;
  responsible_party: string | null;
  target_date: string | null;
  status: string;
  evidence: unknown;
  effectiveness: string | null;
  escalated_attention_id: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  closed_at: string | null;
  created_at: string;
  validations: RemediationValidation[];
  events: SupervisoryEvent[];
  owner_name?: string | null;
}

export interface SupervisoryEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  rationale: string | null;
  detail?: unknown;
  actor_id: string | null;
  actor_name?: string | null;
  created_at: string;
  /** Which record the event belongs to, for the merged finding history. */
  scope: 'FINDING' | 'REMEDIATION';
  scope_reference?: string | null;
}

export interface FindingProvenance {
  workpaper?: { id: string; reference: string | null; area: string | null; conclusion: string | null } | null;
  examination?: { id: string; reference: string | null; title: string | null; stage: string | null } | null;
  intervention?: { id: string; reference: string | null; intervention_type: string | null; status: string | null } | null;
  plan?: { id: string; reference: string | null; title: string | null; status: string | null } | null;
  attention?: { id: string; reference: string | null; title: string | null; status: string | null } | null;
  assessment?: {
    id: string; reference: string | null; assessment_type: string | null;
    overall_rating: string | null; status: string | null;
  } | null;
  dimension?: {
    id: string; dimension_code: string | null; residual_rating: string | null; inherent_rating: string | null;
  } | null;
}

export interface ReassessmentRequirement {
  id: string;
  trigger_kind: string;
  trigger_rationale: string | null;
  requested_type: string | null;
  due_date: string | null;
  status: string;
  finding_id: string | null;
  remediation_action_id: string | null;
  previous_assessment_id: string | null;
  fulfilled_assessment_id: string | null;
  created_at: string;
}

export interface ResidualAcceptance {
  id: string;
  action_id: string;
  finding_id: string;
  remaining_deficiency: string;
  residual_materiality: string;
  follow_up_requirement: string;
  next_review_date: string | null;
  rationale: string;
  accepted_by: string | null;
  accepted_at: string;
  accepted_by_name?: string | null;
}

export interface SupervisoryFindingModel {
  finding: Record<string, any>;
  entityName: string | null;
  ownerName: string | null;
  provenance: FindingProvenance;
  remediation: RemediationAction[];
  events: SupervisoryEvent[];
  reassessments: ReassessmentRequirement[];
  residualAcceptances: ResidualAcceptance[];
}


async function namesFor(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const list = [...new Set(ids.filter(Boolean))] as string[];
  if (!list.length) return new Map();
  const { data } = await sb.from('profiles').select('id, full_name, email').in('id', list);
  return new Map((data ?? []).map((p: any) => [p.id as string, (p.full_name || p.email) as string]));
}

/**
 * One authoritative read of a canonical finding: its exact provenance chain,
 * every corrective action with its own validations and events, the merged
 * history and any reassessment requirement raised from it.
 */
export function useSupervisoryFinding(id?: string) {
  return useQuery<SupervisoryFindingModel>({
    queryKey: [FINDING_KEY, id],
    enabled: !!id,
    queryFn: async () => {
      const { data: finding, error } = await sb.from('supervisory_finding').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      if (!finding) throw new Error('This finding does not exist, or you are not authorised to see it.');

      const [
        { data: entity },
        { data: actions },
        { data: fEvents },
        { data: reassess },
        { data: residual },
        { data: workpaper },
        { data: examination },
      ] = await Promise.all([
        sb.from('licensees').select('id, name').eq('id', finding.entity_id).maybeSingle(),
        sb.from('supervisory_remediation_action').select('*').eq('finding_id', id).order('created_at'),
        sb.from('supervisory_finding_event').select('*').eq('finding_id', id).order('created_at'),
        sb.from('supervisory_reassessment_requirement').select('*').eq('finding_id', id).order('created_at'),
        sb.from('supervisory_residual_acceptance').select('*').eq('finding_id', id).order('accepted_at'),
        finding.workpaper_id
          ? sb.from('examination_workpapers').select('id, reference, area, conclusion').eq('id', finding.workpaper_id).maybeSingle()
          : Promise.resolve({ data: null }),
        finding.examination_id
          ? sb.from('examinations').select('id, reference, title, stage, intervention_id, plan_id')
              .eq('id', finding.examination_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);


      const interventionId = finding.intervention_id ?? examination?.intervention_id ?? null;
      const [{ data: intervention }, { data: assessment }, { data: dimension }] = await Promise.all([
        interventionId
          ? sb.from('supervisory_intervention').select('id, reference, intervention_type, status, plan_id, attention_id')
              .eq('id', interventionId).maybeSingle()
          : Promise.resolve({ data: null }),
        finding.assessment_id
          ? sb.from('supervisory_assessment')
              .select('id, reference, assessment_type, overall_rating, residual_rating, status')
              .eq('id', finding.assessment_id).maybeSingle()
          : Promise.resolve({ data: null }),
        finding.assessment_dimension_id
          ? sb.from('supervisory_assessment_dimension')
              .select('id, dimension_code, residual_rating, inherent_rating')
              .eq('id', finding.assessment_dimension_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const planId = finding.plan_id ?? intervention?.plan_id ?? examination?.plan_id ?? null;
      const { data: plan } = planId
        ? await sb.from('supervisory_plan').select('id, reference, title, status, attention_id').eq('id', planId).maybeSingle()
        : { data: null };

      const attentionId = finding.attention_id ?? intervention?.attention_id ?? plan?.attention_id ?? null;
      const { data: attention } = attentionId
        ? await sb.from('supervisory_attention').select('id, reference, title, status').eq('id', attentionId).maybeSingle()
        : { data: null };

      const actionRows = (actions ?? []) as any[];
      const actionIds = actionRows.map((a) => a.id);
      const [{ data: validations }, { data: rEvents }] = await Promise.all([
        actionIds.length
          ? sb.from('supervisory_remediation_validation').select('*').in('action_id', actionIds).order('validated_at')
          : Promise.resolve({ data: [] }),
        actionIds.length
          ? sb.from('supervisory_remediation_event').select('*').in('action_id', actionIds).order('created_at')
          : Promise.resolve({ data: [] }),
      ]);

      const people = await namesFor([
        finding.owner_id,
        finding.response_recorded_by,
        ...actionRows.map((a) => a.owner_id),
        ...((validations ?? []) as any[]).map((v) => v.validated_by),
        ...((residual ?? []) as any[]).map((r) => r.accepted_by),
        ...((fEvents ?? []) as any[]).map((e) => e.actor_id),
        ...((rEvents ?? []) as any[]).map((e) => e.actor_id),
      ]);


      const remediation: RemediationAction[] = actionRows.map((a) => ({
        ...a,
        owner_name: a.owner_id ? people.get(a.owner_id) ?? null : null,
        validations: ((validations ?? []) as any[])
          .filter((v) => v.action_id === a.id)
          .map((v) => ({ ...v, validator_name: v.validated_by ? people.get(v.validated_by) ?? null : null })),
        events: ((rEvents ?? []) as any[])
          .filter((e) => e.action_id === a.id)
          .map((e) => ({
            ...e, scope: 'REMEDIATION' as const, scope_reference: a.reference,
            actor_name: e.actor_id ? people.get(e.actor_id) ?? null : null,
          })),
      }));

      const events: SupervisoryEvent[] = [
        ...((fEvents ?? []) as any[]).map((e) => ({
          ...e, scope: 'FINDING' as const, scope_reference: finding.reference,
          actor_name: e.actor_id ? people.get(e.actor_id) ?? null : null,
        })),
        ...remediation.flatMap((a) => a.events),
      ].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));

      return {
        finding,
        entityName: entity?.name ?? null,
        ownerName: finding.owner_id ? people.get(finding.owner_id) ?? null : null,
        provenance: {
          workpaper: workpaper ?? null,
          examination: examination ?? null,
          intervention: intervention ?? null,
          plan: plan ?? null,
          attention: attention ?? null,
          assessment: assessment ?? null,
          dimension: dimension ?? null,
        },
        remediation,
        events,
        reassessments: (reassess ?? []) as ReassessmentRequirement[],
        residualAcceptances: ((residual ?? []) as any[]).map((r) => ({
          ...r,
          accepted_by_name: r.accepted_by ? people.get(r.accepted_by) ?? null : null,
        })) as ResidualAcceptance[],

      };
    },
  });
}

/* ------------------------------------------------------------ mutations ---- */

function useFindingMutation<TInput>(fn: (input: TInput) => Promise<unknown>, findingId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [FINDING_KEY, findingId] });
      void qc.invalidateQueries({ queryKey: ['aml'] });
      void qc.invalidateQueries({ queryKey: ['supervisory-work'] });
    },
  });
}

async function rpc<T = any>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function useFindingLifecycle(findingId?: string) {
  return useFindingMutation<{ toStatus: string; rationale: string }>(
    (i) => rpc('supervisory_finding_lifecycle', {
      _finding_id: findingId, _to_status: i.toStatus, _rationale: i.rationale,
    }),
    findingId,
  );
}

export interface RecordResponseInput {
  responseState: 'ACCEPTED' | 'PARTIALLY_ACCEPTED' | 'DISPUTED';
  managementResponse: string;
  proposedAction?: string | null;
  responsiblePerson?: string | null;
  targetDate?: string | null;
  /**
   * Officer-recorded external receipt. The database derives the authoritative
   * `response_source` from who is acting, so this is never a claim that the
   * entity itself answered in the platform — it is how the letter, email or
   * meeting note reached the regulator.
   */
  receivedFrom?: string | null;
  receivedDate?: string | null;
  channel?: string | null;
  documents?: Record<string, unknown>[] | null;
}

export function useRecordFindingResponse(findingId?: string) {
  return useFindingMutation<RecordResponseInput>(
    (i) => rpc('supervisory_finding_response', {
      _finding_id: findingId,
      _response_state: i.responseState,
      _management_response: i.managementResponse,
      _proposed_action: i.proposedAction ?? null,
      _responsible_person: i.responsiblePerson ?? null,
      _target_date: i.targetDate ?? null,
      _attachments: { documents: i.documents ?? [] },
      _received_from: i.receivedFrom ?? null,
      _received_date: i.receivedDate ?? null,
      _channel: i.channel ?? null,
    }),
    findingId,
  );
}

/**
 * Governed acceptance of a residual deficiency. A partially effective
 * corrective action is either remediated further or its residual weakness is
 * formally accepted with a follow-up requirement — it is never quietly closed.
 */
export function useAcceptResidualDeficiency(findingId?: string) {
  return useFindingMutation<{
    actionId: string;
    remainingDeficiency: string;
    residualMateriality: 'LOW' | 'MEDIUM' | 'HIGH';
    followUpRequirement: string;
    rationale: string;
    nextReviewDate?: string | null;
  }>(
    (i) => rpc('supervisory_residual_acceptance_record', {
      _action_id: i.actionId,
      _remaining_deficiency: i.remainingDeficiency,
      _residual_materiality: i.residualMateriality,
      _follow_up_requirement: i.followUpRequirement,
      _rationale: i.rationale,
      _next_review_date: i.nextReviewDate ?? null,
    }),
    findingId,
  );
}


export function useOpenRemediation(findingId?: string) {
  return useFindingMutation<{
    description: string; requiredOutcome?: string | null;
    responsibleParty?: string | null; targetDate?: string | null;
  }>(
    (i) => rpc('supervisory_remediation_open', {
      _finding_id: findingId,
      _description: i.description,
      _required_outcome: i.requiredOutcome ?? null,
      _responsible_party: i.responsibleParty ?? null,
      _target_date: i.targetDate ?? null,
    }),
    findingId,
  );
}

/** Transitions the EXACT corrective action the user selected. */
export function useTransitionRemediation(findingId?: string) {
  return useFindingMutation<{
    actionId: string; toStatus: string; rationale: string;
    entityResponse?: string | null; evidence?: Record<string, unknown>[] | null;
  }>(
    (i) => rpc('supervisory_remediation_transition', {
      _action_id: i.actionId,
      _to_status: i.toStatus,
      _rationale: i.rationale,
      _entity_response: i.entityResponse ?? null,
      _evidence: i.evidence?.length ? i.evidence : null,
    }),
    findingId,
  );
}

export function useValidateRemediation(findingId?: string) {
  return useFindingMutation<{
    actionId: string;
    conclusion: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'INEFFECTIVE';
    evidenceReviewed: string; procedureApplied: string; rationale: string;
    nextStep?: string | null; workpaperId?: string | null; documentId?: string | null;
  }>(
    (i) => rpc('supervisory_remediation_validate', {
      _action_id: i.actionId,
      _conclusion: i.conclusion,
      _evidence_reviewed: i.evidenceReviewed,
      _procedure_applied: i.procedureApplied,
      _rationale: i.rationale,
      _next_step: i.nextStep ?? null,
      _workpaper_id: i.workpaperId ?? null,
      _document_id: i.documentId ?? null,
    }),
    findingId,
  );
}

export function useEscalateRemediation(findingId?: string) {
  return useFindingMutation<{ actionId: string; reason: string; materiality: string; urgency: string }>(
    (i) => rpc('supervisory_remediation_escalate', {
      _action_id: i.actionId, _reason: i.reason, _materiality: i.materiality, _urgency: i.urgency,
    }),
    findingId,
  );
}

/**
 * Enforcement referral — an explicit human regulatory decision, never a
 * consequence of severity or an overdue date. Provenance is derived by the
 * database from the referred source record.
 */
export function useEnforcementReferral(findingId?: string) {
  return useFindingMutation<{
    sourceKind: 'SUPERVISORY_FINDING' | 'SUPERVISORY_REMEDIATION';
    sourceId: string;
    referralReason: string;
    legalBasis?: string | null;
    enforcementType?: string | null;
    remediationBypassReason?: string | null;
  }>(
    (i) => rpc('enforcement_referral_create', {
      _payload: {
        source_kind: i.sourceKind,
        source_id: i.sourceId,
        referral_reason: i.referralReason,
        legal_basis: i.legalBasis ?? null,
        enforcement_type: i.enforcementType ?? null,
        remediation_bypass_reason: i.remediationBypassReason ?? null,
      },
    }),
    findingId,
  );
}

export function useRequireReassessment(findingId?: string) {
  return useFindingMutation<{
    entityId: string; domainCode: string; triggerKind: string; triggerRationale: string;
    requestedType?: string; dueDate?: string | null;
    previousAssessmentId?: string | null;
    /** The exact corrective action that triggered the reassessment, when one did. */
    remediationActionId?: string | null;
    examinationId?: string | null;
    validationId?: string | null;
  }>(
    (i) => rpc('supervisory_reassessment_require', {
      _entity_id: i.entityId,
      _domain_code: i.domainCode,
      _trigger_kind: i.triggerKind,
      _trigger_rationale: i.triggerRationale,
      _requested_type: i.requestedType ?? 'FOLLOW_UP',
      _due_date: i.dueDate ?? null,
      _previous_assessment_id: i.previousAssessmentId ?? null,
      _finding_id: findingId ?? null,
      _remediation_action_id: i.remediationActionId ?? null,
      _validation_id: i.validationId ?? null,
      _examination_id: i.examinationId ?? null,
    }),
    findingId,
  );
}

/* --------------------------------------------------- derived supervision --- */

export const OPEN_REMEDIATION_STATUSES = [
  'OPEN', 'ACTION_PLAN_SUBMITTED', 'UNDER_REVIEW', 'ACCEPTED', 'IMPLEMENTING',
  'EVIDENCE_SUBMITTED', 'VALIDATION', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE', 'REOPENED',
];

/** Derived, never stored: time has not changed the governed lifecycle state. */
export function remediationTiming(action: Pick<RemediationAction, 'target_date' | 'status'>) {
  const status = (action.status ?? '').toUpperCase();
  const settled = ['EFFECTIVE', 'CLOSED'].includes(status);
  if (!action.target_date || settled) return { state: 'none' as const, days: 0 };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(`${action.target_date}T00:00:00`);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { state: 'overdue' as const, days: Math.abs(days) };
  if (days === 0) return { state: 'due_today' as const, days: 0 };
  if (days <= 14) return { state: 'due_soon' as const, days };
  return { state: 'none' as const, days };
}

export interface ClosureCheck { ok: boolean; label: string; detail?: string }

/**
 * Closure readiness computed from EVERY corrective action, mirroring the
 * database guards. One effective action never makes a finding remediated.
 */
export function closureReadiness(model?: SupervisoryFindingModel): {
  checks: ClosureCheck[]; eligible: boolean; blockers: string[];
} {
  if (!model) return { checks: [], eligible: false, blockers: [] };
  const f = model.finding;
  const status = (f.status ?? '').toUpperCase();
  const checks: ClosureCheck[] = [];

  checks.push({
    ok: !!f.issued_at,
    label: 'Finding issued to the entity',
    detail: f.issued_at ? undefined : 'The finding has not been issued yet.',
  });
  const source = String(f.response_source ?? '').toUpperCase();
  checks.push({
    ok: !!f.response_at,
    label: 'Management response received',
    detail: f.response_at
      ? `Response state ${f.response_state ?? '—'}${
        source === 'OFFICER_RECORDED' ? ' · officer-recorded from an external receipt' : source === 'ENTITY_SUBMITTED' ? ' · submitted by the entity' : ''}`
      : 'No management response has been recorded.',
  });
  checks.push({
    ok: model.remediation.length > 0,
    label: 'Corrective actions raised',
    detail: model.remediation.length ? `${model.remediation.length} corrective action(s)` : 'No corrective action exists.',
  });

  /** A partial outcome is resolved only where the residual weakness was formally accepted. */
  const acceptedActionIds = new Set(model.residualAcceptances.map((r) => r.action_id));

  model.remediation.forEach((a) => {
    const s = (a.status ?? '').toUpperCase();
    const accepted = acceptedActionIds.has(a.id);
    const done = ['EFFECTIVE', 'CLOSED'].includes(s) || (s === 'PARTIALLY_EFFECTIVE' && accepted);
    checks.push({
      ok: done,
      label: `${a.reference} ${
        s === 'PARTIALLY_EFFECTIVE' && accepted ? 'partially effective — residual deficiency accepted'
          : done ? 'validated effective' : `is ${s.replace(/_/g, ' ').toLowerCase()}`}`,
      detail: done ? undefined
        : s === 'PARTIALLY_EFFECTIVE'
          ? `${a.reference} was validated only partially effective. Accept the residual deficiency with a follow-up requirement, or require further remediation.`
          : a.validations.length ? `Last validation: ${a.validations[a.validations.length - 1].conclusion}`
            : 'Awaiting governed independent validation.',
    });
  });


  const anyValidation = model.remediation.some((a) => a.validations.length > 0);
  if (['REMEDIATION_REQUIRED', 'VALIDATION', 'REOPENED'].includes(status)) {
    checks.push({
      ok: anyValidation,
      label: 'Governed remediation validation on record',
      detail: anyValidation ? undefined : 'The database requires at least one validation before closure.',
    });
  }

  const blockers = checks.filter((c) => !c.ok).map((c) => c.detail || c.label);
  const terminal = ['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(status);
  return { checks, eligible: !terminal && blockers.length === 0, blockers };
}

/** The single operational next action for the finding. */
export function findingNextAction(model?: SupervisoryFindingModel): string {
  if (!model) return '—';
  const f = model.finding;
  const status = (f.status ?? '').toUpperCase();
  if (status === 'DRAFT') return 'Send the finding for review';
  if (status === 'REVIEW') return 'Issue the finding to the entity';
  if (status === 'ISSUED') return 'Await or record the management response';
  if (status === 'MANAGEMENT_RESPONSE' && !model.remediation.length) return 'Raise the required corrective actions';
  const acceptedActionIds = new Set(model.residualAcceptances.map((r) => r.action_id));
  const residual = model.remediation.find(
    (a) => (a.status ?? '').toUpperCase() === 'PARTIALLY_EFFECTIVE' && !acceptedActionIds.has(a.id),
  );
  if (residual) return `Residual deficiency decision required on ${residual.reference}`;
  const escalate = model.remediation.find(
    (a) => !a.escalated_attention_id
      && (remediationTiming(a).state === 'overdue'
        || ['INEFFECTIVE'].includes((a.status ?? '').toUpperCase())),
  );
  if (escalate) return `Escalation decision required on ${escalate.reference}`;

  const validate = model.remediation.find((a) => (a.status ?? '').toUpperCase() === 'VALIDATION');
  if (validate) return `Validate ${validate.reference}`;
  const awaiting = model.remediation.find((a) => OPEN_REMEDIATION_STATUSES.includes((a.status ?? '').toUpperCase()));
  if (awaiting) return `Await evidence for ${awaiting.reference}`;
  if (['CLOSED', 'WITHDRAWN', 'SUPERSEDED'].includes(status)) {
    const open = model.reassessments.find((r) => r.status === 'OPEN' || r.status === 'open');
    return open ? 'Reassessment due' : 'No action outstanding';
  }
  return closureReadiness(model).eligible ? 'Close the finding' : 'Complete outstanding remediation';
}
