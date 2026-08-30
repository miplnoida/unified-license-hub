#!/usr/bin/env node
/**
 * System Runtime Integrity Gate — Phase 3 live database contract census.
 *
 * Takes the static inventory produced by collect-contracts.mjs and verifies
 * every referenced database object against the ACTUAL connected database
 * catalog (never against the generated Supabase types).
 *
 * Emits scripts/system-runtime/live-census.json.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const inv = JSON.parse(readFileSync('scripts/system-runtime/contract-inventory.json', 'utf8'));

function q(sql) {
  const out = execFileSync('psql', ['-At', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.trim() ? out.trim().split('\n').map((l) => l.split('\t')) : [];
}

// ---------------------------------------------------------------- relations
const rel = new Map(); // "schema.name" -> kind
for (const [s, n, k] of q(`
  SELECT n.nspname, c.relname, c.relkind
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname NOT LIKE 'pg_%'
`)) rel.set(`${s}.${n}`, k);

// ---------------------------------------------------------------- routines
const routines = new Map(); // name -> [{schema,args,ret,secdef,execAnon,execAuth}]
for (const [s, n, args, ret, secdef, ea, eu] of q(`
  SELECT n.nspname, p.proname,
         pg_get_function_arguments(p.oid),
         pg_get_function_result(p.oid),
         p.prosecdef::text,
         has_function_privilege('anon', p.oid, 'EXECUTE')::text,
         has_function_privilege('authenticated', p.oid, 'EXECUTE')::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','extensions','storage','auth','graphql_public')
`)) {
  if (!routines.has(n)) routines.set(n, []);
  routines.get(n).push({ schema: s, args, ret, secdef: secdef === 'true', execAnon: ea === 'true', execAuth: eu === 'true' });
}

// ---------------------------------------------------------------- buckets
const buckets = new Set(q(`SELECT id FROM storage.buckets`).map((r) => r[0]));

// -------------------------------------------------------- realtime publication
const realtimeTables = new Set(
  q(`SELECT schemaname||'.'||tablename FROM pg_publication_tables WHERE pubname='supabase_realtime'`).map((r) => r[0]),
);

// ---------------------------------------------------------------- classify
const results = [];
for (const d of inv.dependencies) {
  const r = { ...d, status: 'VALID', detail: '' };
  const bare = d.object.includes('.') ? d.object.split('.').pop() : d.object;
  const schema = d.object.includes('.') ? d.object.split('.')[0] : 'public';
  if (d.type === 'TABLE_OR_VIEW' || d.type === 'REALTIME_SOURCE') {
    const kind = rel.get(`${schema}.${bare}`);
    if (!kind) {
      // wrong-schema detection: exists under another schema
      const other = [...rel.keys()].filter((k) => k.endsWith(`.${bare}`));
      r.status = other.length ? 'WRONG_SCHEMA' : 'MISSING_RELATION';
      r.detail = other.length ? `exists as ${other.join(', ')}` : 'no relation with this name in any non-system schema';
    } else {
      r.detail = { r: 'TABLE', p: 'PARTITIONED_TABLE', v: 'VIEW', m: 'MATERIALIZED_VIEW', f: 'FOREIGN_TABLE' }[kind];
      if (d.type === 'REALTIME_SOURCE' && !realtimeTables.has(`${schema}.${bare}`)) {
        r.status = 'MISSING_REALTIME_REGISTRATION';
        r.detail += ' (not in supabase_realtime publication)';
      }
    }
  } else if (d.type === 'RPC') {
    const cands = routines.get(bare);
    if (!cands || !cands.length) { r.status = 'MISSING_RPC'; r.detail = 'no routine with this name'; }
    else {
      const pub = cands.filter((c) => c.schema === 'public');
      if (!pub.length) { r.status = 'WRONG_SCHEMA'; r.detail = `only in ${cands.map((c) => c.schema).join(',')}`; }
      else if (!pub.some((c) => c.execAuth || c.execAnon)) { r.status = 'AUTHORIZATION_NO_EXECUTE'; r.detail = 'no EXECUTE for anon/authenticated'; }
      else {
        r.detail = pub.map((c) => `(${c.args}) -> ${c.ret}${c.secdef ? ' SECDEF' : ''}`).join(' | ');
        r.overloads = pub.length;
      }
    }
  } else if (d.type === 'STORAGE_BUCKET') {
    if (!buckets.has(d.object)) { r.status = 'MISSING_STORAGE'; r.detail = 'bucket not present'; }
  }
  results.push(r);
}

// ------------------------------------------- RPC argument-name verification
// For every valid RPC call site, compare the object keys passed by the frontend
// with the live argument names. A key the routine does not declare is a
// signature mismatch (PostgREST returns 404 "function ... does not exist").
const srcCache = new Map();
function readSrc(f) { if (!srcCache.has(f)) srcCache.set(f, readFileSync(f, 'utf8')); return srcCache.get(f); }
const sigDefects = [];
for (const r of results) {
  if (r.type !== 'RPC' || r.status !== 'VALID') continue;
  const cands = routines.get(r.object).filter((c) => c.schema === 'public');
  const argNameSets = cands.map((c) => new Set(
    c.args.split(',').map((a) => a.trim()).filter(Boolean)
      .map((a) => a.replace(/^(IN|OUT|INOUT|VARIADIC)\s+/i, '').split(/\s+/)[0])
      .filter((n) => /^[A-Za-z_]\w*$/.test(n)),
  ));
  for (const f of r.referencedBy) {
    const s = readSrc(f);
    const head = new RegExp(`\\.rpc\\(\\s*['"\`]${r.object}['"\`]\\s*,\\s*\\{`, 'g');
    for (const m of s.matchAll(head)) {
      // Brace-balanced scan so nested payload objects are not mistaken for
      // top-level RPC arguments (a nested `{ start, end }` is one argument).
      let i = m.index + m[0].length;
      let depth = 1;
      const keys = [];
      let atTop = true;
      let buf = '';
      while (i < s.length && depth > 0) {
        const ch = s[i];
        if (ch === '{' || ch === '[' || ch === '(') { depth++; atTop = false; }
        else if (ch === '}' || ch === ']' || ch === ')') { depth--; if (depth === 1) atTop = true; }
        else if (depth === 1) {
          if (ch === ',') { atTop = true; buf = ''; }
          else if (ch === ':' && atTop) { const k = buf.trim(); if (/^[A-Za-z_]\w*$/.test(k)) keys.push(k); atTop = false; buf = ''; }
          else buf += ch;
        }
        i++;
      }
      if (!keys.length) continue;
      const ok = argNameSets.some((set) => keys.every((k) => set.has(k)));
      if (!ok) sigDefects.push({ rpc: r.object, file: f, passed: keys, live: argNameSets.map((s2) => [...s2]) });
    }
  }

}
for (const d of sigDefects) {
  const r = results.find((x) => x.type === 'RPC' && x.object === d.rpc);
  if (r && r.status === 'VALID') { r.status = 'RPC_SIGNATURE_MISMATCH'; r.detail = `caller keys [${d.passed}] not accepted by live signature`; }
}

// ---------------------------------------------------------------- summary
const by = {};
for (const r of results) by[r.status] = (by[r.status] || 0) + 1;
const out = {
  generatedAt: new Date().toISOString(),
  summary: by,
  liveCounts: { relations: rel.size, routines: routines.size, buckets: buckets.size, realtimePublication: realtimeTables.size },
  results,
  signatureDefects: sigDefects,
};
writeFileSync('scripts/system-runtime/live-census.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(by, null, 2));
for (const r of results.filter((x) => x.status !== 'VALID')) {
  console.log(`${r.status}\t${r.type}\t${r.object}\troutes=${r.routes.length}\t${r.detail}`);
}
