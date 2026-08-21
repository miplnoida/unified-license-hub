/**
 * RDM-ENTITY-001 Wave A — Entity Registry Gateway client.
 *
 * The frontend never queries `licensees` / `entity_*` tables directly for
 * identity work: every read and every state change goes through the governed
 * server functions so authorization, provenance and audit stay server-side.
 */
import { supabase } from '@/integrations/supabase/client';

const rpc = (fn: string, args?: Record<string, unknown>) =>
  (supabase.rpc as unknown as (f: string, a?: Record<string, unknown>) => Promise<{ data: any; error: any }>)(fn, args);

async function call<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await rpc(fn, args);
  if (error) throw new Error(error.message || `${fn} failed`);
  return data as T;
}

export interface EntityIdentifierDto {
  type: string;
  label: string;
  value: string;
  normalized_value: string | null;
  verification_status: string | null;
  is_primary: boolean;
}

export interface EntityLicenceDto {
  license_id: string;
  license_number: string | null;
  license_type: string | null;
  status: string | null;
  valid_until: string | null;
  is_primary: boolean;
  effective_from: string;
}

export interface EntityDto {
  source: string;
  entity_id: string;
  legal_name: string;
  display_name: string;
  lifecycle: string | null;
  lifecycle_label: string | null;
  identity_status: string | null;
  identity_status_label: string | null;
  merged_into_entity_id: string | null;
  sector_id: string | null;
  assigned_supervisor_id: string | null;
  identifiers: EntityIdentifierDto[];
  licences: EntityLicenceDto[];
  external_references: Array<{
    external_entity_id: string;
    verification_status: string | null;
    is_authoritative: boolean;
    last_verified_at: string | null;
  }> | null;
}

export interface ResolutionResult {
  case_id: string;
  case_number: string;
  outcome: 'EXACT_MATCH' | 'POSSIBLE_MATCH' | 'NO_MATCH' | 'PROVIDER_UNAVAILABLE';
  entity_id: string | null;
  candidates: Array<{
    entity_id: string;
    legal_name?: string;
    match_score: number;
    match_basis: string;
  }>;
}

/**
 * Governed resolution actions.
 *
 * Maker actions (Entity Resolution Officer): `RECOMMEND_EXISTING`,
 * `RECOMMEND_NEW`, `REQUEST_EVIDENCE`, `ESCALATE`, plus direct
 * `RESOLVE_EXISTING` / `CONFIRM_NEW` where the governing policy does not
 * require maker-checker.
 *
 * Checker actions (Entity Resolution Supervisor, `entity_resolution.approve`):
 * `APPROVE` (completes the recommended resolution) and `RETURN_FOR_REVIEW`
 * (rejects the recommendation and sends the case back to operational review).
 */
export type ResolutionAction =
  | 'RECOMMEND_EXISTING'
  | 'RECOMMEND_NEW'
  | 'RESOLVE_EXISTING'
  | 'CONFIRM_NEW'
  | 'REQUEST_EVIDENCE'
  | 'ESCALATE'
  | 'APPROVE'
  | 'RETURN_FOR_REVIEW';

export interface ResolutionQueueRow {
  id: string;
  case_number: string;
  status: string;
  outcome: string | null;
  subject_name: string;
  provider_status: string;
  authority_mode: string;
  journey_type: string | null;
  registration_id: string | null;
  registration_reference: string | null;
  binding_status: string | null;
  recommended_action: string | null;
  recommended_entity_id: string | null;
  recommended_entity_name: string | null;
  recommended_by: string | null;
  recommended_by_name: string | null;
  recommended_at: string | null;
  escalated_by: string | null;
  escalated_by_name: string | null;
  escalated_at: string | null;
  escalation_reason: string | null;
  supervisor_decision: string | null;
  top_match_score: number | null;
  candidate_count: number;
  escalation_age_hours: number | null;
  awaiting_supervisor: boolean;
  resolved_entity_id: string | null;
  requested_at: string;
  resolved_at: string | null;
  created_at: string;
}

export interface ResolutionCaseView {
  detail: {
    id: string;
    case_number: string;
    status: string;
    outcome: string | null;
    subject_name: string;
    subject_identifiers: Array<Record<string, unknown>> | null;
    provider_status: string;
    authority_mode: string;
    requires_maker_checker: boolean;
    application_id: string | null;
    resolved_entity_id: string | null;
    resolved_entity_name: string | null;
    decision_notes: string | null;
    requested_at: string;
    resolved_at: string | null;
    resolved_by: string | null;
    resolved_by_name: string | null;
    recommended_action: string | null;
    recommended_entity_id: string | null;
    recommended_entity_name: string | null;
    recommended_by: string | null;
    recommended_by_name: string | null;
    recommended_at: string | null;
    recommendation_notes: string | null;
    escalated_by: string | null;
    escalated_by_name: string | null;
    escalated_at: string | null;
    escalation_reason: string | null;
    supervisor_decision: string | null;
    supervisor_notes: string | null;
    supervisor_decided_by: string | null;
    supervisor_decided_by_name: string | null;
    supervisor_decided_at: string | null;
    approved_by: string | null;
    approved_at: string | null;
  };
  journey: {
    journey_type: string | null;
    registration_id: string | null;
    registration_reference: string | null;
    binding_status: string | null;
    applicant_name: string | null;
    applicant_email: string | null;
    sector_name: string | null;
    initiated_at: string | null;
  };
  candidates: Array<{
    id: string;
    entity_id: string | null;
    entity_name: string | null;
    lifecycle: string | null;
    licence_numbers: string[];
    match_score: number;
    match_basis: string;
    signals: Record<string, unknown>;
    is_selected: boolean;
  }>;
  events: Array<{
    id: string;
    event_type: string;
    created_at: string;
    actor_id: string | null;
    actor_name: string | null;
    detail: Record<string, unknown>;
  }>;
}

/** Enriched supervisory queue (case + recommendation + escalation context). */
export const getResolutionQueue = (status?: string) =>
  call<{ rows: ResolutionQueueRow[]; awaiting_supervisor_count: number }>('entity_resolution_queue', {
    _status: status && status !== 'all' ? status : null,
  });

/** Enriched case workspace payload — regulator-facing names, never bare UUIDs. */
export const getResolutionCaseView = (caseId: string) =>
  call<ResolutionCaseView | null>('entity_resolution_case_view', { _case_id: caseId });


/** Provider-agnostic search over the registry (local provider today). */
export const searchEntities = (query: string, limit = 50) =>
  call<EntityDto[]>('entity_registry_search', { _criteria: { query, limit } });

export const getEntity = (entityId: string) =>
  call<EntityDto>('entity_registry_entity_dto', { _entity_id: entityId });

export const resolveIdentity = (payload: {
  legal_name: string;
  identifiers?: Array<{ type: string; value: string }>;
  license_number?: string;
  application_id?: string | null;
  sector_id?: string | null;
}) => call<ResolutionResult>('entity_resolve_identity', { _payload: payload });

export const decideResolution = (args: {
  caseId: string;
  action: ResolutionAction;
  entityId?: string | null;
  notes?: string | null;
}) =>
  call<{ case_id: string; entity_id: string | null; action: string }>('entity_resolution_decide', {
    _case_id: args.caseId,
    _action: args.action,
    _entity_id: args.entityId ?? null,
    _notes: args.notes ?? null,
  });

export const previewMerge = (survivorEntityId: string, absorbedEntityId: string) =>
  call<Record<string, number>>('entity_merge_preview', {
    _survivor_entity_id: survivorEntityId,
    _absorbed_entity_id: absorbedEntityId,
  });

export const executeMerge = (args: {
  survivorEntityId: string;
  absorbedEntityId: string;
  reason: string;
  caseId?: string | null;
}) =>
  call<string>('entity_merge_execute', {
    _survivor_entity_id: args.survivorEntityId,
    _absorbed_entity_id: args.absorbedEntityId,
    _reason: args.reason,
    _case_id: args.caseId ?? null,
  });

/** Entity-id-first licence attachment used by issuance cutover. */
export const attachLicence = (entityId: string, licenseId: string, isPrimary = false) =>
  call<string>('entity_attach_license', {
    _entity_id: entityId,
    _license_id: licenseId,
    _is_primary: isPrimary,
  });

export const createLocalEntity = (args: {
  legalName: string;
  identifiers?: Array<{ type: string; value: string }>;
  sectorId?: string | null;
}) =>
  call<string>('entity_create_local', {
    _legal_name: args.legalName,
    _identifiers: args.identifiers ?? [],
    _sector_id: args.sectorId ?? null,
  });

// ── Membership lifecycle ────────────────────────────────────────────────
export const requestMembership = (entityId: string, roleKey: string, evidenceRef?: string) =>
  call<string>('entity_membership_request', {
    _entity_id: entityId,
    _membership_role_key: roleKey,
    _authority_evidence_reference: evidenceRef ?? null,
  });

export const verifyMembership = (id: string, notes?: string) =>
  call<void>('entity_membership_verify', { _id: id, _notes: notes ?? null });

export const approveMembership = (id: string) => call<void>('entity_membership_approve', { _id: id });

export const rejectMembership = (id: string, reason: string) =>
  call<void>('entity_membership_reject', { _id: id, _reason: reason });

export const revokeMembership = (id: string, reason: string) =>
  call<void>('entity_membership_revoke', { _id: id, _reason: reason });
