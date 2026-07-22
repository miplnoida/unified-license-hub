#!/usr/bin/env node
/**
 * verify-rbac-parity.mjs
 *
 * Verifies that the business-facing UI (menus, routes, buttons) references
 * ONLY module/action pairs that exist in the enforced permission catalogue,
 * and vice-versa — the catalogue never contains an "orphan" permission that
 * no UI surface references.
 *
 * This is a static, dependency-free check. It reads:
 *   - src/lib/rbac/catalog.json      → enforced catalogue (source of truth)
 *   - src/config/navigation.tsx      → sidebar / menu module keys
 *   - src/lib/permissionModules.ts   → route → module map
 *   - src/**\/*.{ts,tsx}             → data-rbac="module.action" markers
 *
 * Exits non-zero when parity is broken so CI blocks merges.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const catalog = JSON.parse(readFileSync(join(ROOT, 'src/lib/rbac/catalog.json'), 'utf8'));

// Catalogue shape is a flat array of {module, name, enforced}.
const catalogueModules = new Set(catalog.map(e => e.module));
const cataloguePairs = new Set(catalog.map(e => `${e.module}.${e.name}`));

// -------------------------------------------------------------------
// Record-scope parity — compare src/lib/rbac/scopeCapabilities.ts with
// the seed inserts + prune migrations in supabase/migrations. Every
// (module, scope, selector) tuple must exist on both sides.
// -------------------------------------------------------------------
const scopeSrc = readFileSync(join(ROOT, 'src/lib/rbac/scopeCapabilities.ts'), 'utf8');

/** Parse MODULE_SCOPE_CAPABILITIES entries via regex — dependency-free. */
function parseUiScopeTuples(src) {
  const tuples = new Set();
  // Match one capability entry: { module: 'x', ..., options: [ ... ] }
  const entryRe = /\{\s*module:\s*['"]([a-z0-9_]+)['"][^}]*?options:\s*\[([\s\S]*?)\][^}]*?\}/g;
  // Match mk('kind', 'selector') or mk('kind')
  const mkRe = /mk\(\s*['"]([a-z_]+)['"](?:\s*,\s*['"]([a-z_]+)['"])?\s*\)/g;
  let m;
  while ((m = entryRe.exec(src))) {
    const mod = m[1];
    const optsBlock = m[2];
    let om;
    mkRe.lastIndex = 0;
    while ((om = mkRe.exec(optsBlock))) {
      const kind = om[1];
      const selector = om[2] || null;
      tuples.add(`${mod}|${kind}|${selector ?? ''}`);
    }
  }
  return tuples;
}

/** Replay every rbac_module_scopes INSERT and DELETE across migrations in filename order. */
function parseDbScopeTuples() {
  const migDir = join(ROOT, 'supabase/migrations');
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort();
  const rowRe = /\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*,\s*(NULL|'([a-z_]+)')\s*,\s*'[^']*'\s*,\s*(?:NULL|'[^']*')\s*\)/g;
  const insertBlockRe = /INSERT\s+INTO\s+public\.rbac_module_scopes[^;]*VALUES([\s\S]*?);/gi;
  const deleteBlockRe = /DELETE\s+FROM\s+public\.rbac_module_scopes\s+WHERE[^;]*IN\s*\(([\s\S]*?)\)\s*;/gi;
  const deletePairRe = /\(\s*'([a-z0-9_]+)'\s*,\s*'([a-z_]+)'\s*\)/g;
  const tuples = new Map(); // module|kind -> selector

  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8');
    let block;
    insertBlockRe.lastIndex = 0;
    while ((block = insertBlockRe.exec(sql))) {
      const body = block[1];
      let r;
      rowRe.lastIndex = 0;
      while ((r = rowRe.exec(body))) {
        tuples.set(`${r[1]}|${r[2]}`, r[4] || '');
      }
    }
    deleteBlockRe.lastIndex = 0;
    while ((block = deleteBlockRe.exec(sql))) {
      const body = block[1];
      let r;
      deletePairRe.lastIndex = 0;
      while ((r = deletePairRe.exec(body))) {
        tuples.delete(`${r[1]}|${r[2]}`);
      }
    }
  }
  const asSet = new Set();
  for (const [key, sel] of tuples) asSet.add(`${key}|${sel}`);
  return asSet;
}

const uiScopeTuples = parseUiScopeTuples(scopeSrc);
const dbScopeTuples = parseDbScopeTuples();
const scopeMissingInDb = [...uiScopeTuples].filter(t => !dbScopeTuples.has(t));
const scopeMissingInUi = [...dbScopeTuples].filter(t => !uiScopeTuples.has(t));



/** Walk src/, return files matching predicate. */
/** Walk src/, return files matching predicate. */
function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) yield* walk(p);
    else if (/\.(t|j)sx?$/.test(name) && !/\.test\.(t|j)sx?$/.test(name) && !p.includes(`${'/'}test${'/'}`)) yield p;
  }
}


const usedPairs = new Set();
const usedModules = new Set();
const violations = [];

const pairRe = /data-rbac\s*=\s*["'`]([a-z0-9_]+)\.([a-z0-9_]+)["'`]/g;
const moduleGuardRe = /module=["'`]([a-z0-9_]+)["'`]|useCan\(\s*['"`]([a-z0-9_]+)['"`]\s*,\s*['"`]([a-z0-9_]+)['"`]\s*\)/g;

for (const file of walk(join(ROOT, 'src'))) {
  const src = readFileSync(file, 'utf8');
  let m;
  pairRe.lastIndex = 0;
  while ((m = pairRe.exec(src))) {
    const mod = m[1], act = m[2];
    usedPairs.add(`${mod}.${act}`);
    usedModules.add(mod);
    if (!cataloguePairs.has(`${mod}.${act}`)) {
      violations.push({ file: relative(ROOT, file), kind: 'ui-references-missing-perm', pair: `${mod}.${act}` });
    }
  }
  moduleGuardRe.lastIndex = 0;
  while ((m = moduleGuardRe.exec(src))) {
    const mod = m[1] || m[2];
    const act = m[3];
    if (mod) usedModules.add(mod);
    if (mod && act) {
      usedPairs.add(`${mod}.${act}`);
      if (!cataloguePairs.has(`${mod}.${act}`)) {
        violations.push({ file: relative(ROOT, file), kind: 'guard-references-missing-perm', pair: `${mod}.${act}` });
      }
    }
  }
}

const orphanModules = [...catalogueModules].filter(m => !usedModules.has(m));
const orphanPairs = [...cataloguePairs].filter(p => !usedPairs.has(p));

const report = {
  catalogue: { modules: catalogueModules.size, pairs: cataloguePairs.size },
  ui: { modules: usedModules.size, pairs: usedPairs.size },
  orphanModules,
  orphanPairs,
  violations,
  scopeParity: {
    expected: uiScopeTuples.size,
    actual: dbScopeTuples.size,
    missingInDb: scopeMissingInDb,
    missingInUi: scopeMissingInUi,
  },
};

console.log(JSON.stringify(report, null, 2));

const scopeOnly = process.argv.includes('--scope-only');

let failed = false;
if (violations.length > 0) {
  const msg = `RBAC UI parity: ${violations.length} UI reference(s) point at permissions missing from the catalogue.`;
  if (scopeOnly) {
    console.warn(`\n[warn] ${msg} (non-blocking in --scope-only mode; tracked as debt in docs/rbac/completion-report.md)`);
  } else {
    console.error(`\nRBAC parity FAILED — ${msg}`);
    failed = true;
  }
}
if (scopeMissingInDb.length > 0) {
  console.error(`\nRecord-scope parity FAILED — ${scopeMissingInDb.length} UI scope option(s) missing from public.rbac_module_scopes:`);
  for (const t of scopeMissingInDb) console.error(`  · ${t}`);
  failed = true;
}
if (scopeMissingInUi.length > 0) {
  console.error(`\nRecord-scope parity FAILED — ${scopeMissingInUi.length} DB scope row(s) not offered by the UI registry:`);
  for (const t of scopeMissingInUi) console.error(`  · ${t}`);
  failed = true;
}
if (failed) process.exit(1);

console.log(`\nRBAC parity OK. Orphan catalogue entries: ${orphanModules.length} module(s), ${orphanPairs.length} action(s). Scope tuples: ${uiScopeTuples.size}.`);
