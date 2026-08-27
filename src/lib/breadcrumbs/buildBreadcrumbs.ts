/**
 * Pure breadcrumb derivation.
 *
 * No React, no Supabase, no router — so the whole trail can be unit tested and
 * regression-checked by `scripts/verify-breadcrumb-coverage.mjs`.
 *
 * Resolution order for a pathname:
 *   1. exact registry rule match (supports `:params`),
 *   2. exact navigation href match (ancestry from the nav tree),
 *   3. longest navigation href prefix + humanised trailing segments,
 *   4. humanised segments only (never a UUID — see `isOpaqueId`).
 */
import type {
  BreadcrumbCrumb,
  BreadcrumbRule,
  BuildBreadcrumbsOptions,
  NavSnapshotItem,
} from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids and tokens must never be shown as a breadcrumb label. */
export function isOpaqueId(segment: string): boolean {
  if (!segment) return false;
  if (UUID_RE.test(segment)) return true;
  if (/^\d+$/.test(segment)) return true;
  // Long token heuristic: only single-word, token-charset strings qualify.
  // Human labels ("Licensing & Authorisation") contain spaces/punctuation and
  // must never be mistaken for an identifier.
  if (segment.length >= 20 && /^[0-9A-Za-z_]+$/.test(segment)) return true;
  return false;
}


export function humanizeSegment(segment: string): string {
  const clean = decodeURIComponent(segment).replace(/[-_]+/g, ' ').trim();
  if (!clean) return '';
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function normalizePath(pathname: string): string {
  const path = (pathname || '/').split('?')[0].split('#')[0];
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

function segments(path: string): string[] {
  return normalizePath(path).split('/').filter(Boolean);
}

/** Match a path against a `:param` pattern, returning the params or null. */
export function matchPattern(pattern: string, path: string): Record<string, string> | null {
  const p = segments(pattern);
  const s = segments(path);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) {
      params[p[i].slice(1)] = s[i];
      continue;
    }
    if (p[i].toLowerCase() !== s[i].toLowerCase()) return null;
  }
  return params;
}

export function findRule(rules: readonly BreadcrumbRule[], path: string): { rule: BreadcrumbRule; params: Record<string, string> } | null {
  let best: { rule: BreadcrumbRule; params: Record<string, string>; score: number } | null = null;
  for (const rule of rules) {
    const params = matchPattern(rule.pattern, path);
    if (!params) continue;
    // Prefer the most literal pattern (fewest params) when several match.
    const score = Object.keys(params).length;
    if (!best || score < best.score) best = { rule, params, score };
  }
  return best ? { rule: best.rule, params: best.params } : null;
}

function fillParams(pattern: string, params: Record<string, string>): string {
  return (
    '/' +
    segments(pattern)
      .map((seg) => (seg.startsWith(':') ? params[seg.slice(1)] ?? seg : seg))
      .join('/')
  );
}

function navByHref(navItems: readonly NavSnapshotItem[]): Map<string, NavSnapshotItem> {
  const map = new Map<string, NavSnapshotItem>();
  for (const item of navItems) {
    if (!item.href) continue;
    const key = normalizePath(item.href);
    if (!map.has(key)) map.set(key, item);
  }
  return map;
}

/** Nav ancestry (root → item) for a nav node, group crumbs included. */
function navAncestry(item: NavSnapshotItem, byKey: Map<string, NavSnapshotItem>): NavSnapshotItem[] {
  const chain: NavSnapshotItem[] = [];
  let current: NavSnapshotItem | undefined = item;
  const guard = new Set<string>();
  while (current && !guard.has(current.key)) {
    guard.add(current.key);
    chain.unshift(current);
    current = current.parentKey ? byKey.get(current.parentKey) : undefined;
  }
  return chain;
}

function toCrumb(item: NavSnapshotItem): BreadcrumbCrumb {
  return {
    key: item.key,
    label: item.label,
    href: item.href ? normalizePath(item.href) : undefined,
    isCurrent: false,
  };
}

/**
 * Build the full breadcrumb trail for a pathname. The last crumb is the current
 * page (never a link). Duplicate consecutive labels/hrefs are collapsed.
 */
export function buildBreadcrumbs(pathname: string, options: BuildBreadcrumbsOptions): BreadcrumbCrumb[] {
  const path = normalizePath(pathname);
  const { navItems, rules, root = null } = options;
  const byKey = new Map(navItems.map((i) => [i.key, i]));
  const byHref = navByHref(navItems);

  const resolve = (target: string, depth: number): BreadcrumbCrumb[] => {
    if (depth > 12) return [];
    const current = normalizePath(target);

    const matched = findRule(rules, current);
    if (matched) {
      const { rule, params } = matched;
      const parentPath = rule.parent ? fillParams(rule.parent, params) : null;
      const parents = parentPath && normalizePath(parentPath) !== current ? resolve(parentPath, depth + 1) : [];
      const crumb: BreadcrumbCrumb = {
        key: rule.pattern,
        label: rule.label ?? labelFallback(current, rule, params),
        href: rule.nonNavigable ? undefined : current,
        isCurrent: false,
        resolver: rule.resolver,
        paramValue: rule.param ? params[rule.param] : undefined,
      };
      return [...parents, crumb];
    }

    const navHit = byHref.get(current);
    if (navHit) return navAncestry(navHit, byKey).map(toCrumb);

    // Longest nav prefix + humanised remainder.
    let prefixHit: NavSnapshotItem | null = null;
    let prefixLen = 0;
    for (const [href, item] of byHref) {
      if (href !== '/' && (current === href || current.startsWith(href + '/')) && href.length > prefixLen) {
        prefixHit = item;
        prefixLen = href.length;
      }
    }
    const base = prefixHit ? navAncestry(prefixHit, byKey).map(toCrumb) : [];
    const consumed = prefixHit && prefixHit.href ? segments(prefixHit.href).length : 0;
    const rest = segments(current).slice(consumed);
    let acc = prefixHit && prefixHit.href ? normalizePath(prefixHit.href) : '';
    const tail: BreadcrumbCrumb[] = [];
    rest.forEach((seg) => {
      acc = `${acc}/${seg}`;
      if (isOpaqueId(seg)) return; // never expose ids
      tail.push({ key: acc, label: humanizeSegment(seg), href: acc, isCurrent: false });
    });
    return [...base, ...tail];
  };

  const trail = resolve(path, 0);

  const out: BreadcrumbCrumb[] = [];
  if (root) {
    out.push({ key: 'breadcrumb-root', label: root.label, href: normalizePath(root.href), isCurrent: false });
  }
  for (const crumb of trail) {
    const prev = out[out.length - 1];
    if (prev && ((crumb.href && prev.href === crumb.href) || (!crumb.resolver && prev.label === crumb.label))) {
      // collapse duplicates (root vs nav "Home", nested groups repeating a label)
      if (crumb.resolver) out[out.length - 1] = { ...prev, ...crumb };
      continue;
    }
    out.push(crumb);
  }

  if (!out.length) {
    return [{ key: path, label: humanizeSegment(segments(path).slice(-1)[0] ?? 'Home'), isCurrent: true }];
  }

  const last = out.length - 1;
  return out.map((crumb, i) => (i === last ? { ...crumb, href: undefined, isCurrent: true } : crumb));
}

function labelFallback(path: string, rule: BreadcrumbRule, params: Record<string, string>): string {
  if (rule.resolver) {
    const raw = rule.param ? params[rule.param] : '';
    return raw && !isOpaqueId(raw) ? humanizeSegment(raw) : 'Record';
  }
  const last = segments(path).slice(-1)[0] ?? '';
  return isOpaqueId(last) ? 'Record' : humanizeSegment(last);
}

/**
 * Collapse long trails for narrow viewports: keep the root, an ellipsis, and
 * the last `keep` crumbs. The full trail stays available to assistive tech.
 */
export function collapseBreadcrumbs(crumbs: BreadcrumbCrumb[], maxVisible = 4): { crumbs: BreadcrumbCrumb[]; collapsed: BreadcrumbCrumb[] } {
  if (crumbs.length <= maxVisible) return { crumbs, collapsed: [] };
  const head = crumbs.slice(0, 1);
  const tail = crumbs.slice(crumbs.length - (maxVisible - 1));
  return { crumbs: [...head, ...tail], collapsed: crumbs.slice(1, crumbs.length - (maxVisible - 1)) };
}
