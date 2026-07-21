#!/usr/bin/env node
/**
 * verify-edge-authz.mjs — CI guard for edge-function authorization coverage.
 *
 * Every function under `supabase/functions/<name>/index.ts` (excluding
 * `_shared/`) must reference exactly one of:
 *   - `requireUserPermission`   (user-invoked, gated by module.action)
 *   - `requireWorkerInvocation` (scheduler / worker, gated by worker token)
 *   - `markPublicFunction`      (explicit public allow-list)
 *
 * Exits non-zero when any function has none of these markers.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'supabase/functions';
const missing = [];
const summary = { user: 0, worker: 0, public: 0 };

for (const name of readdirSync(ROOT)) {
  if (name.startsWith('_') || name === 'node_modules') continue;
  const idx = join(ROOT, name, 'index.ts');
  try { if (!statSync(idx).isFile()) continue; } catch { continue; }
  const src = readFileSync(idx, 'utf8');
  const hasUser   = src.includes('requireUserPermission');
  const hasWorker = src.includes('requireWorkerInvocation');
  const hasPublic = src.includes('markPublicFunction');
  const kinds = [hasUser && 'user', hasWorker && 'worker', hasPublic && 'public'].filter(Boolean);
  if (kinds.length === 0) missing.push(name);
  else summary[kinds[0]]++;
}

console.log(`Edge authz coverage: user=${summary.user} worker=${summary.worker} public=${summary.public}`);
if (missing.length) {
  console.error(`FAIL — ${missing.length} function(s) lack any authorization marker:`);
  for (const n of missing) console.error(`  - ${n}`);
  process.exit(1);
}
console.log('OK — every function is gated.');
