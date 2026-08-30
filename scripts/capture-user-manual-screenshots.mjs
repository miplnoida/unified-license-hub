#!/usr/bin/env node
/**
 * User Manual screenshot capture (documentation only).
 *
 * Drives the RUNNING application with the injected internal session and stores
 * real screenshots under public/user-manual/screenshots/<persona>/<process>/.
 * Nothing is generated, mocked or fabricated: a route that cannot be captured
 * is reported as a failure so the manifest can record NEEDS_CAPTURE with a
 * genuine reason.
 *
 *   node scripts/capture-user-manual-screenshots.mjs [--only=id,id]
 *
 * Route parameters are substituted from demo-safe identifiers below.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.MANUAL_BASE_URL ?? 'http://localhost:8080';
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PARAMS = {
  ':entityId': process.env.MANUAL_ENTITY_ID ?? '',
  ':filingId': process.env.MANUAL_FILING_ID ?? '',
};

const only = (process.argv.find((a) => a.startsWith('--only=')) ?? '').replace('--only=', '');
const wanted = only ? new Set(only.split(',')) : null;

// Parse the manifest without importing TS: read the declarative s()/p() rows.
const src = readFileSync(resolve(ROOT, 'src/content/user-manual/screenshotManifest.ts'), 'utf8');
const rows = [...src.matchAll(/^\s{2}s\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'/gm)].map((m) => ({
  id: m[1], persona: m[2], process: m[3], route: m[4],
}));

const targets = rows.filter((r) => (!wanted || wanted.has(r.id)));
const captured = [];
const failed = [];

// Reuse the sandbox's installed Chromium (the node package's pinned revision
// is not downloaded in this environment).
const EXECUTABLE = process.env.MANUAL_CHROMIUM
  ?? [
    '/opt/ms-playwright/chromium-1194/chrome-linux/chrome',
    '/opt/ms-playwright/chromium_headless_shell-1194/chrome-headless-shell-linux64/chrome-headless-shell',
  ].find((c) => existsSync(c));
const browser = await chromium.launch(EXECUTABLE ? { headless: true, executablePath: EXECUTABLE } : { headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });

// Restore the injected internal session before visiting protected routes.
const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
if (cookiesJson) {
  await context.addCookies(JSON.parse(cookiesJson).map((c) => ({ ...c, url: BASE_URL })));
}
const page = await context.newPage();
await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
if (storageKey && sessionJson) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [storageKey, sessionJson]);
}

for (const t of targets) {
  let route = t.route;
  let unresolved = null;
  for (const [token, value] of Object.entries(PARAMS)) {
    if (route.includes(token)) {
      if (!value) unresolved = token;
      route = route.replace(token, value);
    }
  }
  const out = resolve(ROOT, `public/user-manual/screenshots/${t.persona}/${t.process}/${t.id}.png`);
  if (unresolved) {
    failed.push({ id: t.id, route: t.route, reason: `No demo-safe identifier available for ${unresolved}.` });
    continue;
  }
  try {
    const res = await page.goto(`${BASE_URL}${route}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2500);
    const url = page.url();
    if (/\/(login|auth|unauthorized|403)(\?|$)/.test(new URL(url).pathname + '?')) {
      failed.push({ id: t.id, route, reason: `Route redirected to ${new URL(url).pathname} — persona/authorisation not available in this environment.` });
      continue;
    }
    if (res && res.status() >= 400) {
      failed.push({ id: t.id, route, reason: `HTTP ${res.status()} from the running application.` });
      continue;
    }
    mkdirSync(dirname(out), { recursive: true });
    await page.screenshot({ path: out });
    captured.push({ id: t.id, route, file: `/user-manual/screenshots/${t.persona}/${t.process}/${t.id}.png` });
  } catch (err) {
    failed.push({ id: t.id, route, reason: `Capture error: ${String(err).slice(0, 160)}` });
  }
}

await browser.close();

const report = { baseUrl: BASE_URL, captured, failed, capturedCount: captured.length, failedCount: failed.length };
writeFileSync(resolve(ROOT, 'docs/user-manual/screenshot-capture-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`captured=${captured.length} failed=${failed.length}`);
for (const f of failed) console.log(`  FAILED ${f.id} (${f.route}): ${f.reason}`);
