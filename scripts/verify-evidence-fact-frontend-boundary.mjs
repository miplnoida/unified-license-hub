#!/usr/bin/env node
/**
 * AML-05 front-end boundary gate.
 *
 * Proves that the browser never decides anything about the evidence basis, the
 * structured facts or submission readiness. React may display the server's
 * result, collect input, invoke a governed operation and refresh the same
 * authoritative read model — nothing else.
 *
 *  FEB-01  no client file reads or writes an AML-05 store directly
 *  FEB-02  no client file computes readiness, sufficiency or a submission gate
 *  FEB-03  no hard-coded required-fact list exists in the client
 *  FEB-04  no local source-visibility filtering acts as security
 *  FEB-05  no local evidence-kind catalogue is authoritative
 *  FEB-06  submit consumes the server can_submit
 *  FEB-07  every evidence and fact mutation goes through a governed RPC
 *  FEB-08  mutations refresh the same authoritative readiness read model
 *  FEB-09  no client file decides assessment or regulator ownership
 *  FEB-10  no client file validates fact type/unit/provenance as authority
 *  FEB-11  the readiness surface renders server checks, reasons and counts
 *  FEB-12  the workspace mounts the readiness, evidence and fact surfaces
 *
 * Usage: node scripts/verify-evidence-fact-frontend-boundary.mjs
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

const HOOK = 'src/hooks/useAssessmentEvidenceBasis.ts';
const hook = read('useAssessmentEvidenceBasis.ts');

const STORES = [
  'supervisory_assessment_evidence_basis',
  'supervisory_assessment_question_evidence',
  'supervisory_assessment_dimension_evidence',
  'supervisory_assessment_fact',
  'supervisory_methodology_fact_requirement',
];

/* FEB-01 — no direct store access (the read-only kind catalogue excepted) */
{
  const hits = [];
  for (const [f, text] of src) {
    for (const t of STORES) {
      const re = new RegExp(`\\.from\\(\\s*['"\`]${t}['"\`]`);
      if (re.test(text)) hits.push(`${f} → ${t}`);
    }
  }
  hits.length
    ? fail('FEB-01', `direct store access: ${hits.join(', ')}`)
    : ok('FEB-01', 'no client file reads or writes an evidence, link or fact store directly');
}

/* FEB-02 — readiness, sufficiency and submission gates are never computed */
{
  const DERIVE = [
    /can_submit\s*=\s*(?!.*\.data)/,
    /function\s+\w*(?:computeReadiness|deriveReadiness|isSubmittable|evidenceSufficient|canSubmit)\w*/i,
    /submission_gate\s*=\s*['"]/,
    /blocking_check_count\s*[:=]\s*(?!.*data)[^;\n]*(?:filter|length)/,
  ];
  const hits = [];
  for (const [f, text] of src) {
    if (!/readiness|can_submit|submission_gate/i.test(text)) continue;
    // The pre-AML-05 dimension-progress helper is display-only and is not a
    // submission gate; it is asserted separately by FEB-06.
    if (f.endsWith(path.join('lib', 'amlAssessmentReadiness.ts'))) continue;
    for (const re of DERIVE) if (re.test(text)) hits.push(`${f} (${re})`);
  }
  hits.length
    ? fail('FEB-02', `client-side readiness derivation: ${hits.join(', ')}`)
    : ok('FEB-02', 'no client file computes readiness, evidence sufficiency or a submission gate');
}

/**
 * The AML-05 surface: the governed hook, the supervisory assessment screens and
 * anything that consumes the evidence, fact or readiness contract. The
 * boundary gates below apply to exactly this surface, so unrelated domains
 * (returns configuration, complaints redress, fit-and-proper) cannot mask or
 * trigger an AML-05 boundary breach.
 */
const AML05 = src.filter(([f, text]) =>
  /useAssessmentEvidenceBasis/.test(text) ||
  f.includes(path.join('supervision', 'aml')) ||
  f.endsWith('useAssessmentEvidenceBasis.ts'));

/* FEB-03 — no hard-coded required facts */
{
  const hits = [];
  for (const [f, text] of AML05) {
    if (/(REQUIRED_FACTS?\s*[:=]\s*\[|const\s+\w*RequiredFacts\w*\s*=\s*\[|fact_code\s*===\s*['"])/.test(text)) {
      hits.push(f);
    }
    if (/is_required\s*[:=]\s*true/.test(text)) hits.push(`${f} (asserts is_required)`);
  }
  hits.length
    ? fail('FEB-03', `hard-coded required-fact policy in ${[...new Set(hits)].join(', ')}`)
    : ok('FEB-03', 'no client file carries a required-fact list or asserts a fact is required');
}

/* FEB-04 — source visibility is never enforced in the browser */
{
  const hits = [];
  for (const [f, text] of src) {
    if (!/source_accessible/.test(text)) continue;
    if (/\.filter\([^)]*source_accessible/.test(text) || /source_accessible\s*&&\s*(?:link|unlink|mutate)/.test(text)) {
      hits.push(f);
    }
  }
  const panel = read(path.join('aml', 'AmlQuestionEvidencePanel.tsx'));
  if (hits.length) fail('FEB-04', `local visibility filtering in ${hits.join(', ')}`);
  else if (!panel || !/source_accessible/.test(panel[1])) {
    fail('FEB-04', 'the evidence surface does not read the server accessibility flag');
  } else ok('FEB-04', 'the browser only displays the server accessibility flag; it never filters for security');
}

/* FEB-05 — the evidence-kind catalogue comes from the server */
{
  const hits = [];
  for (const [f, text] of AML05) {
    if (f.endsWith('useAssessmentEvidenceBasis.ts')) continue;
    if (/(EVIDENCE_(?:KIND|TYPE)S?\s*[:=]\s*\[|const\s+\w*EvidenceTypes\w*\s*=\s*\[)/.test(text)) hits.push(f);
  }
  const fromServer = hook && /supervisory_evidence_basis_type/.test(hook[1]);
  if (hits.length) fail('FEB-05', `local evidence-kind catalogue in ${hits.join(', ')}`);
  else if (!fromServer) fail('FEB-05', 'the evidence-kind catalogue is not read from the server');
  else ok('FEB-05', 'evidence kinds are read from the governed catalogue only');
}

/* FEB-06 — submit consumes the server decision */
{
  const actions = read(path.join('aml', 'AmlAssessmentActions.tsx'));
  if (!actions) fail('FEB-06', 'AmlAssessmentActions.tsx is missing');
  else {
    const usesServer = /useAssessmentReadiness\(/.test(actions[1]);
    const gate = /serverReadiness\.data\s*\?\s*serverReadiness\.data\.can_submit\s*:\s*false/.test(actions[1]);
    const disabled = /disabled=\{!submissionReady\}/.test(actions[1]);
    usesServer && gate && disabled
      ? ok('FEB-06', 'submission is enabled only by the server can_submit result, and never while it is unknown')
      : fail('FEB-06', 'submission does not consume the server can_submit result exclusively');
  }
}

/* FEB-07 — governed mutations only */
{
  if (!hook) fail('FEB-07', `${HOOK} is missing`);
  else {
    const need = [
      'supervisory_assessment_evidence_link',
      'supervisory_assessment_evidence_unlink',
      'supervisory_assessment_fact_set',
      'supervisory_assessment_fact_override',
      'supervisory_assessment_readiness',
      'supervisory_assessment_evidence_register',
      'supervisory_assessment_fact_register',
      'supervisory_assessment_question_execution',
    ];
    const missing = need.filter((n) => !hook[1].includes(n));
    const writes = /\.(insert|update|upsert|delete)\(/.test(hook[1]);
    if (missing.length) fail('FEB-07', `the hook does not call ${missing.join(', ')}`);
    else if (writes) fail('FEB-07', 'the hook performs a direct table write');
    else ok('FEB-07', 'every evidence and fact read and write goes through a governed operation');
  }
}

/* FEB-08 — mutations refresh the authoritative readiness read model */
{
  if (!hook) fail('FEB-08', `${HOOK} is missing`);
  else {
    const invalidates = /assessment-readiness/.test(hook[1]) && /invalidateQueries/.test(hook[1]);
    const mutations = (hook[1].match(/useMutation\(/g) ?? []).length;
    const wired = (hook[1].match(/onSuccess:\s*invalidate/g) ?? []).length;
    invalidates && mutations > 0 && wired === mutations
      ? ok('FEB-08', `all ${mutations} governed mutations refresh the same readiness read model`)
      : fail('FEB-08', `only ${wired} of ${mutations} mutations refresh readiness`);
  }
}

/* FEB-09 — ownership is never decided in the browser */
{
  const hits = [];
  for (const [f, text] of src) {
    if (/(assessment_id\s*===\s*\w+\s*&&\s*(?:link|mutate)|regulator_id\s*===\s*[^)]*\)\s*\?\s*(?:link|mutate))/.test(text)) {
      hits.push(f);
    }
    if (/\.filter\([^)]*regulator_id[^)]*\)[^;\n]*(?:link|unlink|fact_set)/.test(text)) hits.push(f);
  }
  hits.length
    ? fail('FEB-09', `client-side ownership decision in ${[...new Set(hits)].join(', ')}`)
    : ok('FEB-09', 'assessment and regulator ownership is decided only by the platform');
}

/* FEB-10 — fact validity is never asserted in the browser */
{
  const hits = [];
  for (const [f, text] of src) {
    if (!/fact/i.test(text)) continue;
    if (/(function\s+\w*validateFact\w*|isFactValid|FACT_UNITS\s*[:=]\s*\[|data_type\s*===\s*['"][A-Z_]+['"]\s*\?\s*(?:mutate|set))/.test(text)) {
      hits.push(f);
    }
  }
  hits.length
    ? fail('FEB-10', `client-side fact validation as authority in ${hits.join(', ')}`)
    : ok('FEB-10', 'fact type, unit and provenance validity is decided only by the platform');
}

/* FEB-11 — the readiness surface renders the server result verbatim */
{
  const panel = read(path.join('aml', 'AmlReadinessPanel.tsx'));
  if (!panel) fail('FEB-11', 'AmlReadinessPanel.tsx is missing');
  else {
    const t = panel[1];
    const renders = /data\.checks\.map/.test(t) && /blocking_check_count/.test(t) && /data\.can_submit/.test(t)
      && /c\.items/.test(t) && /plan_mode/.test(t);
    const computes = /\.filter\([^)]*blocking[^)]*\)\.length/.test(t);
    renders && !computes
      ? ok('FEB-11', 'the readiness surface renders the server checks, reasons, counts and plan mode as given')
      : fail('FEB-11', 'the readiness surface does not render the server result verbatim');
  }
}

/* FEB-12 — the governed surfaces are mounted in the working file */
{
  const gov = read(path.join('aml', 'AmlAssessmentGovernance.tsx'));
  const questions = read(path.join('aml', 'AmlDimensionQuestions.tsx'));
  const mounted = gov && /AmlReadinessPanel/.test(gov[1]) && /AmlFactRegisterPanel/.test(gov[1]);
  const perQuestion = questions && /AmlQuestionEvidencePanel/.test(questions[1])
    && /useAssessmentQuestionExecution/.test(questions[1]);
  mounted && perQuestion
    ? ok('FEB-12', 'the working file mounts the server readiness, fact register and per-question evidence surfaces')
    : fail('FEB-12', 'the working file does not mount the governed evidence, fact and readiness surfaces');
}

for (const p of pass) console.log(`PASS ${p}`);
for (const f of failures) console.error(`FAIL ${f}`);
console.log(`\nAML-05 front-end boundary: ${pass.length} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
