import { useUserDynamicPermissions } from '@/hooks/usePermissions';

/**
 * Terse hook returning whether the current user holds `<module>.<action>`.
 *
 * Assignment-only regulators (see `usePermissions.isAssignmentOnly`) get
 * `false` for every action — they are strictly view-only on their mapped
 * Return Queue and must not trigger any business action.
 */
export function useCan(module: string, action: string): boolean {
  const { hasPermission, isAssignmentOnly, isLoading } = useUserDynamicPermissions();
  if (isLoading) return false;
  if (isAssignmentOnly) return false;
  return hasPermission(module, action);
}
