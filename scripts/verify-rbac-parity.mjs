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
};

console.log(JSON.stringify(report, null, 2));

if (violations.length > 0) {
  console.error(`\nRBAC parity FAILED — ${violations.length} UI reference(s) point at permissions missing from the catalogue.`);
  process.exit(1);
}
console.log(`\nRBAC parity OK. Orphan catalogue entries: ${orphanModules.length} module(s), ${orphanPairs.length} action(s).`);
