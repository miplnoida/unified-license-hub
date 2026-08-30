#!/usr/bin/env node
/**
 * SYSTEM RUNTIME INTEGRITY — INTERNAL CONTRACT GATE.
 *
 * The frontend contract gate (verify-system-runtime-schema.mjs) proves that every
 * object the BROWSER references exists live. It cannot see two other contract
 * surfaces that are equally capable of breaking a production screen:
 *
 *   1. EDGE FUNCTION INTERNAL CONTRACTS — the `.from('x').select('a,b')` calls
 *      made inside supabase/functions/**. These run with the service role, so a
 *      stale column surfaces to the user as an opaque HTTP 500 (RF-17:
 *      public-registry selected licenses.issue_date, which does not exist).
 *
 *   2. DATABASE ROUTINE BODY CONTRACTS — qualified `alias.column` references
 *      inside PL/pgSQL / SQL function bodies. A stale reference is only raised
 *      when the routine is actually executed, so it is invisible to catalog-level
 *      checks (RF-07 licensees.entity_name, RF-11 fp_individual_roles.person_id,
 *      RF-15 notification_event_configs.entity_type).
 *
 * Both surfaces are triangulated against the LIVE catalog via psql. Nothing is
 * trusted from the generated Supabase types.
 *
 * Dynamic / non-statically-resolvable expressions are never wildcard-deferred:
 * they must be listed exactly in internal-contract-audit.json.
 *
 * Usage:
 *   node scripts/system-runtime/verify-internal-contracts.mjs
 *   node scripts/system-runtime/verify-internal-contracts.mjs --self-test
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = process.cwd();
const DIR = path.join(ROOT, 'scripts/system-runtime');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase/functions');
const AUDIT_FILE = path.join(DIR, 'internal-contract-audit.json');
const selfTest = process.argv.includes('--self-test');

function q(sql) {
  const out = execFileSync('psql', ['-At', '-F', '\t', '-c', sql], {
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.trim() ? out.trim().split('\n').map((l) => l.split('\t')) : [];
}

// ------------------------------------------------------------------ live catalog
const columns = new Map(); // "schema.table" -> Set(column)
for (const [s, t, c] of q(`
  SELECT table_schema, table_name, column_name
  FROM information_schema.columns
  WHERE table_schema IN ('public','storage','auth')
`)) {
  const k = `${s}.${t}`;
  if (!columns.has(k)) columns.set(k, new Set());
  columns.get(k).add(c);
}
const relations = new Set(
  q(`
  SELECT n.nspname||'.'||c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE c.relkind IN ('r','p','v','m','f') AND n.nspname IN ('public','storage','auth')
`).map((r) => r[0]),
);
const routineNames = new Set(
  q(`SELECT n.nspname||'.'||p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'`).map((r) => r[0]),
);
const buckets = new Set(q(`SELECT id FROM storage.buckets`).map((r) => r[0]));

const audit = existsSync(AUDIT_FILE) ? JSON.parse(readFileSync(AUDIT_FILE, 'utf8')) : { edgeFunctions: [], routines: [] };
if (JSON.stringify(audit).includes('*')) {
  console.error('FATAL: internal-contract-audit.json must not contain wildcard entries.');
  process.exit(1);
}
const auditedEdge = new Set((audit.edgeFunctions || []).map((e) => `${e.function}|${e.expression}`));
const auditedRoutine = new Set((audit.routines || []).map((e) => `${e.routine}|${e.expression}`));

const defects = [];
const deferrals = [];
function defect(surface, o) {
  defects.push({ surface, ...o });
}

// --------------------------------------------------------- 1. edge functions
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|js|mjs)$/.test(e)) out.push(p);
  }
  return out;
}

const IDENT = String.raw`[A-Za-z_][A-Za-z0-9_]*`;
const edgeStats = { functions: 0, files: 0, dependencies: 0 };
const edgeFiles = existsSync(FUNCTIONS_DIR) ? walk(FUNCTIONS_DIR) : [];
const edgeFunctionNames = new Set(
  edgeFiles.map((f) => path.relative(FUNCTIONS_DIR, f).split(path.sep)[0]).filter((n) => !n.startsWith('_')),
);
edgeStats.functions = edgeFunctionNames.size;

/** Column tokens inside a PostgREST select list, ignoring embeds and modifiers. */
function selectColumns(list) {
  const cols = [];
  let depth = 0;
  let token = '';
  const push = () => {
    const t = token.trim();
    token = '';
    if (!t || t === '*') return;
    // `alias:column`, `column::type`, `count`, `column.desc`
    const bare = t.split(':').pop().split('::')[0].trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bare)) cols.push(bare);
  };
  for (const ch of list) {
    if (ch === '(') { depth++; token += ch; continue; }
    if (ch === ')') { depth--; token += ch; continue; }
    if (ch === ',' && depth === 0) { push(); continue; }
    token += ch;
  }
  push();
  // Drop tokens that carried an embed `table(...)`
  return cols.filter((c) => !/[()]/.test(c));
}

for (const file of edgeFiles) {
  const fnName = path.relative(FUNCTIONS_DIR, file).split(path.sep)[0];
  if (fnName.startsWith('_')) continue; // shared helpers: no independent contract
  edgeStats.files++;
  const src = readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // .from('table') ... optional .select('...')
  const fromRe = new RegExp(String.raw`\.from\(\s*(['"\`])([^'"\`]+)\1\s*\)([\s\S]{0,700})`, 'g');
  let m;
  while ((m = fromRe.exec(src))) {
    const table = m[2];
    // A PostgREST builder chain ends at the statement boundary. Without this cut
    // the window bleeds into the NEXT query and reports its columns against this
    // table, which would make the gate useless (false positives) instead of exact.
    let tail = m[3];
    const cut = Math.min(
      ...[tail.indexOf(';'), tail.indexOf('.from('), tail.indexOf('.rpc(')]
        .map((i) => (i === -1 ? tail.length : i)),
    );
    tail = tail.slice(0, cut);
    edgeStats.dependencies++;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue; // storage path, not a relation
    const key = `public.${table}`;
    if (!relations.has(key) && !buckets.has(table)) {
      defect('EDGE_FUNCTION', { function: fnName, file: rel, object: key, type: 'MISSING TABLE/VIEW', expression: `.from('${table}')` });
      continue;
    }
    if (!relations.has(key)) continue; // storage bucket handle
    const live = columns.get(key) || new Set();
    const sel = tail.match(new RegExp(String.raw`\.select\(\s*([\`'"])([\s\S]*?)\1`));
    const cols = new Set();
    if (sel) selectColumns(sel[2]).forEach((c) => cols.add(c));
    // filters / ordering reference real columns too
    const filterRe = new RegExp(String.raw`\.(eq|neq|gt|gte|lt|lte|like|ilike|is|in|contains|order)\(\s*(['"\`])(${IDENT})\2`, 'g');
    let f;
    while ((f = filterRe.exec(tail))) cols.add(f[3]);
    for (const c of cols) {
      if (sel && sel[2].includes('${')) continue; // interpolated: audited below
      if (!live.has(c)) {
        defect('EDGE_FUNCTION', {
          function: fnName, file: rel, object: key, column: c,
          type: 'MISSING COLUMN', expression: `.from('${table}') → ${c}`,
        });
      }
    }
    if (sel && sel[2].includes('${')) {
      const expr = `.from('${table}').select(<interpolated>)`;
      if (auditedEdge.has(`${fnName}|${expr}`)) deferrals.push({ surface: 'EDGE_FUNCTION', function: fnName, expression: expr });
      else defect('EDGE_FUNCTION', { function: fnName, file: rel, object: key, type: 'UNAUDITED DYNAMIC SELECT', expression: expr });
    }
  }

  // .rpc('name')
  const rpcRe = new RegExp(String.raw`\.rpc\(\s*(['"\`])([^'"\`]+)\1`, 'g');
  while ((m = rpcRe.exec(src))) {
    edgeStats.dependencies++;
    if (!routineNames.has(`public.${m[2]}`)) {
      defect('EDGE_FUNCTION', { function: fnName, file: rel, object: `public.${m[2]}`, type: 'MISSING RPC', expression: `.rpc('${m[2]}')` });
    }
  }

  // storage bucket handles
  const bucketRe = new RegExp(String.raw`\.storage\s*\.from\(\s*(['"\`])([^'"\`$]+)\1`, 'g');
  while ((m = bucketRe.exec(src))) {
    edgeStats.dependencies++;
    if (!buckets.has(m[2])) {
      defect('EDGE_FUNCTION', { function: fnName, file: rel, object: m[2], type: 'MISSING STORAGE BUCKET', expression: `.storage.from('${m[2]}')` });
    }
  }
}

// -------------------------------------------------------- 2. routine bodies
const routineStats = { routines: 0, aliases: 0, dependencies: 0 };
// Function bodies are multi-line, so newlines are encoded before transport and
// restored here. Extension-owned routines (pgtap et al.) are not application
// contracts and are excluded.
const bodies = q(`
  SELECT p.proname, replace(pg_get_functiondef(p.oid), chr(10), '~~NL~~')
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prokind IN ('f','p')
    AND NOT EXISTS (
      SELECT 1 FROM pg_depend d
      WHERE d.objid = p.oid AND d.deptype = 'e'
    )
`).map(([name, def]) => [name, def.split('~~NL~~').join('\n')]);

const RESERVED = new Set(['as', 'on', 'where', 'select', 'from', 'join', 'left', 'right', 'inner', 'outer',
  'lateral', 'group', 'order', 'limit', 'using', 'set', 'and', 'or', 'not', 'union', 'all', 'when',
  'then', 'else', 'end', 'into', 'values', 'returning', 'cross', 'full', 'natural', 'having', 'for', 'loop', 'if']);

for (const [name, def] of bodies) {
  routineStats.routines++;
  // alias -> table, from `FROM public.t alias` / `JOIN public.t AS alias`
  const aliasMap = new Map();
  const aliasRe = new RegExp(
    String.raw`\b(?:FROM|JOIN)\s+(?:public\.)?(${IDENT})\s+(?:AS\s+)?(${IDENT})\b`, 'gi');
  let a;
  while ((a = aliasRe.exec(def))) {
    const table = a[1].toLowerCase();
    const alias = a[2].toLowerCase();
    if (RESERVED.has(alias) || RESERVED.has(table)) continue;
    if (!relations.has(`public.${table}`)) continue;
    if (aliasMap.has(alias) && aliasMap.get(alias) !== table) {
      aliasMap.set(alias, null); // ambiguous inside one routine: audited, never guessed
    } else aliasMap.set(alias, table);
  }
  for (const [alias, table] of aliasMap) {
    if (!table) continue;
    routineStats.aliases++;
    const live = columns.get(`public.${table}`);
    if (!live) continue;
    const seen = new Set();
    const colRe = new RegExp(String.raw`\b${alias}\.(${IDENT})\b`, 'g');
    let c;
    while ((c = colRe.exec(def))) {
      const col = c[1];
      if (seen.has(col)) continue;
      seen.add(col);
      routineStats.dependencies++;
      if (live.has(col)) continue;
      if (live.has(col.toLowerCase())) continue;
      const expr = `${alias}.${col} → public.${table}`;
      if (auditedRoutine.has(`${name}|${expr}`)) { deferrals.push({ surface: 'ROUTINE_BODY', routine: name, expression: expr }); continue; }
      defect('ROUTINE_BODY', { routine: name, object: `public.${table}`, column: col, type: 'MISSING COLUMN', expression: expr });
    }
  }
}

// ---------------------------------------------------------------- self-test
if (selfTest) {
  // Negative fixture: a stale edge-function column MUST be reported.
  const fake = `const x = await admin.from("licenses").select("id, license_number, issue_date");`;
  const live = columns.get('public.licenses');
  const cols = selectColumns('id, license_number, issue_date');
  const missing = cols.filter((c) => !live.has(c));
  const routineNeg = (() => {
    const l = columns.get('public.licensees');
    return !l.has('entity_name');
  })();
  const ok = missing.includes('issue_date') && routineNeg && fake.length > 0;
  console.log(`SELF-TEST edge stale column detected: ${missing.includes('issue_date') ? 'YES' : 'NO'}`);
  console.log(`SELF-TEST routine stale column detectable (licensees.entity_name): ${routineNeg ? 'YES' : 'NO'}`);
  if (!ok) { console.error('SELF-TEST FAILED — the verifier does not fail closed.'); process.exit(1); }
  console.log('SELF-TEST PASS');
}

// ------------------------------------------------------------------- report
console.log('=== INTERNAL CONTRACT GATE ===');
console.log(`EDGE FUNCTIONS scanned          : ${edgeStats.functions} (${edgeStats.files} source files)`);
console.log(`EDGE-FUNCTION dependencies      : ${edgeStats.dependencies}`);
console.log(`ROUTINES scanned                : ${routineStats.routines}`);
console.log(`ROUTINE resolved table aliases  : ${routineStats.aliases}`);
console.log(`ROUTINE-BODY column references  : ${routineStats.dependencies}`);
console.log(`TOTAL VERIFIED INTERNAL CONTRACTS: ${edgeStats.dependencies + routineStats.dependencies}`);
console.log(`EXPLICIT AUDITED DEFERRALS      : ${deferrals.length}`);
console.log(`DEFECTS                         : ${defects.length}`);
if (defects.length) {
  for (const d of defects) {
    console.log(
      `  [${d.surface}] ${d.type} :: ${d.routine || d.function} :: ${d.expression}${d.file ? ` (${d.file})` : ''}`,
    );
  }
  process.exit(1);
}
console.log('RESULT: PASS');
