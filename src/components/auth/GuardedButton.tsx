import React from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';

/**
 * Convenience wrapper that renders a shadcn <Button> ONLY when the current
 * user holds `<module>.<action>`. When denied, renders nothing (hide-by-default).
 *
 * Assignment-only regulators (no dynamic-role permissions, entity assignments
 * only) NEVER see a GuardedButton — the Return Queue exception is view-only
 * and must never surface an action control regardless of module/action asked.
 *
 * If you need a "disable instead of hide" affordance, pass `disableInsteadOfHide`.
 * Use this for every business action button — Create, Edit, Delete, Approve,
 * Reject, Assign, Export, Download, Upload, Import, Bulk *, Workflow, Status
 * Change, Archive, Restore, Escalate, Issue, Publish, Close, Reopen, Resubmit,
 * Configure, Generate Report, AI Analysis, Consolidated Report, PDF, Excel,
 * CSV, Print, Email, Notification.
 */
export interface GuardedButtonProps extends ButtonProps {
  module: string;
  action: string;
  disableInsteadOfHide?: boolean;
}

export const GuardedButton = React.forwardRef<HTMLButtonElement, GuardedButtonProps>(
  function GuardedButton({ module, action, disableInsteadOfHide, disabled, children, ...rest }, ref) {
    const { hasPermission, isAssignmentOnly, isLoading } = useUserDynamicPermissions();
    if (isLoading) return null;
    // Assignment-only regulators are strictly view-only: never render actions.
    if (isAssignmentOnly) {
      if (disableInsteadOfHide) {
        return <Button ref={ref} {...rest} disabled aria-disabled>{children}</Button>;
      }
      return null;
    }
    const allowed = hasPermission(module, action);
    if (!allowed) {
      if (disableInsteadOfHide) {
        return <Button ref={ref} {...rest} disabled aria-disabled>{children}</Button>;
      }
      return null;
    }
    return <Button ref={ref} disabled={disabled} {...rest}>{children}</Button>;
  },
);
