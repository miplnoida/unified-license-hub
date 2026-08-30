#!/usr/bin/env node
/**
 * Final SR-16 census runner with run provenance and Data API atomicity (SR-25/SR-26).
 *
 * The route classifier is NOT weakened: routes keep whatever classification the
 * harness assigns. This wrapper decides whether the RUN as a whole is
 * certification-eligible:
 *
 *   - mid-run sentinel probes two known-good Data API surfaces every
 *     SENTINEL_INTERVAL_MS; on HTTP 503 / PGRST002 / schema-cache unavailability it
 *     aborts the census early instead of manufacturing hundreds of misleading FAILs
 *   - after the run, the produced artifact is scanned for the same infrastructure
 *     signatures
 *   - a contaminated run is preserved as
 *     docs/certification/evidence-route-smoke-attempt-<timestamp>.json and marked
 *     INVALID_ENVIRONMENT_RUN; it is never promoted to canonical evidence
 *   - only a clean run leaves scripts/system-runtime/route-smoke-results.json in
 *     place as canonical evidence, with provenance in
 *     docs/certification/evidence-route-smoke-final-metadata.json
 *
 * Usage: node scripts/system-runtime/run-final-census.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const SENTINEL_INTERVAL_MS = 60_000;
const ARTIFACT = 'scripts/system-runtime/route-smoke-results.json';

const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();
const env = fs.readFileSync('.env', 'utf8');
const pick = (k) => env.match(new RegExp(`${k}="?([^"\\n]+)`))?.[1];
const BASE = process.env.VITE_SUPABASE_URL || pick('VITE_SUPABASE_URL');
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || pick('VITE_SUPABASE_PUBLISHABLE_KEY');

const INFRA_SIGNATURES = ['PGRST002', 'Could not query the database for the schema cache'];
const hasInfraSignature = (text) => INFRA_SIGNATURES.some((s) => text.includes(s));

const head = sh('git', ['rev-parse', 'HEAD']);
const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
const dirty = sh('git', ['status', '--porcelain']);
const startedAt = new Date().toISOString();

const inventory = JSON.parse(fs.readFileSync(path.join(root, 'scripts/system-runtime/contract-inventory.json'), 'utf8'));
const routeCount = (inventory.routes ?? []).length;

const sentinelFailures = [];
let sentinelTimer = null;

async function probe(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (res.status === 503 || hasInfraSignature(text)) {
      return { ok: false, detail: `${res.status} ${text.slice(0, 160)}` };
    }
    if (res.status >= 500) return { ok: false, detail: `${res.status} ${text.slice(0, 160)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: `network: ${String(e).slice(0, 160)}` };
  }
}

async function runSentinel(child) {
  const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };
  const targets = [
    `${BASE}/rest/v1/site_settings?select=key&limit=1`,
    `${BASE}/functions/v1/public-registry?resource=stats`,
  ];
  for (const t of targets) {
    const r = await probe(t, headers);
    if (!r.ok) {
      sentinelFailures.push({ at: new Date().toISOString(), target: t, detail: r.detail });
      console.log(`\n[sentinel] Data API unavailable: ${t} :: ${r.detail}`);
      console.log('[sentinel] aborting census — run will be marked INVALID_ENVIRONMENT_RUN');
      clearInterval(sentinelTimer);
      child.kill('SIGTERM');
      return;
    }
  }
}

const child = spawn('node', ['scripts/system-runtime/runtime-route-smoke.mjs'], { stdio: 'inherit' });
sentinelTimer = setInterval(() => { void runSentinel(child); }, SENTINEL_INTERVAL_MS);

child.on('exit', (code) => {
  clearInterval(sentinelTimer);
  const finishedAt = new Date().toISOString();

  let raw = '';
  let records = [];
  try {
    raw = fs.readFileSync(path.join(root, ARTIFACT), 'utf8');
    const parsed = JSON.parse(raw);
    records = Array.isArray(parsed) ? parsed : (parsed.results ?? []);
  } catch (e) {
    console.log(`no readable artifact: ${String(e)}`);
  }

  const byClass = {};
  for (const r of records) byClass[r.classification] = (byClass[r.classification] ?? 0) + 1;

  const contaminatedExecutions = records
    .filter((r) => hasInfraSignature(JSON.stringify(r)))
    .map((r) => r.routeId);
  const abortedEarly = sentinelFailures.length > 0;
  const invalid = abortedEarly || contaminatedExecutions.length > 0;

  const meta = {
    finding: 'SR-16 final route runtime census',
    run_verdict: invalid ? 'INVALID_ENVIRONMENT_RUN' : 'CERTIFICATION_ELIGIBLE',
    tested_head: head,
    branch,
    tree_at_run_start: dirty ? 'dirty' : 'clean',
    dirty_files_at_run_start: dirty ? dirty.split('\n') : [],
    base_url: process.env.SMOKE_BASE_URL || 'http://localhost:8080',
    started_at: startedAt,
    finished_at: finishedAt,
    route_inventory_count: routeCount,
    covered_routes: new Set(records.map((r) => r.routeId)).size,
    execution_count: records.length,
    classifications: byClass,
    dataapi_sentinel: {
      interval_ms: SENTINEL_INTERVAL_MS,
      failures: sentinelFailures,
      aborted_early: abortedEarly,
    },
    infrastructure_contaminated_executions: contaminatedExecutions,
    personas_available: {
      internal: Boolean(process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN),
      external: fs.existsSync(path.join(root, 'scripts/system-runtime/route-smoke-ids.json')),
      anonymous: true,
    },
    harness_exit_code: code,
    artifact: ARTIFACT,
  };

  if (invalid) {
    const stamp = finishedAt.replace(/[:.]/g, '-');
    const preserved = `docs/certification/evidence-route-smoke-attempt-${stamp}.json`;
    if (raw) fs.writeFileSync(path.join(root, preserved), raw);
    meta.artifact = preserved;
    meta.note = 'Infrastructure-contaminated attempt preserved separately; NOT certification evidence.';
    console.log(`\nINVALID_ENVIRONMENT_RUN — attempt preserved at ${preserved}`);
  }

  const out = path.join(root, 'docs/certification/evidence-route-smoke-final-metadata.json');
  fs.writeFileSync(out, `${JSON.stringify(meta, null, 2)}\n`);
  console.log(`provenance written: ${out}`);
  console.log(JSON.stringify({ run_verdict: meta.run_verdict, tested_head: head, executions: meta.execution_count, classifications: byClass }, null, 2));
  process.exit(invalid ? 1 : (code ?? 0));
});
