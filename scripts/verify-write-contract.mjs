#!/usr/bin/env node
/**
 * verify:write-contract — permanent gate closing the runtime write-contract
 * category exposed by DEF-F4-C-03.
 *
 * `verify:audit-contract` inspects LIVE PostgreSQL routines only. It cannot see
 * TypeScript runtime writers (Edge Functions, service layer, permitted frontend
 * mutations), which is how `process-notification-outbox` shipped an insert
 * against non-existent `notifications.related_entity_type / related_entity_id`.
 *
 * This gate statically extracts every project-owned
 *   .from("<table>").insert({...}) / .update({...}) / .upsert({...})
 * object-literal key set and compares the written keys against the authoritative
 * live DB schema (`information_schema.columns`, read via psql). Any written key
 * that is not a real column of that table is a defect. Nothing is hard-coded to
 * a specific column name or table.
 *
 * Writes whose payload is not a statically analysable inline object literal
 * (variables, spreads of computed records, arrays built at runtime) are reported
 * as DYNAMIC and listed for reviewer awareness — they are not silently ignored.
 *
 * Usage: node scripts/verify-write-contract.mjs
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOTS = ['supabase/functions', 'src', 'scripts'];
const EXTS = ['.ts', '.tsx', '.mts', '.mjs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage']);
// Test/spec sources assert on contracts, they do not perform runtime writes.
const isTestFile = (p) => /(\.test\.|\.spec\.|__tests__|\/test\/)/.test(p);

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.some((e) => name.endsWith(e)) && !isTestFile(p)) out.push(p);
  }
  return out;
}

/** Live schema: table -> Set(columns). */
function loadSchema() {
  const raw = execFileSync(
    'psql',
    ['-At', '-F', '\t', '-c',
      "select table_name, column_name from information_schema.columns where table_schema='public'"],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const map = new Map();
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    const [t, c] = line.split('\t');
    if (!map.has(t)) map.set(t, new Set());
    map.get(t).add(c);
  }
  if (map.size === 0) throw new Error('empty schema — is the database reachable?');
  return map;
}

/** Returns the index just past the matching closing brace, or -1. */
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      i++;
      while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i); if (i < 0) return -1; i++; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

/** Top-level keys of an inline object literal. `null` when not analysable. */
function objectKeys(src, openIdx) {
  const close = matchBrace(src, openIdx);
  if (close < 0) return null;
  const body = src.slice(openIdx + 1, close);
  const keys = [];
  let depth = 0;
  let i = 0;
  let atKeyPos = true;
  let sawSpread = false;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      let j = i + 1;
      let val = '';
      while (j < body.length && body[j] !== q) { if (body[j] === '\\') j++; val += body[j]; j++; }
      if (depth === 0 && atKeyPos) {
        // quoted key must be followed by ':'
        let k = j + 1;
        while (k < body.length && /\s/.test(body[k])) k++;
        if (body[k] === ':') { keys.push(val); atKeyPos = false; }
      }
      i = j + 1;
      continue;
    }
    if (ch === '/' && body[i + 1] === '/') { while (i < body.length && body[i] !== '\n') i++; continue; }
    if (ch === '/' && body[i + 1] === '*') { const e = body.indexOf('*/', i); i = e < 0 ? body.length : e + 2; continue; }
    if ('{[('.includes(ch)) { depth++; i++; continue; }
    if ('}])'.includes(ch)) { depth--; i++; continue; }
    if (depth === 0 && ch === ',') { atKeyPos = true; i++; continue; }
    if (depth === 0 && body.startsWith('...', i)) { sawSpread = true; atKeyPos = false; i += 3; continue; }
    if (depth === 0 && atKeyPos && /[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < body.length && /[A-Za-z0-9_$]/.test(body[j])) j++;
      const ident = body.slice(i, j);
      let k = j;
      while (k < body.length && /\s/.test(body[k])) k++;
      if (body[k] === ':') keys.push(ident);
      else if (body[k] === ',' || body[k] === '}' || k >= body.length) keys.push(ident); // shorthand
      atKeyPos = false;
      i = j;
      continue;
    }
    if (!/\s/.test(ch)) atKeyPos = false;
    i++;
  }
  return { keys, sawSpread };
}

const FROM_RE = /\.from\(\s*(["'`])([A-Za-z0-9_]+)\1\s*\)/g;
const OP_RE = /^\s*(?:\/\/[^\n]*\n\s*|\/\*[\s\S]*?\*\/\s*)*\.\s*(insert|update|upsert)\s*\(/;

const schema = loadSchema();
const defects = [];
const dynamic = [];
let inspected = 0;
const tablesSeen = new Map();

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const src = readFileSync(file, 'utf8');
    if (!src.includes('.from(')) continue;
    FROM_RE.lastIndex = 0;
    let m;
    while ((m = FROM_RE.exec(src))) {
      const table = m[2];
      let cursor = m.index + m[0].length;
      // allow a chain of non-mutating modifiers before the write op
      let op = null;
      for (let hop = 0; hop < 6; hop++) {
        const rest = src.slice(cursor, cursor + 4000);
        const om = OP_RE.exec(rest);
        if (om) { op = om[1]; cursor += om[0].length; break; }
        const chain = /^\s*\.\s*[A-Za-z0-9_$]+\s*\(/.exec(rest);
        if (!chain) break;
        const openParen = cursor + chain[0].length - 1;
        // skip the call's argument list
        let depth = 0; let i = openParen;
        for (; i < src.length; i++) {
          const ch = src[i];
          if (ch === '"' || ch === "'" || ch === '`') { const q = ch; i++; while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; } continue; }
          if ('([{'.includes(ch)) depth++;
          else if (')]}'.includes(ch)) { depth--; if (depth === 0) break; }
        }
        cursor = i + 1;
      }
      if (!op) continue;
      inspected++;
      const loc = `${relative(process.cwd(), file)}:${src.slice(0, cursor).split('\n').length}`;
      tablesSeen.set(table, (tablesSeen.get(table) || 0) + 1);
      let j = cursor;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] !== '{') { dynamic.push(`${loc} ${table}.${op} — non-literal payload`); continue; }
      const parsed = objectKeys(src, j);
      if (!parsed) { dynamic.push(`${loc} ${table}.${op} — unbalanced literal`); continue; }
      const cols = schema.get(table);
      if (!cols) { dynamic.push(`${loc} ${table}.${op} — table not in public schema (view/other schema)`); continue; }
      for (const key of parsed.keys) {
        if (!cols.has(key)) defects.push(`${loc} ${table}.${op} → unknown column "${key}"`);
      }
    }
  }
}

console.log(`verify:write-contract — inspected ${inspected} runtime table write(s) across ${tablesSeen.size} table(s)`);
const notifWrites = tablesSeen.get('notifications') || 0;
console.log(`  notifications writers inspected: ${notifWrites}`);
if (dynamic.length) {
  console.log(`  DYNAMIC (not statically inspectable, ${dynamic.length}):`);
  for (const d of dynamic) console.log(`    - ${d}`);
}
if (defects.length) {
  console.error(`FAIL — ${defects.length} stale runtime table-write column reference(s):`);
  for (const d of defects) console.error(`  - ${d}`);
  process.exit(1);
}
console.log('OK — 0 stale runtime table-write column references.');
