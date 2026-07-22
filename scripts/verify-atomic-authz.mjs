#!/usr/bin/env node
/**
 * verify-atomic-authz — Detect suspicious check-then-mutate patterns in the
 * frontend where a call to authorizedAction() / authorizedExport() is
 * immediately followed by a client-side supabase mutation or a direct
 * functions.invoke() without going through a backend-atomic RPC.
 *
 * A hit is flagged unless the surrounding function/file appears in the
 * allowlist (scripts/atomic-authz-allowlist.json), each entry of which must
 * carry a `reason` explaining why the follow-up mutation is already
 * backend-protected (RLS + has_permission or a dedicated SECURITY DEFINER
 * RPC that re-checks the permission).
 *
 * Exit code:
 *   0  no unallowlisted hits
 *   1  one or more unexplained check-then-mutate patterns
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const ALLOWLIST_PATH = join(ROOT, "scripts", "atomic-authz-allowlist.json");

const allowlist = existsSync(ALLOWLIST_PATH)
  ? JSON.parse(readFileSync(ALLOWLIST_PATH, "utf8"))
  : { entries: [] };

const AUTHZ_CALLS = /authorized(?:Action|Export)\s*\(/;
// mutation shapes we look for within N lines of an authorized* call
const MUTATION = /\.(?:insert|update|delete|upsert)\s*\(|supabase\.functions\.invoke\s*\(/;
const WINDOW = 25;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function isAllowlisted(relPath, line) {
  return allowlist.entries.some(
    (e) => relPath === e.path && (!e.line || Math.abs(line - e.line) <= 3),
  );
}

const hits = [];
for (const file of walk(SRC)) {
  const rel = relative(ROOT, file);
  // Skip the helpers themselves.
  if (/rbac\/authorized(Action|Export)\.ts$/.test(rel)) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!AUTHZ_CALLS.test(lines[i])) continue;
    for (let j = i + 1; j < Math.min(i + WINDOW, lines.length); j++) {
      if (MUTATION.test(lines[j])) {
        if (isAllowlisted(rel, i + 1)) break;
        hits.push({ file: rel, authzLine: i + 1, mutationLine: j + 1, snippet: lines[j].trim() });
        break;
      }
    }
  }
}

if (hits.length === 0) {
  console.log("verify-atomic-authz: OK (no unallowlisted check-then-mutate patterns).");
  process.exit(0);
}

console.error(`verify-atomic-authz: ${hits.length} suspicious pattern(s)\n`);
for (const h of hits) {
  console.error(`  ${h.file}:${h.authzLine} -> mutation at :${h.mutationLine}`);
  console.error(`    ${h.snippet}`);
}
console.error(`\nEither refactor to a single SECURITY DEFINER RPC that enforces the`);
console.error(`permission and performs the mutation atomically, or add an entry to`);
console.error(`scripts/atomic-authz-allowlist.json with a documented reason.`);
process.exit(1);
