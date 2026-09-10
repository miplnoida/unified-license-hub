#!/usr/bin/env node
/**
 * AML-08 frontend boundary verifier.
 *
 * Proves the browser never authoritatively decides: whether a risk-of-record may
 * be acted on, which supervisory consequence is permitted, which permission
 * applies, which prerequisite is satisfied, whether a target is a duplicate,
 * what lineage is bound, or what a rating "means". React may display the server's
 * consequence contract and invoke governed operations.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const HOOK = 'src/hooks/useAmlSupervisoryConsequence.ts';
const PANEL = 'src/components/supervision/aml/AmlSupervisoryConsequencePanel.tsx';

const GOVERNED_RPCS = ['supervisory_consequence_record', 'supervisory_consequence_withdraw'];
const GOVERNED_READS = ['supervisory_consequence_view'];

const CONSEQUENCE_TABLES = [
  'supervisory_consequence_decision',
  'supervisory_plan',
  'supervisory_intervention',
  'supervisory_reassessment_requirement',
  'supervisory_finding',
  'examinations',
  'enforcement_actions',
  'entity_risk_state',
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
const amlFiles = appFiles.filter((f) => /aml/i.test(f) || /supervision/i.test(f) || /entity-detail/i.test(f));
const read = (f) => readFileSync(f, 'utf8');
const hook = read(HOOK);
const panel = read(PANEL);

const gates = [];
const gate = (family, name, ok, detail = '') => gates.push({ family, name, ok, detail });

/* ------------------------------------------------- 1. no direct table writes */
{
  const offenders = [];
  for (const f of appFiles) {
    const src = read(f);
    for (const t of CONSEQUENCE_TABLES) {
      const re = new RegExp(`from\\(['"\`]${t}['"\`]\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`);
      if (re.test(src)) offenders.push(`${f} → ${t}`);
    }
  }
  gate('WRITE', 'No direct client writes to consequence, plan, examination, finding, intervention or enforcement tables',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('WRITE', 'The consequence surface reads no table directly',
    !/\.from\(/.test(panel) && !/\.from\(/.test(hook));
}

/* ---------------------------------------------- 2. no rating → action mapping */
{
  const offenders = amlFiles.filter((f) => {
    const src = read(f);
    return /(RATING_ACTION|ACTION_BY_RATING|RISK_TO_ACTION|RATING_TO_ACTION|ESCALATION_MATRIX)/.test(src);
  });
  gate('JUDGMENT', 'No rating→action mapping table exists in TypeScript',
    offenders.length === 0, offenders.join('; '));
}
{
  const derives =
    /(rating|residual|band)[A-Za-z_]*\s*===\s*['"](HIGH|MEDIUM_HIGH|CRITICAL)['"][\s\S]{0,160}(mutateAsync|actionType|available\s*=\s*true)/i.test(panel);
  gate('JUDGMENT', 'The screen never proposes or enables an action from a rating value', !derives);
}
{
  gate('JUDGMENT', 'The screen states that a rating is an input, not an instruction',
    /never an instruction/i.test(panel));
}

/* ----------------------------------------------------- 3. eligibility is server */
{
  const offenders = appFiles.filter((f) => {
    if (f === HOOK) return false;
    const src = read(f);
    return /(canRecordConsequence|isConsequenceEligible|computeConsequenceActions)\s*[=(]/.test(src);
  });
  gate('ELIGIBILITY', 'Consequence eligibility is not computed in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('ELIGIBILITY', 'Action availability is read from the server action list',
    /a\.action === action/.test(hook) && /action\.available/.test(panel));
}
{
  gate('ELIGIBILITY', 'Blocking conditions are rendered from the server blocker list',
    /src\.blockers/.test(panel) && !/blockers\s*=\s*\[/.test(panel));
}
{
  const localPublishRule =
    /(source_kind\s*===\s*['"]PUBLICATION['"]|eligible\s*=\s*[^;]*(APPROVED|published))[\s\S]{0,120}(available\s*=\s*true|mutateAsync)/.test(panel);
  gate('ELIGIBILITY', 'Publication eligibility is never re-derived on the screen', !localPublishRule);
}

/* ------------------------------------------------------- 4. permission is server */
{
  const offenders = amlFiles.filter((f) => {
    const src = read(f);
    return /role\s*===\s*['"](admin|super_admin|supervisor)['"][\s\S]{0,120}(consequence|refer|intervention|examination)/i.test(src);
  });
  gate('PERMISSION', 'No role-name check decides consequence authority',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('PERMISSION', 'The required permission is displayed from the server contract',
    /required_permission/.test(panel) && !/required_permission\s*=\s*['"]/.test(panel));
}

/* ------------------------------------------------------- 5. prerequisites */
{
  const offenders = appFiles.filter((f) => {
    if (f === HOOK) return false;
    const src = read(f);
    return /(hasApprovedPlan|requiresEndorsedIntervention|prerequisiteSatisfied)\s*[=(]/.test(src);
  });
  gate('PREREQUISITE', 'Prerequisite records are not evaluated in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('PREREQUISITE', 'Missing prerequisites are shown from the server reason code',
    /PREREQUISITE_MISSING/.test(hook));
}

/* ---------------------------------------------------------- 6. duplicates */
{
  const offenders = appFiles.filter((f) => {
    const src = read(f);
    return /(isDuplicateConsequence|dedupeConsequence)\s*[=(]/.test(src);
  });
  gate('DUPLICATE', 'Duplicate equivalence is not decided in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('DUPLICATE', 'The server duplicate verdict is surfaced, not suppressed',
    /res\?\.duplicate/.test(panel));
}

/* ------------------------------------------------------------ 7. lineage */
{
  gate('LINEAGE', 'Lineage is displayed from the server decision record only',
    /lineage/.test(hook) && !/lineage\s*=\s*\{[^}]*publication_id\s*:/.test(panel));
}
{
  const offenders = appFiles.filter((f) => {
    const src = read(f);
    return /calculation_availability\s*=\s*['"](CALCULATED|NOT_CALCULABLE)['"]/.test(src) && !f.includes('/test/');
  });
  gate('LINEAGE', 'Calculation availability is never asserted by client code',
    offenders.length === 0, offenders.join('; '));
}

/* --------------------------------------------------------- 8. governed calls */
{
  const missing = GOVERNED_RPCS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'All governed consequence operations are invoked by name',
    missing.length === 0, missing.join(', '));
}
{
  const missing = GOVERNED_READS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'The server consequence read model is consumed by name',
    missing.length === 0, missing.join(', '));
}
{
  gate('GOVERNED', 'The surface is mounted on the AML assessment workspace and the entity AML view',
    read('src/pages/supervision/aml/AmlAssessmentWorkspace.tsx').includes('AmlSupervisoryConsequencePanel')
    && read('src/components/entity-detail/EntityAmlPanel.tsx').includes('AmlSupervisoryConsequencePanel'));
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
console.log(`\nAML-08 frontend boundary: ${gates.length - failed}/${gates.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);
