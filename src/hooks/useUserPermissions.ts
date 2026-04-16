import { useAuth } from '@/contexts/AuthContext';
import { AppRole, INTERNAL_ROLES, LICENSEE_ROLES } from '@/types/platform';

/**
 * Check if current user can perform final submission (applications, returns).
 * Only internal staff and licensee_primary can submit.
 */
export function useCanSubmit(): boolean {
  const { user } = useAuth();
  if (!user) return false;
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
  return user?.role === 'pre_licensee';
}

/**
 * Check if current user is a licensee (primary or secondary).
 */
export function useIsLicensee(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return LICENSEE_ROLES.includes(user.role);
}

/**
 * Check if current user is internal staff.
 */
export function useIsInternal(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return INTERNAL_ROLES.includes(user.role);
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
  if (!user) return false;
  return ['super_admin', 'admin', 'licensee_primary'].includes(user.role);
}

/**
 * Pre-licensee allowed routes.
 */
export const PRE_LICENSEE_ALLOWED_ROUTES = [
  '/dashboard',
  '/applications',
  '/payments',
  '/profile',
  '/change-password',
  '/notifications',
];

/**
 * Check if a given path is allowed for pre-licensee users.
 */
export function isPreLicenseeAllowedRoute(pathname: string): boolean {
  return PRE_LICENSEE_ALLOWED_ROUTES.some(
    route => pathname === route || pathname.startsWith(route + '/')
  );
}
