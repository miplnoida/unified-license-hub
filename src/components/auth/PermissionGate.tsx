import React from 'react';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';

interface PermissionGateProps {
  /** Permission module key, e.g. 'application_management'. */
  module: string;
  /** Action key on that module, e.g. 'approve', 'review', 'submit'. */
  action: string;
  /** Optional fallback render when permission is denied. Default: render nothing. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Wraps action buttons (Create, Edit, Delete, Approve, Reject, Assign, Review,
 * Submit, Upload, Export, ...) so they only render when the current user has
 * the specified permission. Uses the unified `useUserDynamicPermissions` hook —
 * the SAME source of truth used by route guards and the sidebar.
 *
 * Super Administrators and legacy admins without a mapped dynamic role always
 * see the children (matches `hasPermission` behaviour in the hook).
 *
 * Example:
 *   <PermissionGate module="application_management" action="approve">
 *     <Button onClick={approve}>Approve</Button>
 *   </PermissionGate>
 */
export function PermissionGate({ module, action, fallback = null, children }: PermissionGateProps) {
  const { hasPermission, isLoading } = useUserDynamicPermissions();
  if (isLoading) return null;
  if (!hasPermission(module, action)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Module-level gate — render children only when the user has ANY permission
 * inside the given module. Useful for whole sections / tabs.
 */
export function ModuleGate({
  module,
  fallback = null,
  children,
}: {
  module: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { hasModuleAccess, isLoading } = useUserDynamicPermissions();
  if (isLoading) return null;
  if (!hasModuleAccess(module)) return <>{fallback}</>;
  return <>{children}</>;
}
