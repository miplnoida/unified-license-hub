#!/usr/bin/env node
/**
 * Notification channel health performance regression (SR-24).
 *
 * Proves public.notification_channel_health() completes well below the REAL
 * Data API statement timeout for the `authenticated` role (8s, per
 * pg_roles.rolconfig — NOT the 120s session default), that the authorized
 * persona gets the expected shape, and that an unauthenticated caller is still
 * denied. No timeout is raised and no error is suppressed.
 *
 * Usage: node scripts/system-runtime/verify-notification-health-perf.mjs
 */
const URL_BASE = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const TOKEN = process.env.LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN;
const RUNS = 5;
// Effective PostgREST statement timeout for the `authenticated` role.
const TIMEOUT_MS = 8000;
// Regression threshold: 50% of the effective timeout. Any return of the
// run-history scan (previously 9s+ cold / 57014) breaches this immediately.
const THRESHOLD_MS = 4000;

async function call(auth) {
  const t0 = performance.now();
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/notification_channel_health`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      'Content-Type': 'application/json',
      ...(auth ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: '{}',
  });
  const body = await res.text();
  return { ms: Math.round(performance.now() - t0), status: res.status, body };
}

const fails = [];
if (!TOKEN) { console.error('no authenticated session available'); process.exit(1); }

const times = [];
for (let i = 1; i <= RUNS; i++) {
  const r = await call(true);
  times.push(r.ms);
  let ok = r.status === 200;
  let shape = '';
  if (ok) {
    const j = JSON.parse(r.body);
    for (const k of ['smtp', 'sms', 'email', 'in_app', 'queue', 'workers', 'recent_errors', 'generated_at']) {
      if (!(k in j)) { ok = false; shape += ` missing:${k}`; }
    }
  }
  if (/57014/.test(r.body)) { ok = false; shape += ' TIMEOUT_57014'; }
  if (!ok) fails.push(`execution ${i}: ${r.status}${shape} ${r.body.slice(0, 200)}`);
  console.log(`execution ${i}: ${r.ms} ms  HTTP ${r.status}  ${ok ? 'OK' : 'ERROR' + shape}`);
}

const sorted = [...times].sort((a, b) => a - b);
const median = sorted[Math.floor(sorted.length / 2)];
console.log(`\nmin=${sorted[0]}ms median=${median}ms max=${sorted[sorted.length - 1]}ms`);
console.log(`configured statement timeout=${TIMEOUT_MS}ms  regression threshold=${THRESHOLD_MS}ms`);
if (sorted[sorted.length - 1] > THRESHOLD_MS) fails.push(`max ${sorted[sorted.length - 1]}ms exceeds ${THRESHOLD_MS}ms`);

const anon = await call(false);
console.log(`\nunauthenticated: HTTP ${anon.status} ${anon.body.slice(0, 120)}`);
if (![401, 403].includes(anon.status) && !/42501|forbidden|JWT/i.test(anon.body)) {
  fails.push(`unauthenticated call was not denied (HTTP ${anon.status})`);
}

console.log(fails.length ? `\nFAIL\n${fails.join('\n')}` : '\nPASS: 0 timeouts, 0 functional errors, authorization intact');
process.exit(fails.length ? 1 : 0);
