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
  'complaint_type',
  'user_management',
  'role_management',
  'report_management',
  'fee_management',
  'form_management',
  'workflow_management',
  'settings',
  'fit_and_proper',
  'fit_and_proper_initiation',
  'fit_and_proper_screening',
  'fit_and_proper_committee',
  'market_conduct',
  'market_conduct_investigation',
  'coordination',
  'prudential_supervision',
  'aml_supervision',
  // Enterprise (cross-domain) supervisory read authority — the stated authority
  // for /supervision/portfolio and /supervision/team-performance.
  'supervisory_spine',
  'admin_dashboard',
  'notification_management',
  'audit_management',
  'security_management',
  'ai_management',
  'license_appeals',
  'escalation_management',
  'rule_engine',
  'entity_resolution',
  'entity_membership',
  'onboarding',
  'regulatory_data_model',
  'integration_management',
  'document_management',
] as const;


/**
 * Route prefix → required permission module.
 * Order matters: more specific prefixes come first.
 */
const ROUTE_MODULE_MAP: Array<[string, PermissionModule]> = [
  // ─── Document management ───────────────────────────────────────────────
  ['/documents/registry', 'document_management'],
  // ─── Rule engine ───────────────────────────────────────────────────────
  ['/admin/rule-engine', 'rule_engine'],

  // ─── Regulatory data model / entity registry ───────────────────────────
  ['/licensing/entity-resolution', 'entity_resolution'],
  ['/admin/entity-memberships', 'entity_membership'],
  ['/admin/rdm', 'regulatory_data_model'],
  // Aligned with the canonical `sec_routes` registry, which gates /entities on
  // `licensee_management.view` (the Entity Register is a licensee-population
  // surface, not the licence register).
  ['/entities', 'licensee_management'],
  // Person 360 and the person-identity resolution queue are licensee-population
  // surfaces too: they read the canonical `parties`/`persons` spine behind the
  // licensee register. Both agree with their `ModuleRoute` guard.
  ['/persons', 'licensee_management'],
  // F8A-B4 — canonical address 360 and relationship intelligence are governed by
  // the entity-structure permission family (view/propose/approve/apply); this
  // agrees with their `ModuleRoute` guard.
  ['/intelligence', 'entity_structure'],




  // ─── Forms ─────────────────────────────────────────────────────────────
  ['/admin/forms', 'form_management'],
  ['/admin/registration-forms', 'form_management'],

  // ─── Applications ──────────────────────────────────────────────────────
  ['/applications/queue', 'application_management'],
  ['/admin/applications/bulk-intake', 'application_management'],
  ['/admin/rfi-auto-rules', 'application_management'],
  ['/admin/supervisory-plan-templates', 'application_management'],
  ['/inspections', 'inspection_management'],

  // ─── User & role ───────────────────────────────────────────────────────
  ['/admin/users', 'user_management'],
  ['/admin/web-users', 'user_management'],
  ['/admin/employees', 'user_management'],
  ['/admin/roles', 'role_management'],
  ['/admin/permission-coverage', 'role_management'],
  ['/admin/decision-authority', 'role_management'],

  // ─── Licensing appeals ─────────────────────────────────────────────────
  ['/admin/license-appeals', 'license_appeals'],
  ['/admin/appeal-panels', 'license_appeals'],
  ['/appeals', 'license_appeals'],

  // ─── Licenses / licensees ──────────────────────────────────────────────
  ['/admin/licensees', 'license_management'],
  ['/admin/approved-licensees', 'license_management'],
  ['/admin/ppoc-mappings', 'license_management'],
  ['/admin/license-action-forms', 'license_management'],
  ['/admin/sufficiency-rules', 'license_management'],
  ['/admin/sufficiency-rule-sets', 'license_management'],
  ['/admin/decision-options', 'license_management'],
  ['/enforcement', 'enforcement_management'],

  // ─── Registration review ───────────────────────────────────────────────
  ['/admin/registration-review', 'registration_management'],

  // ─── Returns (specific prefixes BEFORE the /admin/returns catch-all) ───
  ['/admin/return-config', 'returns_management'],
  ['/admin/returns', 'returns_management'],
  ['/returns-management', 'returns_management'],
  // Canonical (post-RDM) regulator returns surfaces: queue, filing detail,
  // obligations workbench and reporting calendar.
  ['/returns', 'returns_management'],

  // External regulated-entity returns surface (audience: external). Mapping is
  // additive — it only makes path→module resolution consistent for the gate,
  // sidebar and search; entitlement stays enforced by RLS/RPC predicates.
  ['/entity/returns', 'returns_management'],
  ['/supervision/aml', 'aml_supervision'],
  ['/supervision/early-warnings', 'prudential_supervision'],
  ['/supervision/breaches', 'prudential_supervision'],
  ['/supervision/plans', 'prudential_supervision'],
  ['/supervision/risk', 'prudential_supervision'],
  ['/alerts', 'returns_management'],

  // ─── Fees / payments / billing ─────────────────────────────────────────
  ['/admin/fees', 'fee_management'],
  ['/billing', 'fee_management'],
  ['/payments', 'application_management'],

  // ─── Workflows ─────────────────────────────────────────────────────────
  ['/workflows', 'workflow_management'],
  ['/delegation-rules', 'workflow_management'],

  // ─── Complaints ────────────────────────────────────────────────────────
  ['/admin/complaint-types', 'complaint_type'],
  ['/complaints', 'complaint_management'],

  // ─── Reports / analytics / executive ───────────────────────────────────
  ['/reports', 'report_management'],
  ['/analytics', 'report_management'],
  ['/executive', 'report_management'],

  // ─── Supervisory methodology calculation governance ───────────────────
  ['/admin/supervisory-methodology', 'aml_supervision'],
  ['/admin/supervisory-policy-profiles', 'aml_supervision'],
  ['/admin/supervisory-calculation/approvals', 'aml_supervision'],
  ['/admin/supervisory-calculation', 'aml_supervision'],

  // ─── Fit & Proper (specific admin sub-modules first) ───────────────────
  ['/admin/fp-screening-configs', 'fit_and_proper_screening'],
  ['/admin/fp-sector-rules', 'fit_and_proper_screening'],
  ['/admin/fp-committees', 'fit_and_proper_committee'],
  ['/fpa', 'fit_and_proper'],

  // ─── Coordination ──────────────────────────────────────────────────────
  ['/coordination', 'coordination'],

  // ─── Market Conduct & Thematic Reviews ─────────────────────────────────
  ['/supervision/thematic-reviews', 'market_conduct'],
  ['/admin/conduct', 'market_conduct'],
  ['/conduct', 'market_conduct'],

  // ─── Prudential Supervision ────────────────────────────────────────────
  ['/admin/prudential-taxonomy', 'prudential_supervision'],
  ['/prudential', 'prudential_supervision'],

  // ─── Licensee sector switcher ──────────────────────────────────────────
  ['/change-sector', 'license_management'],

  // ─── Settings / audit / master data / correspondence / admin utilities ─
  ['/settings', 'settings'],
  ['/admin/audit-logs', 'settings'],
  ['/admin/compliance-audit-logs', 'settings'],
  ['/admin/integration-logs', 'settings'],
  ['/admin/escalations', 'escalation_management'],
  ['/admin/notification-templates', 'notification_management'],
  ['/admin/notification-events', 'notification_management'],
  ['/admin/notification-history', 'notification_management'],
  ['/admin/notification-channel-health', 'notification_management'],
  ['/admin/master-data', 'settings'],
  ['/admin/masters', 'settings'],
  ['/admin/regulators', 'settings'],
  ['/admin/overrides', 'settings'],
  ['/admin/case-audit', 'settings'],
  ['/admin/api-keys', 'settings'],
  ['/admin/audit-export', 'settings'],
  ['/admin/security-events', 'settings'],
  ['/admin/sla-manager', 'settings'],

  ['/admin/document-intelligence', 'settings'],
  ['/admin/correspondence-templates', 'settings'],
  ['/admin/correspondence-routing', 'settings'],
  ['/correspondence', 'notification_management'],

  // ─── Configuration hubs & engine consoles (guard truth, GAP-F0-03) ──────
  // Specific-before-general: the lifecycle hub is a licence surface, every
  // other /admin/config/* hub is a settings surface.
  ['/admin/config/lifecycle', 'license_management'],
  ['/admin/config', 'settings'],
  ['/admin/workflow-engine', 'settings'],
  ['/admin/notification-engine', 'settings'],
  ['/admin/security-audit', 'settings'],
  ['/admin/service-completeness', 'settings'],
  ['/admin/regulatory-data-model', 'settings'],
  ['/admin/forms-packages', 'form_management'],
  ['/admin/support', 'support_management'],
  ['/admin/prudential/operations', 'prudential_supervision'],

  // ─── Licensing / licence lifecycle surfaces ────────────────────────────
  ['/licensing/regulatory-requests', 'license_management'],
  ['/licensing/onboarding-oversight', 'onboarding'],
  ['/licenses/lifecycle', 'license_management'],
  ['/preview', 'form_management'],

  // ─── Supervision & AI governance ───────────────────────────────────────
  ['/supervision/portfolio', 'supervisory_spine'],
  ['/supervision/team-performance', 'supervisory_spine'],
  ['/supervision/detection', 'supervisory_spine'],
  ['/supervision/management-assurance', 'supervisory_spine'],
  ['/supervision/examination-schedule', 'prudential_supervision'],
  ['/supervision/thematic-closure-approvals', 'market_conduct'],
  ['/governance/ai', 'ai_management'],
  // NOTE: no generic ['/admin', 'settings'] catch-all. Unknown /admin/* paths
  // are treated as protected-but-unmapped and denied by canAccessPath.
];

/** Resolve the required module for a given path, or null if unmapped. */
export function getModuleForPath(pathname: string): PermissionModule | null {
  // Exact match only — an `/admin` prefix entry would silently map every
  // unknown /admin/* path to the admin dashboard and defeat deny-by-default.
  if (pathname === '/admin') return 'admin_dashboard';
  for (const [prefix, mod] of ROUTE_MODULE_MAP) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) {
      return mod;
    }
  }
  return null;
}


/**
 * Path prefixes that constitute the internal / admin surface. An unmapped
 * path under one of these prefixes is denied by default rather than allowed.
 */
export const PROTECTED_INTERNAL_PATH_PREFIXES = [
  '/admin',
  '/settings',
  '/workflows',
  '/delegation-rules',
  '/reports',
  '/analytics',
  '/executive',
  '/alerts',
  '/inspections',
  '/enforcement',
  '/billing',
  '/fpa',
  '/conduct',
  '/coordination',
  '/prudential',
  '/supervision',
  '/entities',
  '/licensing/entity-resolution',

  '/correspondence',
  '/returns-management',
] as const;

export function isProtectedInternalPath(pathname: string): boolean {
  return PROTECTED_INTERNAL_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}
