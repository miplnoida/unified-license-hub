import { useAuth } from '@/contexts/AuthContext';
import { AppRole, INTERNAL_ROLES } from '@/types/platform';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';

/**
 * Check if current user can perform final submission (applications, returns).
 * Only internal staff and licensee_primary can submit.
 */
export function useCanSubmit(): boolean {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  if (!user) return false;
  if (portalContext.loading) return false;
  if (portalContext.isLicensee) return true;
  return [...INTERNAL_ROLES, 'licensee_primary'].includes(user.role);
}

/**
 * Check if current user can perform final submission (legacy name).
 */
export function useCanFinalSubmit(): boolean {
  return useCanSubmit();
}

/**
 * Check if current user is a pre-licensee with restricted access.
 */
export function useIsPreLicensee(): boolean {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  return !!user && !portalContext.loading && portalContext.isPreLicensee;
}

/**
 * Check if current user is a licensee (primary or secondary).
 */
export function useIsLicensee(): boolean {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  if (!user || portalContext.loading) return false;
  return portalContext.isLicensee;
}

/**
 * Check if current user is internal staff.
 */
export function useIsInternal(): boolean {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  if (!user || portalContext.loading) return false;
  return portalContext.isInternal;
}

/**
 * Get the current user's role.
 */
export function useUserRole(): AppRole | null {
  const { user } = useAuth();
  return user?.role || null;
}

/**
 * Check if user can make payments.
 * Only licensee_primary and admin roles can pay.
 */
export function useCanPay(): boolean {
  const { user } = useAuth();
  const portalContext = useEffectivePortalContext();
  if (!user) return false;
  if (portalContext.loading) return false;
  if (portalContext.isLicensee) return true;
  return ['super_admin', 'admin', 'licensee_primary'].includes(user.role);
}

/**
 * Pre-licensee allowed routes.
 */
export const PRE_LICENSEE_ALLOWED_ROUTES = [
  '/dashboard',
  '/applications',
  // Pre-licensees who already hold a license (e.g. registered as applicant
  // and later issued one) must be able to view it and start a renewal.
  '/licenses',
  // Applicants/licensees track appeals they lodged against refused applications.
  '/appeals',
  '/post-licensee/applications',
  '/post-license',
  // Pre-licensees start new applications at /pre-license/new; allow the prefix
  // so RegistrationApprovalGate doesn't bounce the click back to /dashboard.
  '/pre-license',
  '/payments',
  // External regulated-entity returns surface (Reporting Dashboard, My Returns,
  // filing workspace). Whitelisting the prefix only stops the pre-licensee
  // approval gate from bouncing to /dashboard; PortalRoute still checks the
  // returns capability and licence entitlement remains enforced server-side.
  '/entity/returns',
  '/profile',
  '/change-password',
  '/notifications',
  '/registration-status',
  // Portal capabilities that pre-licensees carry by default (submit / view
  // their own complaint or F&P declaration). Route-level PortalRoute still
  // enforces the capability check; this list only prevents the pre-licensee
  // approval gate from bouncing them to /dashboard first.
  '/complaints',
  '/fp-declarations',
];

/**
 * Check if a given path is allowed for pre-licensee users.
 */
export function isPreLicenseeAllowedRoute(pathname: string): boolean {
  return PRE_LICENSEE_ALLOWED_ROUTES.some(
    route => pathname === route || pathname.startsWith(route + '/')
  );
}
