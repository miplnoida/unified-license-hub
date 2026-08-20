#!/usr/bin/env node
/**
 * Breadcrumb coverage guard.
 *
 * Every route declared in `src/routes/*.tsx` must resolve a breadcrumb trail
 * from EITHER the navigation snapshot (sec_navigation_items) OR the
 * breadcrumb route registry. Uncovered routes would fall back to humanised URL
 * segments, which is how UUIDs and cryptic slugs leak into the UI.
 *
 * Usage: node scripts/verify-breadcrumb-coverage.mjs [--report]
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const ROUTE_DIR = path.join(ROOT, 'src/routes');

/** Routes intentionally excluded (wildcards, pure redirects, tokens). */
const EXCLUDED = new Set(['*', '/reports/*']);

function readRoutePaths() {
  const paths = new Set();
  for (const file of fs.readdirSync(ROUTE_DIR).filter((f) => f.endsWith('.tsx'))) {
    const src = fs.readFileSync(path.join(ROUTE_DIR, file), 'utf8');
    for (const m of src.matchAll(/path="([^"]+)"/g)) paths.add(m[1]);
  }
  return [...paths].filter((p) => !EXCLUDED.has(p)).sort();
}

function extract(file, regex) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return [...src.matchAll(regex)].map((m) => m[1]);
}

const registryPatterns = extract(
  'src/lib/breadcrumbs/breadcrumbRouteRegistry.ts',
  /pattern:\s*'([^']+)'/g,
);
const navHrefs = extract('src/lib/breadcrumbs/navigationSnapshot.ts', /href:\s*"([^"]+)"/g);

const norm = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
const paramShape = (p) =>
  norm(p)
    .split('/')
    .map((s) => (s.startsWith(':') ? ':' : s.toLowerCase()))
    .join('/');

const covered = new Set([...registryPatterns, ...navHrefs].map(paramShape));

const routes = readRoutePaths();
const missing = routes.filter((r) => !covered.has(paramShape(r)));

const orphanRules = registryPatterns.filter((p) => !routes.some((r) => paramShape(r) === paramShape(p)));

console.log(`Routes checked:      ${routes.length}`);
console.log(`Registry rules:      ${registryPatterns.length}`);
console.log(`Navigation hrefs:    ${navHrefs.length}`);
console.log(`Covered:             ${routes.length - missing.length}`);
console.log(`Uncovered:           ${missing.length}`);
if (orphanRules.length) {
  console.log(`\nRegistry rules with no matching route (stale?):`);
  orphanRules.forEach((p) => console.log(`  - ${p}`));
}
if (missing.length) {
  console.log(`\nRoutes without a breadcrumb source:`);
  missing.forEach((p) => console.log(`  - ${p}`));
  process.exit(1);
}
console.log('\nAll routes have a breadcrumb source.');
