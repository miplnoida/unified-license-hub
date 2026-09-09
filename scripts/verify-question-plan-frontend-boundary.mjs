#!/usr/bin/env node
/**
 * AML-04 front-end boundary gate (PLAN-48 companion).
 *
 * Proves that the browser never decides question applicability:
 *  FE-01  no source file reads the plan/rule tables directly (.from('...'))
 *  FE-02  no source file re-implements plan states or class filtering as logic
 *  FE-03  NOT_APPLICABLE is never used as a plan/scope state in the client
 *  FE-04  every plan write goes through a governed RPC
 *  FE-05  rule definitions are never evaluated client-side
 *  FE-06  the assessment workspace exposes the server-owned scope surface
 *  FE-07  the methodology studio exposes governed rule authoring
 *
 * Usage: node scripts/verify-question-plan-frontend-boundary.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = 'src';
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})(ROOT);

const SKIP = (f) => f.includes('integrations/supabase/types.ts') || f.includes(path.join('src', 'test'));
const src = files.filter((f) => !SKIP(f)).map((f) => [f, readFileSync(f, 'utf8')]);

const failures = [];
const pass = [];
const fail = (gate, msg) => failures.push(`${gate}: ${msg}`);
const ok = (gate, msg) => pass.push(`${gate}: ${msg}`);

const TABLES = [
  'supervisory_assessment_question_plan',
  'supervisory_assessment_question_plan_override',
  'supervisory_methodology_question_rule',
];

// FE-01 — no direct table reads
let direct = [];
for (const [f, text] of src) {
  for (const t of TABLES) {
    const re = new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]`);
    if (re.test(text)) direct.push(`${f} → ${t}`);
  }
}
direct.length
  ? fail('FE-01', `direct table access: ${direct.join(', ')}`)
  : ok('FE-01', 'no client file reads the plan, override or rule tables directly');

// FE-02 — no client-side re-derivation of inclusion
const DERIVE = [
  /question_class\s*===\s*['"]CONDITIONAL['"]\s*&&/,
  /\.filter\([^)]*question_class[^)]*\)\s*\.\s*filter\([^)]*rule/,
  /function\s+\w*(?:isIncluded|computeScope|deriveApplicab)\w*/i,
];
const derived = [];
for (const [f, text] of src) {
  if (f.endsWith('useAmlQuestionPlan.ts')) continue;
  for (const re of DERIVE) if (re.test(text)) derived.push(f);
}
derived.length
  ? fail('FE-02', `client-side applicability derivation in ${[...new Set(derived)].join(', ')}`)
  : ok('FE-02', 'no client file derives question inclusion itself');

// FE-03 — NOT_APPLICABLE is never a scope state in the client
const naAsState = [];
for (const [f, text] of src) {
  const lines = text.split('\n');
  lines.forEach((l, i) => {
    if (!l.includes('NOT_APPLICABLE')) return;
    if (/(plan_state|effective_state|PLAN_STATES|OVERRIDE_STATES|_to_state|toState)/.test(l)) {
      naAsState.push(`${f}:${i + 1}`);
    }
  });
}
naAsState.length
  ? fail('FE-03', `NOT_APPLICABLE used as a scope state at ${naAsState.join(', ')}`)
  : ok('FE-03', 'NOT_APPLICABLE never appears as a question-plan or override state');

// FE-04 — governed writes only
const hook = src.find(([f]) => f.endsWith('useAmlQuestionPlan.ts'));
if (!hook) fail('FE-04', 'src/hooks/useAmlQuestionPlan.ts is missing');
else {
  const need = [
    'supervisory_assessment_question_plan_materialize',
    'supervisory_assessment_question_plan_override_apply',
    'supervisory_assessment_question_plan_context',
  ];
  const missing = need.filter((n) => !hook[1].includes(n));
  const inserts = /\.(insert|update|upsert|delete)\(/.test(hook[1]);
  if (missing.length) fail('FE-04', `plan hook does not call ${missing.join(', ')}`);
  else if (inserts) fail('FE-04', 'plan hook performs a direct table write');
  else ok('FE-04', 'plan reads and writes go only through governed RPCs');
}

// FE-05 — rules are never evaluated in the browser
const evaluators = [];
for (const [f, text] of src) {
  if (/rule_definition/.test(text) && /(switch\s*\(\s*\w*\.?op\b|case\s+['"]EQ['"]|new Function|eval\()/.test(text)) {
    evaluators.push(f);
  }
}
evaluators.length
  ? fail('FE-05', `rule evaluation in ${evaluators.join(', ')}`)
  : ok('FE-05', 'no client file interprets or evaluates a rule definition');

// FE-06 / FE-07 — the surfaces exist
const workspace = src.find(([f]) => f.endsWith(path.join('aml', 'AmlAssessmentWorkspace.tsx')));
workspace && /AmlQuestionPlanPanel/.test(workspace[1])
  ? ok('FE-06', 'the assessment workspace mounts the server-owned question scope surface')
  : fail('FE-06', 'the assessment workspace does not expose question scope');

const questions = src.find(([f]) => f.endsWith(path.join('tabs', 'QuestionsTab.tsx')));
const ruleSection = src.find(([f]) => f.endsWith('QuestionRuleSection.tsx'));
questions && /QuestionRuleSection/.test(questions[1]) && ruleSection
  && /supervisory_question_rule_vocabulary|useQuestionRuleVocabulary/.test(ruleSection[1])
  ? ok('FE-07', 'the methodology studio authors rules from the server-owned vocabulary')
  : fail('FE-07', 'governed rule authoring is not wired into the methodology studio');

for (const p of pass) console.log(`PASS ${p}`);
for (const f of failures) console.error(`FAIL ${f}`);
console.log(`\nAML-04 front-end boundary: ${pass.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
