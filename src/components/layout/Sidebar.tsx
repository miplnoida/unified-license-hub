import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { mainNavSections, bottomNavItems, NavItem } from '@/config/navigation';
import { ROLE_LABELS, AppRole } from '@/types/platform';
import {
  Layers,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';

const COLLAPSED_KEY = 'sidebar-collapsed';
const EXPANDED_KEY = 'sidebar-expanded-groups';

function usePersistedState<T>(key: string, initial: T): [T, (val: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? JSON.parse(stored) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => { sessionStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  return [state, setState];
}

function CollapsibleNavItem({
  item, collapsed, expandedGroups, toggleGroup, pathname,
}: {
  item: NavItem; collapsed: boolean; expandedGroups: string[];
  toggleGroup: (label: string) => void; pathname: string;
}) {
  const isExpanded = expandedGroups.includes(item.label);
  const hasActiveChild = item.children?.some(c => c.href && pathname === c.href) ?? false;

  return (
    <div>
      <button
        onClick={() => toggleGroup(item.label)}
        className={cn('nav-item w-full text-left relative', hasActiveChild && 'text-sidebar-primary font-medium')}
        title={collapsed ? item.label : undefined}
      >
        {item.icon}
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{item.label}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform duration-200', isExpanded && 'rotate-180')} />
          </>
        )}
      </button>
      {!collapsed && (
        <div className={cn('overflow-hidden transition-all duration-200', isExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0')}>
          <div className="ml-4 border-l border-sidebar-border pl-2 py-1 space-y-0.5">
            {item.children?.map((child) => {
              if (!child.href) return null;
              const isActive = pathname === child.href;
              return (
                <Link
                  key={child.href}
                  to={child.href}
                  data-sidebar-active={isActive ? 'true' : undefined}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors',
                    isActive && 'bg-sidebar-accent text-sidebar-primary font-medium'
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
  const location = useLocation();
  const { user, logout } = useAuth();
  const navRef = useRef<HTMLDivElement>(null);

  const toggleGroup = useCallback((label: string) => {
    setExpandedGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }, [setExpandedGroups]);

  useEffect(() => {
    let needsExpand = false;
    mainNavSections.forEach(section => {
      section.items.forEach(item => {
        if (item.children) {
          const hasActive = item.children.some(c => c.href && location.pathname === c.href);
          if (hasActive && !expandedGroups.includes(item.label)) {
            needsExpand = true;
            setExpandedGroups(prev => [...prev, item.label]);
          }
        }
      });
    });
    const delay = needsExpand ? 250 : 50;
    const timer = setTimeout(() => {
      const el = navRef.current?.querySelector('[data-sidebar-active="true"]') as HTMLElement | null;
      el?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const isItemVisible = (item: NavItem) => user && item.roles.includes(user.role);
  const filteredBottomItems = bottomNavItems.filter(isItemVisible);

  return (
    <aside className={cn('fixed left-0 top-0 z-40 h-screen bg-sidebar transition-all duration-300 flex flex-col', collapsed ? 'w-16' : 'w-64')}>
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4 shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
              <Layers className="h-5 w-5 text-sidebar-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-sidebar-foreground">RegPlatform</span>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setCollapsed(!collapsed);
            setTimeout(() => window.dispatchEvent(new Event('sidebar-toggle')), 0);
          }}
          className="text-sidebar-foreground hover:bg-sidebar-accent"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      {/* User info */}
      {!collapsed && user && (
        <div className="border-b border-sidebar-border p-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-medium">
              {user.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{user.fullName}</p>
              <Badge variant="secondary" className="mt-1 text-xs">
                {ROLE_LABELS[user.role]}
              </Badge>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <ScrollArea className="flex-1" ref={navRef}>
        <nav className="p-3 space-y-4">
          {mainNavSections.map((section) => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label || 'main'}>
                {!collapsed && section.label && (
                  <p className="px-4 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
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
                        key={item.href}
                        to={item.href}
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

          {/* Bottom items */}
          {filteredBottomItems.length > 0 && (
            <div>
              {!collapsed && (
                <p className="px-4 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
                  Account
                </p>
              )}
              <div className="space-y-0.5">
                {filteredBottomItems.map((item) => {
                  if (!item.href) return null;
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      className={cn('nav-item', isActive && 'nav-item-active')}
                      title={collapsed ? item.label : undefined}
                    >
                      {item.icon}
                      {!collapsed && <span className="flex-1">{item.label}</span>}
                    </Link>
                  );
                })}
                <button onClick={logout} className="nav-item w-full text-left">
                  <LogOut className="h-5 w-5" />
                  {!collapsed && <span className="flex-1">Logout</span>}
                </button>
              </div>
            </div>
          )}
        </nav>
      </ScrollArea>
    </aside>
  );
}
