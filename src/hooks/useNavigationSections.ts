import { useMemo } from 'react';
import { useSecurityContext } from '@/hooks/useSecurityContext';
import { buildNavTree, type SecNavNode } from '@/lib/rbac/securityContext';
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

function toNavItem(node: SecNavNode): NavItem {
  const children = node.children.map(toNavItem);
  return {
    label: node.label,
    href: node.href || undefined,
    icon: renderNavIcon(node.icon, 'h-5 w-5 shrink-0'),
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
    // Search-only entries (show_in_sidebar = false) stay out of the menu.
    const sidebarItems = items.filter((i) => i.show_in_sidebar !== false);
    const roots = buildNavTree(sidebarItems);
    const sections: NavSection[] = roots.map((root) => ({
      label: root.item_type === 'group' ? root.label : undefined,
      items: (root.item_type === 'group' ? root.children : [root]).map(toNavItem),
    })).filter((s) => s.items.length > 0);
    return { sections: sections.length ? sections : mainNavSections, isLoading, isDbDriven: sections.length > 0 };
  }, [context, isLoading]);

}
