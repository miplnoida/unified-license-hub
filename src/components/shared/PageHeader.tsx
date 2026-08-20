import { ReactNode, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBreadcrumbLabelStore } from '@/components/layout/BreadcrumbLabelContext';

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /**
   * Refines the label of the CURRENT breadcrumb only (e.g. the resolved entity
   * name). Ancestry always stays derived from the navigation tree + breadcrumb
   * registry — pages never define their own trail.
   */
  breadcrumbLabel?: string | null;
}

export function PageHeader({ title, description, actions, backHref, backLabel, breadcrumbLabel }: PageHeaderProps) {
  const { setCurrentLabel } = useBreadcrumbLabelStore();

  useEffect(() => {
    if (breadcrumbLabel === undefined) return;
    setCurrentLabel(breadcrumbLabel ?? null);
    return () => setCurrentLabel(null);
  }, [breadcrumbLabel, setCurrentLabel]);

  return (
    <div className="animate-slide-up space-y-2">
      {backHref && (
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground hover:text-foreground -ml-2">
          <Link to={backHref}>
            <ArrowLeft className="h-4 w-4" />
            {backLabel || 'Back'}
          </Link>
        </Button>
      )}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
    </div>
  );
}
