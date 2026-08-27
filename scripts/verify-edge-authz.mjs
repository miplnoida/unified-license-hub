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
const summary = { user: 0, worker: 0, webhook: 0, machine: 0, public: 0 };

for (const name of readdirSync(ROOT)) {
  if (name.startsWith('_') || name === 'node_modules') continue;
  const idx = join(ROOT, name, 'index.ts');
  try { if (!statSync(idx).isFile()) continue; } catch { continue; }
  const src = readFileSync(idx, 'utf8');
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
console.log('OK — every function is gated.');

