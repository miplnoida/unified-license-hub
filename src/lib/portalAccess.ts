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
