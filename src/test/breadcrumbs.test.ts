import { describe, it, expect } from 'vitest';
import {
  buildBreadcrumbs,
  collapseBreadcrumbs,
  humanizeSegment,
  isOpaqueId,
  matchPattern,
  normalizePath,
} from '@/lib/breadcrumbs/buildBreadcrumbs';
import { breadcrumbRouteRegistry } from '@/lib/breadcrumbs/breadcrumbRouteRegistry';
import { navigationSnapshot } from '@/lib/breadcrumbs/navigationSnapshot';

const UUID = '3f1b8c1e-51a2-4a3e-9b6d-2f0a4c8e77aa';
const opts = { navItems: navigationSnapshot, rules: breadcrumbRouteRegistry, root: { label: 'Home', href: '/dashboard' } };

function labels(pathname: string) {
  return buildBreadcrumbs(pathname, opts).map((c) => c.label);
}

describe('breadcrumb primitives', () => {
  it('normalizes paths and strips query/hash', () => {
    expect(normalizePath('/entities/?a=1')).toBe('/entities');
    expect(normalizePath('/entities/#x')).toBe('/entities');
    expect(normalizePath('')).toBe('/');
  });

  it('detects opaque identifiers', () => {
    expect(isOpaqueId(UUID)).toBe(true);
    expect(isOpaqueId('12345')).toBe(true);
    expect(isOpaqueId('entities')).toBe(false);
  });

  it('humanizes slugs', () => {
    expect(humanizeSegment('registration-review')).toBe('Registration review');
  });

  it('matches param patterns', () => {
    expect(matchPattern('/entities/:entityId', `/entities/${UUID}`)).toEqual({ entityId: UUID });
    expect(matchPattern('/entities/:entityId', '/entities')).toBeNull();
  });
});

describe('buildBreadcrumbs', () => {
  it('always starts at the root crumb and marks only the last crumb current', () => {
    const crumbs = buildBreadcrumbs('/complaints/analytics', opts);
    expect(crumbs[0].label).toBe('Home');
    expect(crumbs.at(-1)!.isCurrent).toBe(true);
    expect(crumbs.at(-1)!.href).toBeUndefined();
    expect(crumbs.slice(0, -1).every((c) => !c.isCurrent)).toBe(true);
  });

  it('never renders an id as a label', () => {
    for (const path of [
      `/entities/${UUID}`,
      `/applications/${UUID}`,
      `/complaints/${UUID}`,
      `/returns/filings/${UUID}`,
      `/admin/registration-review/${UUID}`,
      `/unknown/segment/${UUID}`,
    ]) {
      const crumbs = buildBreadcrumbs(path, opts);
      expect(crumbs.every((c) => !isOpaqueId(c.label))).toBe(true);
      expect(crumbs.some((c) => c.label.includes(UUID))).toBe(false);
    }
  });

  it('exposes the resolver + param for dynamic detail routes', () => {
    const current = buildBreadcrumbs(`/entities/${UUID}`, opts).at(-1)!;
    expect(current.resolver).toBe('entity');
    expect(current.paramValue).toBe(UUID);
  });

  it('inherits the parent record crumb for sub-workspaces', () => {
    const crumbs = buildBreadcrumbs(`/entities/${UUID}/structure`, opts);
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Entity directory', 'Entity', 'Structure workspace']);
    expect(crumbs[2].href).toBe(`/entities/${UUID}`);
  });

  it('derives ancestry from the navigation tree for menu routes', () => {
    const crumbs = buildBreadcrumbs('/applications/queue', opts);
    expect(crumbs[0].label).toBe('Home');
    expect(crumbs.at(-1)!.label).toBe('Review queue');
    expect(crumbs.length).toBeGreaterThan(2);
  });

  it('does not duplicate consecutive crumbs', () => {
    const crumbs = buildBreadcrumbs('/dashboard', opts);
    const seen = crumbs.map((c) => c.label);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('falls back to humanised segments for unregistered paths', () => {
    expect(labels('/some/new-surface')).toEqual(['Home', 'Some', 'New surface']);
  });

  it('supports a public root', () => {
    const crumbs = buildBreadcrumbs('/registry/entities', {
      ...opts,
      root: { label: 'Home', href: '/' },
    });
    expect(crumbs.map((c) => c.label)).toEqual(['Home', 'Public register', 'Regulated entities']);
  });

  it('never loops on cyclic parents', () => {
    const crumbs = buildBreadcrumbs('/a', {
      navItems: [],
      rules: [
        { pattern: '/a', label: 'A', parent: '/b' },
        { pattern: '/b', label: 'B', parent: '/a' },
      ],
      root: null,
    });
    expect(crumbs.length).toBeLessThan(20);
    expect(crumbs.at(-1)!.label).toBe('A');
  });
});

describe('collapseBreadcrumbs', () => {
  it('keeps root and tail, collapsing the middle', () => {
    const crumbs = ['A', 'B', 'C', 'D', 'E'].map((label, i) => ({ key: label, label, href: `/${i}`, isCurrent: false }));
    const { crumbs: visible, collapsed } = collapseBreadcrumbs(crumbs, 3);
    expect(visible.map((c) => c.label)).toEqual(['A', 'D', 'E']);
    expect(collapsed.map((c) => c.label)).toEqual(['B', 'C']);
  });

  it('is a no-op for short trails', () => {
    const crumbs = [{ key: 'a', label: 'A', isCurrent: true }];
    expect(collapseBreadcrumbs(crumbs, 4).collapsed).toEqual([]);
  });
});
