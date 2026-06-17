/**
 * Thin facade over the unified RBAC engine for external portal callers.
 *
 * External portal access is no longer a separate engine — applicant and
 * regulated-entity-user roles get the same `roles` + `permissions` rows the
 * admin manages internally. This hook just translates the legacy
 * (portal_area, capability) names into module/action lookups against the
 * unified permission catalog so existing UI keeps working.
 */
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import type { PortalArea, PortalCapability, ExternalPortalAccessRow } from '@/lib/portalAccess';

const AREA_MODULE: Record<PortalArea, string> = {
  licensing: 'licensing',
  returns: 'returns_management',
  complaints: 'complaint_management',
  fp_declarations: 'fit_and_proper',
};

const CAPABILITY_ACTION: Record<PortalCapability, string> = {
  can_submit: 'submit',
  can_submit_returns: 'submit',
  can_submit_complaints: 'submit',
  can_submit_fp_declarations: 'submit',
  can_upload_documents: 'upload_documents',
  can_view_status: 'view_status',
  can_respond_rfi: 'respond_rfi',
};

const AREA_CAPABILITIES: Record<PortalArea, PortalCapability[]> = {
  licensing: ['can_submit', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  returns: ['can_submit_returns', 'can_view_status', 'can_upload_documents', 'can_respond_rfi'],
  complaints: ['can_submit_complaints', 'can_view_status', 'can_upload_documents'],
  fp_declarations: ['can_submit_fp_declarations', 'can_view_status', 'can_upload_documents'],
};

export function useExternalPortalAccess() {
  const perms = useUserDynamicPermissions();

  const can = (area: PortalArea, capability: PortalCapability, _entityId?: string | null) => {
    return perms.hasPermission(AREA_MODULE[area], CAPABILITY_ACTION[capability]);
  };

  const hasAreaAccess = (area: PortalArea, _entityId?: string | null) => {
    return AREA_CAPABILITIES[area].some(c => can(area, c));
  };

  // Legacy shape — kept so older callers compile, but no longer used as a row.
  const findRow = (_area: PortalArea, _entityId?: string | null): ExternalPortalAccessRow | null => null;
  const rows: ExternalPortalAccessRow[] = [];

  return {
    isLoading: perms.isLoading,
    isError: false,
    data: rows,
    rows,
    can,
    hasAreaAccess,
    findRow,
  };
}
