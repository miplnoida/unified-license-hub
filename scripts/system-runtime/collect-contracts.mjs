#!/usr/bin/env node
/**
 * System Screen/Schema/RPC Runtime Integrity Gate — static collector.
 *
 * Phase 1: route census from src/routes/*.tsx + src/App.tsx.
 * Phase 2: repository-wide runtime data-contract census
 *          (.from / .rpc / .schema / storage / functions.invoke / realtime).
 * Phase 2b: attribution of every dependency to the production routes that can
 *          reach it, by transitively walking the module import graph from each
 *          route's lazily-loaded page component.
 *
 * Emits scripts/system-runtime/contract-inventory.json (git-tracked evidence)
 * and prints a summary. Pure static analysis — no DB access, no assumptions
 * from generated Supabase types.
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const SRC = 'src';
const OUT = 'scripts/system-runtime/contract-inventory.json';

// ---------------------------------------------------------------- file walk
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const files = walk(SRC);
const srcOf = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));

// ------------------------------------------------------- import resolution
function resolveImport(fromFile, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // package
  base = relative('.', base).replace(/\\/g, '/');
  const cands = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  for (const c of cands) if (srcOf.has(c)) return c;
  return null;
}
const IMPORT_RE = /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
const importsOf = new Map();
for (const [f, s] of srcOf) {
  const set = new Set();
  for (const m of s.matchAll(IMPORT_RE)) {
    const spec = m[1] || m[2];
    const r = resolveImport(f, spec);
    if (r) set.add(r);
  }
  importsOf.set(f, [...set]);
}
function closure(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (!f || seen.has(f)) continue;
    seen.add(f);
    for (const d of importsOf.get(f) || []) if (!seen.has(d)) stack.push(d);
  }
  return seen;
}

// -------------------------------------------------------- Phase 1: routes
const ROUTE_FILES = [
  'src/App.tsx',
  ...readdirSync('src/routes').filter((f) => f.endsWith('.tsx')).map((f) => `src/routes/${f}`),
];

/** lazyWithRetry(() => import('@/pages/X')) / lazy(...) component -> file */
function lazyMap(text, file) {
  const map = new Map();
  const re = /const\s+(\w+)\s*=\s*(?:lazyWithRetry|lazy|React\.lazy)\(\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re)) {
    const r = resolveImport(file, m[2]);
    if (r) map.set(m[1], r);
  }
  // direct imports too
  const re2 = /import\s+(?:\{([^}]*)\}|(\w+))\s+from\s*['"]([^'"]+)['"]/g;
  for (const m of text.matchAll(re2)) {
    const r = resolveImport(file, m[3]);
    if (!r) continue;
    if (m[2]) map.set(m[2], r);
    if (m[1]) for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) map.set(name, r);
    }
  }
  return map;
}

const DEV_HINTS = [/\/dev(\/|$)/, /diagnostic/i, /sandbox/i, /playground/i, /__/];

const routes = [];
for (const rf of ROUTE_FILES) {
  const text = srcOf.get(rf);
  if (!text) continue;
  const comps = lazyMap(text, rf);
  // Chunk-based extraction: each `<Route` starts a chunk that ends at the next
  // `<Route`. This tolerates `element={<Guard><Page /></Guard>}` (which contains
  // `>` characters) and nested route trees, which a `[^>]*` regex cannot parse.
  const chunks = text.split(/<Route\b/).slice(1);
  for (const raw of chunks) {
    const chunk = raw.slice(0, 4000);
    const pathM = chunk.match(/^\s*path=\{?["'`]([^"'`]+)["'`]/);
    const idxM = /^\s*index\b/.test(chunk);
    if (!pathM && !idxM) continue;
    const elemComps = [...chunk.matchAll(/<([A-Z]\w+)/g)].map((x) => x[1]);
    const guards = elemComps.filter((c) => /Route$|Guard|Gate$/.test(c));
    const page = elemComps.find((c) => comps.has(c) && !/Route$|Guard|Gate$|Provider|Layout$/.test(c));
    // A route element may be a component declared locally in the route file
    // itself (e.g. an audience switch). Its data dependencies then live in that
    // route file, so attribute it there rather than leaving it unresolved.
    let compFile = page ? comps.get(page) : null;
    const localComp = elemComps.find((c) => new RegExp(`(?:function|const)\\s+${c}\\b`).test(text));
    if (!compFile && localComp) compFile = rf;
    routes.push({
      file: rf,
      path: pathM ? pathM[1] : '(index)',
      component: page || localComp || elemComps[elemComps.length - 1] || null,
      componentFile: compFile,
      guards: [...new Set(guards)],
      permission: (chunk.match(/module=["'](\w+)["']/) || [])[1] || null,
      action: (chunk.match(/action=["'](\w+)["']/) || [])[1] || null,
      portalArea: (chunk.match(/area=["'](\w+)["']/) || [])[1] || null,
      redirectOnly: /element=\{<Navigate/.test(chunk) || /Redirect$/.test(page || ''),
      devOnly: DEV_HINTS.some((r) => r.test(pathM ? pathM[1] : '') || r.test(compFile || '')),
    });
  }
}

// stable IDs
routes.sort((a, b) => (a.file + a.path).localeCompare(b.file + b.path));
routes.forEach((r, i) => { r.id = `R-${String(i + 1).padStart(3, '0')}`; });

// ------------------------------------------- Phase 2: dependency extraction
const PATTERNS = [
  { type: 'TABLE_OR_VIEW', re: /\.from\(\s*['"`]([A-Za-z0-9_.]+)['"`]/g },
  { type: 'RPC', re: /\.rpc\(\s*['"`]([A-Za-z0-9_]+)['"`]/g },
  { type: 'SCHEMA', re: /\.schema\(\s*['"`]([A-Za-z0-9_]+)['"`]/g },
  { type: 'STORAGE_BUCKET', re: /storage\s*\n?\s*\.from\(\s*['"`]([A-Za-z0-9_.-]+)['"`]/g },
  { type: 'EDGE_FUNCTION', re: /functions\.invoke\(\s*['"`]([A-Za-z0-9_-]+)['"`]/g },
  { type: 'EDGE_FUNCTION', re: /invokeFn(?:<[^>]*>)?\(\s*['"`]([A-Za-z0-9_-]+)['"`]/g },
  // Realtime sources are only the `table:` keys inside a postgres_changes
  // subscription payload — a bare `table:` key anywhere else is unrelated.
  { type: 'REALTIME_SOURCE', re: /postgres_changes['"`]\s*,\s*\{[\s\S]{0,300}?table:\s*['"`]([A-Za-z0-9_]+)['"`]/g },

];
const DYNAMIC = [
  // `Array.from(...)` / `Object.from(...)` are not query builders.
  { re: /(?<!Array|Object|Set|Map|String|Buffer)\.from\(\s*([A-Za-z_$][\w.$]*)\s*(?:as[^)]*)?\)/g, kind: 'DYNAMIC_FROM' },
  { re: /\.rpc\(\s*([A-Za-z_$][\w.$]*)\s*(?:as[^)]*)?[,)]/g, kind: 'DYNAMIC_RPC' },
];

const deps = new Map(); // key type|name -> {refs:Set<file>, mutations:Set}
function add(type, name, file, mutation) {
  const k = `${type}|${name}`;
  if (!deps.has(k)) deps.set(k, { type, name, refs: new Set(), mutation: new Set() });
  const d = deps.get(k);
  d.refs.add(file);
  if (mutation) d.mutation.add(mutation);
}
const dynamicRefs = [];
const IGNORE_FILE = (f) => f.startsWith('src/test/') || f === 'src/integrations/supabase/types.ts';

for (const [f, s] of srcOf) {
  if (IGNORE_FILE(f)) continue;
  for (const p of PATTERNS) {
    for (const m of s.matchAll(new RegExp(p.re.source, 'g'))) {
      const name = m[1];
      if (p.type === 'TABLE_OR_VIEW') {
        // storage.from handled separately; skip if preceded by `storage`
        const pre = s.slice(Math.max(0, m.index - 40), m.index);
        if (/storage\s*$/.test(pre) || /storage\s*\n?\s*$/.test(pre)) continue;
        const after = s.slice(m.index, m.index + 600);
        let mut = 'READ';
        if (/\.insert\(/.test(after)) mut = 'INSERT';
        else if (/\.upsert\(/.test(after)) mut = 'UPSERT';
        else if (/\.update\(/.test(after)) mut = 'UPDATE';
        else if (/\.delete\(/.test(after)) mut = 'DELETE';
        add(p.type, name, f, mut);
      } else add(p.type, name, f, null);
    }
  }
  for (const d of DYNAMIC) {
    for (const m of s.matchAll(new RegExp(d.re.source, 'g'))) {
      if (/^(supabase|client|db|this)$/.test(m[1])) continue;
      dynamicRefs.push({ file: f, kind: d.kind, expr: m[1] });
    }
  }
}

// ------------------------------------ Phase 2b: attribute deps -> routes
const routeClosure = new Map();
for (const r of routes) {
  if (!r.componentFile) { routeClosure.set(r.id, new Set()); continue; }
  routeClosure.set(r.id, closure(r.componentFile));
}
const depList = [...deps.values()].map((d) => {
  const rs = [];
  for (const r of routes) {
    const cl = routeClosure.get(r.id);
    if (!cl || cl.size === 0) continue;
    if ([...d.refs].some((f) => cl.has(f))) rs.push(r.id);
  }
  return {
    object: d.name,
    type: d.type,
    schema: d.name.includes('.') ? d.name.split('.')[0] : 'public',
    referencedBy: [...d.refs].sort(),
    routes: rs,
    mutation: [...d.mutation].sort(),
    reachableFromProductionRoute: rs.some((id) => {
      const r = routes.find((x) => x.id === id);
      return r && !r.devOnly;
    }),
  };
});
depList.sort((a, b) => (a.type + a.object).localeCompare(b.type + b.object));

const inventory = {
  generatedAt: new Date().toISOString(),
  routes,
  dependencies: depList,
  dynamicRefs,
  counts: {
    routes: routes.length,
    productionRoutes: routes.filter((r) => !r.devOnly).length,
    devRoutes: routes.filter((r) => r.devOnly).length,
    redirectRoutes: routes.filter((r) => r.redirectOnly).length,
    tables: depList.filter((d) => d.type === 'TABLE_OR_VIEW').length,
    rpcs: depList.filter((d) => d.type === 'RPC').length,
    buckets: depList.filter((d) => d.type === 'STORAGE_BUCKET').length,
    edgeFunctions: depList.filter((d) => d.type === 'EDGE_FUNCTION').length,
    realtime: depList.filter((d) => d.type === 'REALTIME_SOURCE').length,
    schemas: [...new Set(depList.map((d) => d.schema))].length,
    dynamicRefs: dynamicRefs.length,
  },
};
writeFileSync(OUT, JSON.stringify(inventory, null, 2));
console.log(JSON.stringify(inventory.counts, null, 2));
console.log(`\nwrote ${OUT}`);
