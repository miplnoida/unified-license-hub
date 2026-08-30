#!/usr/bin/env node
/**
 * SR-19 dedicated /forms/:formId runtime-semantics proof.
 *
 * Three independent cases, each asserted on real runtime behaviour:
 *   valid   — a REAL published form id must render form/schema/version content,
 *             with no contract marker, no backend error and no stuck spinner.
 *   missing — a syntactically valid but nonexistent uuid must reach a legitimate
 *             not-found state (never a contract error, never a blank spinner).
 *   authz   — /forms/:formId is wrapped in ProtectedRoute (src/routes/
 *             dashboardRoutes.tsx), i.e. authentication-protected but not
 *             permission-gated, so an anonymous caller must be redirected to the
 *             login screen.
 *
 * The related forms surfaces implicated earlier in this wave are exercised too:
 *   /admin/forms, /admin/forms/:templateId/view,
 *   /applications/:applicationId/forms,
 *   /post-licensee/applications/:applicationId/forms
 *
 * Usage: node scripts/system-runtime/verify-forms-semantics.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:8080';
const DIR = path.join(process.cwd(), 'scripts/system-runtime');
const ids = JSON.parse(fs.readFileSync(path.join(DIR, 'route-smoke-ids.json'), 'utf8'));

// A REAL published public.form_templates row (FormDetail reads form_templates,
// not public.forms — the two are distinct tables).
const VALID_FORM = process.env.SR19_FORM_ID || '0168b037-4f81-4f3f-9f00-8d7a2c7ce9bc';
const MISSING_FORM = '00000000-0000-0000-0000-000000000000';

const CONTRACT_CODES = new Set(['42P01', '42703', '42883', '42P17', 'PGRST202', 'PGRST200', 'PGRST204', 'PGRST100']);
const CONTRACT_TEXT = [/relation "[^"]+" does not exist/i, /column [^ ]+ does not exist/i, /function [^ ]+ does not exist/i, /could not find the (table|function|column)/i, /schema cache/i];
const NOT_FOUND_TEXT = [/not found/i, /could not be found/i, /does not exist or you do not have access/i, /no (record|such) /i];

function sessions() {
  const s = {};
  if (process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY && process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON) {
    s.internal = { key: process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY, value: process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON };
  }
  const f = path.join(os.homedir(), '.cache/lovable-auth/session.json');
  if (fs.existsSync(f)) {
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    const key = j.storage_key || process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
    if (key) s.external = { key, value: JSON.stringify(j.session || j) };
  }
  return s;
}

function headless() {
  const opts = { headless: true, args: ['--no-sandbox'] };
  for (const root of ['/opt/ms-playwright']) {
    if (!fs.existsSync(root)) continue;
    const d = fs.readdirSync(root).find((x) => x.startsWith('chromium'));
    if (d) {
      for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell']) {
        const p = path.join(root, d, rel);
        if (fs.existsSync(p)) { opts.executablePath = p; break; }
      }
    }
  }
  return opts;
}

async function visit(page, url) {
  const backendErrors = [];
  const pageErrors = [];
  const onPageError = (e) => pageErrors.push(String(e).slice(0, 300));
  const onResponse = async (res) => {
    const u = res.url();
    if (!/\/rest\/v1\/|\/functions\/v1\//.test(u) || res.status() < 400) return;
    let body = '';
    try { body = (await res.text()).slice(0, 400); } catch { /* consumed */ }
    let code = String(res.status());
    try { code = JSON.parse(body).code || code; } catch { /* not json */ }
    backendErrors.push({ status: res.status(), code, url: u.replace(/^https?:\/\/[^/]+/, ''), body });
  };
  page.on('pageerror', onPageError);
  page.on('response', onResponse);
  let text = '';
  let finalUrl = url;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(1500);
  try { await page.waitForLoadState('networkidle', { timeout: 12000 }); } catch { /* sockets stay open */ }
  finalUrl = page.url();
  text = (await page.locator('body').innerText()).slice(0, 6000);
  page.off('pageerror', onPageError);
  page.off('response', onResponse);
  return { text, finalUrl, backendErrors, pageErrors };
}

const results = [];
function assert(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ' :: ' + detail : ''}`);
}

const browser = await chromium.launch(headless());
const sess = sessions();
if (!sess.internal) { console.error('no internal session available'); process.exit(1); }

// ---- internal persona ------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [sess.internal.key, sess.internal.value]);

  const valid = await visit(page, `${BASE}/forms/${VALID_FORM}`);
  const contract = valid.backendErrors.filter((e) => CONTRACT_CODES.has(e.code));
  const spinner = /Loading|Please wait/i.test(valid.text) && valid.text.trim().length < 120;
  assert('SR-19 valid: no contract-code backend error', contract.length === 0, JSON.stringify(contract).slice(0, 200));
  assert('SR-19 valid: no contract marker rendered', !CONTRACT_TEXT.some((rx) => rx.test(valid.text)));
  assert('SR-19 valid: no page error', valid.pageErrors.length === 0, valid.pageErrors.join(' | ').slice(0, 200));
  assert('SR-19 valid: meaningful content rendered', valid.text.trim().length > 200, `${valid.text.trim().length} chars`);
  assert('SR-19 valid: not stuck on spinner', !spinner);
  assert('SR-19 valid: no not-found state', !NOT_FOUND_TEXT.some((rx) => rx.test(valid.text)));
  assert('SR-19 valid: classification PASS', contract.length === 0 && !spinner && valid.pageErrors.length === 0);

  const missing = await visit(page, `${BASE}/forms/${MISSING_FORM}`);
  const mContract = missing.backendErrors.filter((e) => CONTRACT_CODES.has(e.code));
  const mNotFound = NOT_FOUND_TEXT.some((rx) => rx.test(missing.text))
    || missing.backendErrors.some((e) => e.code === 'PGRST116');
  assert('SR-19 missing: no contract-code backend error', mContract.length === 0, JSON.stringify(mContract).slice(0, 200));
  assert('SR-19 missing: legitimate not-found behaviour', mNotFound, missing.text.slice(0, 160).replace(/\s+/g, ' '));
  assert('SR-19 missing: classification EXPECTED_NOT_FOUND', mContract.length === 0 && mNotFound);

  // related forms surfaces
  for (const [label, p] of [
    ['/admin/forms', '/admin/forms'],
    ['/admin/forms/:templateId/view', `/admin/forms/${ids['/admin/forms']}/view`],
    ['/applications/:applicationId/forms', `/applications/${ids['/applications']}/forms`],
  ]) {
    const r = await visit(page, BASE + p);
    const c = r.backendErrors.filter((e) => CONTRACT_CODES.has(e.code));
    assert(`SR-19 related ${label}: no contract defect`, c.length === 0 && r.pageErrors.length === 0,
      JSON.stringify(c).slice(0, 200) + r.pageErrors.join(' | ').slice(0, 120));
  }
  await ctx.close();
}

// ---- external persona (post-licensee forms) --------------------------------
if (sess.external) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [sess.external.key, sess.external.value]);
  const p = `/post-licensee/applications/${ids['/post-licensee/applications'] || ids['/applications']}/forms`;
  const r = await visit(page, BASE + p);
  const c = r.backendErrors.filter((e) => CONTRACT_CODES.has(e.code));
  assert('SR-19 related /post-licensee/.../forms: no contract defect', c.length === 0 && r.pageErrors.length === 0,
    JSON.stringify(c).slice(0, 200));
  await ctx.close();
} else {
  console.log('SKIP  SR-19 related /post-licensee/.../forms: no external session');
}

// ---- anonymous persona -----------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  const r = await visit(page, `${BASE}/forms/${VALID_FORM}`);
  const p = new URL(r.finalUrl).pathname;
  assert('SR-19 authz: anonymous redirected to login (ProtectedRoute)', /\/(login|unauthorized|forbidden)$/.test(p), p);
  await ctx.close();
}

await browser.close();
const fails = results.filter((r) => !r.ok);
console.log(fails.length ? `\nSR-19 FAILED (${fails.length})` : `\nSR-19 PASSED (${results.length}/${results.length})`);
process.exit(fails.length ? 1 : 0);
