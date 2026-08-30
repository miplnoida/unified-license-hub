#!/usr/bin/env node
/**
 * Data API / PostgREST schema-cache readiness precondition (SR-25).
 *
 * The previous full route census was invalidated by infrastructure behaviour:
 *   503 / PGRST002 "Could not query the database for the schema cache. Retrying."
 * PostgREST emits this while it rebuilds its schema cache (e.g. right after a
 * function replacement). Route failures produced in that window say nothing
 * about the application, so the long census must not start until the Data API
 * is demonstrably settled.
 *
 * This is a PRECONDITION check only. It never reclassifies an application
 * defect: it probes a fixed set of known-good surfaces and requires N
 * consecutive fully clean rounds. Any HTTP 503, PGRST002, schema-cache text or
 * backend-availability failure resets the streak.
 *
 * Usage: node scripts/system-runtime/verify-dataapi-readiness.mjs
 */
const BASE = 'https://sndfttzqmbkmkcnrvpfn.supabase.co';
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;

const REQUIRED_CLEAN_ROUNDS = 10;
const MAX_ROUNDS = 40;
const ROUND_DELAY_MS = 3000;

if (!ANON) { console.error('missing publishable key'); process.exit(1); }
if (!TOKEN) { console.error('missing authenticated session'); process.exit(1); }

/** Known-good surfaces spanning the contract types the census depends on. */
const PROBES = [
  { name: 'table SELECT (anonymous, public config)', auth: false, path: '/rest/v1/site_settings?select=key&limit=1' },
  { name: 'table SELECT (authenticated)', auth: true, path: '/rest/v1/regulators?select=id,name&status=eq.active&limit=1' },
  { name: 'view SELECT (authenticated)', auth: true, path: '/rest/v1/profiles?select=id&limit=1' },
  { name: 'RPC notification_counts (authenticated)', auth: true, path: '/rest/v1/rpc/notification_counts', method: 'POST' },
  { name: 'RPC notification_channel_health (replaced fn)', auth: true, path: '/rest/v1/rpc/notification_channel_health', method: 'POST' },
  { name: 'RPC has_permission-backed sup_dashboard_summary', auth: true, path: '/rest/v1/rpc/sup_dashboard_summary', method: 'POST' },
  { name: 'edge function public-registry (anonymous)', auth: false, path: '/functions/v1/public-registry?action=stats' },
];

const SCHEMA_CACHE = /PGRST002|schema cache|Could not query the database/i;
const UNAVAILABLE = /PGRST001|57P03|could not connect|Service Unavailable/i;

async function probe(p) {
  const res = await fetch(`${BASE}${p.path}`, {
    method: p.method ?? 'GET',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(p.auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    ...(p.method === 'POST' ? { body: '{}' } : {}),
  });
  const body = await res.text();
  const problems = [];
  if (res.status === 503) problems.push('HTTP 503');
  if (SCHEMA_CACHE.test(body)) problems.push('PGRST002/schema-cache');
  if (UNAVAILABLE.test(body)) problems.push('backend unavailable');
  if (res.status >= 500 && !problems.length) problems.push(`HTTP ${res.status}`);
  return { ok: problems.length === 0, status: res.status, problems, body: body.slice(0, 160) };
}

let total = 0, success = 0, pgrst002 = 0, failures = [];
let streak = 0, firstOk = null, lastOk = null;

for (let round = 1; round <= MAX_ROUNDS && streak < REQUIRED_CLEAN_ROUNDS; round++) {
  let roundClean = true;
  for (const p of PROBES) {
    const r = await probe(p);
    total++;
    if (r.ok) { success++; firstOk ??= new Date().toISOString(); lastOk = new Date().toISOString(); }
    else {
      roundClean = false;
      if (r.problems.includes('PGRST002/schema-cache')) pgrst002++;
      failures.push(`round ${round} :: ${p.name} :: ${r.status} :: ${r.problems.join(',')} :: ${r.body}`);
    }
  }
  streak = roundClean ? streak + 1 : 0;
  console.log(`round ${round}: ${roundClean ? 'CLEAN' : 'DIRTY'}  consecutive_clean=${streak}/${REQUIRED_CLEAN_ROUNDS}`);
  if (streak < REQUIRED_CLEAN_ROUNDS) await new Promise((r) => setTimeout(r, ROUND_DELAY_MS));
}

console.log(`\nprobes=${total} success=${success} failures=${total - success} pgrst002=${pgrst002}`);
console.log(`first_success=${firstOk} last_success=${lastOk}`);
console.log(`consecutive clean rounds=${streak} (required ${REQUIRED_CLEAN_ROUNDS})`);
if (failures.length) console.log(`\nfailure detail:\n${failures.slice(-20).join('\n')}`);

if (streak >= REQUIRED_CLEAN_ROUNDS) {
  console.log('\nDATA API READY: schema cache settled, census may proceed');
  process.exit(0);
}
console.log('\nDATA API NOT READY: do not run the full route census');
process.exit(1);
