/**
 * Mapping of admin/internal routes to permission modules used by the
 * dynamic Role Management system. Used by both the sidebar and route
 * guards so menu visibility and route access stay in sync.
 *
 * One unified permission framework now covers both internal employees and
 * external portal users (applicants, regulated entity users). Module names
 * here MUST match rows in the `permissions.module` column.
 */


/**
 * Permission module key. Historically a fixed union of 12 internal modules,
 * now widened to `string` because the catalog (permission_modules table) is
 * admin-managed and admins may create new modules at runtime. The known keys
 * remain enumerated in `KNOWN_PERMISSION_MODULES` for callers that need them.
 */
export type PermissionModule = string;

export const KNOWN_PERMISSION_MODULES = [
  'application_management',
  'license_management',
  'registration_management',
  'returns_management',
  'complaint_management',
  'user_management',
  'role_management',
  'report_management',
  'fee_management',
  'form_management',
  'workflow_management',
  'settings',
] as const;

/**
 * Route prefix → required permission module.
 * Order matters: more specific prefixes come first.
 */
const ROUTE_MODULE_MAP: Array<[string, PermissionModule]> = [
  // Form management
  ['/admin/forms', 'form_management'],
  ['/admin/registration-forms', 'form_management'],

  // Application management (admin queue)
  ['/applications/queue', 'application_management'],

  // User & role
  ['/admin/users', 'user_management'],
  ['/admin/web-users', 'user_management'],
  ['/admin/employees', 'user_management'],
  
  ['/admin/roles', 'role_management'],

  // Licenses / licensees
  ['/admin/licensees', 'license_management'],
  ['/admin/approved-licensees', 'license_management'],
  ['/admin/ppoc-mappings', 'license_management'],

  // Registration review (dedicated module so it can be granted independently)
  ['/admin/registration-review', 'registration_management'],

  // Returns
  ['/admin/returns', 'returns_management'],
  ['/admin/return-config', 'returns_management'],

  // Fees
  ['/admin/fees', 'fee_management'],

  // Workflows
  ['/workflows', 'workflow_management'],
  ['/delegation-rules', 'workflow_management'],
  

  // Complaints
  ['/admin/complaint-types', 'complaint_management'],
  ['/complaints', 'complaint_management'],

  // Reports
  ['/reports', 'report_management'],
  ['/analytics', 'report_management'],

  // Settings + audit + notifications + master data
  ['/settings', 'settings'],
  ['/admin/audit-logs', 'settings'],
  ['/admin/compliance-audit-logs', 'settings'],
  ['/admin/notification-templates', 'settings'],
  ['/admin/master-data', 'settings'],
  ['/admin/masters', 'settings'],
  ['/admin/regulators', 'settings'],

  // Admin hub itself — visible to anyone with at least one admin module
  ['/admin', 'settings'],
];

/** Resolve the required module for a given path, or null if unmapped. */
export function getModuleForPath(pathname: string): PermissionModule | null {
  for (const [prefix, mod] of ROUTE_MODULE_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return mod;
    }
  }
  return null;
}
