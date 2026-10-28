/**
 * Entity portal-user access requests. All rules (who may submit, maker-checker,
 * membership changes) are enforced by the `entity_access_request_*` database
 * commands; this module only calls them and formats results.
 */
import { supabase } from '@/integrations/supabase/client';

export const ACCESS_BUCKET = 'entity-access-requests';

export type AccessRequestType = 'ADD_USER' | 'CHANGE_ROLE' | 'REMOVE_USER' | 'PRIMARY_USER_CHANGE';

export const REQUEST_TYPE_LABEL: Record<AccessRequestType, string> = {
  ADD_USER: 'Add user',
  CHANGE_ROLE: 'Change role',
  REMOVE_USER: 'Remove user',
  PRIMARY_USER_CHANGE: 'Change Primary User',
};

export const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Submitted',
  UNDER_REVIEW: 'Under review',
  APPROVED: 'Approved',
  APPROVED_PENDING_PROVISIONING: 'Approved – account to be created',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
};

export interface AccessRequest {
  id: string; reference: string; entity_id: string; request_type: AccessRequestType; status: string;
  target_membership_id: string | null; subject_full_name: string | null; subject_email: string | null;
  subject_position: string | null; requested_role_id: string | null; effective_date: string | null;
  reason: string; letter_path: string; supporting_paths: string[]; submitted_by: string; submitted_at: string;
  reviewed_by: string | null; reviewed_at: string | null; review_recommendation: string | null; review_notes: string | null;
  decided_by: string | null; decided_at: string | null; decision_notes: string | null;
}

const sb = supabase as any;

export async function uploadAccessFile(entityId: string, file: File): Promise<string> {
  if (file.size > 20 * 1024 * 1024) throw new Error('File must be 20 MB or smaller');
  const safe = file.name.replace(/[^\w.-]+/g, '_');
  const path = `${entityId}/${crypto.randomUUID()}-${safe}`;
  const { error } = await supabase.storage.from(ACCESS_BUCKET).upload(path, file, { upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export async function openAccessFile(path: string) {
  const { data, error } = await supabase.storage.from(ACCESS_BUCKET).createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, '_blank', 'noopener');
}

export async function listAccessRequests(entityId?: string): Promise<AccessRequest[]> {
  let q = sb.from('entity_user_access_requests').select('*').order('submitted_at', { ascending: false }).limit(500);
  if (entityId) q = q.eq('entity_id', entityId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function submitAccessRequest(args: {
  entityId: string; type: AccessRequestType; reason: string; letterPath: string;
  targetMembershipId?: string | null; fullName?: string; email?: string; phone?: string; position?: string;
  roleId?: string | null; effectiveDate?: string | null; supportingPaths?: string[];
}) {
  const { data, error } = await sb.rpc('entity_access_request_submit', {
    _entity_id: args.entityId, _request_type: args.type, _reason: args.reason, _letter_path: args.letterPath,
    _target_membership_id: args.targetMembershipId ?? null, _full_name: args.fullName ?? null, _email: args.email ?? null,
    _phone: args.phone ?? null, _position: args.position ?? null, _requested_role_id: args.roleId ?? null,
    _effective_date: args.effectiveDate || null, _supporting_paths: args.supportingPaths ?? [],
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function withdrawAccessRequest(id: string) {
  const { error } = await sb.rpc('entity_access_request_withdraw', { _id: id });
  if (error) throw new Error(error.message);
}

export async function reviewAccessRequest(id: string, recommendation: 'APPROVE' | 'REJECT', notes: string) {
  const { error } = await sb.rpc('entity_access_request_review', { _id: id, _recommendation: recommendation, _notes: notes });
  if (error) throw new Error(error.message);
}

export async function decideAccessRequest(id: string, approve: boolean, notes: string) {
  const { data, error } = await sb.rpc('entity_access_request_decide', { _id: id, _approve: approve, _notes: notes });
  if (error) throw new Error(error.message);
  return data as string;
}
