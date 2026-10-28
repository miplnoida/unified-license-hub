import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import {
  CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { renderNavIcon } from '@/lib/rbac/navIcons';
import type { SecNavItem } from '@/lib/rbac/securityContext';
import { useUserDynamicPermissions } from '@/hooks/usePermissions';
import { useSubscriptionPackage } from '@/hooks/useSubscriptionPackage';
import { getModuleForPath } from '@/lib/permissionModules';
import { canDiscoverSupervisoryNavigation, isSupervisoryNavigationPath } from '@/lib/supervisoryNavigation';

interface Entry {
  key: string;
  label: string;
  href: string;
  icon: string | null;
  group: string;
  keywords: string[];
}

/**
 * Global navigation search (Ctrl/Cmd+K).
 *
 * The index is the authorized navigation returned by `sec_get_user_context()`,
 * so it lists every destination the signed-in user may open — including the
 * specialist screens that were deliberately pulled out of the sidebar to keep
 * the menu compact. Nothing the user lacks permission for is ever indexed, and
 * route guards plus RLS still enforce access on navigation.
 */
export function GlobalNavSearch() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { context } = useSecurityContext();
  const { isInternal, isBypassRole, hasPermission } = useUserDynamicPermissions();
  const { isModuleEnabled } = useSubscriptionPackage();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const entries = useMemo<Entry[]>(() => {
    const items = context?.navigation ?? [];
    const byKey = new Map(items.map((i) => [i.key, i]));
    const rootLabel = (item: SecNavItem): string => {
      let current: SecNavItem | undefined = item;
      const guard = new Set<string>();
      while (current?.parent_key && !guard.has(current.parent_key)) {
        guard.add(current.parent_key);
        const parent = byKey.get(current.parent_key);
        if (!parent) break;
        current = parent;
      }
      return current && current.key !== item.key ? current.label : 'Navigation';
    };
    return items
      .filter((i) => i.item_type === 'link' && !!i.href && i.show_in_search !== false
        && (isSupervisoryNavigationPath(i.href)
          ? isModuleEnabled(getModuleForPath(i.href)) && canDiscoverSupervisoryNavigation(isInternal, isBypassRole, hasPermission)
          : i.allowed !== false))
      .map((i) => ({
        key: i.key,
        label: i.label,
        href: i.href!,
        icon: i.icon,
        group: rootLabel(i),
        keywords: i.keywords ?? [],
      }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
  }, [context, isInternal, isBypassRole, hasPermission, isModuleEnabled]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const entry of entries) {
      if (!map.has(entry.group)) map.set(entry.group, []);
      map.get(entry.group)!.push(entry);
    }
    return Array.from(map.entries());
  }, [entries]);

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-40 items-center gap-2 rounded-md bg-muted/40 pl-3 pr-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/70 sm:w-56 md:w-72"
        aria-label="Search navigation"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">Search...</span>
        <kbd className="hidden shrink-0 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] md:inline">
          ⌘K
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, queues and settings..." />
        <CommandList>
          <CommandEmpty>No matching page you have access to.</CommandEmpty>
          {grouped.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.key}
                  value={`${item.label} ${item.group} ${item.keywords.join(' ')} ${item.href}`}
                  onSelect={() => go(item.href)}
                >
                  {renderNavIcon(item.icon, 'mr-2 h-4 w-4')}
                  <span className="flex-1 truncate">{item.label}</span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">{item.href}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}
