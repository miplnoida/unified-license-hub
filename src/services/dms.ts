/**
 * Central Document Management (DMS) service layer.
 *
 * Every call goes through a governed SECURITY DEFINER RPC that enforces the
 * `document_management` permission module, confidentiality visibility, scan
 * state, legal hold and audit logging server-side. The client never mutates
 * `document_groups` / `document_versions` directly.
 */
import { supabase } from '@/integrations/supabase/client';

export type DmsConfidentiality =
  | 'public'
  | 'entity'
  | 'regulator_internal'
  | 'restricted'
  | 'confidential'
  | 'legal_privileged';

export type DmsPublicationEligibility =
  | 'not_publishable'
  | 'public_eligible'
  | 'published';

export interface DmsDocumentRow {
  id: string;
  document_reference: string | null;
  display_name: string | null;
  document_type: string | null;
  category_code: string | null;
  category_name: string | null;
  type_code: string | null;
  document_status: string | null;
  verification_status: string | null;
  acceptance_status: string | null;
  confidentiality_classification: DmsConfidentiality | null;
  publication_eligibility: DmsPublicationEligibility | null;
  publication_status: string | null;
  primary_entity_id: string | null;
  source_module: string | null;
  source_record_type: string | null;
  source_record_id: string | null;
  current_version: number | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  bucket: string | null;
  storage_path: string | null;
  updated_at: string | null;
  total_count: number | null;
}

export interface DmsDocumentDetail {
  document: Record<string, unknown>;
  category: Record<string, unknown> | null;
  type: Record<string, unknown> | null;
  retention_policy: Record<string, unknown> | null;
  versions: Record<string, unknown>[];
  relationships: Record<string, unknown>[];
  holds: Record<string, unknown>[];
  audit: Record<string, unknown>[];
}

type Result<T> = { success: true; data: T } | { success: false; error: string };

async function rpc<T>(fn: string, params: Record<string, unknown>): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(fn as any, params as any);
  if (error) return { success: false, error: error.message };
  return { success: true, data: data as T };
}

export interface DmsSearchParams {
  entityId?: string | null;
  search?: string | null;
  categoryCode?: string | null;
  documentStatus?: string | null;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export async function searchDocuments(
  params: DmsSearchParams = {},
): Promise<Result<{ rows: DmsDocumentRow[]; total: number }>> {
  const res = await rpc<DmsDocumentRow[]>('dms_search_documents', {
    _entity_id: params.entityId ?? null,
    _search: params.search ?? null,
    _category_code: params.categoryCode ?? null,
    _document_status: params.documentStatus ?? null,
    _include_archived: params.includeArchived ?? false,
    _limit: params.limit ?? 50,
    _offset: params.offset ?? 0,
  });
  if ('error' in res) return { success: false, error: res.error };
  const rows = Array.isArray(res.data) ? res.data : [];
  return { success: true, data: { rows, total: Number(rows[0]?.total_count ?? 0) } };
}

/** Documents belonging to (or linked to) one regulated entity. */
export async function listEntityDocuments(
  entityId: string,
  params: Omit<DmsSearchParams, 'entityId'> = {},
) {
  return searchDocuments({ ...params, entityId });
}

export async function getDocument(groupId: string) {
  return rpc<DmsDocumentDetail>('dms_get_document', { _group_id: groupId });
}

export interface DmsContextInput {
  categoryCode?: string | null;
  typeCode?: string | null;
  primaryEntityId?: string | null;
  sourceModule?: string | null;
  sourceRecordType?: string | null;
  sourceRecordId?: string | null;
  sourceReference?: string | null;
}

/**
 * Attach canonical classification/ownership context to a freshly registered
 * document. Defaults are derived from the category/type unless an explicit
 * override was already recorded.
 */
export async function applyDocumentContext(groupId: string, ctx: DmsContextInput) {
  return rpc<string>('dms_apply_document_context', {
    _group_id: groupId,
    _category_code: ctx.categoryCode ?? null,
    _type_code: ctx.typeCode ?? null,
    _primary_entity_id: ctx.primaryEntityId ?? null,
    _source_module: ctx.sourceModule ?? null,
    _source_record_type: ctx.sourceRecordType ?? null,
    _source_record_id: ctx.sourceRecordId ?? null,
    _source_reference: ctx.sourceReference ?? null,
  });
}

export interface DmsMetadataInput {
  displayName?: string | null;
  documentDate?: string | null;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
  expiryDate?: string | null;
  reportingPeriodStart?: string | null;
  reportingPeriodEnd?: string | null;
  tags?: string[] | null;
  metadata?: Record<string, unknown> | null;
}

export async function updateDocumentMetadata(groupId: string, input: DmsMetadataInput) {
  return rpc<string>('dms_update_metadata', {
    _group_id: groupId,
    _display_name: input.displayName ?? null,
    _document_date: input.documentDate ?? null,
    _effective_from: input.effectiveFrom ?? null,
    _effective_until: input.effectiveUntil ?? null,
    _expiry_date: input.expiryDate ?? null,
    _reporting_period_start: input.reportingPeriodStart ?? null,
    _reporting_period_end: input.reportingPeriodEnd ?? null,
    _tags: input.tags ?? null,
    _metadata: input.metadata ?? null,
  });
}

export interface DmsClassifyInput {
  categoryCode?: string | null;
  typeCode?: string | null;
  confidentiality?: DmsConfidentiality | null;
  publicationEligibility?: DmsPublicationEligibility | null;
  retentionPolicyCode?: string | null;
}

export async function classifyDocument(groupId: string, input: DmsClassifyInput) {
  return rpc<string>('dms_classify', {
    _group_id: groupId,
    _category_code: input.categoryCode ?? null,
    _type_code: input.typeCode ?? null,
    _confidentiality: input.confidentiality ?? null,
    _publication_eligibility: input.publicationEligibility ?? null,
    _retention_policy_code: input.retentionPolicyCode ?? null,
  });
}

export async function verifyDocument(
  groupId: string,
  decision: 'verified' | 'rejected' | 'pending',
  note?: string,
) {
  return rpc<string>('dms_verify', { _group_id: groupId, _decision: decision, _note: note ?? null });
}

export async function acceptDocument(
  groupId: string,
  decision: 'accepted' | 'conditionally_accepted' | 'rejected' | 'pending',
  note?: string,
) {
  return rpc<string>('dms_accept', { _group_id: groupId, _decision: decision, _note: note ?? null });
}

export async function archiveDocument(groupId: string, reason?: string) {
  return rpc<string>('dms_archive', { _group_id: groupId, _reason: reason ?? null });
}

export async function restoreDocument(groupId: string, reason?: string) {
  return rpc<string>('dms_restore', { _group_id: groupId, _reason: reason ?? null });
}

export async function softDeleteDocument(groupId: string, reason?: string) {
  return rpc<string>('dms_soft_delete', { _group_id: groupId, _reason: reason ?? null });
}

export async function linkDocumentToRecord(args: {
  groupId: string;
  targetType: string;
  targetId: string;
  relationshipType?: string;
  targetReference?: string | null;
}) {
  return rpc<string>('dms_link_record', {
    _group_id: args.groupId,
    _target_type: args.targetType,
    _target_id: args.targetId,
    _relationship_type: args.relationshipType ?? 'attached_to',
    _target_reference: args.targetReference ?? null,
  });
}

/** Human-readable messages for governed RPC failures. */
export function describeDmsError(message: string): string {
  const map: Record<string, string> = {
    not_authenticated: 'You must be signed in to perform this action.',
    forbidden: 'You do not have access to this document.',
    document_not_found: 'This document no longer exists.',
    scan_not_clean: 'This file has not passed its security scan yet.',
    document_on_legal_hold: 'This document is under legal hold and cannot be disposed of.',
    accepted_evidence_cannot_be_deleted: 'Accepted regulatory evidence cannot be deleted.',
    cross_entity_link_forbidden: 'You do not have scope over both entities for this link.',
    forbidden_target_scope: 'You do not have access to the target record.',
    entity_reassignment_not_allowed: 'This document is already owned by another entity.',
  };
  const key = Object.keys(map).find((k) => message.includes(k));
  if (key) return map[key];
  if (message.includes('forbidden_action_')) {
    return 'You do not have permission to perform this document action.';
  }
  return message;
}
