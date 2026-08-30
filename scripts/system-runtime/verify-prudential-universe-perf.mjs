#!/usr/bin/env node
/**
 * F8A / SR-24 — focused performance + authorization regression for
 * public.prudential_entity_universe(uuid, text, text) (route R-229).
 *
 * Proves, under the REAL authenticated statement_timeout (no timeout changes,
 * no service_role bypass, no error suppression):
 *   - >= 5 successful authenticated executions, zero SQLSTATE 57014
 *   - max runtime comfortably below the regression threshold
 *   - stable result contract (row count + full column set)
 *   - filtered invocation still deterministic
 *   - anonymous execution denied
 *
 * Usage: node scripts/system-runtime/verify-prudential-universe-perf.mjs
 */
import fs from 'node:fs';

const ITERATIONS = 6;
const AUTH_STATEMENT_TIMEOUT_MS = 8000; // live `authenticated` role setting
const THRESHOLD_MS = 2000; // ~4x margin under the real 8s budget

const env = fs.readFileSync('.env', 'utf8');
const pick = (k) => env.match(new RegExp(`${k}="?([^"\\n]+)`))?.[1];
const BASE = process.env.VITE_SUPABASE_URL || pick('VITE_SUPABASE_URL');
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || pick('VITE_SUPABASE_PUBLISHABLE_KEY');
const TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;

const EXPECTED_COLUMNS = [
  'entity_id', 'entity_name', 'status', 'sector_id', 'sub_sector_id', 'category_id',
  'license_id', 'assigned_supervisor_id', 'systemic_importance', 'latest_filing_id',
  'latest_filing_reference', 'latest_period_label', 'latest_period_end',
  'latest_filing_status', 'latest_submitted_at', 'latest_accepted_filing_id',
  'latest_accepted_period_end', 'breach_count', 'worst_breach', 'open_ewi',
  'open_actions', 'overdue_actions', 'open_escalations', 'stress_open',
  'latest_rating', 'latest_rating_status',
];

const results = [];
const fail = (msg) => { results.push({ ok: false, msg }); console.log(`FAIL  ${msg}`); };
const pass = (msg) => { results.push({ ok: true, msg }); console.log(`PASS  ${msg}`); };

async function rpc(body, { anon = false } = {}) {
  const headers = { apikey: ANON, 'Content-Type': 'application/json' };
  if (!anon) headers.Authorization = `Bearer ${TOKEN}`;
  const started = Date.now();
  const res = await fetch(`${BASE}/rest/v1/rpc/prudential_entity_universe`, {
    method: 'POST', headers, body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body kept as text */ }
  return { status: res.status, ms: Date.now() - started, json, text };
}

(async () => {
  if (!TOKEN) { console.log('FAIL  no authenticated session available'); process.exit(1); }
  console.log(`authenticated statement_timeout : ${AUTH_STATEMENT_TIMEOUT_MS} ms`);
  console.log(`regression threshold            : ${THRESHOLD_MS} ms\n`);

  const timings = [];
  let baselineCount = null;
  for (let i = 1; i <= ITERATIONS; i += 1) {
    const r = await rpc({});
    const code = r.json && !Array.isArray(r.json) ? r.json.code : null;
    console.log(`  exec ${i}: HTTP ${r.status} ${r.ms}ms rows=${Array.isArray(r.json) ? r.json.length : 'n/a'}${code ? ` code=${code}` : ''}`);
    if (code === '57014') { fail(`exec ${i} statement timeout (57014)`); continue; }
    if (r.status !== 200 || !Array.isArray(r.json)) { fail(`exec ${i} unexpected response: ${r.text.slice(0, 200)}`); continue; }
    timings.push(r.ms);
    if (baselineCount === null) baselineCount = r.json.length;
    else if (r.json.length !== baselineCount) fail(`exec ${i} row count drift ${r.json.length} != ${baselineCount}`);
    if (r.json.length > 0) {
      const missing = EXPECTED_COLUMNS.filter((c) => !(c in r.json[0]));
      if (missing.length) fail(`exec ${i} missing columns: ${missing.join(', ')}`);
    }
  }

  if (timings.length >= 5) pass(`${timings.length} successful executions, 0 timeouts`);
  else fail(`only ${timings.length} successful executions (need >= 5)`);

  const sorted = [...timings].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  console.log(`\n  min=${min}ms median=${median}ms max=${max}ms rows=${baselineCount}`);
  if (max !== undefined && max < THRESHOLD_MS) pass(`max ${max}ms < threshold ${THRESHOLD_MS}ms (budget ${AUTH_STATEMENT_TIMEOUT_MS}ms)`);
  else fail(`max ${max}ms exceeds threshold ${THRESHOLD_MS}ms`);

  // filtered invocation stays deterministic and bounded
  const filtered = await rpc({ _status: 'active' });
  if (filtered.status === 200 && Array.isArray(filtered.json) && filtered.json.length <= baselineCount && filtered.ms < THRESHOLD_MS) {
    pass(`filtered call (_status=active) HTTP 200 ${filtered.ms}ms rows=${filtered.json.length}`);
  } else {
    fail(`filtered call unexpected: HTTP ${filtered.status} ${filtered.ms}ms ${filtered.text.slice(0, 160)}`);
  }

  // deterministic behaviour on a non-matching argument
  const empty = await rpc({ _status: '__no_such_status__' });
  if (empty.status === 200 && Array.isArray(empty.json) && empty.json.length === 0) pass('non-matching filter returns empty array (deterministic)');
  else fail(`non-matching filter unexpected: HTTP ${empty.status} ${empty.text.slice(0, 160)}`);

  // anonymous must remain denied
  const anon = await rpc({}, { anon: true });
  if (anon.status === 401 || anon.status === 403 || anon.json?.code === '42501') pass(`anonymous denied (HTTP ${anon.status}${anon.json?.code ? `/${anon.json.code}` : ''})`);
  else fail(`anonymous NOT denied: HTTP ${anon.status} ${anon.text.slice(0, 160)}`);

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} checks passed`);
  process.exit(failed ? 1 : 0);
})();
