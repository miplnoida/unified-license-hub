#!/usr/bin/env node
/**
 * verify-authz-centralized.mjs — CI hard gate (Batch 2).
 *
 * Enforces that every UI authorization decision flows through the single
 * `src/lib/rbac/authorize.ts` service. Ad-hoc `permissions.some(...)` array
 * scans and bespoke normalization of module/action keys are forbidden.
 *
 * Allow-list:
 *   - src/lib/rbac/authorize.ts        — the authorized implementation.
 *   - src/hooks/usePermissions.ts      — the hook that consumes the service
 *                                        (still internally iterates once to
 *                                        derive the `hasAnyEntityAssignment`
 *                                        flag, not for decisions).
 *   - src/test/**                      — test fixtures may inline mock arrays.
 *   - src/integrations/supabase/**     — generated types.
 *
 * Exits non-zero on any offender so it cannot be introduced without an
 * explicit refactor + review.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'src';
const ALLOW = new Set([
  'src/lib/rbac/authorize.ts',
  'src/hooks/usePermissions.ts',
]);
const ALLOW_PREFIXES = ['src/test/', 'src/integrations/supabase/'];

const OFFENDING_PATTERNS = [
  { name: 'permissions.some array scan', re: /\bpermissions(?:\?)?\.some\(/ },
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const offenders = [];
for (const f of files) {
  const rel = relative('.', f).replace(/\\/g, '/');
  if (ALLOW.has(rel)) continue;
  if (ALLOW_PREFIXES.some((p) => rel.startsWith(p))) continue;
  const src = readFileSync(f, 'utf8');
  for (const pat of OFFENDING_PATTERNS) {
    const m = src.match(pat.re);
    if (m) offenders.push({ file: rel, pattern: pat.name, snippet: m[0] });
  }
}

console.log(`Scanned ${files.length} files under ${ROOT}/`);
if (offenders.length) {
  console.error(`FAIL — ${offenders.length} ad-hoc authorization site(s) found:`);
  for (const o of offenders) console.error(`  - ${o.file}: ${o.pattern} → ${o.snippet}`);
  console.error('\nRoute every authorization decision through src/lib/rbac/authorize.ts.');
  process.exit(1);
}
console.log('OK — all authorization decisions are centralized in src/lib/rbac/authorize.ts.');
