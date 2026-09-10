#!/usr/bin/env node
/**
 * AML-10 frontend boundary verifier.
 *
 * Proves the browser never authoritatively decides: which entities are visible,
 * a risk classification, a provenance bucket, any total or distribution, a
 * review state, a movement direction, a consequence count, a filter result, or
 * an exported value. React may display the server's portfolio contract and
 * request a governed export.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'src';
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git']);
const HOOK = 'src/hooks/useAmlPortfolio.ts';
const REPORT = 'src/components/supervision/aml/AmlPortfolioReport.tsx';
const PAGE = 'src/pages/supervision/aml/AmlPortfolio.tsx';

const GOVERNED_READS = ['supervisory_portfolio_report'];
const GOVERNED_EXPORTS = ['supervisory_portfolio_export'];
const PORTFOLIO_TABLES = [
  'entity_risk_state',
  'entity_risk_state_movement',
  'supervisory_assessment_risk_publication',
  'supervisory_consequence_decision',
  'supervisory_reassessment_requirement',
  'supervisory_risk_monitoring_decision',
  'supervisory_finding',
  'supervisory_intervention',
  'enforcement_actions',
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

const read = (f) => readFileSync(f, 'utf8');
const hook = read(HOOK);
const report = read(REPORT);
const page = read(PAGE);
const surfaces = [hook, report, page];
const surfaceNames = [HOOK, REPORT, PAGE];

const gates = [];
const gate = (family, name, ok, detail = '') => gates.push({ family, name, ok, detail });

/* --------------------------------------------------------- 1. server source */
{
  const missing = GOVERNED_READS.filter((r) => !hook.includes(r));
  gate('SOURCE', 'The portfolio read model is consumed by name', missing.length === 0, missing.join(', '));
}
{
  const missing = GOVERNED_EXPORTS.filter((r) => !hook.includes(r));
  gate('SOURCE', 'The export is produced by the governed server export function',
    missing.length === 0, missing.join(', '));
}
{
  const offenders = PORTFOLIO_TABLES.filter((t) => surfaces.some((s) => s.includes(`from('${t}')`) || s.includes(`from("${t}")`)));
  gate('SOURCE', 'No portfolio surface reads a canonical supervisory table directly',
    offenders.length === 0, offenders.join(', '));
}
{
  gate('SOURCE', 'The portfolio surfaces create no new supervisory source of truth',
    !surfaces.some((s) => /\.insert\(|\.upsert\(|\.delete\(/.test(s)));
}

/* ------------------------------------------------------------ 2. visibility */
{
  gate('VISIBILITY', 'The screen does not filter the entity population client-side',
    !/entities\s*\.\s*filter\(/.test(report) && !/entities\.slice\(/.test(report));
}
{
  gate('VISIBILITY', 'Regulator, domain and perimeter scope is never evaluated in the browser',
    !/regulator_id\s*===|sector_id\s*===|scope_admits|perimeter/i.test(report));
}
{
  gate('VISIBILITY', 'Restricted matters are shown as presence only, never as content',
    /restricted_matter_present/.test(report) && !/restricted_(detail|content|reason_text)/.test(report));
}

/* ------------------------------------------------------------- 3. arithmetic */
{
  const aggregation = /\.reduce\((?![^)]*directions)/.test(report)
    || /(entities|movements|risk_distribution)[^\n]*\.(reduce|filter)\([^)]*\+/.test(report);
  gate('TOTALS', 'The screen performs no aggregation over server rows', !aggregation);
}
{
  const sums = surfaces.some((s) => /(total|count|sum)\w*\s*=\s*[^;\n]*\.reduce\(/i.test(s));
  gate('TOTALS', 'No total, count or sum is computed in TypeScript', !sums);
}
{
  gate('TOTALS', 'Every summary card reads a server-published total',
    /s\?\.visible_entity_total/.test(report) && /s\?\.entities_with_open_consequence/.test(report));
}
{
  gate('TOTALS', 'Bucket and review counts are indexed from the server summary, never recounted',
    /s\.calculated_risk_total/.test(report) && /s\.review_overdue_total/.test(report));
}
{
  gate('TOTALS', 'The only client arithmetic is bar geometry, printed alongside the server number',
    /function Bar\(/.test(report) && /aria-hidden/.test(report));
}

/* ---------------------------------------------------------- 4. classification */
{
  const bands = /(?:>=|<=|>|<)\s*(?:0\.\d+|[1-9]\d*)\s*\)?\s*\?\s*['"](?:HIGH|MEDIUM|LOW|CRITICAL)/i.test(report);
  gate('CLASSIFY', 'No risk band, rating or score threshold is decided in the browser', !bands);
}
{
  gate('CLASSIFY', 'Provenance buckets are labelled, not derived',
    /PROVENANCE_BUCKET_LABEL/.test(hook) && !/provenance_bucket\s*=\s*(?!.*LABEL)/.test(report));
}
{
  gate('CLASSIFY', 'Legacy and not-calculated records are reported in their own buckets',
    /LEGACY/.test(hook) && /NOT_CALCULABLE/.test(hook)
    && /not a calculated rating/i.test(read(HOOK)));
}
{
  gate('CLASSIFY', 'Review status labels map canonical monitoring states only',
    /PORTFOLIO_REVIEW_LABEL/.test(hook)
    && ['CURRENT', 'DUE', 'OVERDUE', 'EVENT_TRIGGERED', 'UNSCHEDULED', 'BLOCKED', 'LEGACY']
      .every((s) => hook.includes(s)));
}
{
  gate('CLASSIFY', 'Movement direction is displayed from the server field, never inferred from ratings',
    /m\.direction/.test(report)
    && !/previous_rating\s*[<>]/.test(report) && !/new_rating\s*[<>]/.test(report));
}

/* ----------------------------------------------------------------- 5. dates */
{
  gate('DATES', 'The as-of date and trend period are server-stated',
    /data\.as_of/.test(report) && /trends\?\.period_from/.test(report));
}
{
  gate('DATES', 'No review date, interval or risk age is calculated in the browser',
    !/Date\.now\(\)|addMonths|differenceInDays|setMonth\(/.test(report)
    && /r\.risk_age_days/.test(report));
}

/* --------------------------------------------------------------- 6. filters */
{
  gate('FILTERS', 'Filter selections are sent to the server as a payload',
    /monitoring_state:\s*state === 'all' \? null : state/.test(report)
    && /useAmlPortfolioReport\(filters\)/.test(report));
}
{
  gate('FILTERS', 'The filtered result set is refetched, not sliced locally',
    /queryKey: \[\.\.\.PORTFOLIO_KEY, filters\]/.test(hook));
}
{
  gate('FILTERS', 'Server truncation is disclosed rather than hidden',
    /data\?\.truncated/.test(report) && /Totals cover every entity in scope/.test(report));
}

/* ---------------------------------------------------------------- 7. export */
{
  gate('EXPORT', 'The export payload is the server payload — the browser only writes the file',
    /exportToCsv\(\s*report\.entities/.test(hook));
}
{
  gate('EXPORT', 'The export carries server provenance including who generated it and when',
    /report\.generated_by/.test(hook) && /report\.generated_at/.test(hook));
}
{
  gate('EXPORT', 'No export value is recomputed or re-derived client-side',
    !/rowCount:\s*report\.entities\.length/.test(hook)
    && /rowCount:\s*Number\(report\.row_count/.test(hook));
}
{
  gate('EXPORT', 'A refused export is surfaced with the server reason',
    /port-export-error/.test(report) && /portfolioErrorMessage/.test(report));
}

/* -------------------------------------------------------- 8. scope of screen */
{
  gate('SURFACE', 'The portfolio route is mounted for the AML supervision module',
    read('src/routes/dashboardRoutes.tsx').includes("path=\"/supervision/aml/portfolio\"")
    && read('src/config/navigation.tsx').includes('/supervision/aml/portfolio'));
}
{
  gate('SURFACE', 'The reporting surface takes no supervisory decision and creates no record',
    !/require_reassessment|reschedule|record_consequence|approve|publish/i.test(report));
}
{
  gate('SURFACE', 'The operational work queue is not duplicated by the report',
    /work queue remains on Supervised/i.test(report));
}
{
  gate('SURFACE', 'A due or overdue review is stated as a workflow condition, not a new rating',
    /workflow condition, not a new risk rating/i.test(report));
}

/* -------------------------------------------- 9. no duplicate portfolio model */
{
  const all = walk(SRC).filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes('/test/'));
  const consumers = all.filter((f) => read(f).includes('supervisory_portfolio_report'));
  gate('SINGLE', 'Exactly one hook module owns the portfolio read model',
    consumers.length === 1 && consumers[0] === HOOK, consumers.join(', '));
}
{
  gate('SINGLE', 'The AML-09 monitoring model is not re-implemented here',
    !/supervisory_risk_monitoring_view|supervisory_risk_monitoring_due_list/.test(hook));
}
{
  gate('SINGLE', 'The portfolio surfaces are the only files added for this report',
    surfaceNames.every((f) => read(f).length > 0));
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
console.log(`\nAML-10 frontend boundary: ${gates.length - failed}/${gates.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);
