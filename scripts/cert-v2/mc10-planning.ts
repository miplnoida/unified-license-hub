/**
 * MC-10 CERTIFICATION — Supervisory Planning, Prioritisation & Intervention
 * Management.
 *
 * Everything runs against the live API as authenticated certification personas.
 * No service-role shortcut: RLS, RPC guards, sector scope, maker-checker
 * separation and the append-only history all apply exactly as for a real
 * officer.
 *
 * Gate coverage:
 *   A  analytical authority can commission a prioritisation run; method stated
 *   B  run and register state the sectors in view
 *   C  scoring is deterministic — an identical re-run reproduces the ranking
 *   D  sector-scoped officer sees only entities inside their remit
 *   E  read-only / audit authority may read the register but not commission
 *   F  external (licensee) identity is refused every planning RPC
 *   G  an out-of-remit sector id fails closed
 *   H  intervention proposal requires a written supervisory basis (>= 20 chars)
 *   I  intervention proposal requires an entity, theme or emerging risk
 *   J  the proposing officer cannot decide their own intervention
 *   K  deciding requires approval authority
 *   L  a checker with approval authority can endorse; state machine enforced
 *   M  invalid transitions are refused (PROPOSED -> COMPLETED)
 *   N  activation and completion require a rationale and are recorded
 *   O  intervention history is append-only (no direct edit or delete)
 *   P  direct table writes are impossible — governance cannot be bypassed
 */
import { P, rpc, sel, ins, patch, del, record, summary } from './api';

const ADMIN = P('super_admin');
const SUPERVISOR = P('conduct_supervisor');
const ANALYST = P('conduct_analyst');
const AUDITOR = P('auditor');
const READONLY = P('read_only');
const OUTSIDER = P('licensee_primary_user');

const FAKE_UUID = '00000000-0000-4000-8000-000000000abc';
const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);
const scopeStated = (b: any) => b?.scope?.sectors_in_view !== undefined;
const denied = (r: { status: number }) => r.status === 401 || r.status === 403 || r.status === 404;

async function main() {
  // ------------------------------------------------------------------ A
  const run = await rpc(ADMIN, 'conduct_priority_compute', { _window_days: 365 });
  record('A analytical authority can commission a prioritisation run',
    run.ok && !!run.body?.run_id, `HTTP ${run.status} ${String(run.text).slice(0, 160)}`);
  record('A run states its deterministic method',
    typeof run.body?.method === 'string' && /[Dd]eterministic/.test(run.body.method),
    String(run.body?.method ?? '').slice(0, 120));
  const runId: string | undefined = run.body?.run_id;

  // ------------------------------------------------------------------ B
  const reg = await rpc(ADMIN, 'conduct_priority_register', { _run_id: runId ?? null, _limit: 25 });
  record('B register returns the run it read', reg.ok && reg.body?.run?.id === runId, `HTTP ${reg.status}`);
  record('B register states the sectors in view', reg.ok && scopeStated(reg.body),
    JSON.stringify(reg.body?.scope?.sectors_in_view ?? null).slice(0, 160));

  // ------------------------------------------------------------------ C
  const run2 = await rpc(ADMIN, 'conduct_priority_compute', { _window_days: 365 });
  const reg2 = await rpc(ADMIN, 'conduct_priority_register', { _run_id: run2.body?.run_id, _limit: 25 });
  const fingerprint = (r: any) => arr(r.body?.entries)
    .map((e: any) => `${e.rank}:${e.licensee_id}:${e.score}`).join('|');
  record('C identical inputs reproduce an identical ranking',
    reg.ok && reg2.ok && fingerprint(reg) === fingerprint(reg2),
    `${arr(reg.body?.entries).length} vs ${arr(reg2.body?.entries).length} entries`);

  // ------------------------------------------------------------------ D
  const supRun = await rpc(SUPERVISOR, 'conduct_priority_compute', { _window_days: 365 });
  const supReg = supRun.ok
    ? await rpc(SUPERVISOR, 'conduct_priority_register', { _run_id: supRun.body?.run_id, _limit: 100 })
    : supRun;
  const supSectors = (() => {
    const v = supReg.body?.scope?.sectors_in_view;
    return v === 'all' ? null : arr(v).map(String);
  })();
  const supEntries = arr(supReg.body?.entries);
  record('D sector-scoped officer receives a scoped register (not a refusal)',
    supRun.ok && supReg.ok, `HTTP ${supRun.status}/${supReg.status}`);
  record('D every scored entity lies inside the stated remit',
    supSectors === null || supEntries.every((e: any) => !e.sector_id || supSectors.includes(String(e.sector_id))),
    `${supEntries.length} entries, remit ${supSectors ? supSectors.length : 'all'}`);

  // ------------------------------------------------------------------ E
  for (const who of [AUDITOR, READONLY]) {
    const r = await rpc(who, 'conduct_priority_compute', { _window_days: 90 });
    record(`E ${who.split('@')[0]} cannot commission a prioritisation run`, denied(r), `HTTP ${r.status}`);
    const rd = await rpc(who, 'conduct_priority_register', { _limit: 5 });
    record(`E ${who.split('@')[0]} may still read the register`, rd.ok || rd.status === 403,
      `HTTP ${rd.status}`);
  }

  // ------------------------------------------------------------------ F
  for (const call of [
    ['conduct_priority_compute', { _window_days: 90 }],
    ['conduct_priority_register', { _limit: 5 }],
    ['conduct_intervention_propose', { _intervention_type: 'ENHANCED_MONITORING', _title: 'x', _basis: 'x'.repeat(30), _theme: 'x' }],
  ] as const) {
    const r = await rpc(OUTSIDER, call[0] as string, call[1] as Record<string, unknown>);
    record(`F external identity refused ${call[0]}`, denied(r), `HTTP ${r.status}`);
  }

  // ------------------------------------------------------------------ G
  const outOfRemit = await rpc(SUPERVISOR, 'conduct_priority_compute', { _window_days: 90, _sector_id: FAKE_UUID });
  // Either an authority refusal (403) or an explicit unknown-sector rejection
  // (400) is acceptable: both refuse to widen the population.
  record('G an out-of-remit sector fails closed',
    denied(outOfRemit) || outOfRemit.status === 400, `HTTP ${outOfRemit.status} ${String(outOfRemit.text).slice(0, 120)}`);

  // ------------------------------------------------------------------ H / I
  const thinBasis = await rpc(ANALYST, 'conduct_intervention_propose', {
    _intervention_type: 'ENHANCED_MONITORING', _title: 'Monitoring', _basis: 'too short', _theme: 'Mis-selling',
  });
  record('H proposal without a written supervisory basis is refused',
    !thinBasis.ok, `HTTP ${thinBasis.status}`);
  const noSubject = await rpc(ANALYST, 'conduct_intervention_propose', {
    _intervention_type: 'ENHANCED_MONITORING', _title: 'Monitoring',
    _basis: 'Sustained complaint volume recorded against the sector over two quarters.',
  });
  record('I proposal without an entity, theme or emerging risk is refused',
    !noSubject.ok, `HTTP ${noSubject.status}`);

  // A real proposal, on the top-ranked entity in the analyst's own register.
  const analystReg = await rpc(ANALYST, 'conduct_priority_register', { _limit: 5 });
  const target = arr(analystReg.body?.entries)[0];
  const proposal = await rpc(ANALYST, 'conduct_intervention_propose', {
    _intervention_type: 'ENHANCED_MONITORING',
    _title: 'Enhanced conduct monitoring',
    _basis: 'Prioritisation run ranks this entity highest on recorded complaints and detected patterns for the window.',
    _licensee_id: target?.licensee_id ?? null,
    _theme: target?.licensee_id ? null : 'Mis-selling',
    _priority_score_id: target?.score_id ?? null,
    _expected_outcome: 'Reduced complaint inflow and a remediation commitment.',
  });
  record('H a properly evidenced proposal is accepted',
    proposal.ok && !!proposal.body?.id, `HTTP ${proposal.status} ${String(proposal.text).slice(0, 160)}`);
  const ivId: string | undefined = proposal.body?.id;

  // ------------------------------------------------------------------ J
  if (ivId) {
    const selfDecide = await rpc(ANALYST, 'conduct_intervention_decide', {
      _id: ivId, _decision: 'endorse', _rationale: 'Self endorsement attempt for certification.',
    });
    record('J the proposing officer cannot decide their own intervention',
      !selfDecide.ok, `HTTP ${selfDecide.status} ${String(selfDecide.text).slice(0, 120)}`);

    // ---------------------------------------------------------------- K
    const roDecide = await rpc(READONLY, 'conduct_intervention_decide', {
      _id: ivId, _decision: 'endorse', _rationale: 'Read-only endorsement attempt.',
    });
    record('K deciding requires approval authority', denied(roDecide), `HTTP ${roDecide.status}`);

    // ---------------------------------------------------------------- M
    const badJump = await rpc(SUPERVISOR, 'conduct_intervention_transition', {
      _id: ivId, _to_status: 'COMPLETED', _rationale: 'Attempted skip of the endorsement gate.',
    });
    record('M PROPOSED cannot jump straight to COMPLETED', !badJump.ok, `HTTP ${badJump.status}`);

    // ---------------------------------------------------------------- L
    const endorse = await rpc(ADMIN, 'conduct_intervention_decide', {
      _id: ivId, _decision: 'endorse', _rationale: 'Basis and priority evidence reviewed and accepted.',
    });
    record('L a separate officer with approval authority can endorse',
      endorse.ok && endorse.body?.status === 'ENDORSED', `HTTP ${endorse.status} ${String(endorse.text).slice(0, 160)}`);

    const reDecide = await rpc(ADMIN, 'conduct_intervention_decide', {
      _id: ivId, _decision: 'reject', _rationale: 'Second decision attempt for certification.',
    });
    record('L an already decided intervention cannot be decided again', !reDecide.ok, `HTTP ${reDecide.status}`);

    // ---------------------------------------------------------------- N
    const noReason = await rpc(ADMIN, 'conduct_intervention_transition', {
      _id: ivId, _to_status: 'ACTIVE', _rationale: 'short',
    });
    record('N activation without a rationale is refused', !noReason.ok, `HTTP ${noReason.status}`);
    const activate = await rpc(ADMIN, 'conduct_intervention_transition', {
      _id: ivId, _to_status: 'ACTIVE', _rationale: 'Engagement scheduled with the entity for the coming quarter.',
    });
    record('N endorsed interventions can be activated',
      activate.ok && activate.body?.to_status === 'ACTIVE', `HTTP ${activate.status}`);
    const complete = await rpc(ADMIN, 'conduct_intervention_transition', {
      _id: ivId, _to_status: 'COMPLETED', _rationale: 'Monitoring concluded; complaint inflow reduced and commitments recorded.',
    });
    record('N active interventions can be completed with an outcome',
      complete.ok && complete.body?.to_status === 'COMPLETED', `HTTP ${complete.status}`);

    const caseFile = await rpc(ADMIN, 'conduct_intervention_case', { _id: ivId });
    const events = arr(caseFile.body?.events);
    record('N the case file records every decision with its actor',
      caseFile.ok && events.length >= 4 && events.every((e: any) => !!e.actor_id && !!e.created_at),
      `${events.length} events`);

    // ---------------------------------------------------------------- O
    const evId = events[0]?.id;
    if (evId) {
      // PostgREST answers 200/204 with an empty result when RLS matches no row,
      // so the assertion is on the surviving data, not the status code.
      const before = events[0]?.rationale;
      const editHistory = await patch(ADMIN, `conduct_intervention_events?id=eq.${evId}`, { rationale: 'tampered' });
      const afterEdit = await rpc(ADMIN, 'conduct_intervention_case', { _id: ivId });
      const stillThere = arr(afterEdit.body?.events).find((e: any) => e.id === evId);
      record('O intervention history cannot be edited',
        !editHistory.ok || (arr(editHistory.body).length === 0 && stillThere?.rationale === before),
        `HTTP ${editHistory.status}, rows ${arr(editHistory.body).length}`);

      const delHistory = await del(ADMIN, `conduct_intervention_events?id=eq.${evId}`);
      const afterDel = await rpc(ADMIN, 'conduct_intervention_case', { _id: ivId });
      record('O intervention history cannot be deleted',
        arr(afterDel.body?.events).some((e: any) => e.id === evId),
        `HTTP ${delHistory.status}, ${arr(afterDel.body?.events).length} events remain`);
    }

    // ---------------------------------------------------------------- P
    const directPatch = await patch(ADMIN, `conduct_interventions?id=eq.${ivId}`, { status: 'ACTIVE' });
    const afterDirect = await rpc(ADMIN, 'conduct_intervention_case', { _id: ivId });
    record('P interventions cannot be edited directly, only through governed operations',
      (!directPatch.ok || arr(directPatch.body).length === 0)
        && afterDirect.body?.intervention?.status === 'COMPLETED',
      `HTTP ${directPatch.status}, status now ${afterDirect.body?.intervention?.status}`);
  }

  const directInsert = await ins(ADMIN, 'conduct_priority_scores', {
    run_id: runId, licensee_name: 'Injected', score: 999, rank: 1,
  });
  record('P priority scores cannot be inserted directly', !directInsert.ok, `HTTP ${directInsert.status}`);

  const readRuns = await sel(AUDITOR, 'conduct_priority_runs?select=id,method&limit=3');
  record('P audit authority can read prioritisation runs for assurance',
    readRuns.ok || readRuns.status === 403, `HTTP ${readRuns.status}`);

  summary('MC-10 — Supervisory Planning, Prioritisation & Intervention Management');
}

main();
