/**
 * Canonical security context contract (Phase 7 of the one-model refactor).
 *
 * The backend function `public.sec_get_user_context()` is the SINGLE source of
 * truth for:
 *   - the caller's roles,
 *   - their effective `<module>.<action>` permissions,
 *   - their per-module data scopes,
 *   - the route -> permission registry,
 *   - the navigation tree (menu = discoverability only).
 *
 * This module contains pure helpers over that payload — no React, no Supabase.
 * MENU != SECURITY: hiding a nav item never grants or denies data access; RLS,
 * RPC and edge-function checks remain the backend authority.
 */
import { normalizeAction, normalizeModule, type UserPermission } from './authorize';

export type SecAudience = 'internal' | 'external' | 'any';

export interface SecRole {
  id: string;
  key: string;
  name: string;
  role_type: string | null;
  dashboard_tier: string | null;
}

export interface SecScope {
  module: string;
  scope: string;
  values: Array<{ kind: string; id: string | null }>;
}

export interface SecRoute {
  key: string;
  path: string;
  match_type: 'exact' | 'prefix' | 'pattern';
  audience: SecAudience;
  is_protected: boolean;
  module: string | null;
  action: string | null;
  priority: number;
}

export interface SecNavItem {
  key: string;
  parent_key: string | null;
  label: string;
  item_type: 'group' | 'link' | 'separator';
  href: string | null;
  icon: string | null;
  sort_order: number;
  audience: SecAudience;
  admin_only: boolean;
  module: string | null;
  action: string | null;
  /** Sidebar visibility (discoverability only — never a security decision). */
  show_in_sidebar?: boolean;
  /** Global-search visibility; some items are searchable but not in the menu. */
  show_in_search?: boolean;
  keywords?: string[] | null;
  /** Server-evaluated permission decision for this item. */
  allowed: boolean;
}


export interface SecurityContext {
  authenticated: boolean;
  user_id?: string;
  is_bypass?: boolean;
  roles?: SecRole[];
  permissions?: Array<{ module: string; action: string }>;
  scopes?: SecScope[];
  routes?: SecRoute[];
  navigation?: SecNavItem[];
}

/** Canonicalized permission tuples for `authorize()`. */
export function toUserPermissions(ctx: SecurityContext | null | undefined): UserPermission[] {
  const seen = new Set<string>();
  const out: UserPermission[] = [];
  for (const p of ctx?.permissions ?? []) {
    const module = normalizeModule(p.module);
    const name = normalizeAction(p.action);
    const key = `${module}::${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ module, name });
    }
  }
  return out;
}

/** Most specific registered route for a path (lowest priority number wins). */
export function matchRoute(routes: readonly SecRoute[] | undefined, pathname: string): SecRoute | null {
  if (!routes?.length) return null;
  const path = (pathname || '').split('?')[0];
  const candidates = routes.filter((r) =>
    r.match_type === 'exact'
      ? path === r.path
      : path === r.path || path.startsWith(r.path + '/'),
  );
  if (!candidates.length) return null;
  return candidates.reduce((best, r) => (r.priority < best.priority ? r : best));
}

/** Scope for a module, defaulting to `all` when the role declares none. */
export function scopeForModule(ctx: SecurityContext | null | undefined, module: string): SecScope | null {
  const key = normalizeModule(module);
  return (ctx?.scopes ?? []).find((s) => normalizeModule(s.module) === key) ?? null;
}

export interface SecNavNode extends SecNavItem {
  children: SecNavNode[];
}

/**
 * Canonical audience resolution (Wave 3B.5).
 *
 * The audience of a caller is derived ONLY from the governed `sec_roles`
 * catalogue (`role_type`) delivered by `sec_get_user_context()` — never from
 * the legacy `app_role` enum or `profiles.role`. Returns `null` when the
 * canonical payload carries no role-type information (e.g. the legacy
 * fallback context), so callers can degrade deliberately instead of silently
 * treating internal staff as external.
 */
export function resolveAudience(ctx: SecurityContext | null | undefined): SecAudience | null {
  if (!ctx?.authenticated) return null;
  if (ctx.is_bypass) return 'internal';
  const roles = ctx.roles ?? [];
  const typed = roles.filter((r) => !!r.role_type);
  if (!typed.length) return null;
  return typed.some((r) => String(r.role_type).toLowerCase() === 'internal')
    ? 'internal'
    : 'external';
}

/** True only when the canonical context resolves the caller to internal staff. */
export function isInternalAudience(ctx: SecurityContext | null | undefined): boolean {
  return resolveAudience(ctx) === 'internal';
}

/** Build the nav forest, ordered by `sort_order`. */
export function buildNavTree(items: readonly SecNavItem[] | undefined): SecNavNode[] {
  const nodes = new Map<string, SecNavNode>();
  for (const item of items ?? []) nodes.set(item.key, { ...item, children: [] });
  const roots: SecNavNode[] = [];
  for (const node of nodes.values()) {
    if (node.parent_key && nodes.has(node.parent_key)) {
      nodes.get(node.parent_key)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sort = (list: SecNavNode[]) => {
    list.sort((a, b) => a.sort_order - b.sort_order);
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
