#!/usr/bin/env node
/**
 * Phase 12 — FRD traceability gate.
 *
 * Reads docs/frd/TRACEABILITY.csv and proves every claim in it:
 *  - each row carries a status the process recognises;
 *  - every file path cited as evidence exists in the repository;
 *  - every route cited as evidence is declared in src/routes/*.tsx;
 *  - Done rows cite at least one concrete artefact (file, route or DB object);
 *  - Partial/Missing rows carry a gap description so nothing is silently open.
 *
 * Exits non-zero on any unproven claim, so stale evidence cannot survive a merge.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const CSV = 'docs/frd/TRACEABILITY.csv';
const VALID = new Set(['Done', 'Partial', 'Missing', 'Planned', 'In-Progress', 'Waived']);

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift();
  return rows.filter((r) => r.some((v) => v !== '')).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const routeSource = readdirSync('src/routes')
  .filter((f) => f.endsWith('.tsx'))
  .map((f) => readFileSync(join('src/routes', f), 'utf8'))
  .join('\n');

const FILE_RE = /(?:src|supabase|docs|scripts)\/[\w\-./]+\.\w+/g;
const ROUTE_RE = /(?<![\w./])\/[a-z0-9][a-z0-9-]*(?:\/[a-z0-9:\-[\]{}]+)*/g;

const errors = [];
const warnings = [];
const rows = parseCsv(readFileSync(CSV, 'utf8'));

if (rows.length === 0) errors.push(`${CSV} contains no requirement rows`);

const seen = new Set();
for (const r of rows) {
  const id = r.item_id || '(missing item_id)';
  if (seen.has(id)) errors.push(`${id}: duplicate item_id`);
  seen.add(id);
  if (!r.screen_id) errors.push(`${id}: missing FRD screen_id`);
  if (!VALID.has(r.status_v6)) errors.push(`${id}: unrecognised status "${r.status_v6}"`);

  const evidence = `${r.evidence} ${r.route}`;
  const files = [...new Set(evidence.match(FILE_RE) ?? [])];
  const routes = [...new Set(evidence.match(ROUTE_RE) ?? [])].filter((x) => !files.some((f) => f.includes(x)));

  for (const f of files) {
    if (!existsSync(f)) errors.push(`${id}: cited evidence file does not exist: ${f}`);
  }
  for (const rt of routes) {
    const base = rt.split('/:')[0];
    if (!routeSource.includes(rt) && !routeSource.includes(base)) {
      errors.push(`${id}: cited route is not declared in src/routes: ${rt}`);
    }
  }

  if (r.status_v6 === 'Done') {
    const hasArtefact = files.length > 0 || routes.length > 0 || /\b(DB|RPC|table|edge fn)\b/i.test(r.evidence);
    if (!hasArtefact) errors.push(`${id}: marked Done but cites no file, route or database object`);
    if (Number(r.pct) < 1) errors.push(`${id}: marked Done but pct is ${r.pct}`);
  } else {
    if (!r.gap.trim()) errors.push(`${id}: status ${r.status_v6} but no gap description`);
    warnings.push(`${id} (${r.screen_id}) — ${r.status_v6} @ ${Math.round(Number(r.pct) * 100)}%`);
  }
}

const done = rows.filter((r) => r.status_v6 === 'Done').length;
console.log(`FRD traceability: ${rows.length} requirements, ${done} Done, ${rows.length - done} open.`);
for (const w of warnings) console.log(`  open: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`FRD traceability gate failed with ${errors.length} unproven claim(s).`);
  process.exit(1);
}
console.log('FRD traceability gate passed: every cited artefact exists.');
