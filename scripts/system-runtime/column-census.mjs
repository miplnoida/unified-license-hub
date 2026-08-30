#!/usr/bin/env node
/**
 * System Runtime Integrity Gate — Phase 3 column & embedded-resource census.
 *
 * For every literal `supabase.from('<table>')` call site in the application,
 * extract the columns the frontend actually asks the database for:
 *   - `.select('a, b, nested(x)')`   → top-level columns + embedded resources
 *   - `.eq/.neq/.gt/.gte/.lt/.lte/.like/.ilike/.in/.is/.contains/.order(...)`
 *   - `.insert({...}) / .update({...}) / .upsert({...})` top-level keys
 * and verify each against the live catalog. Embedded resource names are
 * verified as relations (PostgREST embeds fail at runtime when the relation or
 * the FK relationship is absent).
 *
 * Also verifies configuration-stored table names (report_sources.table_name),
 * which no literal search can discover.
 *
 * Emits scripts/system-runtime/column-census.json.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

function q(sql) {
  const out = execFileSync('psql', ['-At', '-F', '\t', '-c', sql], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return out.trim() ? out.trim().split('\n').map((l) => l.split('\t')) : [];
}

const cols = new Map(); // table -> Map(col -> type)
for (const [t, c, ty] of q(`
  SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod)
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
`)) {
  if (!cols.has(t)) cols.set(t, new Map());
  cols.get(t).set(c, ty);
}
const relations = new Set(cols.keys());

// foreign-key columns per table — needed to validate PostgREST embeds that
// address the relationship through the FK column name.
const fkCols = new Map();
for (const [t, c] of q(`
  SELECT c.relname, a.attname
  FROM pg_constraint k
  JOIN pg_class c ON c.oid = k.conrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN unnest(k.conkey) AS ck(attnum) ON true
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = ck.attnum
  WHERE k.contype = 'f'
`)) {
  if (!fkCols.has(t)) fkCols.set(t, new Set());
  fkCols.get(t).add(c);
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}
const files = walk('src').filter((f) => !f.startsWith('src/test/') && f !== 'src/integrations/supabase/types.ts' && !/\.test\.tsx?$/.test(f));

const FILTERS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'contains', 'containedBy', 'order', 'overlaps'];
const findings = [];
const seen = new Set();

function record(kind, table, name, file, extra) {
  const key = `${kind}|${table}|${name}|${file}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ kind, table, name, file, ...extra });
}

/** split a PostgREST select string on top-level commas */
function splitTop(s) {
  const out = [];
  let depth = 0, buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(buf); buf = ''; } else buf += ch;
  }
  if (buf.trim()) out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const fromRe = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]\s*(?:as[^)]*)?\)/g;
  for (const m of src.matchAll(fromRe)) {
    const table = m[1];
    const pre = src.slice(Math.max(0, m.index - 40), m.index);
    if (/storage\s*\n?\s*$/.test(pre)) continue; // storage bucket
    if (!relations.has(table)) { record('MISSING_RELATION', table, '-', f, {}); continue; }
    const live = cols.get(table);
    // Bound the chain to THIS query: stop at the next builder start
    // (`supabase` / `.from(`) or a blank line / statement end, whichever comes
    // first. Without this bound, sibling queries in the same function leak
    // their columns onto the wrong table and produce false defects.
    const chain = src.slice(m.index + m[0].length, m.index + m[0].length + 1800);
    const bounds = [chain.search(/\n\s*\n/), chain.search(/;\s*\n/), chain.search(/\bsupabase\b/), chain.search(/\.from\(/)]
      .filter((i) => i > 0);
    const body = bounds.length ? chain.slice(0, Math.min(...bounds)) : chain;

    // .select('...')
    for (const sm of body.matchAll(/\.select\(\s*(['"`])([\s\S]*?)\1/g)) {
      if (sm[2].includes('${')) continue; // interpolated — not statically knowable
      for (let tok of splitTop(sm[2].replace(/\s+/g, ' '))) {
        tok = tok.trim();
        if (!tok || tok === '*' || tok.startsWith('count')) continue;
        const embed = tok.match(/^([A-Za-z0-9_]+)(?:!\w+)?\s*\(([\s\S]*)\)$/);
        const aliased = tok.match(/^([A-Za-z0-9_]+)\s*:\s*([\s\S]+)$/);
        if (embed) {
          const rel = embed[1];
          // PostgREST also allows embedding by FK COLUMN name
          // (`select('sector_id(name)')`), which is valid when the column
          // exists and carries a foreign key.
          if (!relations.has(rel) && !(live.has(rel) && fkCols.get(table)?.has(rel))) {
            record('MISSING_EMBED_RELATION', table, rel, f, {});
          }
          continue;
        }
        if (aliased) {
          const target = aliased[2].trim();
          const emb2 = target.match(/^([A-Za-z0-9_]+)(?:!\w+)?\s*\(/);
          if (emb2) {
            const rel2 = emb2[1];
            if (!relations.has(rel2) && !(live.has(rel2) && fkCols.get(table)?.has(rel2))) {
              record('MISSING_EMBED_RELATION', table, rel2, f, {});
            }
            continue;
          }
          tok = target;
        }
        const col = tok.replace(/::.*/, '').replace(/\..*/, '').replace(/!.*/, '').trim();
        if (!col || col === '*' || /[^A-Za-z0-9_]/.test(col)) continue;
        if (!live.has(col)) record('MISSING_COLUMN', table, col, f, { context: 'select' });
      }
    }
    // filters / order
    for (const fm of body.matchAll(new RegExp(`\\.(${FILTERS.join('|')})\\(\\s*(['"\`])([A-Za-z0-9_.]+)\\2`, 'g'))) {
      const col = fm[3].includes('.') ? null : fm[3];
      if (col && !live.has(col)) record('MISSING_COLUMN', table, col, f, { context: fm[1] });
    }
    // writes
    for (const wm of body.matchAll(/\.(insert|update|upsert)\(\s*\{/g)) {
      let i = wm.index + wm[0].length, depth = 1, atTop = true, buf = '';
      const keys = [];
      while (i < body.length && depth > 0) {
        const ch = body[i];
        if ('{[('.includes(ch)) { depth++; atTop = false; }
        else if ('}])'.includes(ch)) { depth--; if (depth === 1) atTop = true; }
        else if (depth === 1) {
          if (ch === ',') { atTop = true; buf = ''; }
          else if (ch === ':' && atTop) { const k = buf.trim(); if (/^[A-Za-z_]\w*$/.test(k)) keys.push(k); atTop = false; buf = ''; }
          else buf += ch;
        }
        i++;
      }
      for (const k of keys) if (!live.has(k)) record('MISSING_COLUMN', table, k, f, { context: wm[1] });
    }
  }
}

// ------------------------------------- configuration-stored table names
const configTables = q(`SELECT table_name FROM public.report_sources WHERE is_active`).map((r) => r[0]);
const configFindings = configTables
  .filter((t) => !relations.has(t))
  .map((t) => ({ kind: 'MISSING_RELATION', table: t, name: '-', file: 'public.report_sources.table_name (configuration)' }));

const all = [...findings, ...configFindings];
const summary = {};
for (const x of all) summary[x.kind] = (summary[x.kind] || 0) + 1;
writeFileSync('scripts/system-runtime/column-census.json', JSON.stringify({
  generatedAt: new Date().toISOString(),
  liveRelations: relations.size,
  configTablesChecked: configTables.length,
  summary,
  findings: all,
}, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const x of all) console.log(`${x.kind}\t${x.table}.${x.name}\t${x.context || ''}\t${x.file}`);
