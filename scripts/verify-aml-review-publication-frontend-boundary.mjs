#!/usr/bin/env node
/**
 * AML-07 frontend boundary verifier.
 *
 * Proves the browser never authoritatively decides: lifecycle transitions,
 * submission readiness, reviewer eligibility, maker-checker separation,
 * challenge resolution, the final approved rating, override precedence,
 * publication eligibility, risk supersession, the current risk-of-record or
 * downstream risk. React may display server outcomes and invoke governed RPCs.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const HOOK = 'src/hooks/useAmlAssessmentReview.ts';
const REVIEW_PANEL = 'src/components/supervision/aml/AmlAssessmentReviewPanel.tsx';
const RISK_PANEL = 'src/components/supervision/aml/AmlEntityRiskHistory.tsx';

const GOVERNED_RPCS = [
  'supervisory_assessment_submit_for_review',
  'supervisory_assessment_review_assign',
  'supervisory_assessment_challenge_raise',
  'supervisory_assessment_challenge_resolve',
  'supervisory_assessment_review_return',
  'supervisory_assessment_review_reject',
  'supervisory_assessment_approve',
  'supervisory_assessment_publish_risk_of_record',
];

const GOVERNED_READS = [
  'supervisory_assessment_lifecycle_state',
  'supervisory_assessment_review_register',
  'supervisory_assessment_risk_lineage',
  'supervisory_entity_risk_history',
];

const REVIEW_TABLES = [
  'supervisory_assessment_review_round',
  'supervisory_assessment_review_challenge',
  'supervisory_assessment_approval_decision',
  'supervisory_assessment_risk_publication',
  'entity_risk_state',
  'entity_risk_state_movement',
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p)) out.push(p);
  }
  return out;
}

const allFiles = walk(SRC);
const appFiles = allFiles.filter(
  (f) => !f.includes('integrations/supabase/types') && !f.includes('/test/') && !/\.test\.tsx?$/.test(f),
);
// AML-07 owns the AML supervision surface; unrelated domains have their own boundary verifiers.
const amlFiles = appFiles.filter((f) => /aml/i.test(f) || /supervision/i.test(f) || /entity-detail/i.test(f));
const read = (f) => readFileSync(f, 'utf8');
const hook = read(HOOK);
const reviewPanel = read(REVIEW_PANEL);
const riskPanel = read(RISK_PANEL);

const gates = [];
const gate = (family, name, ok, detail = '') => gates.push({ family, name, ok, detail });

/* ------------------------------------------------- 1. no direct table writes */
{
  const offenders = [];
  for (const f of appFiles) {
    const src = read(f);
    for (const t of REVIEW_TABLES) {
      const re = new RegExp(`from\\(['"\`]${t}['"\`]\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`);
      if (re.test(src)) offenders.push(`${f} → ${t}`);
    }
  }
  gate('WRITE', 'No direct client writes to review, decision, publication or risk tables',
    offenders.length === 0, offenders.join('; '));
}

/* ------------------------------------------ 2. no client lifecycle machine */
{
  const offenders = amlFiles.filter((f) => {
    const src = read(f);
    if (f === HOOK) return false;
    return /(ALLOWED_TRANSITIONS|TRANSITION_MAP|NEXT_STATES|LIFECYCLE_TRANSITIONS)/.test(src);
  });
  gate('LIFECYCLE', 'No lifecycle transition table exists in TypeScript',
    offenders.length === 0, offenders.join('; '));
}
{
  const localStateDecision =
    /canonical_state\s*===\s*['"][A-Z_]+['"][\s\S]{0,60}&&[\s\S]{0,120}(mutateAsync|permitted\s*=\s*true)/.test(reviewPanel);
  gate('LIFECYCLE', 'The review screen does not gate governed actions on a locally derived state',
    !localStateDecision);
}
{
  gate('LIFECYCLE', 'Action availability is read from the server action list',
    /actions\?\.find\(\(a\)\s*=>\s*a\.action === action\)/.test(hook)
    && /permitted\('SUBMIT_FOR_REVIEW'\)/.test(reviewPanel));
}

/* ------------------------------------------------- 3. readiness not computed */
{
  const offenders = appFiles.filter((f) => {
    if (f === HOOK) return false;
    const src = read(f);
    return /(isReadyToSubmit|computeReadiness|canSubmitAssessment)\s*[=(]/.test(src);
  });
  gate('SUBMIT', 'Submission readiness is not computed in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('SUBMIT', 'Blockers are rendered from the server blocker list',
    /life\.blockers/.test(reviewPanel) && !/blockers\s*=\s*\[/.test(reviewPanel));
}

/* -------------------------------------- 4. reviewer eligibility / maker-checker */
{
  const offenders = amlFiles.filter((f) => {
    const src = read(f);
    return /(role\s*===\s*['"](admin|super_admin|supervisor)['"][\s\S]{0,80}(approve|publish))/i.test(src);
  });
  gate('MAKER_CHECKER', 'No role-name check decides review or approval authority',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('MAKER_CHECKER', 'Maker-checker separation is displayed from server flags only',
    /maker_checker_required/.test(hook)
    && !/viewer_is_preparer\s*\?\s*false/.test(reviewPanel)
    && !/preparerCannotApprove\s*=/.test(reviewPanel));
}

/* -------------------------------------------------- 5. final rating precedence */
{
  const offenders = appFiles.filter((f) => {
    const src = read(f);
    return /(override_rating\s*(\?\?|\|\|)\s*computed_rating|computed_rating\s*(\?\?|\|\|)\s*override_rating)/.test(src);
  });
  gate('APPROVAL', 'Override precedence is never resolved in TypeScript',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('APPROVAL', 'The approved result is read from the server decision record',
    /decision\?\.final_rating/.test(reviewPanel) && /final_rating_source/.test(reviewPanel));
}

/* ------------------------------------------------------ 6. publication policy */
{
  gate('PUBLISH', 'Publication eligibility comes from the server action contract',
    /permitted\('PUBLISH_RISK_OF_RECORD'\)/.test(reviewPanel)
    && !/canPublish\s*=\s*[^;]*(APPROVED|approved)/.test(reviewPanel));
}
{
  const offenders = appFiles.filter((f) => {
    const src = read(f);
    return /(supersede|supersession)[A-Za-z]*\s*\(/i.test(src) && /entity_risk_state/.test(src);
  });
  gate('SUPERSEDE', 'Risk supersession is not performed by client code',
    offenders.length === 0, offenders.join('; '));
}

/* ------------------------------------------------- 7. current risk-of-record */
{
  gate('RISK', 'Current risk is read only from the governed risk-history contract',
    /supervisory_entity_risk_history/.test(hook)
    && /data\?\.current/.test(riskPanel)
    && !/movements\[0\]\s*\.\s*new_rating\s*as\s*current/i.test(riskPanel));
}
{
  const offenders = appFiles.filter((f) => {
    const src = read(f);
    return /current[A-Za-z]*Risk\s*=\s*[^;]*(draft|calculation_run|computed_rating)/i.test(src);
  });
  gate('RISK', 'No screen presents a draft or calculated result as current risk',
    offenders.length === 0, offenders.join('; '));
}

/* ------------------------------------------------------------ 8. governed RPCs */
{
  const missing = GOVERNED_RPCS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'All governed review, approval and publication operations are invoked by name',
    missing.length === 0, missing.join(', '));
}
{
  const missing = GOVERNED_READS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'All server read models are consumed by name',
    missing.length === 0, missing.join(', '));
}

/* --------------------------------------------------------------- 9. redaction */
{
  gate('LINEAGE', 'Lineage evidence is rendered from the server accessible view',
    /accessible_count/.test(reviewPanel)
    && !/restricted[A-Za-z]*\s*=\s*[^;]*length\s*-/.test(reviewPanel));
}

const width = Math.max(...gates.map((g) => g.family.length));
let failed = 0;
const families = new Map();
for (const g of gates) {
  const f = families.get(g.family) ?? { pass: 0, total: 0 };
  f.total += 1;
  if (g.ok) f.pass += 1; else failed += 1;
  families.set(g.family, f);
  console.log(`${g.ok ? 'PASS' : 'FAIL'}  ${g.family.padEnd(width)}  ${g.name}${g.detail ? ` — ${g.detail}` : ''}`);
}
console.log('\n--- family totals ---');
for (const [name, f] of families) console.log(`${name.padEnd(width)}  ${f.pass}/${f.total}`);
console.log(`\nAML-07 frontend boundary: ${gates.length - failed}/${gates.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);
