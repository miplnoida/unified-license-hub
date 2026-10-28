import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { type NavItem } from '@/config/navigation';
import { useNavigationSections } from '@/hooks/useNavigationSections';
import { Layers, ChevronLeft, ChevronRight, ChevronDown, Menu, X, Lock } from 'lucide-react';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { getModuleForPath } from '@/lib/permissionModules';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { useLicenseEntitlements } from '@/hooks/useLicenseEntitlements';
import { pathRequiresLicenceEntitlement } from '@/lib/licenceEntitlementNav';
import { LICENSEE_ROLES, PRE_LICENSEE_ROLES, INTERNAL_ROLES } from '@/types/platform';
import { prefetchRoute } from '@/lib/routePrefetch';
import { useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';
import { canDiscoverSupervisoryNavigation, isSupervisoryNavigationPath } from '@/lib/supervisoryNavigation';


const COLLAPSED_KEY = 'sidebar-collapsed';
/** v3 = expansion identity is the stable sec_navigation_items key, not the label. */
const EXPANDED_KEY = 'sidebar-expanded-v3';


function usePersistedState<T>(key: string, initial: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  return [state, setState];
}

/**
 * A nav link is active on its exact path and on its detail routes
 * (e.g. `/admin/roles/123` keeps "Role Management" highlighted), but `/` and
 * other index links never swallow the whole app.
 */
function isPathActive(href: string | undefined, pathname: string): boolean {
  if (!href) return false;
  if (pathname === href) return true;
  if (href === '/' || href.length < 2) return false;
  return pathname.startsWith(href.endsWith('/') ? href : `${href}/`);
}

function hasActiveDescendant(item: NavItem, pathname: string): boolean {
  return (item.children ?? []).some(
    (c) => isPathActive(c.href, pathname) || hasActiveDescendant(c, pathname),
  );
}


/** Stable accordion identity — DB nav key, never the display label. */
export function navKey(item: NavItem): string {
  return item.key ?? `label:${item.label}`;
}

/**
 * Level-aware row styling. Level 1 domains are real navigation rows
 * (44px, 14.5px, semibold, title case) — not 10px uppercase captions.
 */
function rowClassForDepth(depth: number): string {
  if (depth === 0) return 'min-h-[42px] px-3 py-2 text-[14.5px] font-semibold rounded-[10px]';
  if (depth === 1) return 'min-h-[38px] px-2.5 py-2 text-[14px] font-medium rounded-lg';
  return 'min-h-[34px] px-2.5 py-1.5 text-[13px] rounded-md';
}

/**
 * Renders a navigation group at any depth. Groups may nest (Supervision →
 * Market Conduct → Investigations) because the taxonomy lives in
 * `sec_navigation_items` and admins can add levels.
 */
function CollapsibleNavItem({ item, collapsed, expandedGroups, toggleGroup, pathname, depth = 0 }: {
  item: NavItem; collapsed: boolean; expandedGroups: string[];
  toggleGroup: (key: string) => void; pathname: string; depth?: number;
}) {
  const itemKey = navKey(item);
  const isExpanded = expandedGroups.includes(itemKey);
  const hasActiveChild = hasActiveDescendant(item, pathname);
  const panelId = `nav-panel-${itemKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`;

  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={() => toggleGroup(itemKey)}
        onMouseEnter={() => prefetchGroup(item)}
        onFocus={() => prefetchGroup(item)}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className={cn(
          'flex w-full min-w-0 items-start gap-2.5 text-left transition-colors',
          'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          rowClassForDepth(depth),
          collapsed && 'justify-center',
          // Active ancestor hint — present but restrained
          hasActiveChild && 'text-sidebar-primary',
        )}
        title={item.label}
      >
        <span className={cn('shrink-0 mt-[1px]', hasActiveChild && 'text-sidebar-primary')}>{item.icon}</span>
        {!collapsed && (
          <>
            <span className="flex-1 min-w-0 break-words leading-snug line-clamp-2">{item.label}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 mt-[3px] transition-transform duration-200 motion-reduce:transition-none', isExpanded && 'rotate-180')} />
          </>
        )}
      </button>
      {!collapsed && (
        <div
          id={panelId}
          hidden={!isExpanded}
          className={cn(
            'grid overflow-hidden transition-[grid-template-rows,opacity] duration-[170ms] ease-out motion-reduce:transition-none',
            isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="min-w-0 overflow-hidden">
            <div className={cn('min-w-0 border-l border-sidebar-border py-1 space-y-0.5', depth === 0 ? 'ml-3.5 pl-2' : 'ml-2.5 pl-2')}>
              {item.children?.map((child) => {
                if (child.children?.length) {
                  return (
                    <CollapsibleNavItem
                      key={navKey(child)}
                      item={child}
                      collapsed={collapsed}
                      expandedGroups={expandedGroups}
                      toggleGroup={toggleGroup}
                      pathname={pathname}
                      depth={depth + 1}
                    />
                  );
                }
                if (!child.href) return null;
                return <NavLeaf key={navKey(child)} item={child} pathname={pathname} depth={depth + 1} />;
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A navigable destination row at any depth. */
function NavLeaf({ item, pathname, depth, collapsed = false }: { item: NavItem; pathname: string; depth: number; collapsed?: boolean }) {
  const isActive = isPathActive(item.href, pathname);
  const locked = !!(item as NavItem & { locked?: boolean }).locked;
  const lockedReason = (item as NavItem & { lockedReason?: string }).lockedReason
    || 'Available once your licence is approved and issued.';

  if (locked) {
    // Entitlement-gated destination: kept visible so the journey stays clear,
    // but not actionable until an eligible licence exists.
    return (
      <div
        title={lockedReason}
        aria-disabled="true"
        className={cn(
          'relative flex min-w-0 cursor-not-allowed items-start gap-2.5 text-sidebar-foreground/35',
          rowClassForDepth(depth),
          collapsed && 'justify-center',
        )}
      >
        <span className="shrink-0 mt-[1px]"><Lock className="h-4 w-4" /></span>
        {!collapsed && <span className="min-w-0 flex-1 break-words leading-snug line-clamp-2">{item.label}</span>}
      </div>
    );
  }

  return (
    <Link
      to={item.href!}
      data-sidebar-active={isActive ? 'true' : undefined}
      aria-current={isActive ? 'page' : undefined}
      title={item.label}
      onMouseEnter={() => prefetchRoute(item.href)}
      onFocus={() => prefetchRoute(item.href)}
      onTouchStart={() => prefetchRoute(item.href)}
      onClick={(e) => {
        // Reject accidental repeat clicks on the destination we are already on
        // so the page does not re-issue its business queries.
        if (isActive) e.preventDefault();
      }}
      className={cn(
        'relative flex min-w-0 items-start gap-2.5 transition-colors',
        'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
        rowClassForDepth(depth),
        collapsed && 'justify-center',
        isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[2.5px] before:rounded-full before:bg-sidebar-primary',
      )}
    >
      <span className={cn('shrink-0 mt-[1px]', isActive && 'text-sidebar-primary')}>{item.icon}</span>
      {!collapsed && <span className="min-w-0 flex-1 break-words leading-snug line-clamp-2">{item.label}</span>}
    </Link>
  );
}

/** Warm the chunks of a group's direct destinations on hover/focus. */
function prefetchGroup(item: NavItem) {
  (item.children ?? []).slice(0, 6).forEach((child) => prefetchRoute(child.href));
}



export function Sidebar() {
  const [collapsed, setCollapsed] = usePersistedState(COLLAPSED_KEY, false);
  const [expandedGroups, setExpandedGroups] = usePersistedState<string[]>(EXPANDED_KEY, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { user } = useAuth();
  const { branding } = useSiteSettings();
  const { sections: navSections } = useNavigationSections();
  const { hasPermission, hasModuleAccess, hasAnyModuleAccess, enforceDynamic, hasAssignmentReturnQueueAccess, isAssignmentAllowedReturnsPath } = useUserDynamicPermissions();
  const portalContext = useEffectivePortalContext();
  // CANONICAL ENTITLEMENT: post-licence services and returns only become
  // actionable once an eligible licence exists (same resolver the DB enforces).
  const entitlements = useLicenseEntitlements();
  const { isModuleEnabled: isPackageModuleEnabled } = useSubscriptionPackage();
  const entitlementGateApplies = !portalContext.isInternal;
  const lockNewActivity = entitlementGateApplies
    && !entitlements.loading
    && !entitlements.hasEligibleLicense;
  const navRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, [setExpandedGroups]);

  useEffect(() => {
    // Expand every ancestor group of the active route, at any depth, using the
    // stable DB nav key (labels may be renamed by admins).
    const toExpand: string[] = [];
    const walk = (items: NavItem[]) => {
      items.forEach((item) => {
        if (item.children?.length) {
          if (hasActiveDescendant(item, location.pathname)) toExpand.push(navKey(item));
          walk(item.children);
        }
      });
    };
    navSections.forEach((section) => walk(section.items));
    if (toExpand.length) {
      setExpandedGroups(prev => {
        const missing = toExpand.filter((k) => !prev.includes(k));
        return missing.length ? [...prev, ...missing] : prev;
      });
    }

    // Only scroll when the active row is genuinely out of view, and without
    // smooth motion so it never competes with the content transition.
    requestAnimationFrame(() => {
      const root = navRef.current;
      const activeEl = root?.querySelector('[data-sidebar-active="true"]') as HTMLElement | null;
      if (!root || !activeEl) return;
      const rootBox = root.getBoundingClientRect();
      const box = activeEl.getBoundingClientRect();
      const outOfView = box.top < rootBox.top || box.bottom > rootBox.bottom;
      if (outOfView) activeEl.scrollIntoView({ block: 'nearest' });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, navSections]);


  // Close mobile sidebar on route change
  useEffect(() => {
    if (isMobile) setMobileOpen(false);
  }, [location.pathname, isMobile]);

  const isItemVisible = (item: NavItem) => {
    if (!user) return false;
    if (portalContext.loading) return false;

    const roleVisible = item.roles.includes(user.role);
    const hasLicenseeAudience = item.roles.some((role) => LICENSEE_ROLES.includes(role));
    const hasPreLicenseeAudience = item.roles.some((role) => PRE_LICENSEE_ROLES.includes(role));
    const effectiveVisible = roleVisible
      || (portalContext.isLicensee && hasLicenseeAudience)
      || (portalContext.isPreLicensee && hasPreLicenseeAudience);

    // An item is treated as internal-only when its declared audience is
    // exclusively internal staff roles (or it is explicitly flagged adminOnly,
    // or it lives under an admin-panel path). Such items must always respect
    // the static role check, even when the user has been granted the same
    // permission module via a dynamic role — otherwise external users would
    // see admin screens just because they share a module key (e.g. an
    // applicant with complaint_management:submit seeing "Complaint Types").
    const audienceIsInternalOnly = item.roles.length > 0
      && item.roles.every((r) => INTERNAL_ROLES.includes(r));
    const pathIsAdminPanel = !!item.href && (item.href.startsWith('/admin/') || item.href === '/admin' || item.href.startsWith('/settings'));
    const isInternalOnlyItem = !!item.adminOnly || audienceIsInternalOnly || pathIsAdminPanel;

    // Internal-only items should be visible to ANY internal staff role when a
    // dynamic role grants the module — not just users whose static role is in
    // the item's declared audience. We still block non-internal users from
    // seeing admin-panel screens even when they share a module key.
    const userIsInternal = INTERNAL_ROLES.includes(user.role);
    if (enforceDynamic) {
      // Narrow assignment-only exception: allow the Return Queue entry
      // (and only the queue entry) when the user is assigned to at least
      // one licensee but lacks the base returns_management.view permission.
      const itemIsAssignmentQueue =
        !!item.href
        && (getModuleForPath(item.href) === 'returns_management')
        && isAssignmentAllowedReturnsPath(item.href);
      if (item.module) {
        if (isInternalOnlyItem && !userIsInternal) return false;
        // External users (applicants, licensee primary/secondary, pre-licensees)
        // are not gated by the internal dynamic-permission catalog. Their
        // portal-item visibility comes from the item's declared audience;
        // row-level access is enforced by RLS on click.
        if (!userIsInternal) return effectiveVisible;
        // Exact-action gate when the item declares one (e.g. Permission
        // Coverage → role_management.view_coverage) — module-wide access is
        // not enough for diagnostic entries.
        if (isSupervisoryNavigationPath(item.href)) {
          return canDiscoverSupervisoryNavigation(userIsInternal, false, hasPermission);
        }
        if (item.requiredAction) {
          return hasPermission(item.module, item.requiredAction);
        }
        if (hasModuleAccess(item.module)) return true;
        if (item.module === 'returns_management' && itemIsAssignmentQueue && hasAssignmentReturnQueueAccess) return true;
        return false;
      }
      if (item.href) {
        const mappedModule = getModuleForPath(item.href);
        if (mappedModule) {
          if (isInternalOnlyItem && !userIsInternal) return false;
          if (!userIsInternal) return effectiveVisible;
          if (hasModuleAccess(mappedModule)) return true;
          if (mappedModule === 'returns_management' && itemIsAssignmentQueue && hasAssignmentReturnQueueAccess) return true;
          return false;
        }
      }

      if (item.children?.length) return item.children.some(isItemVisible);
      // Module-less internal items (e.g. Dashboard) must still be gated so
      // assignment-only regulators and unpermissioned internal users don't see
      // them. External users keep visibility via their audience.
      if (portalContext.isLicensee || portalContext.isPreLicensee) return effectiveVisible;
      if (!userIsInternal) return effectiveVisible;
      return effectiveVisible && hasAnyModuleAccess();
    }
    if (!effectiveVisible) return false;
    return true;
  };

  /**
   * Recursively prunes the tree to what the user may see. Groups collapse away
   * when none of their descendants survive, so empty domains never render.
   */
  const pruneItem = (item: NavItem): NavItem | null => {
    // Modules outside the implemented subscription package disappear entirely.
    const pkgModule = item.module ?? (item.href ? getModuleForPath(item.href) : null);
    if (pkgModule && !isPackageModuleEnabled(pkgModule)) return null;
    if (!isItemVisible(item)) return null;
    if (item.children?.length) {
      const kids = item.children.map(pruneItem).filter((c): c is NavItem => !!c);
      return kids.length ? { ...item, children: kids } : null;
    }
    if (lockNewActivity && (item.requiresLicenceEntitlement || pathRequiresLicenceEntitlement(item.href))) {
      return {
        ...item,
        locked: true,
        lockedReason:
          entitlements.unavailableReason
          || 'Available once your licence is approved and issued.',
      } as NavItem;
    }
    return item;
  };



  // Mobile: hamburger button rendered outside sidebar
  if (isMobile) {
    return (
      <>
        {/* Mobile hamburger */}
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 h-9 w-9 bg-card shadow-md border"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setMobileOpen(false)} />
        )}

        {/* Slide-out drawer */}
        <aside className={cn(
          'fixed left-0 top-0 z-50 h-screen w-72 bg-sidebar flex flex-col border-r border-sidebar-border transition-transform duration-300',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}>
          <div className="flex h-14 items-center justify-between px-4 shrink-0">
            <div className="flex items-center gap-2.5">
              {branding.logo_url ? (
                <img src={branding.logo_url} alt={branding.site_name} className="h-10 w-auto max-w-[180px] rounded-lg object-contain" />
              ) : (
                <>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                    <Layers className="h-4.5 w-4.5 text-sidebar-primary-foreground" />
                  </div>
                  <span className="text-base font-bold text-sidebar-foreground tracking-tight">{branding.site_name}</span>
                </>
              )}
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-8 w-8 text-sidebar-foreground/60">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="sidebar-nav-scroll flex-1 px-3" ref={navRef}>
            <nav className="w-full min-w-0 py-3 space-y-5">
              {navSections.map((section) => {
                const visibleItems = section.items.map(pruneItem).filter((i): i is NavItem => !!i);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={section.label || 'main'} className="min-w-0">
                    {section.label && (
                      <p className="flex min-w-0 items-center gap-2 px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/40">
                        <span className="shrink-0 text-sidebar-foreground/50">{section.icon}</span>
                        <span className="min-w-0 truncate">{section.label}</span>
                      </p>
                    )}
                    <div className="min-w-0 space-y-1">
                      {visibleItems.map((item) => {
                        if (item.children?.length) {
                          return (
                            <CollapsibleNavItem key={navKey(item)} item={item} collapsed={false} expandedGroups={expandedGroups} toggleGroup={toggleGroup} pathname={location.pathname} />
                          );
                        }
                        if (!item.href) return null;
                        return <NavLeaf key={navKey(item)} item={item} pathname={location.pathname} depth={0} />;
                      })}
                    </div>

                  </div>
                );
              })}

            </nav>
          </ScrollArea>
        </aside>
      </>
    );
  }

  return (
    <aside className={cn(
      'fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 flex flex-col border-r border-sidebar-border',
      collapsed ? 'w-16' : 'w-64'
    )}>
      {/* Logo */}
      <div className="flex h-14 items-center justify-between px-4 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2.5">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={branding.site_name} className="h-10 w-auto max-w-[180px] rounded-lg object-contain" />
            ) : (
              <>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Layers className="h-4.5 w-4.5 text-sidebar-primary-foreground" />
                </div>
                <span className="text-base font-bold text-sidebar-foreground tracking-tight">{branding.site_name}</span>
              </>
            )}
          </div>
        )}
        <Button
          variant="ghost" size="icon"
          onClick={() => {
            setCollapsed(!collapsed);
            setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 0);
          }}
          className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* Navigation */}
      <ScrollArea className="sidebar-nav-scroll flex-1 px-3" ref={navRef}>
        <nav className="w-full min-w-0 py-3 space-y-5">
          {navSections.map((section) => {
            const visibleItems = section.items.map(pruneItem).filter((i): i is NavItem => !!i);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label || 'main'} className="min-w-0">
                {!collapsed && section.label && (
                  <p className="flex min-w-0 items-center gap-2 px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/40">
                    <span className="shrink-0 text-sidebar-foreground/50">{section.icon}</span>
                    <span className="min-w-0 truncate">{section.label}</span>
                  </p>
                )}
                <div className="min-w-0 space-y-1">
                  {visibleItems.map((item) => {
                    if (item.children?.length) {
                      return (
                        <CollapsibleNavItem
                          key={navKey(item)}
                          item={item}
                          collapsed={collapsed}
                          expandedGroups={expandedGroups}
                          toggleGroup={toggleGroup}
                          pathname={location.pathname}
                        />
                      );
                    }
                    if (!item.href) return null;
                    return <NavLeaf key={navKey(item)} item={item} pathname={location.pathname} depth={0} collapsed={collapsed} />;
                  })}
                </div>
              </div>

            );
          })}


        </nav>
      </ScrollArea>
    </aside>
  );
}
