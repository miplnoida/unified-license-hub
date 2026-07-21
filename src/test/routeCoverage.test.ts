/**
 * Route ↔ permission coverage test.
 *
 * Scans every route file for `<M module="X">` (ModuleRoute) guards and
 * asserts that the corresponding `path="..."` resolves to the SAME module
 * via `getModuleForPath`. This guarantees the sidebar's `canAccessPath`
 * check and the runtime `ModuleRoute` guard agree for every protected
 * page. Also flags duplicate mappings.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getModuleForPath } from '@/lib/permissionModules';

const ROUTE_DIR = join(process.cwd(), 'src/routes');

function collectRouteFiles(): string[] {
  return readdirSync(ROUTE_DIR)
    .filter((f) => f.endsWith('Routes.tsx'))
    .map((f) => join(ROUTE_DIR, f));
}

interface GuardedRoute {
  file: string;
  path: string;
  module: string;
}

/**
 * Match every `<Route path="X" element={<M module="Y"> ... </M>} />`.
 * Uses a non-greedy body match to tolerate additional wrappers between M
 * and the page element.
 */
const ROUTE_M_REGEX =
  /<Route\s+path="([^"]+)"\s+element=\{[^}]*?<M\s+module="([^"]+)"/g;

function extractGuardedRoutes(): GuardedRoute[] {
  const out: GuardedRoute[] = [];
  for (const file of collectRouteFiles()) {
    const src = readFileSync(file, 'utf8');
    let m: RegExpExecArray | null;
    while ((m = ROUTE_M_REGEX.exec(src)) !== null) {
      out.push({ file, path: m[1], module: m[2] });
    }
  }
  return out;
}

/** Strip route params so we can resolve against the static prefix map. */
function staticPathOf(routePath: string): string {
  const parts = routePath.split('/').filter(Boolean);
  const kept: string[] = [];
  for (const seg of parts) {
    if (seg.startsWith(':') || seg === '*') break;
    kept.push(seg);
  }
  return '/' + kept.join('/');
}

describe('Route coverage — ModuleRoute guards agree with ROUTE_MODULE_MAP', () => {
  const guarded = extractGuardedRoutes();

  it('discovers at least one guarded route (regex sanity)', () => {
    expect(guarded.length).toBeGreaterThan(20);
  });

  it('every guarded route resolves to the SAME module via getModuleForPath', () => {
    const mismatches: string[] = [];
    for (const r of guarded) {
      const resolved = getModuleForPath(staticPathOf(r.path));
      if (resolved !== r.module) {
        mismatches.push(
          `  ${r.path}  guard=${r.module}  map=${resolved ?? 'UNMAPPED'}`,
        );
      }
    }
    if (mismatches.length > 0) {
      throw new Error(
        `Route/permission mismatch (${mismatches.length}):\n${mismatches.join('\n')}`,
      );
    }
  });

  it('no duplicate path entries across guarded routes', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const r of guarded) {
      const prev = seen.get(r.path);
      if (prev && prev !== r.module) {
        dupes.push(`${r.path}: ${prev} vs ${r.module}`);
      } else {
        seen.set(r.path, r.module);
      }
    }
    expect(dupes).toEqual([]);
  });
});
