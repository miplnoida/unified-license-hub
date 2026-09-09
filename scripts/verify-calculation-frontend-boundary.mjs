#!/usr/bin/env node
/**
 * AML-06 front-end boundary gate.
 *
 * Proves that no authoritative calculation policy or regulatory arithmetic lives
 * in the browser. React may collect policy input, invoke a governed operation and
 * display the server's persisted run — nothing else.
 *
 *  CFB-01  no client file writes an AML-06 policy, run or override store directly
 *  CFB-02  no client file multiplies or divides by a weight (no local aggregation)
 *  CFB-03  no hard-coded band edge / threshold table exists in the client
 *  CFB-04  no residual-risk matrix lookup exists in the client
 *  CFB-05  no unit conversion factor exists in the client
 *  CFB-06  no client file computes a completeness percentage
 *  CFB-07  no client file rounds a regulatory score or rating
 *  CFB-08  every policy mutation goes through a governed RPC
 *  CFB-09  the calculation workspace reads only the server calculation view
 *  CFB-10  override proposal and decision are server operations
 *  CFB-11  the override rating vocabulary comes from the published methodology
 *  CFB-12  the assessment workspace mounts the calculation surface
 *
 * Usage: node scripts/verify-calculation-frontend-boundary.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})('src');

const SKIP = (f) =>
  f.includes(path.join('integrations', 'supabase', 'types.ts')) || f.includes(path.join('src', 'test'));
const src = files.filter((f) => !SKIP(f)).map((f) => [f, readFileSync(f, 'utf8')]);
const read = (suffix) => src.find(([f]) => f.endsWith(suffix));

const pass = [];
const failures = [];
const ok = (g, m) => pass.push(`${g}: ${m}`);
const fail = (g, m) => failures.push(`${g}: ${m}`);

const HOOK_PATH = 'useAmlCalculationPolicy.ts';
const hook = read(HOOK_PATH);

/* CFB-02, CFB-06 and CFB-07 police the AML-06 calculation surfaces themselves:
 * the calculation policy hooks, the four policy editors, the calculation
 * configuration/approval screens and the assessment calculation panel. Unrelated
 * product areas keep their own domain gates. */
const AML06 = src.filter(([f]) =>
  /useAmlCalculationPolicy\.ts$|useSupervisoryCalculationConfig\.ts$/.test(f)
  || f.includes(path.join('components', 'admin', 'calculation'))
  || /SupervisoryCalculationConfig\.tsx$|SupervisoryCalculationApprovals\.tsx$/.test(f)
  || /AmlAssessmentCalculation\.tsx$/.test(f));
const panel = read(path.join('supervision', 'aml', 'AmlAssessmentCalculation.tsx'));
const workspace = read(path.join('supervision', 'aml', 'AmlAssessmentWorkspace.tsx'));

const STORES = [
  'supervisory_calculation_question_weight',
  'supervisory_calculation_dimension_weight',
  'supervisory_calculation_fact_rule',
  'supervisory_calculation_fact_threshold',
  'supervisory_calculation_materiality_rule',
  'supervisory_assessment_calculation_run',
  'supervisory_calculation_override',
];

/* CFB-01 — no direct writes to any AML-06 store */
{
  const hits = [];
  for (const [f, text] of src) {
    for (const store of STORES) {
      const re = new RegExp(`from\\(['"\`]${store}['"\`]\\)\\s*\\.\\s*(insert|update|upsert|delete)`);
      if (re.test(text)) hits.push(`${f} → ${store}`);
    }
  }
  hits.length === 0
    ? ok('CFB-01', 'no client file writes an AML-06 calculation store directly')
    : fail('CFB-01', `direct store writes: ${hits.join(', ')}`);
}

/* CFB-02 — no local weighted aggregation */
{
  const re = /(weight\s*[*/]\s*[A-Za-z0-9_.]+)|([A-Za-z0-9_.]*score[A-Za-z0-9_.]*\s*[*/]\s*[A-Za-z0-9_.]*weight)/i;
  const hits = AML06.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-02', 'no client file aggregates scores by weight')
    : fail('CFB-02', `local weighted aggregation: ${hits.join(', ')}`);
}

/* CFB-03 — no hard-coded band or threshold table */
{
  const re = /(min_value\s*:\s*-?\d)|(max_value\s*:\s*-?\d)|(band_code\s*:\s*['"][A-Z_]+['"]\s*,\s*(min|max))|(threshold_value\s*:\s*-?\d)/;
  const hits = src.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-03', 'no band edge or threshold value is hard-coded in the client')
    : fail('CFB-03', `hard-coded thresholds: ${hits.join(', ')}`);
}

/* CFB-04 — no residual matrix lookup in TypeScript */
{
  const re = /(RESIDUAL_MATRIX)|(residualMatrix\s*[:=]\s*\{)|(matrix\s*\[\s*[A-Za-z0-9_.]+\s*\]\s*\[)/;
  const hits = src.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-04', 'no residual-risk matrix is resolved in the client')
    : fail('CFB-04', `client matrix lookup: ${hits.join(', ')}`);
}

/* CFB-05 — no unit conversion factor */
{
  const re = /(UNIT_FACTOR)|(unitFactor)|(\/\s*100\s*\)?\s*;?\s*\/\/\s*percent)|(convertUnit)/;
  const hits = src.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-05', 'no unit conversion factor exists in the client')
    : fail('CFB-05', `client unit conversion: ${hits.join(', ')}`);
}

/* CFB-06 — no client completeness computation */
{
  const re = /(completeness\w*\s*=\s*[^;]*\/)|(computeCompleteness)|(min_completeness_pct\s*[<>])/i;
  const hits = AML06.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-06', 'no client file computes or enforces completeness')
    : fail('CFB-06', `client completeness logic: ${hits.join(', ')}`);
}

/* CFB-07 — no rounding of a regulatory value */
{
  const re = /Math\.(round|floor|ceil)\s*\(\s*[A-Za-z0-9_.]*(score|rating|band|residual|inherent|control)/i;
  const hits = AML06.filter(([, t]) => re.test(t)).map(([f]) => f);
  hits.length === 0
    ? ok('CFB-07', 'no client file rounds a regulatory score or rating')
    : fail('CFB-07', `client rounding: ${hits.join(', ')}`);
}

/* CFB-08 — governed RPC for every policy mutation */
{
  const required = [
    'supervisory_calculation_question_weights_set',
    'supervisory_calculation_dimension_weights_set',
    'supervisory_calculation_fact_rules_set',
    'supervisory_calculation_materiality_set',
  ];
  const missing = required.filter((r) => !hook?.[1].includes(r));
  missing.length === 0
    ? ok('CFB-08', 'every policy layer is saved through its governed operation')
    : fail('CFB-08', `missing governed operations: ${missing.join(', ')}`);
}

/* CFB-09 — the workspace panel reads only the server view */
{
  const t = panel?.[1] ?? '';
  const usesView = t.includes('useAssessmentCalculationView');
  const noDirectRead = !/from\(['"`]supervisory_calculation/.test(t) && !/from\(['"`]supervisory_assessment_calculation/.test(t);
  usesView && noDirectRead
    ? ok('CFB-09', 'the calculation surface renders the server calculation view only')
    : fail('CFB-09', 'the calculation surface does not consume the server view exclusively');
}

/* CFB-10 — override operations are server-side */
{
  const t = panel?.[1] ?? '';
  const h = hook?.[1] ?? '';
  const serverOps = h.includes('supervisory_calculation_override_propose')
    && h.includes('supervisory_calculation_override_decide');
  const uiUsesThem = t.includes('useProposeCalculationOverride') && t.includes('useDecideCalculationOverride');
  serverOps && uiUsesThem
    ? ok('CFB-10', 'override proposal and decision are governed server operations')
    : fail('CFB-10', 'override proposal or decision is not a governed server operation');
}

/* CFB-11 — rating vocabulary comes from the published methodology */
{
  const h = hook?.[1] ?? '';
  const fromServer = h.includes('useMethodologyRatingVocabulary') && h.includes("from('supervisory_methodology')");
  const panelText = panel?.[1] ?? '';
  const noLiteralScale = !/\[\s*'(LOW|MODERATE|HIGH|SEVERE)'/.test(panelText);
  fromServer && noLiteralScale
    ? ok('CFB-11', 'the override rating vocabulary is read from the published methodology')
    : fail('CFB-11', 'the override rating vocabulary is not server-published');
}

/* CFB-12 — the assessment workspace mounts the calculation surface */
{
  (workspace?.[1] ?? '').includes('<AmlAssessmentCalculation')
    ? ok('CFB-12', 'the assessment workspace mounts the calculation surface')
    : fail('CFB-12', 'the assessment workspace does not mount the calculation surface');
}

for (const p of pass) console.log(`PASS ${p}`);
for (const f of failures) console.error(`FAIL ${f}`);
console.log(`\n${pass.length} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
