import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';
import {
  deriveUserContext,
  getDashboardWidgetsForUser,
} from '@/lib/dashboardRegistry';
import { WIDGET_RENDERERS } from '@/components/dashboard/widgets';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';

/**
 * Permission-driven dashboard.
 *
 * The composition is fully data-driven via `dashboardRegistry`:
 *   1. Derive the user's CONTEXT (internal / licensee / pre-licensee / applicant).
 *   2. Ask `useUserDynamicPermissions` whether each module is accessible.
 *   3. `getDashboardWidgetsForUser` returns the ordered visible widget list.
 *
 * No role-name `if` branches live in this file. Adding a new dynamic role with
 * a new permission set automatically changes what renders.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const { hasModuleAccess, hasPermission, isLoading: permsLoading } = useUserDynamicPermissions();
  const portalContext = useEffectivePortalContext();

  const context = useMemo(
    () => deriveUserContext(user, portalContext.loading ? null : portalContext),
    [portalContext, user],
  );

  const widgets = useMemo(() => {
    if (!context) return [];
    return getDashboardWidgetsForUser({
      context,
      hasModuleAccess: (m) => hasModuleAccess(m),
      hasPermission: (m, a) => hasPermission(m, a),
    });
  }, [context, hasModuleAccess, hasPermission, permsLoading]);

  if (portalContext.loading) return <AuthLoadingScreen />;
  if (!user || !context) return null;

  const title = context.isInternal
    ? 'Admin Dashboard'
    : context.isLicensee
      ? 'Licensee Dashboard'
      : context.isPreLicensee
        ? 'Pre-License Portal'
        : 'My Dashboard';
  const subtitle = `Welcome back, ${user.fullName}. Here's what you can access.`;

  return (
    <DashboardLayout title={title} subtitle={subtitle}>
      <div className="space-y-6">
        {widgets.length === 0 ? (
          <Card>
            <CardContent className="py-12 flex flex-col items-center text-center gap-3">
              <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <p className="font-medium text-foreground">No dashboard widgets available yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md">
                  Your account does not currently have access to any dashboard
                  modules. Please contact your administrator if you believe this
                  is a mistake.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 animate-slide-up delay-100">
            {widgets.map(w => {
              const Renderer = WIDGET_RENDERERS[w.id];
              if (!Renderer) return null;
              return <Renderer key={w.id} widget={w} context={context} />;
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
