/**
 * Permission tab grouping for the Role Management UI.
 *
 * Pure UI/UX layer: filters which modules + actions are shown when editing
 * or viewing a role, depending on whether the role is `internal` or
 * `external`. Does NOT change any RBAC logic, RLS, or route guards.
 *
 * A permission shows under a tab when:
 *  - its module key is listed in `modules`, AND
 *  - (optionally) its action key matches `actions` (if provided).
 */

export type RoleType = 'internal' | 'external';

export interface PermissionTab {
  key: string;
  label: string;
  /** Module keys this tab includes. */
  modules: string[];
  /**
   * Optional per-module action filter. When omitted for a module, every
   * action of that module appears under this tab.
   * Map: moduleKey -> action keys to include.
   */
  actions?: Record<string, string[]>;
}

export const INTERNAL_TABS: PermissionTab[] = [
  { key: 'applications', label: 'Applications', modules: ['application_management'] },
  {
    key: 'licensing',
    label: 'Licensing',
    modules: ['licensing', 'license_management', 'registration_management', 'fee_management'],
    // hide submitter-facing actions on `licensing` for internal users
    actions: {
      licensing: [
        'view', 'approve', 'reject', 'conditional_approve', 'add_legal_notes',
        'flag_concern', 'issue_digital_license', 'override_ai_recommendation',
        'recommend_conditions', 'sign_enforcement_order',
      ],
    },
  },
  { key: 'workflow', label: 'Workflow', modules: ['workflow_management', 'form_management'] },
  {
    key: 'findings',
    label: 'Findings',
    modules: ['market_conduct', 'market_conduct_investigation', 'prudential_supervision', 'prudential_payment_systems'],
  },
  {
    key: 'returns_review',
    label: 'Returns Review',
    modules: ['returns_management'],
    actions: { returns_management: ['view', 'create', 'edit', 'approve'] },
  },
  {
    key: 'complaints_review',
    label: 'Complaints Review',
    modules: ['complaint_management', 'public_complaint_portal'],
    actions: { complaint_management: ['view', 'create', 'edit'] },
  },
  {
    key: 'fp_review',
    label: 'F&P Review',
    modules: ['fit_and_proper', 'fit_and_proper_committee', 'fit_and_proper_initiation', 'fit_and_proper_screening'],
    actions: { fit_and_proper: ['view'] },
  },
  { key: 'reports', label: 'Reports & Analytics', modules: ['report_management', 'executive_oversight'] },
  { key: 'admin', label: 'Administration', modules: ['user_management', 'role_management', 'settings'] },
];

export const EXTERNAL_TABS: PermissionTab[] = [
  {
    key: 'applications',
    label: 'Applications',
    modules: ['licensing'],
    actions: { licensing: ['submit', 'view_status'] },
  },
  {
    key: 'documents',
    label: 'Documents',
    modules: ['licensing'],
    actions: { licensing: ['upload_documents'] },
  },
  {
    key: 'rfis',
    label: 'RFIs',
    modules: ['licensing'],
    actions: { licensing: ['respond_rfi'] },
  },
  {
    key: 'returns_submission',
    label: 'Returns Submission',
    modules: ['returns_management'],
    actions: { returns_management: ['submit', 'view_status', 'upload_documents', 'respond_rfi'] },
  },
  {
    key: 'complaints_submission',
    label: 'Complaints Submission',
    modules: ['complaint_management'],
    actions: { complaint_management: ['submit', 'view', 'view_status', 'upload_documents'] },
  },
  {
    key: 'fp_declarations',
    label: 'F&P Declarations',
    modules: ['fit_and_proper'],
    actions: { fit_and_proper: ['submit', 'view', 'view_status', 'upload_documents'] },
  },
  {
    key: 'license_status',
    label: 'License Status',
    modules: ['licensing'],
    actions: { licensing: ['view_status'] },
  },
];

export function getTabsForRoleType(roleType: RoleType): PermissionTab[] {
  return roleType === 'external' ? EXTERNAL_TABS : INTERNAL_TABS;
}

/**
 * Does a (module, action) pair belong to the given tab?
 */
export function matchesTab(tab: PermissionTab, moduleKey: string, actionKey: string): boolean {
  if (!tab.modules.includes(moduleKey)) return false;
  if (tab.actions && tab.actions[moduleKey]) {
    return tab.actions[moduleKey].includes(actionKey);
  }
  return true;
}

/**
 * True if the (module, action) pair should be visible to the given role type
 * at all (i.e. it appears in at least one tab for that role type).
 */
export function isPermissionVisibleForRoleType(
  roleType: RoleType,
  moduleKey: string,
  actionKey: string,
): boolean {
  return getTabsForRoleType(roleType).some(t => matchesTab(t, moduleKey, actionKey));
}

export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  internal: 'Internal Regulatory User',
  external: 'External Portal User',
};
