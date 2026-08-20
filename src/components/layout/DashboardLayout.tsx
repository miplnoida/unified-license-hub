import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ActingOnBehalfOfBanner } from '@/components/shared/ActingOnBehalfOfBanner';
import { LicenseeSwitcher } from '@/components/ppoc/LicenseeSwitcher';
import { useIsMobile } from '@/hooks/use-mobile';
import { useInsideAppShell } from './AppShellContext';

const COLLAPSED_KEY = 'sidebar-collapsed';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

/**
 * Page container.
 *
 * Inside the persistent `AppShell` (all authenticated portal routes) this
 * renders ONLY the page heading + content — the shell already owns the sidebar,
 * header, scroll container and banner, and must never be remounted per route.
 * Outside the shell (standalone/public usages) it still renders full chrome so
 * legacy screens keep working unchanged.
 */
export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
  const insideShell = useInsideAppShell();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = sessionStorage.getItem(COLLAPSED_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handleStorage = () => {
      try {
        const stored = sessionStorage.getItem(COLLAPSED_KEY);
        setCollapsed(stored ? JSON.parse(stored) : false);
      } catch {
        setCollapsed(false);
      }
    };
    window.addEventListener('sidebar-toggle', handleStorage);
    return () => window.removeEventListener('sidebar-toggle', handleStorage);
  }, []);

  if (insideShell) {
    return (
      <div className="space-y-4">
        {title && (
          <div className="mb-4 md:mb-6">
            <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    );
  }

  const sidebarWidth = isMobile ? '0px' : collapsed ? '4rem' : '16rem';

  return (

    <div className="h-screen overflow-hidden bg-background">
      <Sidebar />
      <div
        className="h-screen flex flex-col transition-all duration-300"
        style={{ paddingLeft: sidebarWidth }}
      >
        <Header />
        <LicenseeSwitcher />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="max-w-[1440px] mx-auto space-y-4">
            <ActingOnBehalfOfBanner />
            {title && (
              <div className="mb-4 md:mb-6 animate-slide-up">
                <h1 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">{title}</h1>
                {subtitle && <p className="mt-1 text-xs md:text-sm text-muted-foreground">{subtitle}</p>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
