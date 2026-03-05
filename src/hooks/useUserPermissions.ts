import { useAuth, WebUserType } from '@/contexts/AuthContext';

/**
 * Hook to check if the current user can perform final submission.
 * Only Primary users can final submit; Secondary users can only save/draft.
 */
export function useCanFinalSubmit(): boolean {
  const { webUserType } = useAuth();
  return webUserType === 'primary' || webUserType === null; // null = mock user (admin), allow
}

/**
 * Hook to get the current web user type.
 */
export function useWebUserType(): WebUserType | null {
  const { webUserType } = useAuth();
  return webUserType;
}
