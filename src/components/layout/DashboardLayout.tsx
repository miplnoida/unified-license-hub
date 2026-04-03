import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { useIsMobile } from '@/hooks/use-mobile';

const COLLAPSED_KEY = 'sidebar-collapsed';

interface DashboardLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
}

export function DashboardLayout({ children, title, subtitle }: DashboardLayoutProps) {
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

  const sidebarWidth = isMobile ? '0px' : collapsed ? '4rem' : '16rem';

  return (
    <div className="h-screen overflow-hidden bg-background">
      <Sidebar />
      <div
        className="h-screen flex flex-col transition-all duration-300"
        style={{ paddingLeft: sidebarWidth }}
      >
        <Header />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
          <div className="max-w-[1440px] mx-auto">
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
