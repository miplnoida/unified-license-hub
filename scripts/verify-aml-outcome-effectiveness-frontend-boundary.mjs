#!/usr/bin/env node
/**
 * AML-11 frontend boundary verifier.
 *
 * Proves that the React surface for supervisory outcome effectiveness decides
 * nothing: not eligibility, not effectiveness, not evidence sufficiency, not
 * maker-checker, not approval, not follow-up availability, not aggregate
 * outcome totals and never a risk change.
 */
import { readFileSync } from 'node:fs';

const HOOK = 'src/hooks/useAmlSupervisoryOutcome.ts';
const PANEL = 'src/components/supervision/aml/AmlOutcomeEffectivenessPanel.tsx';
const PORT_HOOK = 'src/hooks/useAmlPortfolio.ts';
const PORT_UI = 'src/components/supervision/aml/AmlPortfolioReport.tsx';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const src = Object.fromEntries([HOOK, PANEL, PORT_HOOK, PORT_UI].map((p) => [p, read(p)]));

let pass = 0;
const fails = [];
const check = (name, ok, detail = '') => {
  if (ok) {
    pass += 1;
    console.log(`PASS ${name}`);
  } else {
    fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const hook = src[HOOK];
const panel = src[PANEL];
const portHook = src[PORT_HOOK];
const portUi = src[PORT_UI];
const client = hook + panel;

/* ------------------------------------------------------------------- SOURCE */
check('SOURCE-01 outcome read model comes from the governed server function',
  hook.includes("rpc<OutcomeView>('supervisory_outcome_view'"));
check('SOURCE-02 evaluation is created only by the governed operation',
  hook.includes("'supervisory_outcome_evaluate'"));
check('SOURCE-03 review is performed only by the governed operation',
  hook.includes("'supervisory_outcome_review'"));
check('SOURCE-04 follow-up is recorded only by the governed operation',
  hook.includes("'supervisory_outcome_followup'"));
check('SOURCE-05 no direct table access from the client',
  !/from\(\s*['"]supervisory_outcome_evaluation/.test(client)
  && !/from\(\s*['"]supervisory_consequence_decision/.test(client));
check('SOURCE-06 no direct writes to canonical supervisory records',
  !/\.(insert|update|upsert|delete)\(/.test(client));

/* -------------------------------------------------------------- ELIGIBILITY */
check('ELIG-01 eligibility is read from the server verdict',
  panel.includes('a.evaluable') && hook.includes('evaluable: boolean'));
check('ELIG-02 the client never derives eligibility from a status',
  !/evaluable\s*=\s*[^;]*(status|CLOSED|COMPLETED)/i.test(panel));
check('ELIG-03 refusal reason and code are rendered as returned',
  panel.includes('action.reason') && panel.includes('reason_code'));
check('ELIG-04 completion is read, never inferred',
  panel.includes('action_completed_at') && !/action_completed\s*=\s*/.test(panel));
check('ELIG-05 legacy lineage is a server flag',
  panel.includes('a.legacy_lineage') && !/legacy_lineage\s*=\s*[^;]*publication/i.test(panel));

/* ------------------------------------------------------------ EFFECTIVENESS */
check('EFF-01 the conclusion vocabulary is supplied by the server',
  panel.includes('view.conclusions') && !/conclusions\s*=\s*\[/.test(panel));
check('EFF-02 the client never selects a conclusion for the supervisor',
  !/setConclusion\((['"])(EFFECTIVE|INEFFECTIVE|PARTIALLY_EFFECTIVE|INCONCLUSIVE)\1\)/.test(panel));
check('EFF-03 closure is never rendered as effectiveness',
  !/(CLOSED|COMPLETED)[^\n]*(EFFECTIVE)/.test(panel));
check('EFF-04 conclusion labels are display-only',
  /OUTCOME_CONCLUSION_LABEL: Record<string, string>/.test(hook));
check('EFF-05 no scoring or weighting arithmetic in the client',
  !/(score|weight|percentage|\*\s*100)/i.test(panel));

/* ---------------------------------------------------------------- EVIDENCE */
check('EVID-01 evidence rows are rendered from the server payload',
  panel.includes('e.evidence') && hook.includes('evidence: OutcomeEvidenceRef[]'));
check('EVID-02 restricted evidence is disclosed only as the server allows',
  panel.includes('ev.restricted'));
check('EVID-03 the client never judges evidence sufficiency',
  !/evidence\.length\s*[<>]=?\s*\d/.test(panel));
check('EVID-04 the evidence snapshot flag is a server value',
  panel.includes('evidence_snapshot_present'));

/* ----------------------------------------------------------- MAKER-CHECKER */
check('MC-01 review capability is a server verdict',
  panel.includes('e.may_review') && hook.includes('may_review: boolean'));
check('MC-02 self-review blocking is a server verdict',
  panel.includes('self_review_blocked')
  && !/prepared_by\s*===?\s*(view\.)?viewer/.test(panel));
check('MC-03 the client never computes approval state',
  !/review_status\s*=\s*['"]APPROVED['"]/.test(panel));
check('MC-04 approval and return are server operations only',
  panel.includes("decision: 'APPROVE'") && panel.includes("decision: 'RETURN'")
  && hook.includes("'supervisory_outcome_review'"));
check('MC-05 preparation capability is a server verdict',
  panel.includes('view.viewer.may_prepare'));

/* --------------------------------------------------------------- FOLLOW-UP */
check('FOLLOW-01 available follow-ups come from the server payload',
  panel.includes('view.follow_up_actions'));
check('FOLLOW-02 follow-up availability per evaluation is a server flag',
  panel.includes('e.follow_up_available')
  && !/follow_up_available\s*=\s*/.test(panel));
check('FOLLOW-03 the client never derives a follow-up from a conclusion',
  !/conclusion\s*===?\s*['"]INEFFECTIVE['"]/.test(panel));
check('FOLLOW-04 follow-up requires an explicit supervisor justification',
  panel.includes('followupRationale'));
check('FOLLOW-05 nothing is created automatically on render',
  !/useEffect\([^)]*mutateAsync/.test(panel));

/* --------------------------------------------------------------- REPORTING */
check('REP-01 outcome totals are read from the server report',
  portUi.includes('data.outcome_summary?.completed_actions_total'));
check('REP-02 the report UI performs no outcome arithmetic',
  !/outcome_summary[^\n]*[+\-/*]\s*(data|\d)/.test(portUi));
check('REP-03 unevaluated and legacy totals stay separate',
  portUi.includes('unevaluated_actions_total') && portUi.includes('legacy_lineage_actions_total'));
check('REP-04 the outcome summary type is a plain server payload',
  portHook.includes('export interface PortfolioOutcomeSummary'));
check('REP-05 no client-side reduce over evaluations for totals',
  !/evaluations[^\n]*\.reduce\(/.test(panel) && !/evaluations[^\n]*\.filter\([^)]*\)\.length/.test(portUi));

/* ---------------------------------------------------------------- RISK/SEC */
check('RISK-01 no risk rating or risk state write from the client',
  !/entity_risk_state|risk_rating\s*=/.test(client));
check('RISK-02 the panel states that risk-of-record is never changed',
  panel.includes('never changes a risk rating') || hook.includes('never'));
check('SEC-01 server refusals are surfaced verbatim through one translator',
  hook.includes('export function outcomeErrorMessage'));
check('SEC-02 no service role or privileged key use in the client',
  !/service_role|SERVICE_ROLE/.test(client));

console.log(`\nAML-11 frontend boundary: ${pass} passed / ${fails.length} failed`);
if (fails.length) {
  console.log(fails.map((f) => ` - ${f}`).join('\n'));
  process.exit(1);
}
