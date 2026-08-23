import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { buildBreadcrumbs } from '@/lib/breadcrumbs/buildBreadcrumbs';
import { breadcrumbRouteRegistry } from '@/lib/breadcrumbs/breadcrumbRouteRegistry';
import { navigationSnapshot } from '@/lib/breadcrumbs/navigationSnapshot';
import { resolveLabel, resolverFallback, isResolvableId } from '@/lib/breadcrumbs/dynamicLabelResolvers';
import type { BreadcrumbCrumb, NavSnapshotItem } from '@/lib/breadcrumbs/types';
import type { SecNavItem } from '@/lib/rbac/securityContext';

/** Live security-context nav → the flat shape the pure builder expects. */
function fromContext(items: readonly SecNavItem[] | undefined): NavSnapshotItem[] {
  if (!items?.length) return [];
  return items.map((i) => ({
    key: i.key,
    parentKey: i.parent_key,
    label: i.label,
    href: i.href,
    itemType: i.item_type,
    audience: i.audience,
    // Breadcrumbs use the FULL tree: search-only items still need an ancestry.
    showInSidebar: i.show_in_sidebar !== false,
  }));
}

export interface UseBreadcrumbsOptions {
  /** Root crumb; pass null to suppress (public shell supplies its own). */
  root?: { label: string; href: string } | null;
  /** Overrides the current (last) crumb label — used by `PageHeader`. */
  currentLabel?: string | null;
}

/**
 * Breadcrumb trail for the active route.
 *
 * Ancestry comes from the live navigation tree when available and the frozen
 * snapshot otherwise, so the trail is stable during context loading. Dynamic
 * crumbs (detail routes) resolve their business label asynchronously and show a
 * neutral fallback ("Application", "Entity") until then — never a UUID.
 */
export function useBreadcrumbs(options: UseBreadcrumbsOptions = {}): { crumbs: BreadcrumbCrumb[]; isResolving: boolean } {
  const { root = { label: 'Home', href: '/dashboard' }, currentLabel = null } = options;
  const location = useLocation();
  const { context } = useSecurityContext();

  const navItems = useMemo(() => {
    const live = fromContext(context?.navigation);
    return live.length ? live : navigationSnapshot;
  }, [context]);

  const base = useMemo(
    () => buildBreadcrumbs(location.pathname, { navItems, rules: breadcrumbRouteRegistry, root }),
    [location.pathname, navItems, root],
  );

  const dynamic = useMemo(
    () =>
      base
        .filter((c) => c.resolver && isResolvableId(c.paramValue ?? undefined))
        .map((c) => ({ resolver: c.resolver!, id: c.paramValue! })),
    [base],
  );

  const results = useQueries({
    queries: dynamic.map(({ resolver, id }) => ({
      queryKey: ['breadcrumb-label', resolver, id],
      queryFn: () => resolveLabel(resolver, id),
      staleTime: 300_000,
      retry: 0,
    })),
  });

  const crumbs = useMemo(() => {
    const resolved = new Map<string, string>();
    dynamic.forEach(({ resolver, id }, index) => {
      const label = results[index]?.data;
      if (label) resolved.set(`${resolver}:${id}`, label);
    });
    const next = base.map((crumb) => {
      if (!crumb.resolver || !crumb.paramValue) return crumb;
      const hit = resolved.get(`${crumb.resolver}:${crumb.paramValue}`);
      return { ...crumb, label: hit ?? resolverFallback(crumb.resolver) ?? crumb.label };
    });
    if (currentLabel && next.length) {
      next[next.length - 1] = { ...next[next.length - 1], label: currentLabel };
    }
    return next;
  }, [base, dynamic, results, currentLabel]);

  return { crumbs, isResolving: results.some((r) => r.isLoading) };
}
