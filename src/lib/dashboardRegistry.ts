/**
 * Dashboard Widget Registry
 * ─────────────────────────
 * Single source of truth for which widgets appear on the dashboard.
 *
 * Each widget declares:
 *   - the permission MODULE it requires (matches `permissions.module` and
 *     `permissionModules.ts`),
 *   - an optional permission ACTION (e.g. 'view', 'manage') for fine-grained
 *     gating on top of module access,
 *   - the AUDIENCE/context it applies to (internal staff, licensee/entity user,
 *     pre-licensee, public applicant — or 'any').
 *
 * A widget is shown only when BOTH the permission gate AND the context gate
 * pass. Composition happens in `useDashboardWidgets`.
 *
 * Adding a new dynamic role with a new set of permissions automatically
 * changes which widgets render — no code changes required.
 */

import type { PermissionModule } from './permissionModules';
import type { PlatformUser } from '@/types/platform';
import type { EffectivePortalContext } from '@/lib/effectiveRole';

export type DashboardAudience =
  | 'internal'        // staff: super_admin, admin, supervisor, officer, analyst, …
  | 'licensee'        // licensee_primary / licensee_secondary / ppoc-mapped users
  | 'pre_licensee'    // pre-license applicants
  | 'applicant'       // public applicant with a profile but no licensee linkage
  | 'any';            // visible regardless of context

export interface DashboardUserContext {
  isInternal: boolean;
  isLicensee: boolean;
  isPreLicensee: boolean;
  isApplicant: boolean;
  activeLicenseeId?: string | null;
  licenseeId?: string;
  userId: string;
}

export interface DashboardWidgetDef {
  id: string;
  title: string;
  description: string;
  /** Permission module required to see this widget. Omit for context-only widgets. */
  module?: PermissionModule;
  /** Optional permission action ('view', 'manage', …). Falls back to module-level access. */
  action?: string;
  /** Which user contexts this widget applies to. Empty / undefined → ['any']. */
  audiences?: DashboardAudience[];
  /** Sidebar/CTA route. Used by the widget renderer. */
  route?: string;
  /** Render priority (lower = earlier). Defaults to 100. */
  order?: number;
}

/**
 * The registry.
 *
 * NOTE: We keep this declarative & data-only. The actual UI components are
 * resolved in `src/components/dashboard/widgets/index.tsx` so this file stays
 * cheap to import from non-React code (tests, route guards, etc.).
 */
export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  // ─── Internal / admin operational widgets ─────────────────────────────────
  {
    id: 'pending_applications',
    title: 'Pending Applications',
    description: 'Applications awaiting review',
    module: 'application_management',
    audiences: ['internal'],
    route: '/applications/queue',
    order: 10,
  },
  {
    id: 'active_licenses',
    title: 'Active Licenses',
    description: 'Currently valid licenses across the platform',
    module: 'license_management',
    audiences: ['internal'],
    route: '/admin/approved-licensees',
    order: 20,
  },
  {
    id: 'returns_due',
    title: 'Returns Due',
    description: 'Compliance returns approaching or past due',
    module: 'returns_management',
    audiences: ['internal'],
    route: '/admin/returns',
    order: 30,
  },
  {
    id: 'complaints',
    title: 'Open Complaints',
    description: 'Complaints under investigation',
    module: 'complaint_management',
    audiences: ['internal'],
    route: '/complaints',
    order: 40,
  },
  {
    id: 'users',
    title: 'User Management',
    description: 'Internal employees and web users',
    module: 'user_management',
    audiences: ['internal'],
    route: '/admin/users',
    order: 50,
  },
  {
    id: 'roles',
    title: 'Roles & Permissions',
    description: 'Dynamic roles and access control',
    module: 'role_management',
    audiences: ['internal'],
    route: '/admin/roles',
    order: 55,
  },
  {
    id: 'reports',
    title: 'Reports & Analytics',
    description: 'Operational and regulatory reporting',
    module: 'report_management',
    audiences: ['internal'],
    route: '/reports',
    order: 60,
  },
  {
    id: 'fees',
    title: 'Fee Management',
    description: 'Fee configuration & collections',
    module: 'fee_management',
    audiences: ['internal'],
    route: '/admin/fees',
    order: 65,
  },
  {
    id: 'forms',
    title: 'Form Templates',
    description: 'Dynamic form builder & published versions',
    module: 'form_management',
    audiences: ['internal'],
    route: '/admin/forms/pre-license',
    order: 70,
  },
  {
    id: 'workflows',
    title: 'Approval Workflows',
    description: 'Configured workflows and step health',
    module: 'workflow_management',
    audiences: ['internal'],
    route: '/workflows',
    order: 75,
  },
  {
    id: 'settings_audit',
    title: 'System & Audit',
    description: 'Platform settings and audit trail',
    module: 'settings',
    audiences: ['internal'],
    route: '/admin/audit-logs',
    order: 80,
  },

  // ─── Licensee / entity-scoped widgets ─────────────────────────────────────
  {
    id: 'my_licenses',
    title: 'My Licenses',
    description: 'Licenses held by your entity',
    audiences: ['licensee'],
    route: '/licenses',
    order: 110,
  },
  {
    id: 'my_returns',
    title: 'My Returns',
    description: 'Upcoming and overdue compliance returns',
    audiences: ['licensee'],
    route: '/compliance/returns',
    order: 115,
  },
  {
    id: 'my_payments',
    title: 'My Payments',
    description: 'Payments and outstanding dues',
    audiences: ['licensee'],
    route: '/billing/post-licensee',
    order: 120,
  },
  {
    id: 'my_notifications',
    title: 'Notifications',
    description: 'Recent regulator communications',
    audiences: ['licensee', 'pre_licensee', 'applicant'],
    route: '/notifications',
    order: 125,
  },

  // ─── Pre-licensee / applicant widgets ─────────────────────────────────────
  {
    id: 'new_application',
    title: 'New Application',
    description: 'Start a new license application',
    audiences: ['pre_licensee', 'applicant'],
    route: '/applications/new',
    order: 95,
  },
  {
    id: 'draft_applications',
    title: 'Draft Applications',
    description: 'Continue an incomplete license application',
    audiences: ['pre_licensee', 'applicant', 'licensee'],
    route: '/applications?status=draft',
    order: 100,
  },
  {
    id: 'my_applications',
    title: 'Recent Applications',
    description: 'Track submitted and in-progress applications',
    audiences: ['pre_licensee', 'applicant', 'licensee'],
    route: '/applications',
    order: 105,
  },
];

/* ────────────────────────────────────────────────────────────────────────── */

export function deriveUserContext(
  user: PlatformUser | null,
  portalContext?: Pick<EffectivePortalContext, 'isInternal' | 'isLicensee' | 'isPreLicensee' | 'isApplicant' | 'activeLicenseeId'> | null,
): DashboardUserContext | null {
  if (!user) return null;

  return {
    isInternal: portalContext?.isInternal ?? false,
    isLicensee: portalContext?.isLicensee ?? false,
    isPreLicensee: portalContext?.isPreLicensee ?? false,
    isApplicant: portalContext?.isApplicant ?? false,
    activeLicenseeId: portalContext?.activeLicenseeId ?? null,
    licenseeId: user.licenseeId,
    userId: user.id,
  };
}

export interface DashboardGateInputs {
  context: DashboardUserContext;
  hasModuleAccess: (module: string) => boolean;
  hasPermission: (module: string, action: string) => boolean;
}

/**
 * Pure composition function — given a user context + permission checkers,
 * return the ordered list of widgets that should render.
 *
 * No React, no DOM — easy to unit test.
 */
export function getDashboardWidgetsForUser(
  inputs: DashboardGateInputs,
  registry: DashboardWidgetDef[] = DASHBOARD_WIDGETS,
): DashboardWidgetDef[] {
  const { context, hasModuleAccess, hasPermission } = inputs;

  const audienceMatches = (w: DashboardWidgetDef): boolean => {
    const audiences = w.audiences && w.audiences.length ? w.audiences : ['any' as const];
    if (audiences.includes('any')) return true;
    if (audiences.includes('internal') && context.isInternal) return true;
    if (audiences.includes('licensee') && context.isLicensee) return true;
    if (audiences.includes('pre_licensee') && context.isPreLicensee) return true;
    if (audiences.includes('applicant') && context.isApplicant) return true;
    return false;
  };

  const permissionMatches = (w: DashboardWidgetDef): boolean => {
    if (!w.module) return true; // context-only widget
    if (w.action) return hasPermission(w.module, w.action);
    return hasModuleAccess(w.module);
  };

  return registry
    .filter(w => audienceMatches(w) && permissionMatches(w))
    .sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
}
