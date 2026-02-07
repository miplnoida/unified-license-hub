import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Construction } from 'lucide-react';
import { useLocation } from 'react-router-dom';

export default function PlaceholderPage() {
  const location = useLocation();

  // Derive a readable title from the pathname
  const title = location.pathname
    .split('/')
    .filter(Boolean)
    .map(segment =>
      segment
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase())
    )
    .join(' › ');

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center animate-slide-up">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10 mb-6">
          <Construction className="h-8 w-8 text-secondary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground">{title}</h1>
        <p className="mt-3 text-muted-foreground max-w-md">
          This module is under development. Backend integration and full functionality
          will be available in a future release.
        </p>
        <p className="mt-6 text-xs text-muted-foreground/60 font-mono">
          Route: {location.pathname}
        </p>
      </div>
    </DashboardLayout>
  );
}
