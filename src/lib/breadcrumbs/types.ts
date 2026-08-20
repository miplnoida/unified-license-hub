/**
 * Platform-wide breadcrumb contracts.
 *
 * Breadcrumbs are DERIVED, never hand-written per page:
 *   1. the live navigation tree from `sec_get_user_context()` (canonical), or
 *   2. the frozen `navigationSnapshot` fallback, plus
 *   3. `breadcrumbRouteRegistry` rules for routes that are not menu entries
 *      (detail views, wizards, workspaces).
 *
 * Breadcrumbs are presentation only. They never grant access: a crumb link is
 * still subject to route guards, RLS and edge-function authorization.
 */

export type BreadcrumbAudience = 'public' | 'internal' | 'external' | 'any';

/** Flattened navigation node (live context or generated snapshot). */
export interface NavSnapshotItem {
  key: string;
  parentKey: string | null;
  label: string;
  href: string | null;
  itemType: string;
  audience: string;
  showInSidebar: boolean;
}

/**
 * Rule for a route that is not (or not only) a sidebar entry.
 *
 * `pattern` uses React-Router style params (`/entities/:entityId`).
 * `parent` may itself contain params — they are substituted from the params
 * matched on the current path, so `/entities/:entityId/structure` inherits the
 * resolved entity crumb rather than repeating a UUID.
 */
export interface BreadcrumbRule {
  pattern: string;
  /** Static label. Omit when `resolver` supplies a business label. */
  label?: string;
  /** Parent path (may contain `:params`). Defaults to the nav-derived parent. */
  parent?: string;
  /** Dynamic label resolver key (see `dynamicLabelResolvers`). */
  resolver?: string;
  /** Route param carrying the record id for `resolver`. */
  param?: string;
  /** Audience hint, used by coverage reporting only. */
  audience?: BreadcrumbAudience;
  /** Crumb is a grouping label with no navigable target. */
  nonNavigable?: boolean;
}

export interface BreadcrumbCrumb {
  /** Stable react key (nav key or route pattern). */
  key: string;
  label: string;
  /** Absent for the current page and for non-navigable group crumbs. */
  href?: string;
  isCurrent: boolean;
  /** Set when the label must be replaced by a resolved business label. */
  resolver?: string;
  /** Raw route param value (record id) for the resolver. */
  paramValue?: string;
}

export interface BuildBreadcrumbsOptions {
  navItems: NavSnapshotItem[];
  rules: BreadcrumbRule[];
  /** Root crumb, e.g. `{ label: 'Home', href: '/dashboard' }`. */
  root?: { label: string; href: string } | null;
  /** Hard cap before collapsing in the UI (build keeps the full chain). */
  maxDepth?: number;
}
