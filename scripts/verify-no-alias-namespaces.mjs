#!/usr/bin/env node
/**
 * verify-no-alias-namespaces.mjs — CI hard gate.
 *
 * Forbids the reintroduction of legacy permission-namespace aliases anywhere
 * in the repository. Canonical namespaces (chosen in Batch 1 of the final
 * RBAC closure) are:
 *
 *   admin           -> settings
 *   applications    -> application_management
 *   complaints      -> complaint_management
 *   inspections     -> inspection_management
 *   licenses        -> license_management
 *   notifications   -> notification_management
 *   prudential      -> prudential_supervision
 *   reporting       -> report_management
 *   supervision     -> prudential_supervision  (context-dependent; use the specific canonical)
 *   audit_logs      -> audit_management
 *
 * The check operates in two passes:
 *   1. `src/lib/rbac/catalog.json` — no entry may use an alias `module`.
 *   2. Source code — call-site literals like useCan('applications', ...)
 *      or data-rbac="prudential.view" are rejected. Table-name string
 *      literals (`.from('applications')`) are ignored by design because
 *      table names are not permission modules.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ALIASES = [
  'admin', 'applications', 'complaints', 'inspections', 'licenses',
  'notifications', 'prudential', 'reporting', 'supervision', 'audit_logs',
];
const ALIAS_SET = new Set(ALIASES);

const violations = [];

// -- 1. Catalog check ------------------------------------------------------
const catalog = JSON.parse(readFileSync('src/lib/rbac/catalog.json', 'utf8'));
for (const [i, entry] of catalog.entries()) {
  if (ALIAS_SET.has(entry.module)) {
    violations.push(`catalog.json[${i}]: module="${entry.module}" is a legacy alias (use canonical namespace).`);
  }
}

// -- 2. Call-site literal check -------------------------------------------
const CALLSITE_PATTERNS = ALIASES.map(a => ({
  alias: a,
  // useCan('alias', ...) / hasPermission('alias', ...) / requireUserPermission(req,'alias',...) / data-rbac="alias.action"
  re: new RegExp(
    String.raw`(?:useCan|hasPermission|requireUserPermission|has_permission)\([^)]*?['"\`]${a}['"\`]` +
    `|data-rbac=["']${a}\\.[a-z_]+["']`,
  ),
}));

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) { walk(p); continue; }
    if (!/\.(ts|tsx|js|mjs|sql)$/.test(name)) continue;
    // Don't scan this file itself, the catalog (checked above), or the completion report.
    if (p.endsWith('verify-no-alias-namespaces.mjs')) continue;
    if (p.endsWith('src/lib/rbac/catalog.json')) continue;
    const src = readFileSync(p, 'utf8');
    for (const { alias, re } of CALLSITE_PATTERNS) {
      const m = src.match(re);
      if (m) {
        const line = src.slice(0, m.index).split('\n').length;
        violations.push(`${p}:${line}: alias "${alias}" used in permission call-site — replace with canonical namespace.`);
      }
    }
  }
}
for (const root of ['src', 'supabase/functions', 'supabase/tests', 'scripts']) {
  try { if (statSync(root).isDirectory()) walk(root); } catch { /* ignore */ }
}

if (violations.length) {
  console.error(`FAIL — ${violations.length} legacy namespace alias violation(s):`);
  for (const v of violations) console.error('  - ' + v);
  process.exit(1);
}
console.log(`OK — no legacy namespace aliases found. Canonical namespaces enforced (${ALIASES.length} aliases blocked).`);
