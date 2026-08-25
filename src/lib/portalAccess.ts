/**
 * Shared types for portal capability checks. The underlying engine is now the
 * unified RBAC (`roles` + `permissions` + `user_dynamic_roles`). These types
 * remain for backwards-compat with route guards and form-renderer props.
 */
import { supabase } from '@/integrations/supabase/client';

export type PortalArea = 'licensing' | 'returns' | 'complaints' | 'fp_declarations';

export type PortalCapability =
  | 'can_submit'
  | 'can_upload_documents'
  | 'can_view_status'
  | 'can_respond_rfi'
  | 'can_submit_returns'
  | 'can_submit_complaints'
  | 'can_submit_fp_declarations';

/** Legacy row shape — retained for type compatibility only. */
export interface ExternalPortalAccessRow {
  id: string;
  user_id: string;
  entity_id: string | null;
  portal_area: PortalArea;
  can_submit: boolean;
  can_upload_documents: boolean;
  can_view_status: boolean;
  can_respond_rfi: boolean;
  can_submit_returns: boolean;
  can_submit_complaints: boolean;
  can_submit_fp_declarations: boolean;
  status: 'active' | 'inactive';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const PORTAL_AREAS: PortalArea[] = ['licensing', 'returns', 'complaints', 'fp_declarations'];

export const PORTAL_AREA_LABEL: Record<PortalArea, string> = {
  licensing: 'Licensing Portal',
  returns: 'Returns Portal',
  complaints: 'Complaints Portal',
  fp_declarations: 'F&P Declarations Portal',
};

export const CAPABILITY_LABEL: Record<PortalCapability, string> = {
  can_submit: 'Submit applications',
  can_upload_documents: 'Upload documents',
  can_view_status: 'View case status',
  can_respond_rfi: 'Respond to RFIs',
  can_submit_returns: 'Submit prudential returns',
  can_submit_complaints: 'Submit complaints',
  can_submit_fp_declarations: 'Submit F&P declarations',
};

/**
 * Server-authoritative capability check. Wraps the unified `has_portal_capability`
 * Postgres function, which now consults roles + permissions + user_dynamic_roles.
 */
export async function canAccessPortal(
  userId: string,
  entityId: string | null,
  area: PortalArea,
  capability: PortalCapability,
): Promise<boolean> {
  const { data, error } = await (supabase as any).rpc('has_portal_capability', {
    _user_id: userId,
    _entity_id: entityId,
    _area: area,
    _capability: capability,
  });
  if (error) {
    console.warn('canAccessPortal RPC failed', error);
    return false;
  }
  return Boolean(data);
}

export function hasCapability(row: ExternalPortalAccessRow | null | undefined, cap: PortalCapability): boolean {
  if (!row || row.status !== 'active') return false;
  return Boolean(row[cap]);
}

/**
 * Role-based default portal capabilities for EXTERNAL users only.
 *
 * External portal capabilities (submit your own application/complaint/return,
 * view your own status, upload supporting docs) are intrinsic to the role —
 * they are NOT admin-configurable dynamic permissions. Row-level access is
 * still enforced by RLS. Internal roles are intentionally absent here; their
 * access is governed exclusively by the dynamic RBAC engine.
 */
const APPLICANT_DEFAULTS: Partial<Record<PortalArea, PortalCapability[]>> = {
  licensing: ['can_submit', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  complaints: ['can_submit_complaints', 'can_view_status', 'can_upload_documents'],
  fp_declarations: ['can_submit_fp_declarations', 'can_view_status', 'can_upload_documents'],
  // Read-only visibility of the Returns workspace. Submission authority is
  // NOT granted here — licence entitlement + server-side checks decide that.
  returns: ['can_view_status'],
};

const LICENSEE_DEFAULTS: Partial<Record<PortalArea, PortalCapability[]>> = {
  licensing: ['can_submit', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  returns: ['can_submit_returns', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  complaints: ['can_submit_complaints', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  fp_declarations: ['can_submit_fp_declarations', 'can_view_status', 'can_upload_documents'],
};

const EXTERNAL_ROLE_DEFAULTS: Record<string, Partial<Record<PortalArea, PortalCapability[]>>> = {
  // Legacy role keys
  applicant: APPLICANT_DEFAULTS,
  pre_licensee: APPLICANT_DEFAULTS,
  licensee_primary: LICENSEE_DEFAULTS,
  licensee_secondary: LICENSEE_DEFAULTS,
  // Canonical role keys currently issued by the security catalogue. Without
  // these, valid portal users (notably PPOC) fell through to Access Denied.
  pre_licensee_user: APPLICANT_DEFAULTS,
  applicant_user: APPLICANT_DEFAULTS,
  licensee_primary_user: LICENSEE_DEFAULTS,
  licensee_secondary_user: LICENSEE_DEFAULTS,
  regulated_entity_user: LICENSEE_DEFAULTS,
  entity_ppoc: LICENSEE_DEFAULTS,
};


export function hasDefaultPortalCapability(
  role: string | null | undefined,
  area: PortalArea,
  capability: PortalCapability,
): boolean {
  if (!role) return false;
  const caps = EXTERNAL_ROLE_DEFAULTS[role]?.[area];
  return !!caps && caps.includes(capability);
}

