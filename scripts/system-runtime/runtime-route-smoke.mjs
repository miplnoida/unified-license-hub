#!/usr/bin/env node
/**
 * SR-16 all-route runtime smoke.
 *
 * Drives every production route from the generated route census
 * (scripts/system-runtime/contract-inventory.json) through a real browser with a
 * real authenticated session, and classifies each route by what the *backend*
 * actually did — not merely by whether React mounted.
 *
 * Personas
 *   internal  — regulator staff session (LOVABLE_BROWSER_SUPABASE_* env)
 *   external  — licensee portal session (~/.cache/lovable-auth/session.json)
 *   anonymous — no session (public routes only)
 *
 * Classifications (exactly one per production route):
 *   PASS                  route rendered and every initial backend call succeeded
 *   EXPECTED_NOT_FOUND    valid contract, record genuinely absent (empty fixture)
 *   EXPECTED_AUTHORIZATION guard/RLS denial that is the intended behaviour
 *   REDIRECT              redirect-only route resolved to its target
 *   FAIL                  contract/runtime defect (severity attached)
 *   ENVIRONMENT_BLOCKED   could not be exercised in this environment
 *
 * Usage: node scripts/system-runtime/runtime-route-smoke.mjs [--filter <substr>]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'scripts/system-runtime');
const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8080';
const inventory = JSON.parse(fs.readFileSync(path.join(DIR, 'contract-inventory.json'), 'utf8'));
const idMap = JSON.parse(fs.readFileSync(path.join(DIR, 'route-smoke-ids.json'), 'utf8'));
const filter = process.argv.includes('--filter')
  ? process.argv[process.argv.indexOf('--filter') + 1]
  : null;

/** Hard contract defects: object/column/signature does not exist. */
const CONTRACT_CODES = new Set(['42P01', '42703', '42883', '42P17', 'PGRST202', 'PGRST200', 'PGRST204', 'PGRST100']);
/** Authorization outcomes — never mixed with schema defects. */
const AUTHZ_CODES = new Set(['42501', 'PGRST301', '401', '403']);
const CONTRACT_TEXT = [
  /relation "[^"]+" does not exist/i,
  /column [^ ]+ does not exist/i,
  /function [^ ]+ does not exist/i,
  /could not find the (table|function|column)/i,
  /schema cache/i,
];
/**
 * Backend outcomes that are a genuine "record absent", not a broken contract:
 *   PGRST116 - `.single()` matched 0 rows (record missing, or filtered by RLS)
 *   22023    - a SECURITY DEFINER guard deliberately rejected an id that has no
 *              corresponding record (e.g. PERSON_PARTY_REQUIRED). The contract
 *              itself resolved: the routine ran and raised its own guard.
 * The message must match as well as the code, so an unrelated 22023 still FAILs.
 */
const NOT_FOUND_BACKEND = [
  { code: 'PGRST116', rx: /0 rows|multiple \(or no\) rows/i },
  { code: '22023', rx: /_REQUIRED\b|not found|does not exist for/i },
];

const NOT_FOUND_TEXT = [
  /not found/i,
  /could not be found/i,
  /does not exist or you do not have access/i,
  /no (record|such) /i,
  /unable to load .* record/i,
];

const publicPrefixes = ['/', '/login', '/register', '/registry', '/complaints/track', '/licensee-services', '/declaration', '/services', '/about', '/contact', '/legal', '/privacy', '/faq', '/news', '/publications', '/forgot-password', '/reset-password', '/verify'];
const externalPrefixes = ['/entity/', '/portal', '/post-licensee', '/licensee/', '/my-'];

function personasFor(route) {
  const p = route.path;
  const out = [];
  if (externalPrefixes.some((x) => p.startsWith(x))) out.push('external');
  if (publicPrefixes.includes(p) || (p !== '/' && publicPrefixes.some((x) => x !== '/' && p.startsWith(x)))) out.push('anonymous');
  if (!out.length || route.guards?.length) out.unshift('internal');
  return [...new Set(out)];
}

function concreteUrl(route) {
  let p = route.path;
  // React Router catch-all. `http://host*` is not a navigable URL, so the route
  // is exercised through a path that is guaranteed not to match anything else
  // (RF-14 was a harness defect, not a product defect).
  if (p === '*' || p === '/*') return BASE + '/__runtime_smoke_unmatched_path__';
  if (p.includes(':')) {
    const key = Object.keys(idMap)
      .filter((k) => k.startsWith('/') && p.startsWith(k))
      .sort((a, b) => b.length - a.length)[0];
    const id = key ? idMap[key] : '00000000-0000-0000-0000-000000000000';
    p = p.replace(/:entityType/g, idMap.__entityType__ || 'application');
    p = p.replace(/:type/g, 'individual').replace(/:kind/g, 'instruction').replace(/:family/g, 'complaints');
    p = p.replace(/:[A-Za-z0-9_]+/g, id);
  }
  return BASE + p;
}

function loadSessions() {
  const s = {};
  if (process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY && process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON) {
    s.internal = {
      key: process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY,
      value: process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON,
    };
  }
  const f = path.join(os.homedir(), '.cache/lovable-auth/session.json');
  if (fs.existsSync(f)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const key = j.storage_key || process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
    const value = JSON.stringify(j.session || j);
    if (key) s.external = { key, value };
  }
  return s;
}

async function run() {
  const sessions = loadSessions();
  const routes = inventory.routes.filter((r) => !r.devOnly && (!filter || r.path.includes(filter)));
  const browser = await chromium.launch(headless());
  const results = [];

  for (const persona of ['internal', 'external', 'anonymous']) {
    const subset = routes.filter((r) => personasFor(r).includes(persona));
    if (!subset.length) continue;
    if (persona !== 'anonymous' && !sessions[persona]) {
      subset.forEach((r) => results.push(blocked(r, persona, 'no session available for persona')));
      continue;
    }
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await ctx.newPage();
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    if (sessions[persona]) {
      const { key, value } = sessions[persona];
      await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
    } else {
      await page.evaluate(() => localStorage.clear());
    }
    for (const route of subset) {
      results.push(await exercise(page, route, persona));
      process.stdout.write('.');
    }
    await ctx.close();
  }
  await browser.close();

  const out = { generatedAt: new Date().toISOString(), base: BASE, results, summary: summarize(results) };
  fs.writeFileSync(path.join(DIR, 'route-smoke-results.json'), JSON.stringify(out, null, 2));
  console.log('\n' + JSON.stringify(out.summary, null, 2));
  const fails = results.filter((r) => r.classification === 'FAIL');
  for (const f of fails) console.log(`FAIL ${f.routeId} ${f.persona} ${f.url}\n   ${f.reasons.join('\n   ')}`);
  process.exit(fails.length ? 1 : 0);
}

function headless() {
  // The sandbox ships a pinned Chromium that may differ from the npm package's
  // expected revision; prefer whatever build is actually installed.
  const opts = { headless: true, args: ['--no-sandbox'] };
  const roots = ['/opt/ms-playwright'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const dir = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
    const exe = dir && path.join(root, dir, 'chrome-linux/chrome');
    if (exe && fs.existsSync(exe)) { opts.executablePath = exe; break; }
  }
  return opts;
}

function blocked(route, persona, why) {
  return { routeId: route.id, path: route.path, url: '', persona, component: route.component, classification: 'ENVIRONMENT_BLOCKED', reasons: [why], backendErrors: [] };
}

async function exercise(page, route, persona) {
  const url = concreteUrl(route);
  const consoleErrors = [];
  const pageErrors = [];
  const backendErrors = [];
  const onConsole = (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 400)); };
  const onPageError = (e) => pageErrors.push(String(e).slice(0, 400));
  const onResponse = async (res) => {
    const u = res.url();
    if (!/\/(rest|rpc|functions|storage)\/v1\//.test(u)) return;
    if (res.status() < 400) return;
    let body = '';
    try { body = (await res.text()).slice(0, 500); } catch { /* body consumed */ }
    let code = String(res.status());
    try { code = JSON.parse(body).code || code; } catch { /* non-json */ }
    backendErrors.push({ status: res.status(), code, url: u.replace(/^https?:\/\/[^/]+/, ''), body });
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  let text = '';
  let finalUrl = url;
  let navError = null;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch { /* long-poll/realtime keeps the socket open */ }
    await page.waitForTimeout(400);
    finalUrl = page.url();
    text = (await page.locator('body').innerText()).slice(0, 6000);
  } catch (e) {
    navError = String(e).slice(0, 300);
  }
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);

  return classify({ route, persona, url, finalUrl, text, navError, consoleErrors, pageErrors, backendErrors });
}

function classify(o) {
  const { route, url, finalUrl, text, navError, consoleErrors, pageErrors, backendErrors } = o;
  const base = {
    routeId: route.id,
    path: route.path,
    url,
    finalUrl,
    persona: o.persona,
    component: route.component,
    guards: route.guards || [],
    permission: route.permission || null,
    redirectOnly: !!route.redirectOnly,
    consoleErrors,
    pageErrors,
    backendErrors,
    reasons: [],
  };
  if (navError) return { ...base, classification: 'ENVIRONMENT_BLOCKED', reasons: [navError] };

  const absent = backendErrors.filter((e) =>
    NOT_FOUND_BACKEND.some((n) => n.code === e.code && n.rx.test(e.body || '')));
  const contract = backendErrors.filter((e) => CONTRACT_CODES.has(e.code) && !absent.includes(e));
  const authz = backendErrors.filter((e) => AUTHZ_CODES.has(e.code) || [401, 403].includes(e.status));
  const other = backendErrors.filter((e) => !contract.includes(e) && !authz.includes(e) && !absent.includes(e));
  const contractText = CONTRACT_TEXT.filter((rx) => rx.test(text)).map((rx) => String(rx));
  const notFound = NOT_FOUND_TEXT.some((rx) => rx.test(text));
  const stillLoading = /Loading|Please wait/i.test(text) && text.trim().length < 120;
  const redirected = new URL(finalUrl).pathname !== new URL(url).pathname;
  const guardRedirect = redirected && /\/(login|unauthorized|forbidden)$/.test(new URL(finalUrl).pathname);

  if (absent.length && !contract.length && !pageErrors.length) {
    return { ...base, classification: 'EXPECTED_NOT_FOUND',
      reasons: absent.map((e) => `record absent (${e.status}/${e.code}) ${e.url}`) };
  }
  if (contract.length) return { ...base, classification: 'FAIL', severity: 'P0', reasons: contract.map((e) => `${e.code} ${e.url} :: ${e.body}`) };
  if (contractText.length) return { ...base, classification: 'FAIL', severity: 'P0', reasons: [`contract text rendered: ${contractText.join(', ')}`] };
  if (pageErrors.length) return { ...base, classification: 'FAIL', severity: 'P1', reasons: pageErrors };
  if (other.length) return { ...base, classification: 'FAIL', severity: 'P1', reasons: other.map((e) => `${e.status}/${e.code} ${e.url} :: ${e.body}`) };
  if (stillLoading) return { ...base, classification: 'FAIL', severity: 'P1', reasons: ['screen never left its loading state'] };
  if (guardRedirect) return { ...base, classification: 'EXPECTED_AUTHORIZATION', reasons: [`guard redirect to ${new URL(finalUrl).pathname}`] };
  if (authz.length) return { ...base, classification: 'EXPECTED_AUTHORIZATION', reasons: authz.map((e) => `${e.status}/${e.code} ${e.url}`) };
  if (base.redirectOnly && redirected) return { ...base, classification: 'REDIRECT', reasons: [`resolved to ${new URL(finalUrl).pathname}`] };
  if (notFound) return { ...base, classification: 'EXPECTED_NOT_FOUND', reasons: ['explicit not-found state, no backend contract error'] };
  if (redirected) return { ...base, classification: 'REDIRECT', reasons: [`resolved to ${new URL(finalUrl).pathname}`] };
  return { ...base, classification: 'PASS', reasons: [] };
}

function summarize(results) {
  const s = { TOTAL_EXECUTIONS: results.length, ROUTES: new Set(results.map((r) => r.routeId)).size };
  for (const r of results) s[r.classification] = (s[r.classification] || 0) + 1;
  return s;
}

run().catch((e) => { console.error(e); process.exit(1); });
