/**
 * Node-only Permission Coverage scanner. Walks source files + SQL migrations
 * and returns a `CoverageMatrix`. Types + the pure `classifyCoverage`
 * classifier live in `./coverageTypes` so UI code can consume them without
 * pulling in `node:fs` / `node:path`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type {
  CatalogEntry,
  CoverageMatrix,
  CoverageRow,
  SurfaceKey,
  SurfaceReference,
} from './coverageTypes';

export type {
  CatalogEntry,
  CoverageMatrix,
  CoverageRow,
  SurfaceKey,
  SurfaceReference,
} from './coverageTypes';
export { classifyCoverage } from './coverageTypes';

// ---------------------------------------------------------------------------
// FS helpers
// ---------------------------------------------------------------------------

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.git') continue;
      walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

function readOr(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function lineOf(text: string, idx: number): number {
  let l = 1;
  for (let i = 0; i < idx && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) l++;
  }
  return l;
}

function relTo(root: string, file: string): string {
  const rr = resolve(root);
  const ff = resolve(file);
  if (ff.startsWith(rr + '/')) return ff.slice(rr.length + 1);
  return file;
}

// ---------------------------------------------------------------------------
// Frontend scanners
// ---------------------------------------------------------------------------

function scanMenu(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference) => void,
) {
  const file = join(root, 'src/config/navigation.tsx');
  const text = readOr(file);
  if (!text) return;
  const re = /module\s*:\s*['"]([a-z0-9_]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    register(m[1], 'view', {
      file: 'src/config/navigation.tsx',
      line: lineOf(text, m.index),
    });
  }
}

function scanRoutes(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference) => void,
) {
  const files = walk(join(root, 'src/routes'), ['.tsx', '.ts']);
  const re = /<(?:M|ModuleRoute)\s+module\s*=\s*["']([a-z0-9_]+)["']/g;
  for (const file of files) {
    const text = readOr(file);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      register(m[1], 'view', { file: relTo(root, file), line: lineOf(text, m.index) });
    }
  }
}

function scanButtons(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference, kind: SurfaceKey) => void,
) {
  const files = [
    ...walk(join(root, 'src/pages'), ['.tsx', '.ts']),
    ...walk(join(root, 'src/components'), ['.tsx', '.ts']),
  ];
  const gatePatterns: RegExp[] = [
    /<PermissionGate\s+module\s*=\s*["']([a-z0-9_]+)["']\s+action\s*=\s*["']([a-z0-9_]+)["']/g,
    /<GuardedButton[^>]+module\s*=\s*["']([a-z0-9_]+)["'][^>]+action\s*=\s*["']([a-z0-9_]+)["']/g,
  ];
  const markerPattern = /data-rbac\s*=\s*["']([a-z0-9_]+)\.([a-z0-9_]+)["']/g;
  for (const file of files) {
    const text = readOr(file);
    for (const re of gatePatterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        register(m[1], m[2], { file: relTo(root, file), line: lineOf(text, m.index) }, 'button');
      }
    }
    markerPattern.lastIndex = 0;
    let mm: RegExpExecArray | null;
    while ((mm = markerPattern.exec(text)) !== null) {
      register(
        mm[1],
        mm[2],
        { file: relTo(root, file), line: lineOf(text, mm.index), detail: 'data-rbac marker (audit signal only)' },
        'marker',
      );
    }
  }
}

function scanReports(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference) => void,
) {
  const files = walk(join(root, 'src/pages/reports'), ['.ts', '.tsx']);
  for (const file of files) {
    const text = readOr(file);
    register('report_management', 'view', {
      file: relTo(root, file),
      line: 1,
      detail: 'implicit — file under src/pages/reports',
    });
    const re = /data-rbac\s*=\s*["']([a-z0-9_]+)\.([a-z0-9_]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      register(m[1], m[2], { file: relTo(root, file), line: lineOf(text, m.index) });
    }
  }
}

// ---------------------------------------------------------------------------
// SQL scanners — RLS / RPC / storage
// ---------------------------------------------------------------------------

interface SqlContext {
  kind: 'rls' | 'rpc' | 'storage';
  detail: string;
}

function classifySqlContext(text: string, pos: number): SqlContext {
  const before = text.slice(Math.max(0, pos - 2000), pos);
  const lastPolicy = before.lastIndexOf('CREATE POLICY');
  const lastFn = Math.max(
    before.lastIndexOf('CREATE FUNCTION'),
    before.lastIndexOf('CREATE OR REPLACE FUNCTION'),
  );
  if (lastPolicy > lastFn) {
    const onIdx = before.indexOf(' ON ', lastPolicy);
    const on = onIdx >= 0 ? before.slice(onIdx, onIdx + 60) : '';
    if (/storage\.objects/i.test(on)) {
      return { kind: 'storage', detail: 'storage.objects policy' };
    }
    return { kind: 'rls', detail: 'RLS policy' };
  }
  return { kind: 'rpc', detail: 'function body' };
}

/**
 * Canonical SQL authorization primitives. All of them terminate in
 * `has_permission(user, module, action)` server-side, so a literal reference
 * inside a migration is real backend enforcement.
 *
 * Deliberately narrow: only `('module', 'action')` literal pairs are
 * recognised. A dynamic/variable pair is NOT counted — it must not be able to
 * hide a missing gate.
 */
const SQL_AUTHZ_PATTERNS: RegExp[] = [
  // has_permission(auth.uid(), 'module', 'action')
  /\bhas_permission\s*\(\s*[^,()]+,\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*\)/gi,
  // sec_has_permission(auth.uid(), 'module', 'action')
  /\bsec_has_permission\s*\(\s*[^,()]+,\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*\)/gi,
  // has_scoped_permission(auth.uid(), 'module', 'action', …)
  /\bhas_scoped_permission\s*\(\s*[^,()]+,\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'/gi,
  // enforce_permission('module', 'action') — used inside governed RPC bodies
  /\benforce_permission\s*\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*\)/gi,
];

function scanSql(
  root: string,
  registerWithKind: (
    m: string,
    a: string,
    ref: SurfaceReference,
    kind: SurfaceKey,
  ) => void,
) {
  const files = walk(join(root, 'supabase/migrations'), ['.sql']);
  for (const file of files) {
    const text = readOr(file);
    for (const re of SQL_AUTHZ_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const ctx = classifySqlContext(text, m.index);
        registerWithKind(
          m[1],
          m[2],
          { file: relTo(root, file), line: lineOf(text, m.index), detail: ctx.detail },
          ctx.kind,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Edge-function scanner — `requireUserPermission(req, 'module', 'action')`
// is the canonical edge gate (see docs/rbac/edge-function-authorization.md).
// It calls has_permission() server-side, so it counts as backend enforcement.
// ---------------------------------------------------------------------------

function scanEdgeFunctions(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference, kind: SurfaceKey) => void,
) {
  const files = walk(join(root, 'supabase/functions'), ['.ts']);
  const re =
    /requireUserPermission\s*\(\s*[A-Za-z0-9_.]+\s*,\s*['"]([a-z0-9_]+)['"]\s*,\s*['"]([a-z0-9_]+)['"]/g;
  for (const file of files) {
    const text = readOr(file);
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      register(
        m[1],
        m[2],
        {
          file: relTo(root, file),
          line: lineOf(text, m.index),
          detail: 'edge function gate (requireUserPermission)',
        },
        'rpc',
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Frontend authorization-helper scanner.
//
//  - `authorizedAction` / `authorizedExport` call the SECURITY DEFINER
//    `enforce_action` RPC → server-side enforcement (backend surface).
//  - `useCan` / `hasPermission` are frontend gates → UI surface only.
// ---------------------------------------------------------------------------

function scanAuthzHelpers(
  root: string,
  register: (m: string, a: string, ref: SurfaceReference, kind: SurfaceKey) => void,
) {
  const files = [
    ...walk(join(root, 'src/pages'), ['.ts', '.tsx']),
    ...walk(join(root, 'src/components'), ['.ts', '.tsx']),
    ...walk(join(root, 'src/hooks'), ['.ts', '.tsx']),
    ...walk(join(root, 'src/lib'), ['.ts', '.tsx']),
    ...walk(join(root, 'src/routes'), ['.ts', '.tsx']),
  ];
  const serverRe =
    /\bauthorized(?:Action|Export)\s*\(\s*['"]([a-z0-9_]+)['"]\s*,\s*['"]([a-z0-9_]+)['"]/g;
  const uiRe =
    /\b(?:useCan|hasPermission)\s*\(\s*['"]([a-z0-9_]+)['"]\s*,\s*['"]([a-z0-9_]+)['"]/g;
  for (const file of files) {
    const rel = relTo(root, file);
    // Skip the helper definitions themselves.
    if (/src\/lib\/rbac\/authorized(Action|Export)\.ts$/.test(rel)) continue;
    const text = readOr(file);
    serverRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = serverRe.exec(text)) !== null) {
      register(
        m[1],
        m[2],
        {
          file: rel,
          line: lineOf(text, m.index),
          detail: 'enforce_action RPC (server-enforced)',
        },
        'rpc',
      );
    }
    uiRe.lastIndex = 0;
    while ((m = uiRe.exec(text)) !== null) {
      register(
        m[1],
        m[2],
        { file: rel, line: lineOf(text, m.index), detail: 'frontend gate (useCan/hasPermission)' },
        'button',
      );
    }
  }
}


// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function buildCoverage(
  projectRoot: string,
  catalog: readonly CatalogEntry[],
): CoverageMatrix {
  const rows = new Map<string, CoverageRow>();
  const key = (m: string, a: string) => `${m}.${a}`;
  const emptyRow = (module: string, action: string): CoverageRow => ({
    module,
    action,
    menu: [],
    route: [],
    button: [],
    marker: [],
    rls: [],
    rpc: [],
    storage: [],
    report: [],
    orphaned: true,
  });
  for (const c of catalog) {
    rows.set(key(c.module, c.name), emptyRow(c.module, c.name));
  }

  const register = (m: string, a: string, ref: SurfaceReference, kind: SurfaceKey) => {
    const k = key(m, a);
    let row = rows.get(k);
    if (!row) {
      row = emptyRow(m, a);
      rows.set(k, row);
    }
    row[kind].push(ref);
    // Markers alone do NOT satisfy orphan-status — a real surface must exist.
    if (kind !== 'marker') row.orphaned = false;
  };

  const regKind =
    (kind: SurfaceKey) => (m: string, a: string, ref: SurfaceReference) =>
      register(m, a, ref, kind);

  scanMenu(projectRoot, regKind('menu'));
  scanRoutes(projectRoot, regKind('route'));
  scanButtons(projectRoot, register);
  scanReports(projectRoot, regKind('report'));
  scanSql(projectRoot, register);
  scanEdgeFunctions(projectRoot, register);
  scanAuthzHelpers(projectRoot, register);

  const finalRows = [...rows.values()].map((r) => ({
    ...r,
    orphaned:
      r.menu.length === 0 &&
      r.route.length === 0 &&
      r.button.length === 0 &&
      r.rls.length === 0 &&
      r.rpc.length === 0 &&
      r.storage.length === 0 &&
      r.report.length === 0,
  }));


  finalRows.sort((a, b) =>
    a.module === b.module ? a.action.localeCompare(b.action) : a.module.localeCompare(b.module),
  );

  return {
    generatedAt: new Date().toISOString(),
    rows: finalRows,
    orphanedCount: finalRows.filter((r) => r.orphaned).length,
  };
}
