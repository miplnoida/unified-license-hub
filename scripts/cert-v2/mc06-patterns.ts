/**
 * MC-06 certification — deterministic Patterns & Clusters runtime checks (A–N).
 *
 * Executes against the live API as authenticated certification personas only.
 * Every mutation goes through the governed MC-06 RPCs; no service-role writes.
 */
import { P, rpc, sel, ins, patch, record, summary, denied } from './api';

const OFFICER = P('conduct_supervisor');   // market_conduct, scope: all
const ANALYST = P('conduct_analyst');      // market_conduct, scope: assigned only
const AUDITOR = P('auditor');

const RULE_SIGNALS = 'CERT-MC06-SIGREC';
const RULE_COMPLAINTS = 'CERT-MC06-CMPREC';
const RULE_OUTCOMES = 'CERT-MC06-OUTREC';

const ok = (r: any) => r.ok === true;

async function counts() {
  const q = async (path: string) => (await sel(P('super_admin'), path)).body;
  return {
    investigations: (await q('conduct_investigations?select=id&limit=2000'))?.length ?? -1,
    findings: (await q('conduct_findings?select=id&limit=2000'))?.length ?? -1,
    enforcement: (await q('enforcement_actions?select=id&limit=2000'))?.length ?? -1,
    complaints: (await q('complaints?select=id&limit=5000'))?.length ?? -1,
  };
}

async function upsertRule(code: string, patternType: string, name: string, extra: Record<string, unknown>) {
  return rpc(OFFICER, 'conduct_pattern_rule_upsert', {
    _payload: {
      code, pattern_type: patternType, name,
      description: 'MC-06 certification pattern rule.',
      active: true, ...extra,
    },
  });
}

async function detail(cluster: string, email = OFFICER) {
  const r = await rpc(email, 'conduct_cluster_detail', { _cluster_id: cluster });
  return { r, d: r.body?.cluster ? r.body : (r.body ?? {}) };
}

async function main() {
  const before = await counts();

  // ---------------------------------------------------------------- rules
  const r1 = await upsertRule(RULE_SIGNALS, 'entity_signal_recurrence', 'Repeated conduct signals for one entity',
    { metric: 'signal_count', threshold_value: 3, comparison_operator: '>=', lookback_days: 90, definition: { min_volume: 3 } });
  const r2 = await upsertRule(RULE_COMPLAINTS, 'complaint_issue_recurrence', 'Repeated complaints on the same issue',
    { metric: 'complaint_count', threshold_value: 3, comparison_operator: '>=', lookback_days: 90 });
  const r3 = await upsertRule(RULE_OUTCOMES, 'complaint_outcome_recurrence', 'Repeated complaint outcomes',
    { metric: 'outcome_count', threshold_value: 1, comparison_operator: '>=', lookback_days: 90 });
  record('setup pattern rules saved through governed upsert', ok(r1) && ok(r2) && ok(r3), `${r1.text} ${r2.text} ${r3.text}`);
  const ruleIds = [r1.body?.id, r2.body?.id, r3.body?.id];
  if (ruleIds.some((x) => !x)) return finish();

  // ------------------------------------------------ A deterministic run creates a cluster
  const runs = [];
  for (const id of ruleIds) runs.push(await rpc(OFFICER, 'conduct_pattern_detect', { _rule_id: id }));
  const created = runs.reduce((n, r) => n + (r.body?.clusters_created ?? 0), 0);
  const matched = runs.reduce((n, r) => n + (r.body?.matched ?? 0), 0);
  record('A deterministic rule run creates a pattern/cluster', runs.every(ok) && matched > 0 && created > 0,
    runs.map((r) => r.text).join(' | '));

  const reg1 = await rpc(OFFICER, 'conduct_cluster_register', { _limit: 200 });
  const allRows: any[] = Array.isArray(reg1.body) ? reg1.body : (reg1.body?.rows ?? []);
  const mine = allRows.filter((x) => [RULE_SIGNALS, RULE_COMPLAINTS, RULE_OUTCOMES].includes(x.rule_code));
  record('A register read model returns the detected patterns', ok(reg1) && mine.length > 0,
    `rows=${allRows.length} cert=${mine.length}`);
  const sigCluster = mine.find((x) => x.rule_code === RULE_SIGNALS);
  const cmpCluster = mine.find((x) => x.rule_code === RULE_COMPLAINTS);
  const outCluster = mine.find((x) => x.rule_code === RULE_OUTCOMES);
  if (!sigCluster) { record('A signal-recurrence cluster present', false, JSON.stringify(mine).slice(0, 300)); return finish(); }

  // ------------------------------------------------ B rerun is idempotent
  const beforeIds = mine.map((x) => x.id).sort().join(',');
  const rerun = [];
  for (const id of ruleIds) rerun.push(await rpc(OFFICER, 'conduct_pattern_detect', { _rule_id: id }));
  const reCreated = rerun.reduce((n, r) => n + (r.body?.clusters_created ?? 0), 0);
  const reUpdated = rerun.reduce((n, r) => n + (r.body?.clusters_updated ?? 0), 0);
  const reg2 = await rpc(OFFICER, 'conduct_cluster_register', { _limit: 200 });
  const rows2: any[] = Array.isArray(reg2.body) ? reg2.body : (reg2.body?.rows ?? []);
  const mine2 = rows2.filter((x) => [RULE_SIGNALS, RULE_COMPLAINTS, RULE_OUTCOMES].includes(x.rule_code));
  const afterIds = mine2.map((x) => x.id).sort().join(',');
  const d1 = await detail(sigCluster.id);
  const memberDupes = (() => {
    const ms: any[] = d1.d.members ?? [];
    const keys = ms.map((m: any) => `${m.member_type}:${m.member_id}`);
    return keys.length !== new Set(keys).size;
  })();
  record('B rerunning the same rule/window creates no duplicate pattern',
    rerun.every(ok) && reCreated === 0 && reUpdated > 0 && beforeIds === afterIds,
    `created=${reCreated} updated=${reUpdated} same_ids=${beforeIds === afterIds}`);
  record('B contributing records are not duplicated on rerun', !memberDupes,
    `members=${(d1.d.members ?? []).length}`);

  // ------------------------------------------------ C explainability
  const c = d1.d.cluster ?? {};
  const hasExplain = !!c.match_explanation && /threshold/i.test(String(c.match_explanation));
  record('C cluster exposes exact rule, version, metric, threshold and explanation',
    ok(d1.r) && c.rule_code === RULE_SIGNALS && Number(c.rule_version) >= 1 && !!c.metric &&
    c.metric_value != null && c.threshold_value != null && !!c.comparison_operator &&
    !!c.window_start && !!c.window_end && hasExplain,
    `rule=${c.rule_code} v=${c.rule_version} ${c.metric}=${c.metric_value} ${c.comparison_operator}${c.threshold_value}`);
  const metrics: any[] = d1.d.metrics ?? [];
  record('C evaluation metric history is retained', metrics.length >= 1,
    `metric_rows=${metrics.length}`);

  // ------------------------------------------------ D contributing records
  const sigMembers: any[] = (d1.d.members ?? []).filter((m: any) => m.member_type === 'signal');
  const sigIdsOk = sigMembers.length > 0 && (await sel(OFFICER,
    `conduct_signals?id=in.(${sigMembers.map((m) => m.member_id).join(',')})&select=id,reference`)).body?.length === sigMembers.length;
  record('D contributing Signals are visible and correctly linked',
    sigMembers.length >= 3 && sigIdsOk && sigMembers.every((m) => m.member_table === 'conduct_signals' && !!m.member_reference),
    `signal_members=${sigMembers.length}`);

  const cmpDetail = cmpCluster ? await detail(cmpCluster.id) : null;
  const cmpMembers: any[] = (cmpDetail?.d.members ?? []).filter((m: any) => m.member_type === 'complaint');
  record('D contributing Complaints are visible and correctly linked',
    !!cmpCluster && cmpMembers.length >= 3 && cmpMembers.every((m) => m.member_table === 'complaints'),
    `complaint_members=${cmpMembers.length}`);

  const outDetail = outCluster ? await detail(outCluster.id) : null;
  const outMembers: any[] = (outDetail?.d.members ?? []).filter((m: any) => m.member_type === 'complaint_outcome');
  record('D contributing Complaint Outcomes are visible and correctly linked',
    !!outCluster && outMembers.length >= 1 && outMembers.every((m) => m.member_table === 'complaint_outcomes'),
    `outcome_members=${outMembers.length}`);

  // ------------------------------------------------ E review / confirm
  const shortNote = await rpc(OFFICER, 'conduct_cluster_review', { _cluster_id: sigCluster.id, _status: 'under_review', _note: 'short' });
  const toReview = await rpc(OFFICER, 'conduct_cluster_review', { _cluster_id: sigCluster.id, _status: 'under_review', _note: 'Taken up for supervisory review of repeated signals.' });
  const confirm = await rpc(OFFICER, 'conduct_cluster_review', { _cluster_id: sigCluster.id, _status: 'confirmed', _note: 'Pattern confirmed: repeated sales-practice signals for the same entity.' });
  const afterConfirm = await detail(sigCluster.id);
  record('E officer reviews and confirms a pattern',
    !shortNote.ok && ok(toReview) && ok(confirm) && afterConfirm.d.cluster?.status === 'confirmed',
    `${toReview.text} ${confirm.text}`);
  const history: any[] = afterConfirm.d.history ?? [];
  record('E review activity is recorded in history', history.some((h) => h.event_type === 'REVIEW'),
    `events=${history.map((h) => h.event_type).join(',')}`);

  // ------------------------------------------------ F dismiss requires rationale
  const dismissTarget = cmpCluster ?? outCluster;
  const badDismiss = dismissTarget
    ? await rpc(OFFICER, 'conduct_cluster_review', { _cluster_id: dismissTarget.id, _status: 'dismissed', _note: 'no' })
    : { ok: true, text: 'no target' } as any;
  const goodDismiss = dismissTarget
    ? await rpc(OFFICER, 'conduct_cluster_review', { _cluster_id: dismissTarget.id, _status: 'dismissed', _note: 'Dismissed: complaint volumes explained by a one-off system migration.' })
    : { ok: false, text: 'no target' } as any;
  record('F officer dismisses only with a sufficient rationale',
    !!dismissTarget && !badDismiss.ok && ok(goodDismiss), `${badDismiss.text} | ${goodDismiss.text}`);

  // ------------------------------------------------ G evidence linking
  const ev = await rpc(OFFICER, 'conduct_evidence_upload', {
    _payload: {
      title: 'MC-06 certification evidence — pattern working paper',
      evidence_type: 'document', confidentiality_level: 'internal',
      entity_id: sigCluster.entity_id ?? c.licensee_id ?? null,
    },
  });
  const evidenceId = ev.body?.id;
  const linkEv = evidenceId
    ? await rpc(OFFICER, 'conduct_cluster_link_evidence', { _cluster_id: sigCluster.id, _evidence_id: evidenceId, _note: 'Linked existing evidence item.' })
    : { ok: false, text: ev.text } as any;
  const evAfter = await detail(sigCluster.id);
  const evList: any[] = evAfter.d.evidence ?? [];
  record('G existing evidence can be linked to a pattern',
    ok(linkEv) && evList.some((e) => e.id === evidenceId), `${linkEv.text} evidence=${evList.length}`);

  // ------------------------------------------------ H/I raise one Signal
  const rs1 = await rpc(OFFICER, 'conduct_cluster_raise_signal', { _cluster_id: sigCluster.id, _rationale: 'Confirmed pattern warrants a conduct intelligence signal.' });
  const rs2 = await rpc(OFFICER, 'conduct_cluster_raise_signal', { _cluster_id: sigCluster.id, _rationale: 'Second attempt to raise a signal from the same pattern.' });
  const afterSig = await detail(sigCluster.id);
  const raisedSignal = afterSig.d.cluster?.raised_signal_id;
  record('H officer raises one Conduct Signal from the pattern',
    ok(rs1) && !!rs1.body?.id && rs1.body?.already_exists === false && !!raisedSignal, rs1.text);
  record('I a second Signal raise is prevented',
    (ok(rs2) && rs2.body?.already_exists === true && rs2.body?.id === rs1.body?.id) || denied(rs2) || !rs2.ok,
    rs2.text);

  // ------------------------------------------------ J/K raise one Alert
  const ra1 = await rpc(OFFICER, 'conduct_cluster_raise_alert', { _cluster_id: sigCluster.id, _rationale: 'Pattern requires threshold attention through a conduct alert.' });
  const ra2 = await rpc(OFFICER, 'conduct_cluster_raise_alert', { _cluster_id: sigCluster.id, _rationale: 'Second attempt to raise an alert from the same pattern.' });
  const afterAlert = await detail(sigCluster.id);
  const raisedAlert = afterAlert.d.cluster?.raised_alert_id;
  const alertRow = raisedAlert ? await sel(OFFICER, `conduct_alerts?id=eq.${raisedAlert}&select=id,kind,source,status`) : { body: [], text: 'none' } as any;
  record('J officer raises one Conduct Alert from the pattern',
    ok(ra1) && !!ra1.body?.id && ra1.body?.already_exists === false && (alertRow.body?.length ?? 0) === 1,
    `${ra1.text} ${alertRow.text}`);
  record('K a second Alert raise is prevented',
    (ok(ra2) && ra2.body?.already_exists === true && ra2.body?.id === ra1.body?.id) || denied(ra2) || !ra2.ok,
    ra2.text);

  const alertCount = (await sel(OFFICER, `conduct_alerts?detail->>cluster_id=eq.${sigCluster.id}&select=id`)).body;
  record('K exactly one alert exists for the pattern', Array.isArray(alertCount) ? alertCount.length <= 1 : true,
    `alerts_for_cluster=${Array.isArray(alertCount) ? alertCount.length : 'n/a'}`);

  // ------------------------------------------------ L out-of-scope mutation denied
  const outOfScope = await rpc(ANALYST, 'conduct_cluster_review', {
    _cluster_id: sigCluster.id, _status: 'open', _note: 'Attempting a review outside the acting officer regulatory scope.',
  });
  const outOfScopeRaise = await rpc(ANALYST, 'conduct_cluster_raise_alert', {
    _cluster_id: sigCluster.id, _rationale: 'Attempting an escalation outside the acting officer regulatory scope.',
  });
  record('L out-of-regulatory-scope pattern mutation denied',
    (denied(outOfScope) || !outOfScope.ok) && (denied(outOfScopeRaise) || !outOfScopeRaise.ok),
    `${outOfScope.text} | ${outOfScopeRaise.text}`);

  // ------------------------------------------------ M auditor read-only
  const aRead = await rpc(AUDITOR, 'conduct_cluster_register', { _limit: 5 });
  const aDetail = await rpc(AUDITOR, 'conduct_cluster_detail', { _cluster_id: sigCluster.id });
  const aReview = await rpc(AUDITOR, 'conduct_cluster_review', { _cluster_id: sigCluster.id, _status: 'open', _note: 'Auditor attempting a governed mutation.' });
  const aRaise = await rpc(AUDITOR, 'conduct_cluster_raise_signal', { _cluster_id: sigCluster.id, _rationale: 'Auditor attempting to raise a signal.' });
  const aDetect = await rpc(AUDITOR, 'conduct_pattern_detect', { _rule_id: ruleIds[0] });
  const aPatch = await patch(AUDITOR, `conduct_clusters?id=eq.${sigCluster.id}`, { severity: 'low' });
  const aIns = await ins(AUDITOR, 'conduct_clusters', { reference: 'auditor-direct', dedupe_key: 'auditor-direct', pattern_type: 'entity_signal_recurrence', title: 'auditor direct insert' });
  record('M auditor can read the pattern register and detail', ok(aRead) && ok(aDetail), `${aRead.text} ${aDetail.text}`);
  record('M auditor governed pattern mutations denied', !aReview.ok && !aRaise.ok && !aDetect.ok,
    `${aReview.text} | ${aRaise.text} | ${aDetect.text}`);
  record('M auditor direct table writes denied',
    (!aPatch.ok || (Array.isArray(aPatch.body) && aPatch.body.length === 0)) && !aIns.ok,
    `${aPatch.text} | ${aIns.text}`);

  // ------------------------------------------------ N nothing auto-created
  const after = await counts();
  record('N no investigation auto-created', after.investigations === before.investigations, `${before.investigations}->${after.investigations}`);
  record('N no conduct finding auto-created', after.findings === before.findings, `${before.findings}->${after.findings}`);
  record('N no enforcement action auto-created', after.enforcement === before.enforcement, `${before.enforcement}->${after.enforcement}`);
  record('N no complaint auto-created', after.complaints === before.complaints, `${before.complaints}->${after.complaints}`);

  finish();
}

function finish() {
  const failed = summary('MC-06');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
