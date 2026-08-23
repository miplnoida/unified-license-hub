import { useMemo } from 'react';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { buildNavTree, resolveAudience, type SecNavItem, type SecNavNode } from '@/lib/rbac/securityContext';
import { renderNavIcon } from '@/lib/rbac/navIcons';
import { mainNavSections, type NavItem, type NavSection } from '@/config/navigation';
import { INTERNAL_ROLES, LICENSEE_ROLES, type AppRole } from '@/types/platform';
import type { PermissionModule } from '@/lib/permissionModules';


const ALL_ROLES: AppRole[] = [
  'super_admin', 'admin', 'supervisor', 'licensing_officer', 'analyst',
  'applicant', 'developer', 'pre_licensee', 'licensee_primary', 'licensee_secondary',
  'legal_compliance',
];
const EXTERNAL_ROLES: AppRole[] = ['applicant', 'pre_licensee', ...LICENSEE_ROLES];

function audienceRoles(audience: string): AppRole[] {
  if (audience === 'internal') return [...INTERNAL_ROLES];
  if (audience === 'external') return EXTERNAL_ROLES;
  return ALL_ROLES;
}

/**
 * Icon size by visible depth so the hierarchy reads at a glance:
 * level 1 domain 18px, level 2 workspace 17px, level 3 leaf 15px.
 */
const ICON_CLASS_BY_DEPTH = ['h-[18px] w-[18px] shrink-0', 'h-[17px] w-[17px] shrink-0', 'h-[15px] w-[15px] shrink-0'];

function iconClassForDepth(depth: number): string {
  return ICON_CLASS_BY_DEPTH[Math.min(depth, ICON_CLASS_BY_DEPTH.length - 1)];
}

function toNavItem(node: SecNavNode, depth = 0): NavItem {
  const children = node.children.map((child) => toNavItem(child, depth + 1));
  return {
    key: node.key,
    label: node.label,
    href: node.href || undefined,
    icon: renderNavIcon(node.icon, iconClassForDepth(depth)),
    roles: audienceRoles(node.audience),
    module: (node.module || undefined) as PermissionModule | undefined,
    requiredAction: node.action || undefined,
    adminOnly: node.admin_only || undefined,
    children: children.length ? children : undefined,
  };
}


/**
 * Database-driven sidebar navigation.
 *
 * The menu structure, ordering, icons, audiences and per-item permission
 * requirements all come from `sec_navigation_items` via
 * `sec_get_user_context()`. The hardcoded `mainNavSections` config is kept only
 * as a boot fallback while the context loads or if it cannot be fetched, so the
 * app never renders an empty sidebar.
 *
 * Menu visibility is discoverability only — route guards, RLS and edge
 * functions remain the enforcement layer.
 */
export function useNavigationSections(): { sections: NavSection[]; isLoading: boolean; isDbDriven: boolean } {
  const { context, isLoading } = useSecurityContext();

  return useMemo(() => {
    const items = context?.navigation ?? [];
    if (!items.length) {
      return { sections: mainNavSections, isLoading, isDbDriven: false };
    }
    // Search-only entries (show_in_sidebar = false) stay out of the menu —
    // together with everything beneath them, otherwise a hidden group's
    // children would lose their parent and surface as top-level entries.
    const byKey = new Map(items.map((i) => [i.key, i]));
    const isSidebarVisible = (item: SecNavItem): boolean => {
      if (item.show_in_sidebar === false) return false;
      let parentKey = item.parent_key;
      const guard = new Set<string>();
      while (parentKey && !guard.has(parentKey)) {
        guard.add(parentKey);
        const parent = byKey.get(parentKey);
        if (!parent) break;
        if (parent.show_in_sidebar === false) return false;
        parentKey = parent.parent_key;
      }
      return true;
    };
    // Audience convergence (Wave 3B.5): a caller resolved to the EXTERNAL
    // audience by the canonical `sec_roles` catalogue never sees items declared
    // for internal staff — not even as a collapsed domain heading. Route guards
    // and RLS remain the enforcement layer; this only removes discoverability
    // of surfaces the caller can never open.
    const audience = resolveAudience(context);
    const audienceItems = audience === 'external'
      ? sidebarItemsRaw.filter((i) => String(i.audience ?? 'any').toLowerCase() !== 'internal')
      : sidebarItemsRaw;
    // Drop orphans whose parent was removed by the audience filter.
    const keptKeys = new Set(audienceItems.map((i) => i.key));
    const sidebarItems = audienceItems.filter((i) => !i.parent_key || keptKeys.has(i.parent_key));
    const roots = buildNavTree(sidebarItems);

    // Root domains (Licensing, Supervision, Returns, ...) render as first-class
    // level-1 accordion rows with their own icon — NOT as tiny uppercase
    // separator captions. A root that is a plain link (Home) renders directly.
    const sections: NavSection[] = [{ items: roots.map((root) => toNavItem(root, 0)) }]
      .filter((s) => s.items.length > 0);
    return { sections: sections.length ? sections : mainNavSections, isLoading, isDbDriven: sections.length > 0 };

  }, [context, isLoading]);

}
