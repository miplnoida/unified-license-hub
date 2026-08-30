#!/usr/bin/env node
/**
 * Final SR-16 census runner with run provenance (SR-26).
 *
 * Wraps the untouched route smoke harness so the resulting evidence can be tied
 * to the exact source state that produced it. The harness itself and its
 * artifact format are unchanged; provenance is written to a sidecar file:
 *   docs/certification/evidence-route-smoke-final-metadata.json
 *
 * Usage: node scripts/system-runtime/run-final-census.mjs
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const head = sh('git', ['rev-parse', 'HEAD']);
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = sh('git', ['status', '--porcelain']);
const startedAt = new Date().toISOString();

const inventory = JSON.parse(fs.readFileSync(path.join(root, 'scripts/system-runtime/contract-inventory.json'), 'utf8'));
const routeCount = (inventory.routes ?? []).length;

const run = spawnSync('node', ['scripts/system-runtime/runtime-route-smoke.mjs'], { stdio: 'inherit' });

const finishedAt = new Date().toISOString();
const results = JSON.parse(fs.readFileSync(path.join(root, 'scripts/system-runtime/route-smoke-results.json'), 'utf8'));
const records = Array.isArray(results) ? results : (results.results ?? []);
const byClass = {};
for (const r of records) byClass[r.classification] = (byClass[r.classification] ?? 0) + 1;

const meta = {
  finding: 'SR-16 final route runtime census',
  tested_head: head,
  branch,
  tree_at_run_start: dirty ? 'dirty' : 'clean',
  dirty_files_at_run_start: dirty ? dirty.split('\n') : [],
  base_url: process.env.SMOKE_BASE_URL || 'http://localhost:8080',
  backend_project_ref: 'sndfttzqmbkmkcnrvpfn',
  started_at: startedAt,
  finished_at: finishedAt,
  route_inventory_count: routeCount,
  covered_routes: new Set(records.map((r) => r.routeId)).size,
  execution_count: records.length,
  classifications: byClass,
  personas_available: {
    internal: Boolean(process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN),
    external: fs.existsSync(path.join(root, 'scripts/system-runtime/route-smoke-ids.json')),
    anonymous: true,
  },
  harness_exit_code: run.status,
  artifact: 'scripts/system-runtime/route-smoke-results.json',
};

const out = path.join(root, 'docs/certification/evidence-route-smoke-final-metadata.json');
fs.writeFileSync(out, `${JSON.stringify(meta, null, 2)}\n`);
console.log(`\nprovenance written: ${out}`);
console.log(JSON.stringify({ tested_head: head, executions: meta.execution_count, classifications: byClass }, null, 2));
process.exit(run.status ?? 0);
