import { Link } from 'react-router-dom';
import { Fragment } from 'react';
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useBreadcrumbs } from '@/hooks/useBreadcrumbs';
import { collapseBreadcrumbs } from '@/lib/breadcrumbs/buildBreadcrumbs';
import { useBreadcrumbLabelStore } from './BreadcrumbLabelContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ApplicationBreadcrumbsProps {
  /** Root crumb; pass null for shells that are already at the root. */
  root?: { label: string; href: string } | null;
  className?: string;
}

/**
 * Global breadcrumb bar.
 *
 * Rendered once by the shell — pages never build their own trail. A single
 * crumb (the landing/home route) renders nothing, keeping the header clean.
 * Long trails collapse in the middle on narrow viewports while the full chain
 * stays in the DOM for assistive technology.
 */
export function ApplicationBreadcrumbs({ root, className }: ApplicationBreadcrumbsProps) {
  const { currentLabel } = useBreadcrumbLabelStore();
  const { crumbs } = useBreadcrumbs({ root: root === undefined ? undefined : root, currentLabel });
  const isMobile = useIsMobile();

  if (crumbs.length < 2) return null;

  const { crumbs: visible, collapsed } = collapseBreadcrumbs(crumbs, isMobile ? 3 : 6);

  return (
    <Breadcrumb className={cn('min-w-0', className)}>
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {visible.map((crumb, index) => {
          const showEllipsisBefore = collapsed.length > 0 && index === 1;
          return (
            <Fragment key={crumb.key}>
              {index > 0 && <BreadcrumbSeparator />}
              {showEllipsisBefore && (
                <>
                  <BreadcrumbItem>
                    <BreadcrumbEllipsis />
                    <span className="sr-only">{collapsed.map((c) => c.label).join(' / ')}</span>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                </>
              )}
              <BreadcrumbItem className="min-w-0">
                {crumb.isCurrent || !crumb.href ? (
                  <BreadcrumbPage className="truncate max-w-[16rem] font-medium">{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link to={crumb.href} className="truncate max-w-[12rem] hover:underline">
                      {crumb.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default ApplicationBreadcrumbs;
