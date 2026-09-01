#!/usr/bin/env node
/**
 * verify-edge-authz.mjs — CI guard for edge-function authorization coverage.
 *
 * Every function under `supabase/functions/<name>/index.ts` (excluding
 * `_shared/`) must reference at least one canonical authorization marker.
 * Each marker maps to a real runtime control — a marker is never a comment
 * or an annotation, it is the call that enforces the check:
 *
 *   user    requireUserPermission        JWT + has_permission(module, action)
 *           requireAuthenticatedUser     JWT only (record ACL enforced in-function)
 *   worker  requireWorkerInvocation      service-role bearer or x-worker-token
 *           requireWorkerInvocationAsync   "
 *           requireWorkerOrPrudentialUser  worker credential or prudential permission
 *   webhook requireSignedWebhook         HMAC-SHA256 over the raw body
 *   machine requireSandboxCredential     provider credential (connector runtime)
 *   public  markPublicFunction           explicit, reasoned public allow-list
 *
 * Exits non-zero when any function has none of these markers.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';
const CLASSES = {
  user: ['requireUserPermission', 'requireAuthenticatedUser'],
  worker: ['requireWorkerInvocation', 'requireWorkerInvocationAsync', 'requireWorkerOrPrudentialUser'],
  webhook: ['requireSignedWebhook'],
  machine: ['requireSandboxCredential'],
  public: ['markPublicFunction'],
};
const missing = [];
const malformed = [];
const summary = { user: 0, worker: 0, webhook: 0, machine: 0, public: 0 };

function findOptionsBlock(source) {
  const match = /if\s*\(\s*req\.method\s*===?\s*['"]OPTIONS['"]\s*\)\s*\{/.exec(source);
  if (!match) return null;

  const open = source.indexOf('{', match.index);
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let i = open; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) return source.slice(open, i + 1);
  }
  return null;
}

for (const name of readdirSync(ROOT)) {
  if (name.startsWith('_') || name === 'node_modules') continue;
  const idx = join(ROOT, name, 'index.ts');
  try { if (!statSync(idx).isFile()) continue; } catch { continue; }
  const src = readFileSync(idx, 'utf8');
  const optionsBlock = findOptionsBlock(src);
  if (optionsBlock) {
    const gateMarkers = Object.values(CLASSES).flat().filter((marker) => marker !== 'markPublicFunction');
    if (gateMarkers.some((marker) => optionsBlock.includes(`${marker}(`))) malformed.push(name);
  }
  const kinds = Object.entries(CLASSES)
    .filter(([, markers]) => markers.some((m) => src.includes(m)))
    .map(([kind]) => kind);
  if (kinds.length === 0) missing.push(name);
  else summary[kinds[0]]++;
}

console.log(
  `Edge authz coverage: user=${summary.user} worker=${summary.worker} ` +
  `webhook=${summary.webhook} machine=${summary.machine} public=${summary.public}`,
);
if (missing.length) {
  console.error(`FAIL — ${missing.length} function(s) lack any authorization marker:`);
  for (const n of missing) console.error(`  - ${n}`);
  process.exit(1);
}
if (malformed.length) {
  console.error(`FAIL — ${malformed.length} function(s) place an authorization gate inside OPTIONS:`);
  for (const n of malformed) console.error(`  - ${n}`);
  process.exit(1);
}
console.log('OK — every function is gated.');

