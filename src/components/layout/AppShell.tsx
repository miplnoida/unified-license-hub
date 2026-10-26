import { Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';
import { getModuleForPath } from '@/lib/permissionModules';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ActingOnBehalfOfBanner } from '@/components/shared/ActingOnBehalfOfBanner';
import { LicenseeSwitcher } from '@/components/ppoc/LicenseeSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { RouteContentSkeleton } from '@/components/shared/RouteContentSkeleton';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { AppShellContext } from './AppShellContext';
import { ApplicationBreadcrumbs } from './ApplicationBreadcrumbs';
import { BreadcrumbLabelProvider } from './BreadcrumbLabelContext';
import { markRouteMounted, markNavigationStart } from '@/lib/navPerf';


const COLLAPSED_KEY = 'sidebar-collapsed';

/**
 * Persistent authenticated application shell.
 *
 * Sidebar, Header, LicenseeSwitcher and the acting-on-behalf banner mount once
 * and stay mounted for the whole authenticated session. Only the content area
 * is wrapped in `Suspense`, so lazy route chunks can never blank the app or
 * flash the auth loading screen.
 */
export function AppShell() {
  const isMobile = useIsMobile();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = sessionStorage.getItem(COLLAPSED_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const sync = () => {
      try {
        const stored = sessionStorage.getItem(COLLAPSED_KEY);
        setCollapsed(stored ? JSON.parse(stored) : false);
      } catch {
        setCollapsed(false);
      }
    };
    window.addEventListener('sidebar-toggle', sync);
    return () => window.removeEventListener('sidebar-toggle', sync);
  }, []);

  useEffect(() => {
    markNavigationStart(location.pathname);
  }, [location.pathname]);

  const sidebarWidth = isMobile ? '0px' : collapsed ? '4rem' : '16rem';
  const { isModuleEnabled } = useSubscriptionPackage();
  const packageBlocked = !isModuleEnabled(getModuleForPath(location.pathname));

  return (
    <AppShellContext.Provider value={true}>
      <BreadcrumbLabelProvider>
        <div className="h-screen overflow-hidden bg-background">
          <Sidebar />
          <div className="h-screen flex flex-col transition-[padding] duration-300" style={{ paddingLeft: sidebarWidth }}>
            <Header />
            <LicenseeSwitcher />
            <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
              <div className="max-w-[1440px] mx-auto space-y-4">
                <ApplicationBreadcrumbs />
                <ActingOnBehalfOfBanner />
                <ErrorBoundary context="RouteContent">
                  <Suspense fallback={<RouteContentSkeleton />}>
                    {/* keyed by path: restarts only the CONTENT transition */}
                    {packageBlocked ? (
                      <Navigate to="/dashboard" replace />
                    ) : (
                      <RouteContentTransition pathname={location.pathname}>
                        <Outlet />
                      </RouteContentTransition>
                    )}
                  </Suspense>
                </ErrorBoundary>
              </div>
            </main>
          </div>
        </div>
      </BreadcrumbLabelProvider>
    </AppShellContext.Provider>

  );
}

/**
 * Subtle content-only enter transition (opacity + 3px rise, ~150ms ease-out).
 * Disabled automatically under `prefers-reduced-motion` via the CSS class.
 */
function RouteContentTransition({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  useEffect(() => {
    markRouteMounted(pathname);
  }, [pathname]);
  return (
    <div key={pathname} className="route-content-enter">
      {children}
    </div>
  );
}

export default AppShell;
