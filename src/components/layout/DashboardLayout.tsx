import { ReactNode, useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

const COLLAPSED_KEY = 'sidebar-collapsed';

interface DashboardLayoutProps {
  children: ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
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

    // Listen for custom event from Sidebar
    window.addEventListener('sidebar-toggle', handleStorage);
    return () => window.removeEventListener('sidebar-toggle', handleStorage);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className="transition-all duration-300"
        style={{ paddingLeft: collapsed ? '4rem' : '16rem' }}
      >
        <Header />
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
