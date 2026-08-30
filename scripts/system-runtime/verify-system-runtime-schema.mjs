#!/usr/bin/env node
/**
 * verify-system-runtime-schema.mjs — SYSTEM SCREEN / SCHEMA / RPC RUNTIME
 * INTEGRITY GATE (Phase 10).
 *
 * One reusable, hard CI gate that proves every reachable production screen has
 * a valid runtime backend contract. It runs the three censuses in order and
 * fails on any defect:
 *
 *   1. collect-contracts.mjs  — static route + data-dependency inventory
 *                               (from/rpc/schema/storage/edge/realtime and the
 *                               dynamic references that need human attribution)
 *   2. live-census.mjs        — every referenced relation, routine, bucket and
 *                               realtime source verified against the LIVE
 *                               catalog, including RPC argument signatures
 *   3. column-census.mjs      — every referenced COLUMN, PostgREST embed and
 *                               write payload key verified against the live
 *                               catalog, plus configuration-stored table names
 *                               (public.report_sources.table_name)
 *
 * Deferred dependencies must be declared explicitly, per object, in
 * scripts/system-runtime/deferred-dependencies.json. Wildcards are rejected.
 *
 * Usage: npm run verify:system-runtime-schema
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const DIR = 'scripts/system-runtime';
const DEFERRED_FILE = `${DIR}/deferred-dependencies.json`;

function run(script) {
  process.stdout.write(`\n[gate] ${script}\n`);
  execFileSync('node', [`${DIR}/${script}`], { stdio: 'inherit' });
}

if (!process.env.PGHOST) {
  console.error('[verify:system-runtime-schema] PGHOST is not set — the live census needs database access.');
  process.exit(2);
}

// ------------------------------------------------------------ deferred list
const deferred = JSON.parse(readFileSync(DEFERRED_FILE, 'utf8')).deferred ?? [];
const deferredKeys = new Set();
for (const d of deferred) {
  for (const field of ['object', 'type', 'module', 'reason', 'fallback']) {
    if (!d[field] || String(d[field]).trim().length < 3) {
      console.error(`FAIL — deferred entry is incomplete (missing ${field}): ${JSON.stringify(d)}`);
      process.exit(1);
    }
  }
  if (/[*%?]/.test(d.object)) {
    console.error(`FAIL — deferred entry uses a wildcard, which is not allowed: ${d.object}`);
    process.exit(1);
  }
  if (!Array.isArray(d.routes) || d.routes.length === 0) {
    console.error(`FAIL — deferred entry names no route: ${d.object}`);
    process.exit(1);
  }
  deferredKeys.add(`${d.type}:${d.object}`);
}

run('collect-contracts.mjs');
run('live-census.mjs');
run('column-census.mjs');

// ------------------------------------------------------------ verdict
const inv = JSON.parse(readFileSync(`${DIR}/contract-inventory.json`, 'utf8'));
const live = JSON.parse(readFileSync(`${DIR}/live-census.json`, 'utf8'));
const colf = JSON.parse(readFileSync(`${DIR}/column-census.json`, 'utf8'));

const failures = [];
for (const r of live.results) {
  if (r.status === 'VALID') continue;
  if (deferredKeys.has(`${r.type}:${r.object}`)) continue;
  failures.push(`${r.status} ${r.type} ${r.object} (routes: ${r.routes.slice(0, 3).join(', ') || 'unattributed'}) ${r.detail || ''}`);
}
for (const f of colf.findings) {
  if (deferredKeys.has(`COLUMN:${f.table}.${f.name}`)) continue;
  failures.push(`${f.kind} ${f.table}.${f.name} (${f.context || 'embed'}) ${f.file}`);
}

// Route dependency registry must stay complete: every production route with a
// component file must resolve its component, otherwise the census is blind.
const unresolved = inv.routes.filter((r) => r.component && !r.componentFile && !r.redirectOnly && !r.devOnly);
for (const r of unresolved) failures.push(`ROUTE_COMPONENT_UNRESOLVED ${r.path} -> ${r.component}`);

console.log('\n──────── SYSTEM RUNTIME SCHEMA GATE ────────');
console.log(`routes (production):     ${inv.counts.productionRoutes}`);
console.log(`data dependencies:       ${live.results.length}`);
console.log(`live relations/routines: ${live.liveCounts.relations} / ${live.liveCounts.routines}`);
console.log(`dynamic references:      ${inv.counts.dynamicRefs} (constant/parameterised — resolved by callers)`);
console.log(`declared deferred:       ${deferred.length}`);
console.log(`defects:                 ${failures.length}`);
if (failures.length) {
  console.error('\nFAIL — runtime contract defects:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('PASS — every referenced table, view, column, embed, RPC signature, storage bucket and realtime source exists live.');
