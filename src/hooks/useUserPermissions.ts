import { useAuth } from '@/contexts/AuthContext';
import { AppRole } from '@/types/platform';

/**
 * Hook to check if the current user can perform final submission.
 * Only super_admin, admin, and primary users can final submit.
 */
export function useCanFinalSubmit(): boolean {
  const { user } = useAuth();
  if (!user) return false;
  return ['super_admin', 'admin', 'supervisor', 'licensing_officer'].includes(user.role);
}

/**
 * Hook to get the current user's role.
 */
export function useUserRole(): AppRole | null {
  const { user } = useAuth();
  return user?.role || null;
}
