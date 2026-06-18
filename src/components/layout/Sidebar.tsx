import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { mainNavSections, NavItem } from '@/config/navigation';
import { Layers, ChevronLeft, ChevronRight, ChevronDown, Menu, X } from 'lucide-react';
import { useSiteSettings } from '@/contexts/SiteSettingsContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { getModuleForPath } from '@/lib/permissionModules';
import { useEffectivePortalContext } from '@/hooks/useEffectivePortalContext';
import { LICENSEE_ROLES, PRE_LICENSEE_ROLES, INTERNAL_ROLES } from '@/types/platform';

const COLLAPSED_KEY = 'sidebar-collapsed';
const EXPANDED_KEY = 'sidebar-expanded-groups';

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

function CollapsibleNavItem({ item, collapsed, expandedGroups, toggleGroup, pathname }: {
  item: NavItem; collapsed: boolean; expandedGroups: string[];
  toggleGroup: (label: string) => void; pathname: string;
}) {
  const isExpanded = expandedGroups.includes(item.label);
  const hasActiveChild = item.children?.some(c => c.href && pathname === c.href) ?? false;

  return (
    <div>
      <button
        onClick={() => toggleGroup(item.label)}
        className={cn('nav-item w-full text-left', hasActiveChild && 'text-sidebar-primary font-semibold')}
        title={collapsed ? item.label : undefined}
      >
        {item.icon}
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', isExpanded && 'rotate-180')} />
          </>
        )}
      </button>
      {!collapsed && (
        <div className={cn('overflow-hidden transition-all duration-200', isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="ml-5 border-l border-sidebar-border pl-3 py-1 space-y-0.5">
            {item.children?.map((child) => {
              if (!child.href) return null;
              const isActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  to={child.href}
                  data-sidebar-active={isActive ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-sidebar-foreground/65 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                    isActive && 'bg-sidebar-accent text-sidebar-primary font-semibold'
                  )}
                >
                  {child.icon}
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = usePersistedState(COLLAPSED_KEY, false);
  const [expandedGroups, setExpandedGroups] = usePersistedState<string[]>(EXPANDED_KEY, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { user } = useAuth();
  const { branding } = useSiteSettings();
  const { hasModuleAccess, enforceDynamic } = useUserDynamicPermissions();
  const portalContext = useEffectivePortalContext();
  const navRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }, [setExpandedGroups]);

  useEffect(() => {
    mainNavSections.forEach(section => {
      section.items.forEach(item => {
        if (item.children) {
          const hasActive = item.children.some(c => c.href && location.pathname === c.href);
          if (hasActive && !expandedGroups.includes(item.label)) {
            setExpandedGroups(prev => [...prev, item.label]);
          }
        }
      });
    });
    // Auto-scroll sidebar to active item
    requestAnimationFrame(() => {
      const activeEl = navRef.current?.querySelector('[data-sidebar-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

    if (enforceDynamic) {
      if (item.module) {
        if (isInternalOnlyItem && !roleVisible) return false;
        return hasModuleAccess(item.module);
      }
      if (item.href) {
        const mappedModule = getModuleForPath(item.href);
        if (mappedModule) {
          if (isInternalOnlyItem && !roleVisible) return false;
          return hasModuleAccess(mappedModule);
        }
      }
      if (item.children?.length) return item.children.some(isItemVisible);
      return effectiveVisible;
    }
    if (!effectiveVisible) return false;
    return true;
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
                <img src={branding.logo_url} alt={branding.site_name} className="h-8 w-8 rounded-lg object-contain" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                  <Layers className="h-4.5 w-4.5 text-sidebar-primary-foreground" />
                </div>
              )}
              <span className="text-base font-bold text-sidebar-foreground tracking-tight">{branding.site_name}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="h-8 w-8 text-sidebar-foreground/60">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1 px-3" ref={navRef}>
            <nav className="py-3 space-y-5">
              {mainNavSections.map((section) => {
                const visibleItems = section.items.filter(isItemVisible);
                if (visibleItems.length === 0) return null;
                return (
                  <div key={section.label || 'main'}>
                    {section.label && (
                      <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/30">
                        {section.label}
                      </p>
                    )}
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => {
                        if (item.children?.length) {
                          const visibleChildren = item.children.filter(isItemVisible);
                          if (!visibleChildren.length) return null;
                          return (
                            <CollapsibleNavItem key={item.label} item={{ ...item, children: visibleChildren }} collapsed={false} expandedGroups={expandedGroups} toggleGroup={toggleGroup} pathname={location.pathname} />
                          );
                        }
                        if (!item.href) return null;
                        const isActive = location.pathname === item.href;
                        return (
                          <Link key={item.href} to={item.href} className={cn('nav-item', isActive && 'nav-item-active')}>
                            {item.icon}
                            <span className="flex-1 truncate">{item.label}</span>
                          </Link>
                        );
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
              <img src={branding.logo_url} alt={branding.site_name} className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
                <Layers className="h-4.5 w-4.5 text-sidebar-primary-foreground" />
              </div>
            )}
            <span className="text-base font-bold text-sidebar-foreground tracking-tight">{branding.site_name}</span>
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
      <ScrollArea className="flex-1 px-3" ref={navRef}>
        <nav className="py-3 space-y-5">
          {mainNavSections.map((section) => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label || 'main'}>
                {!collapsed && section.label && (
                  <p className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/30">
                    {section.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item) => {
                    if (item.children?.length) {
                      const visibleChildren = item.children.filter(isItemVisible);
                      if (!visibleChildren.length) return null;
                      return (
                        <CollapsibleNavItem
                          key={item.label}
                          item={{ ...item, children: visibleChildren }}
                          collapsed={collapsed}
                          expandedGroups={expandedGroups}
                          toggleGroup={toggleGroup}
                          pathname={location.pathname}
                        />
                      );
                    }
                    if (!item.href) return null;
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.href} to={item.href}
                        data-sidebar-active={isActive ? 'true' : undefined}
                        className={cn('nav-item', isActive && 'nav-item-active')}
                        title={collapsed ? item.label : undefined}
                      >
                        {item.icon}
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      </Link>
                    );
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
