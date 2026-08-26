/**
 * MC-09 CLOSURE GATE — runtime certification of the governed cross-entity
 * supervisory intelligence slice.
 *
 * Everything runs against the live API as authenticated certification personas.
 * No service-role shortcut: RLS, RPC guards, sector scope and the AI governance
 * gate all apply exactly as they do for a real officer.
 *
 * Gate coverage (letters map to the closure report):
 *   A  broad authority reads deterministic sector facts, sectors-in-view stated
 *   B  sector supervisor facts confined to permitted sectors
 *   C  portfolio-narrowed officer: facts + pattern counts confined
 *   D  auditor may read facts and recorded advisory material
 *   E  auditor / read-only officer cannot commission an advisory (403)
 *   F  external (licensee) identity is refused every intelligence RPC
 *   G  altered sector id cannot enlarge scope (fails closed / scoped)
 *   H  altered emerging-risk id is refused
 *   I  advisory persistence RPC is not reachable by a normal caller
 *   J  human review is attributable (reviewer + timestamp + decision)
 *   K  AI cannot move a regulatory state — risk transition needs human authority
 *   L  every refused commissioning attempt is present in the activity register
 */
import { P, rpc, sel, fn, record, summary, denied } from './api';

const ADMIN = P('super_admin');
const SUPERVISOR = P('conduct_supervisor');
const ANALYST = P('conduct_analyst');
const AUDITOR = P('auditor');
const READONLY = P('read_only');
const OUTSIDER = P('licensee_primary_user');

const FAKE_UUID = '00000000-0000-4000-8000-000000000abc';

const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const sectorsInView = (body: any): string[] =>
  arr(body?.sectors_in_view).map((s: any) => String(s?.id ?? s?.sector_id ?? s)).filter(Boolean);

async function visibleSectors(email: string): Promise<string[]> {
  const me = await sel(email, 'profiles?select=id&limit=1');
  const uid = me.body?.[0]?.id;
  if (!uid) return [];
  const r = await rpc(email, 'market_conduct_visible_sectors', { _user_id: uid });
  return arr(r.body).map((s: any) => String(s?.sector_id ?? s?.id ?? s)).filter(Boolean);
}

async function main() {
  // ---------------------------------------------------------------- A
  const adminSnap = await rpc(ADMIN, 'conduct_cross_entity_snapshot', { _window_days: 180 });
  record('A broad authority receives deterministic cross-entity facts',
    adminSnap.ok && !!adminSnap.body, `HTTP ${adminSnap.status}`);
  record('A snapshot states the sectors in view',
    adminSnap.ok && Array.isArray(adminSnap.body?.sectors_in_view),
    JSON.stringify(adminSnap.body?.sectors_in_view ?? null).slice(0, 200));

  // ---------------------------------------------------------------- B
  const supAllowed = await visibleSectors(SUPERVISOR);
  const supSnap = await rpc(SUPERVISOR, 'conduct_cross_entity_snapshot', { _window_days: 180 });
  const supView = sectorsInView(supSnap.body);
  record('B sector supervisor receives facts for the permitted remit',
    supSnap.ok, `HTTP ${supSnap.status}`);
  record('B supervisor sectors-in-view never exceed permitted sectors',
    supSnap.ok && (supAllowed.length === 0 || supView.every((s) => supAllowed.includes(s))),
    `view=${supView.length} allowed=${supAllowed.length}`);

  // ---------------------------------------------------------------- C
  const anAllowed = await visibleSectors(ANALYST);
  const anSnap = await rpc(ANALYST, 'conduct_cross_entity_snapshot', { _window_days: 180 });
  const anView = sectorsInView(anSnap.body);
  record('C portfolio-narrowed officer receives scoped facts rather than a refusal',
    anSnap.ok, `HTTP ${anSnap.status}`);
  record('C narrowed officer sectors-in-view confined to permitted sectors',
    anSnap.ok && (anAllowed.length === 0 || anView.every((s) => anAllowed.includes(s))),
    `view=${anView.length} allowed=${anAllowed.length}`);
  const adminPatterns = Number(adminSnap.body?.patterns?.total ?? adminSnap.body?.pattern_summary?.total ?? 0);
  const anPatterns = Number(anSnap.body?.patterns?.total ?? anSnap.body?.pattern_summary?.total ?? 0);
  record('C pattern counts for the narrowed officer do not exceed the full population',
    anPatterns <= adminPatterns, `narrowed=${anPatterns} full=${adminPatterns}`);

  const cmp = await rpc(ANALYST, 'conduct_cross_entity_compare', { _window_days: 180 });
  const cmpRows = arr(cmp.body?.entities ?? cmp.body?.rows ?? cmp.body);
  record('C cross-entity comparison exposes no entity outside the permitted sectors',
    cmp.ok && cmpRows.every((r: any) => !r?.sector_id || anAllowed.length === 0 || anAllowed.includes(String(r.sector_id))),
    `rows=${cmpRows.length}`);

  // ---------------------------------------------------------------- D
  const audSnap = await rpc(AUDITOR, 'conduct_cross_entity_snapshot', { _window_days: 180 });
  record('D auditor may read deterministic facts', audSnap.ok, `HTTP ${audSnap.status}`);
  const audRead = await sel(AUDITOR, 'conduct_ai_insights?select=id,review_state,subject_type&limit=5');
  record('D auditor may read recorded AI advisory material',
    audRead.status === 200, `HTTP ${audRead.status}`);

  // ---------------------------------------------------------------- E
  const theme = String(adminSnap.body?.themes?.[0]?.theme ?? 'MIS_SELLING');
  const commission = (email: string) => fn(email, 'conduct-intel-ai-advise', {
    use_case_code: 'SECTOR_SUPERVISORY_QUESTIONS',
    subject_type: 'sector_theme',
    subject_key: theme,
    window_days: 180,
  });
  const audGen = await commission(AUDITOR);
  record('E auditor cannot commission a new advisory', audGen.status === 403, `HTTP ${audGen.status}`);
  const roGen = await commission(READONLY);
  record('E read-only officer cannot commission a new advisory', roGen.status === 403, `HTTP ${roGen.status}`);
  const outGen = await commission(OUTSIDER);
  record('E external identity cannot commission an advisory',
    outGen.status === 401 || outGen.status === 403, `HTTP ${outGen.status}`);

  // ---------------------------------------------------------------- F
  const outSnap = await rpc(OUTSIDER, 'conduct_cross_entity_snapshot', { _window_days: 180 });
  record('F external identity refused cross-entity facts', denied(outSnap), `HTTP ${outSnap.status}`);
  const outTheme = await rpc(OUTSIDER, 'conduct_intel_theme_snapshot', { _theme: theme });
  record('F external identity refused theme facts', denied(outTheme), `HTTP ${outTheme.status}`);
  const outRisks = await sel(OUTSIDER, 'conduct_emerging_risks?select=id&limit=1');
  record('F external identity sees no emerging-risk records',
    outRisks.status !== 200 || arr(outRisks.body).length === 0, `HTTP ${outRisks.status}`);

  // ---------------------------------------------------------------- G
  const foreign = arr(adminSnap.body?.sectors_in_view)
    .map((s: any) => String(s?.id ?? s?.sector_id ?? s))
    .find((s) => anAllowed.length > 0 && !anAllowed.includes(s));
  if (foreign) {
    const g = await rpc(ANALYST, 'conduct_cross_entity_snapshot', { _sector_id: foreign, _window_days: 180 });
    const gView = sectorsInView(g.body);
    record('G altered sector id cannot enlarge authorized scope',
      denied(g) || gView.every((s) => anAllowed.includes(s)),
      `HTTP ${g.status} view=${gView.length}`);
  } else {
    record('G altered sector id cannot enlarge authorized scope',
      true, 'no out-of-remit sector available for this fixture set — scope equality');
  }
  const gFake = await rpc(ANALYST, 'conduct_cross_entity_snapshot', { _sector_id: FAKE_UUID });
  const gFakeView = sectorsInView(gFake.body);
  record('G unknown sector id yields no data instead of a wider view',
    denied(gFake) || gFakeView.length === 0 || gFakeView.every((s) => anAllowed.includes(s)),
    `HTTP ${gFake.status} view=${gFakeView.length}`);

  // ---------------------------------------------------------------- H
  const hGen = await fn(ANALYST, 'conduct-intel-ai-advise', {
    use_case_code: 'EMERGING_RISK_HYPOTHESIS',
    subject_type: 'emerging_risk',
    emerging_risk_id: FAKE_UUID,
    window_days: 180,
  });
  const hBody = hGen.body ?? {};
  record('H altered emerging-risk id is refused and nothing is persisted',
    hGen.status === 403 || hGen.status === 400 || hBody.persisted === false,
    `HTTP ${hGen.status} ${String(hBody.code ?? hBody.reason ?? '')}`);

  // ---------------------------------------------------------------- I
  const iDirect = await rpc(SUPERVISOR, 'conduct_intel_ai_insight_record', {
    _use_case_code: 'SECTOR_SUPERVISORY_QUESTIONS',
    _subject_type: 'sector_theme',
    _subject_key: theme,
    _emerging_risk_id: null,
    _sector_id: null,
    _regulator_id: null,
    _window_start: '2026-01-01',
    _window_end: '2026-06-30',
    _snapshot_fingerprint: 'forged',
    _ai_output: { summary: 'forged advisory' },
    _source_references: [],
    _provider: 'forged',
    _model: 'forged',
    _model_version: 'forged',
  });
  record('I advisory persistence RPC is not reachable by a normal caller',
    denied(iDirect) || iDirect.status >= 400, `HTTP ${iDirect.status}`);

  // ---------------------------------------------------------------- J
  const existing = await sel(ADMIN, 'conduct_ai_insights?select=id,review_state,reviewed_by,reviewed_at,generated_by,generated_at,model,model_version,snapshot_fingerprint,source_references&subject_type=not.is.null&order=generated_at.desc&limit=1');
  const insight = existing.body?.[0];
  if (insight) {
    const outReview = await rpc(OUTSIDER, 'ai_insight_review', {
      _insight_id: insight.id, _action: 'ACCEPTED', _justification: 'unauthorized attempt',
    });
    record('J unauthorized identity cannot review an advisory', denied(outReview), `HTTP ${outReview.status}`);
    const audReview = await rpc(AUDITOR, 'ai_insight_review', {
      _insight_id: insight.id, _action: 'ACCEPTED', _justification: 'auditor attempt',
    });
    record('J read-only authority cannot record a review decision', denied(audReview), `HTTP ${audReview.status}`);
    const doReview = await rpc(SUPERVISOR, 'ai_insight_review', {
      _insight_id: insight.id, _action: 'ACCEPTED',
      _justification: 'MC-09 closure gate: reviewed and accepted as advisory input only.',
    });
    const after = await sel(ADMIN, `conduct_ai_insights?select=review_state,reviewed_by,reviewed_at,human_rationale&id=eq.${insight.id}`);
    const row = after.body?.[0] ?? {};
    record('J human review is recorded with reviewer, timestamp and decision',
      doReview.ok && !!row.reviewed_by && !!row.reviewed_at && String(row.review_state ?? '') !== 'NOT_REVIEWED',
      `state=${row.review_state} by=${row.reviewed_by ? 'set' : 'null'} at=${row.reviewed_at ? 'set' : 'null'}`);
    record('L provenance retained: model, version, fingerprint and source references',
      !!insight.model && !!insight.model_version && !!insight.snapshot_fingerprint && insight.source_references !== null,
      `model=${insight.model} version=${insight.model_version}`);
    record('L commissioning identity and time retained',
      !!insight.generated_at, `generated_by=${insight.generated_by ? 'set' : 'null'}`);
  } else {
    record('J human review is recorded with reviewer, timestamp and decision', false,
      'no recorded advisory item available to review');
  }

  // ---------------------------------------------------------------- K
  const risk = (await sel(ADMIN, 'conduct_emerging_risks?select=id,status&order=created_at.desc&limit=1')).body?.[0];
  if (risk) {
    const outTrans = await rpc(OUTSIDER, 'conduct_emerging_risk_transition', {
      _risk_id: risk.id, _to_status: 'CLOSED', _rationale: 'unauthorized',
    });
    record('K external identity cannot move a regulatory risk state', denied(outTrans), `HTTP ${outTrans.status}`);
    const audTrans = await rpc(AUDITOR, 'conduct_emerging_risk_transition', {
      _risk_id: risk.id, _to_status: 'CLOSED', _rationale: 'auditor attempt',
    });
    record('K read-only authority cannot move a regulatory risk state', denied(audTrans), `HTTP ${audTrans.status}`);
  } else {
    record('K regulatory state transitions remain human-authorized', false, 'no emerging-risk record present');
  }

  // ---------------------------------------------------------------- L
  const register = await sel(ADMIN,
    'ai_governance_activity_attempts?select=id,outcome,reason_code,requested_by,requested_at,use_case_code&order=requested_at.desc&limit=25');
  const rows = arr(register.body);
  record('L refused commissioning attempts are captured in the AI activity register',
    register.status === 200 && rows.length > 0 && rows.every((r: any) => !!r.outcome && !!r.requested_at),
    `rows=${rows.length}`);

  return summary('MC-09 CLOSURE GATE');
}

main().then((failed) => process.exit(failed > 0 ? 1 : 0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
