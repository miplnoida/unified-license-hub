#!/usr/bin/env node
/**
 * AML-09 frontend boundary verifier.
 *
 * Proves the browser never authoritatively decides: a next review date, a review
 * interval, a monitoring state, which events count, whether reassessment is
 * available, who has authority, whether a repeat request is a duplicate, a
 * schedule override, or an entity's risk. React may display the server's
 * monitoring contract and invoke the governed operations.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const HOOK = 'src/hooks/useAmlRiskMonitoring.ts';
const PANEL = 'src/components/supervision/aml/AmlRiskMonitoringPanel.tsx';
const LIST = 'src/components/supervision/aml/AmlDueReviewList.tsx';

const GOVERNED_RPCS = [
  'supervisory_risk_monitoring_require_reassessment',
  'supervisory_risk_monitoring_reschedule',
];
const GOVERNED_READS = [
  'supervisory_risk_monitoring_view',
  'supervisory_risk_monitoring_due_list',
];

const MONITORING_TABLES = [
  'supervisory_risk_monitoring_decision',
  'supervisory_reassessment_requirement',
  'entity_risk_state',
  'entity_risk_state_movement',
  'supervisory_assessment_programme',
  'supervisory_assessment_risk_publication',
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
const read = (f) => readFileSync(f, 'utf8');
const hook = read(HOOK);
const panel = read(PANEL);
const list = read(LIST);
const surfaces = [hook, panel, list];

const gates = [];
const gate = (family, name, ok, detail = '') => gates.push({ family, name, ok, detail });

/* ------------------------------------------------------ 1. no direct writes */
{
  const offenders = [];
  for (const f of appFiles) {
    const src = read(f);
    for (const t of MONITORING_TABLES) {
      const re = new RegExp(`from\\(['"\`]${t}['"\`]\\)[\\s\\S]{0,200}?\\.(insert|update|upsert|delete)\\(`);
      if (re.test(src)) offenders.push(`${f} → ${t}`);
    }
  }
  gate('WRITE', 'No direct client writes to monitoring decision, reassessment, risk state, programme or publication tables',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('WRITE', 'The monitoring surfaces read no table directly',
    surfaces.every((s) => !/\.from\(/.test(s)));
}

/* --------------------------------------------------------- 2. due dates */
{
  const arithmetic = surfaces.some((s) =>
    /(addMonths|setMonth\(|setFullYear\(|\+\s*(REVIEW|CYCLE)_?(MONTHS|INTERVAL)|1000\s*\*\s*60\s*\*\s*60\s*\*\s*24)/.test(s));
  gate('DUE_DATE', 'No due-date arithmetic exists on the monitoring surfaces', !arithmetic);
}
{
  const interval = surfaces.some((s) =>
    /(REVIEW_INTERVAL|DEFAULT_REVIEW|REVIEW_MONTHS|CYCLE_MONTHS|recurrence_months\s*[=:]\s*\d)/.test(s));
  gate('DUE_DATE', 'No default review interval or cycle length is declared in TypeScript', !interval);
}
{
  gate('DUE_DATE', 'The next review date is rendered from the server schedule only',
    /schedule\.next_review_date|s\.next_review_date/.test(panel)
    && !/next_review_date\s*=\s*[^;]*(new Date|Date\.)/.test(panel));
}
{
  gate('DUE_DATE', 'The basis for the date is displayed from the server basis code',
    /due_date_basis/.test(panel) && !/due_date_basis\s*=\s*['"]/.test(panel));
}

/* --------------------------------------------------- 3. monitoring state */
{
  const derived = surfaces.some((s) =>
    /(monitoring_state\s*=\s*['"]|isOverdue\s*[=(]|computeMonitoringState|deriveMonitoringState)/.test(s));
  gate('STATE', 'The monitoring state is never derived or assigned in the browser', !derived);
}
{
  const compares = /(next_review_date|dueDate)[\s\S]{0,40}<\s*(new Date|Date\.now|today)/.test(panel + list);
  gate('STATE', 'No screen compares a review date against today to decide a state', !compares);
}
{
  gate('STATE', 'The state and its reason code are rendered as returned',
    /view\.monitoring_state/.test(panel) && /view\.reason_code/.test(panel));
}
{
  // Scoped to the AML-09 monitoring surfaces: other modules have their own
  // governed vocabularies and are out of scope for this boundary.
  const invented = surfaces.some((s) => /DUE_SOON/.test(s));
  gate('STATE', 'No ungoverned DUE_SOON state is invented on the AML monitoring surfaces', !invented);
}

/* --------------------------------------------------------- 4. events */
{
  const invented = surfaces.some((s) =>
    /(EVENT_RULES|TRIGGER_THRESHOLD|eventRequiresReassessment|isTriggeringEvent)\s*[=(:]/.test(s));
  gate('EVENT', 'No event rule or trigger threshold exists in TypeScript', !invented);
}
{
  gate('EVENT', 'Recognised events are read from the server event list',
    /view\.events/.test(panel) && !/events\s*=\s*\[\s*\{/.test(panel));
}
{
  const severityRule = /severity\s*===\s*['"](HIGH|CRITICAL)['"][\s\S]{0,160}(mutateAsync|available)/.test(panel);
  gate('EVENT', 'No severity test decides whether an event may drive reassessment', !severityRule);
}

/* -------------------------------------------------- 5. eligibility / authority */
{
  const offenders = appFiles.filter((f) => {
    if (f === HOOK) return false;
    return /(canRequireReassessment|isReassessmentEligible|computeMonitoringActions)\s*[=(]/.test(read(f));
  });
  gate('ELIGIBILITY', 'Reassessment eligibility is not computed in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('ELIGIBILITY', 'Both buttons are gated only by the server availability verdict',
    /reassessAction\?\.available/.test(panel) && /rescheduleAction\?\.available/.test(panel));
}
{
  const roleRule = /role\s*===\s*['"](admin|super_admin|supervisor)['"][\s\S]{0,140}(reassess|reschedul|monitoring)/i.test(panel + list + hook);
  gate('PERMISSION', 'No role-name check decides monitoring authority', !roleRule);
}
{
  gate('PERMISSION', 'The required permission is displayed from the server contract',
    /required_permission/.test(panel) && !/required_permission\s*[=:]\s*['"]aml/.test(panel));
}

/* ------------------------------------------------------- 6. duplicates */
{
  const offenders = appFiles.filter((f) => /(isDuplicateReassessment|dedupeReassessment)\s*[=(]/.test(read(f)));
  gate('DUPLICATE', 'Duplicate equivalence is not decided in the browser',
    offenders.length === 0, offenders.join('; '));
}
{
  gate('DUPLICATE', 'The server duplicate verdict is surfaced, not suppressed',
    /res\?\.duplicate/.test(panel));
}

/* -------------------------------------------------- 7. schedule / risk safety */
{
  const overwrite = /schedule_decision\s*=\s*\{|original_due_date\s*=\s*[^;]*revised/.test(panel);
  gate('SCHEDULE', 'The screen never rewrites a recorded schedule decision', !overwrite);
}
{
  gate('SCHEDULE', 'Waiver is presented as unsupported rather than implemented',
    /WAIVE_REVIEW/.test(hook) && !/disposition:\s*['"]WAIVED['"]/.test(panel));
}
{
  const ratingWrite = /(residual_rating|current_rating)\s*[=:]\s*['"](LOW|MEDIUM|HIGH|MEDIUM_HIGH|CRITICAL)['"]/.test(panel + list + hook);
  gate('RISK', 'No monitoring surface assigns or downgrades a risk rating', !ratingWrite);
}
{
  gate('RISK', 'The screen states that a due or overdue review is not a new rating',
    /workflow condition, not a new risk rating/i.test(panel));
}

/* --------------------------------------------------------- 8. governed calls */
{
  const missing = GOVERNED_RPCS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'All governed monitoring operations are invoked by name',
    missing.length === 0, missing.join(', '));
}
{
  const missing = GOVERNED_READS.filter((r) => !hook.includes(r));
  gate('GOVERNED', 'Both server read models are consumed by name',
    missing.length === 0, missing.join(', '));
}
{
  gate('GOVERNED', 'The monitoring section is mounted on the entity AML view and the due list on the portfolio surface',
    read('src/components/entity-detail/EntityAmlPanel.tsx').includes('AmlRiskMonitoringPanel')
    && read('src/pages/supervision/aml/AmlSupervisedEntities.tsx').includes('AmlDueReviewList'));
}
{
  gate('GOVERNED', 'The due list stays a work list and publishes no aggregate analytics',
    !/(Recharts|ResponsiveContainer|BarChart|PieChart|average|percentile)/i.test(list));
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
console.log(`\nAML-09 frontend boundary: ${gates.length - failed}/${gates.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);
