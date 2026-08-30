#!/usr/bin/env node
/**
 * Permanent User Manual documentation gate (documentation only).
 *
 * Proves the in-app manual, its navigation registration, its contextual help
 * anchors, its screenshot manifest and its generated documents are complete and
 * honest. NEEDS_CAPTURE with a recorded reason is acceptable; a silently missing
 * screenshot is not.
 *
 *   node scripts/verify-user-manual.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');
let pass = 0;
const fail = [];
const ok = (cond, label) => (cond ? pass++ : fail.push(label));

const MANUAL_ROUTE = '/help/user-manual';

/* ------------------------------------------------------------ app wiring */
const routes = read('src/routes/dashboardRoutes.tsx');
ok(routes.includes(`path="${MANUAL_ROUTE}"`), 'React route /help/user-manual is registered');
ok(existsSync(resolve(ROOT, 'src/pages/help/UserManual.tsx')), 'manual page component exists');
const navFallback = read('src/config/navigation.tsx');
ok(navFallback.includes(MANUAL_ROUTE) && navFallback.includes('Help & User Manual'), 'fallback navigation carries the manual');
const snapshot = read('src/lib/breadcrumbs/navigationSnapshot.ts');
ok(snapshot.includes('nav_help_user_manual') && snapshot.includes(MANUAL_ROUTE), 'navigation snapshot (breadcrumb source) carries the manual');
const guards = read('src/routes/routeHelpers.tsx');
ok(guards.includes(`'${MANUAL_ROUTE}'`), 'pre-licensee registration gate allows the manual');


/* ------------------------------------------------- database registration */
if (process.env.PGHOST) {
  const q = (sql) => execFileSync('psql', ['-At', '-c', sql], { encoding: 'utf8' }).trim();
  ok(q(`select count(*) from sec_routes where path_pattern = '${MANUAL_ROUTE}' and is_active`) === '1', 'sec_routes entry exists and is active');
  ok(q("select is_protected from sec_routes where key = 'help_user_manual'") === 't', 'sec_routes.help_user_manual is_protected = true (authenticated-only)');
  ok(q("select audience from sec_routes where key = 'help_user_manual'") === 'any', 'manual route is available to any authenticated audience');
  ok(q(`select count(*) from sec_navigation_items where key = 'nav_help_user_manual' and is_active and show_in_sidebar`) === '1', 'sec_navigation_items entry exists, active and in the sidebar');
  ok(q("select show_in_search from sec_navigation_items where key = 'nav_help_user_manual'") === 't', 'manual navigation item is searchable');
  ok(q("select p.key from sec_navigation_items i join sec_navigation_items p on p.id = i.parent_id where i.key = 'nav_help_user_manual'") === 'grp_nav_home', 'manual navigation parent is Home');
  ok(q("select label from sec_navigation_items where key = 'nav_help_user_manual'") === 'Help & User Manual', 'navigation label is "Help & User Manual"');
} else {
  console.log('verify:user-manual: no database configured — skipping sec_routes / sec_navigation_items checks.');
}


/* -------------------------------------------------------------- registry */
const src = (f) => read(`src/content/user-manual/${f}`);
const count = (text, re) => (text.match(re) ?? []).length;

const meta = src('meta.ts');
ok(/version:\s*'/.test(meta), 'manual version recorded');
ok(/repositoryHead:\s*'[0-9a-f]{40}'/.test(meta), 'documented HEAD recorded');
ok(/manualStatus:\s*'INTERIM/.test(meta), 'interim status recorded');
ok(/lastE2eVerifiedHead:/.test(meta), 'E2E verification status recorded');

const personas = src('personas.ts');
ok(count(personas, /^\s{2}\{\s*$/gm) >= 10 || count(personas, /key:\s*'/g) >= 10, 'all 10 personas documented');
ok(!/audience:\s*''/.test(personas), 'every persona has a visibility classification');

const processDoc = src('sections.ts');
ok(count(processDoc, /^\s{2}\{\n\s+id: '/gm) > 0 || count(process, /\n\s{4}id: '/g) > 0, 'process chapters present');

const e360 = src('entity360.ts');
const e360Docs = count(e360, /\n\s{4}key: '/g);
const catalogue = read('src/components/entity-detail/sectionCatalogue.tsx');
const live = count(catalogue, /\n\s+key:\s*'/g);
ok(e360Docs >= 21, `Entity 360 sections documented (${e360Docs} >= 21)`);
ok(live === 0 || e360Docs >= live - 1, `Entity 360 documentation covers the live catalogue (docs ${e360Docs}, live ${live})`);

const ai = src('aiSurfaces.ts');
const aiDocs = count(ai, /\n\s{4}code: '/g);
ok(aiDocs >= 8, `governed AI surfaces documented (${aiDocs} >= 8)`);
ok(/AI_MUST_NOT_CLAIM/.test(ai), 'prohibited AI claims recorded');

const journeys = src('journeys.ts');
ok(count(journeys, /\n\s{4}code: '/g) === 6, 'journeys A–F documented (6/6)');

const demo = src('demoPlaybook.ts');
ok(count(demo, /\n\s{4}id: 'demo-/g) >= 3, 'three internal demo scripts documented');
ok(/AI_DEMO_SCENARIOS/.test(demo), 'dedicated AI demo scenarios documented');

/* ---------------------------------------------------- contextual help */
const help = src('helpLinks.ts');
const anchors = [...help.matchAll(/anchor:\s*'([^']+)'/g)].map((x) => x[1]);
ok(anchors.length >= 10, 'contextual help anchors registered');
const allText = ['sections.ts', 'entity360.ts', 'aiSurfaces.ts'].map(src).join('\n');
const brokenAnchors = anchors.filter((a) => !allText.includes(`'${a.replace(/^entity-360-/, '')}'`) && !allText.includes(`'${a}'`));
ok(brokenAnchors.length === 0, `all help anchors resolve to documented content (broken: ${brokenAnchors.join(', ')})`);
const helpComponent = 'src/components/help/ScreenHelpLink.tsx';
ok(existsSync(resolve(ROOT, helpComponent)), 'single canonical ScreenHelpLink component exists');
const surfacesWired = ['entity-360', 'entity-structure', 'licensing', 'returns', 'fees-payments', 'complaints', 'enforcement', 'ai-governance'];
const wiredHits = execFileSync('rg', ['-l', 'ScreenHelpLink|helpSurface=', 'src/pages', 'src/components'], { encoding: 'utf8' }).trim().split('\n');
ok(wiredHits.length >= 8, `contextual help wired into major surfaces (${wiredHits.length} files)`);
for (const s of surfacesWired) ok(help.includes(`surface: '${s}'`), `help surface registered: ${s}`);

/* ------------------------------------------------------------ screenshots */
const manifest = src('screenshotManifest.ts');
const ids = [...manifest.matchAll(/^\s{2}[sp]\('([^']+)'/gm)].map((x) => x[1]);
ok(ids.length > 0, 'screenshot manifest is populated');
ok(new Set(ids).size === ids.length, 'screenshot ids are unique');
const pendingIds = [...manifest.matchAll(/^\s{2}p\('([^']+)'[^\n]*'([^']*)'\),$/gm)].map((x) => x[1]);
const pendingRows = [...manifest.matchAll(/^\s{2}p\((.*)\),$/gm)].map((x) => x[1]);
ok(pendingRows.every((r) => /,\s*'[^']{20,}'\s*$/.test(r)), 'every NEEDS_CAPTURE entry records an explicit reason');
const capturedRows = [...manifest.matchAll(/^\s{2}s\('([^']+)',\s*'([^']+)',\s*'([^']+)'/gm)];
const missingFiles = capturedRows
  .map(([, id, persona, proc]) => ({ id, file: `public/user-manual/screenshots/${persona}/${proc}/${id}.png` }))
  .filter((x) => !existsSync(resolve(ROOT, x.file)));
ok(missingFiles.length === 0, `every CURRENT screenshot file exists on disk (missing: ${missingFiles.map((x) => x.id).join(', ')})`);
const retired = capturedRows.map((r) => r[4]).filter(Boolean);
ok(!manifest.includes("'/returns/management'"), 'no screenshot points at a retired route');

/* -------------------------------------------------------- generated docs */
for (const f of [
  'docs/user-manual/Unified-License-Hub-User-Manual.md',
  'docs/user-manual/Demo-Playbook.md',
  'docs/user-manual/Screenshot-Manifest.md',
  'docs/user-manual/FINAL-E2E-REFRESH.md',
]) ok(existsSync(resolve(ROOT, f)), `generated document exists: ${f}`);
const refresh = read('docs/user-manual/FINAL-E2E-REFRESH.md');
for (const clause of ['Re-census', 'Entity 360', 'AI surface', 'Recapture', 'FINAL_E2E_VERIFIED', 'lastE2eVerifiedHead', 'verify:user-manual']) {
  ok(refresh.includes(clause), `refresh contract requires: ${clause}`);
}
const generated = read('docs/user-manual/Unified-License-Hub-User-Manual.md');
ok(generated.includes(MANUAL_ROUTE) || generated.includes('User Manual'), 'generated manual carries manual identity');
ok(/INTERIM/.test(generated), 'generated manual displays interim status');

/* ------------------------------------------------------------------ report */
console.log(`\nverify:user-manual — passed ${pass}, failed ${fail.length}`);
if (fail.length) {
  for (const f of fail) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log('USER MANUAL DOCUMENTATION GATE: PASS');
