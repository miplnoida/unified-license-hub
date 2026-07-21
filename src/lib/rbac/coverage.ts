/**
 * Permission Coverage scanner.
 *
 * Walks source files + SQL migrations to determine where every catalogued
 * (module, action) permission is actually enforced. Produces a matrix used by:
 *   - `scripts/generate-permission-coverage.ts` (writes docs/rbac/*)
 *   - `src/pages/admin/PermissionCoverageReport.tsx`
 *   - `src/test/rbac/permissionCoverage.test.ts` (coverage floor)
 *
 * A permission is ORPHANED when it appears in no surface below.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export type SurfaceKey =
  | 'menu'
  | 'route'
  | 'button'
  | 'rls'
  | 'rpc'
  | 'storage'
  | 'report';

export interface SurfaceReference {
  file: string;
  line: number;
  detail?: string;
}

export interface CoverageRow {
  module: string;
  action: string;
  menu: SurfaceReference[];
  route: SurfaceReference[];
  button: SurfaceReference[];
  rls: SurfaceReference[];
  rpc: SurfaceReference[];
  storage: SurfaceReference[];
  report: SurfaceReference[];
  orphaned: boolean;
}

export interface CoverageMatrix {
  generatedAt: string;
  rows: CoverageRow[];
  orphanedCount: number;
}

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

// ---------------------------------------------------------------------------
// Frontend scanners
// ---------------------------------------------------------------------------

/** Menu references — every `module: '<key>'` entry in navigation config. */
function scanMenu(root: string, register: (m: string, a: string, ref: SurfaceReference) => void) {
  const file = join(root, 'src/config/navigation.tsx');
  const text = readOr(file);
  if (!text) return;
  const re = /module\s*:\s*['"]([a-z0-9_]+)['"]/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    register(m[1], 'view', { file: 'src/config/navigation.tsx', line: lineOf(text, m.index) });
  }
}

/** Route references — every `<M module="…">` / `<ModuleRoute module="…">` guard. */
function scanRoutes(root: string, register: (m: string, a: string, ref: SurfaceReference) => void) {
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

/** Button references — PermissionGate / GuardedButton / data-rbac markers. */
function scanButtons(root: string, register: (m: string, a: string, ref: SurfaceReference) => void) {
  const files = [
    ...walk(join(root, 'src/pages'), ['.tsx', '.ts']),
    ...walk(join(root, 'src/components'), ['.tsx', '.ts']),
  ];
  const patterns: RegExp[] = [
    /<PermissionGate\s+module\s*=\s*["']([a-z0-9_]+)["']\s+action\s*=\s*["']([a-z0-9_]+)["']/g,
    /<GuardedButton[^>]+module\s*=\s*["']([a-z0-9_]+)["'][^>]+action\s*=\s*["']([a-z0-9_]+)["']/g,
    /data-rbac\s*=\s*["']([a-z0-9_]+)\.([a-z0-9_]+)["']/g,
  ];
  for (const file of files) {
    const text = readOr(file);
    for (const re of patterns) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        register(m[1], m[2], { file: relTo(root, file), line: lineOf(text, m.index) });
      }
    }
  }
}

/** Report references — reportDefinitions entries and every file under src/pages/reports. */
function scanReports(root: string, register: (m: string, a: string, ref: SurfaceReference) => void) {
  const files = walk(join(root, 'src/pages/reports'), ['.ts', '.tsx']);
  for (const file of files) {
    const text = readOr(file);
    // Every report page implicitly consumes report_management.view.
    register('report_management', 'view', {
      file: relTo(root, file),
      line: 1,
      detail: 'implicit — file under src/pages/reports',
    });
    // Explicit gate markers, if any.
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

/**
 * Determine what the SQL statement enclosing `pos` is: an RLS policy on
 * storage.objects (storage), an RLS policy on any other table (rls), or a
 * function body (rpc).
 */
function classifySqlContext(text: string, pos: number): SqlContext {
  const before = text.slice(Math.max(0, pos - 2000), pos);
  // Walk backwards for the nearest CREATE POLICY / CREATE FUNCTION.
  const lastPolicy = before.lastIndexOf('CREATE POLICY');
  const lastFn = Math.max(
    before.lastIndexOf('CREATE FUNCTION'),
    before.lastIndexOf('CREATE OR REPLACE FUNCTION'),
  );
  if (lastPolicy > lastFn) {
    // Look forward from `CREATE POLICY` for the ON clause.
    const onIdx = before.indexOf(' ON ', lastPolicy);
    const on = onIdx >= 0 ? before.slice(onIdx, onIdx + 60) : '';
    if (/storage\.objects/i.test(on)) {
      return { kind: 'storage', detail: 'storage.objects policy' };
    }
    return { kind: 'rls', detail: 'RLS policy' };
  }
  return { kind: 'rpc', detail: 'function body' };
}

function scanSql(root: string, register: (m: string, a: string, ref: SurfaceReference) => void) {
  const files = walk(join(root, 'supabase/migrations'), ['.sql']);
  const re = /has_permission\s*\(\s*[^,]+,\s*'([a-z0-9_]+)'\s*,\s*'([a-z0-9_]+)'\s*\)/gi;
  for (const file of files) {
    const text = readOr(file);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const ctx = classifySqlContext(text, m.index);
      const ref: SurfaceReference = {
        file: relTo(root, file),
        line: lineOf(text, m.index),
        detail: ctx.detail,
      };
      // Send to the right surface bucket.
      const module = m[1];
      const action = m[2];
      // Register under the semantic surface. Callers merge into a matrix
      // keyed by (module, action, surface); nothing else to do here.
      // We stash the surface on `detail` — the register callback below
      // dispatches by SurfaceKey using this helper:
      registerSurface(register, ctx.kind, module, action, ref);
    }
  }
}

function registerSurface(
  register: (m: string, a: string, ref: SurfaceReference) => void,
  _kind: SurfaceKey,
  m: string,
  a: string,
  ref: SurfaceReference,
) {
  // The outer register variant used by scanSql needs to remember the surface;
  // we return through a wrapper set up in build().
  (register as unknown as (
    m: string,
    a: string,
    ref: SurfaceReference,
    kind: SurfaceKey,
  ) => void)(m, a, ref, _kind);
}

function relTo(root: string, file: string): string {
  const rr = resolve(root);
  const ff = resolve(file);
  if (ff.startsWith(rr + '/')) return ff.slice(rr.length + 1);
  return file;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CatalogEntry {
  module: string;
  name: string;
  enforced: boolean;
}

export function buildCoverage(
  projectRoot: string,
  catalog: readonly CatalogEntry[],
): CoverageMatrix {
  // Initialise one row per catalogued permission.
  const rows = new Map<string, CoverageRow>();
  const key = (m: string, a: string) => `${m}.${a}`;
  const emptyRow = (module: string, action: string): CoverageRow => ({
    module,
    action,
    menu: [],
    route: [],
    button: [],
    rls: [],
    rpc: [],
    storage: [],
    report: [],
    orphaned: true,
  });
  for (const c of catalog) {
    rows.set(key(c.module, c.name), emptyRow(c.module, c.name));
  }

  const register = (
    m: string,
    a: string,
    ref: SurfaceReference,
    kind: SurfaceKey = 'button',
  ) => {
    const k = key(m, a);
    let row = rows.get(k);
    if (!row) {
      row = emptyRow(m, a);
      rows.set(k, row);
    }
    row[kind].push(ref);
    row.orphaned = false;
  };

  // Frontend surfaces know their kind statically.
  const regKind =
    (kind: SurfaceKey) => (m: string, a: string, ref: SurfaceReference) =>
      register(m, a, ref, kind);

  scanMenu(projectRoot, regKind('menu'));
  scanRoutes(projectRoot, regKind('route'));
  scanButtons(projectRoot, regKind('button'));
  scanReports(projectRoot, regKind('report'));

  // SQL scanner determines its own kind (rls/rpc/storage) and calls the
  // 4-arg register directly.
  scanSql(projectRoot, register as unknown as (
    m: string,
    a: string,
    ref: SurfaceReference,
  ) => void);

  // Recompute orphaned flag after all scans.
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

/** Classify a row's coverage state for UI badges. */
export function classifyCoverage(
  row: Pick<CoverageRow, 'menu' | 'route' | 'button' | 'rls' | 'rpc' | 'storage' | 'report' | 'orphaned'>,
): 'orphaned' | 'ui-only' | 'backend-only' | 'enforced' {
  if (row.orphaned) return 'orphaned';
  const hasBackend = row.rls.length + row.rpc.length + row.storage.length > 0;
  const hasUi = row.menu.length + row.route.length + row.button.length + row.report.length > 0;
  if (hasBackend && hasUi) return 'enforced';
  if (hasBackend) return 'backend-only';
  return 'ui-only';
}
