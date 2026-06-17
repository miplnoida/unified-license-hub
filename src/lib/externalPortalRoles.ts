/**
 * External Portal Role Templates — types and constants.
 *
 * Completely separate from internal Role Management. Defines reusable
 * role templates with capabilities per portal area. Users get capabilities
 * by being assigned templates (optionally scoped to an entity/licensee).
 */
import type { PortalArea, PortalCapability } from './portalAccess';
import { PORTAL_AREAS, PORTAL_AREA_LABEL, CAPABILITY_LABEL } from './portalAccess';

export type ExternalAudienceRole =
  | 'applicant'
  | 'pre_licensee'
  | 'licensee_primary'
  | 'licensee_secondary';

export const EXTERNAL_AUDIENCE_ROLES: ExternalAudienceRole[] = [
  'applicant',
  'pre_licensee',
  'licensee_primary',
  'licensee_secondary',
];

export const EXTERNAL_AUDIENCE_ROLE_LABEL: Record<ExternalAudienceRole, string> = {
  applicant: 'Applicant',
  pre_licensee: 'Pre-Licensee',
  licensee_primary: 'Licensee Primary',
  licensee_secondary: 'Licensee Secondary',
};

/** Capability switches valid for each portal area. */
export const AREA_CAPABILITIES: Record<PortalArea, PortalCapability[]> = {
  licensing: ['can_submit', 'can_upload_documents', 'can_view_status', 'can_respond_rfi'],
  returns: ['can_submit_returns', 'can_upload_documents', 'can_view_status', 'can_respond_rfi'],
  complaints: ['can_submit_complaints', 'can_upload_documents', 'can_view_status'],
  fp_declarations: ['can_submit_fp_declarations', 'can_upload_documents', 'can_view_status'],
};

export const ALL_CAPABILITIES: PortalCapability[] = [
  'can_submit', 'can_upload_documents', 'can_view_status', 'can_respond_rfi',
  'can_submit_returns', 'can_submit_complaints', 'can_submit_fp_declarations',
];

export interface ExternalPortalRole {
  id: string;
  role_key: string;
  name: string;
  description: string | null;
  applies_to_roles: string[];
  is_system: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExternalPortalRoleCapability {
  id: string;
  external_role_id: string;
  portal_area: PortalArea;
  can_submit: boolean;
  can_upload_documents: boolean;
  can_view_status: boolean;
  can_respond_rfi: boolean;
  can_submit_returns: boolean;
  can_submit_complaints: boolean;
  can_submit_fp_declarations: boolean;
}

export interface ExternalUserPortalRoleAssignment {
  id: string;
  user_id: string;
  entity_id: string | null;
  external_role_id: string;
  status: 'active' | 'inactive';
  assigned_by: string | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export const RESTRICTIONS_NOTICE = [
  'Cannot view other entities\u2019 data.',
  'Cannot access internal workflow.',
  'Cannot access findings.',
  'Cannot access reviewer notes, officer queues, audit logs, reports, or admin panel.',
];

export { PORTAL_AREAS, PORTAL_AREA_LABEL, CAPABILITY_LABEL };
export type { PortalArea, PortalCapability };
