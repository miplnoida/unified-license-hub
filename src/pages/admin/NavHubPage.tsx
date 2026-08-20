import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, ArrowUpRight, ShieldAlert } from 'lucide-react';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { renderNavIcon } from '@/lib/rbac/navIcons';
import type { SecNavItem } from '@/lib/rbac/securityContext';

interface NavHubPageProps {
  /** `sec_navigation_items.key` whose descendants this hub lists. */
  navKey: string;
  title: string;
  description?: string;
}

/**
 * Generic, database-driven configuration hub.
 *
 * Deep configuration areas are collapsed to a single sidebar entry that opens
 * one of these hubs. The tool list is not hardcoded — it is the authorized
 * descendants of `navKey` in `sec_navigation_items`, exactly as evaluated by
 * `sec_get_user_context()`. A tool the signed-in user may not open is never
 * listed, and the underlying route guard plus RLS remain the enforcement
 * layer (this page is discoverability only).
 */
export default function NavHubPage({ navKey, title, description }: NavHubPageProps) {
  const { context, isLoading } = useSecurityContext();
  const [query, setQuery] = useState('');

  const tools = useMemo(() => {
    const items = context?.navigation ?? [];
    const byKey = new Map(items.map((i) => [i.key, i]));
    const descendantOf = (item: SecNavItem): boolean => {
      let parent = item.parent_key;
      const guard = new Set<string>();
      while (parent && !guard.has(parent)) {
        if (parent === navKey) return true;
        guard.add(parent);
        parent = byKey.get(parent)?.parent_key ?? null;
      }
      return false;
    };
    return items
      .filter((i) => i.item_type === 'link' && !!i.href && i.allowed !== false && descendantOf(i))
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [context, navKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tools;
    return tools.filter(
      (t) =>
        t.label.toLowerCase().includes(q)
        || (t.keywords ?? []).some((k) => k.toLowerCase().includes(q))
        || (t.href ?? '').toLowerCase().includes(q),
    );
  }, [tools, query]);

  return (
    <DashboardLayout>
      <PageHeader title={title} description={description} />

      <div className="relative mb-5 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a configuration tool..."
          className="pl-9"
          aria-label="Find a configuration tool"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-10 text-muted-foreground">
            <ShieldAlert className="h-5 w-5 shrink-0" />
            <span className="text-sm">
              {tools.length === 0
                ? 'You do not have access to any tools in this area.'
                : 'No tool matches your search.'}
            </span>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((tool) => (
            <Link key={tool.key} to={tool.href!} className="group">
              <Card className="h-full transition-colors hover:border-primary/50 hover:bg-accent/40">
                <CardContent className="flex items-start gap-3 p-4">
                  <span className="mt-0.5 text-primary">{renderNavIcon(tool.icon, 'h-5 w-5')}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 font-semibold">
                      <span className="truncate">{tool.label}</span>
                      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70" />
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{tool.href}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
