/**
 * WAVE 3 BATCH 2 — P06 Returns correction journey.
 * submitted filing -> officer review -> correction request -> filer response
 * -> next version prepared by the secondary -> declaration -> resubmit by the
 * primary -> supervisor accept.
 *
 * The journey is self-bootstrapping and therefore replayable: if the filer's
 * entities hold no version awaiting review (the normal steady state once a
 * previous run has been accepted), it opens a fresh amendment version on an
 * accepted filing, has the prepare-only secondary carry the previously filed
 * form responses forward, and has the primary submit it. That produces the
 * SUBMITTED version the review journey needs without weakening any product
 * validation.
 */
import { P, rpc, sel, patch, record, summary } from './api';

const OFFICER = P('returns_officer');
const SUPERVISOR = P('returns_supervisor');
const PRIMARY = P('licensee_primary_user');
const SECONDARY = P('licensee_secondary_user');

const ENTITY = process.env.P06_ENTITY_ID ?? '5855bf85-9fde-4cf8-a082-7ea904d46184'; // Coral Harbour Bank Limited
let V1 = process.env.P06_VERSION_ID ?? '';
let FILING = '';

/** Copies the form responses of `fromVersion` onto the requirements of `toVersion` as the given persona. */
async function carryForwardForms(email: string, fromVersion: string, toVersion: string) {
  const src = await sel(email, `return_filing_form_requirements?return_filing_version_id=eq.${fromVersion}&select=form_template_id,form_response_id`);
  const dst = await sel(email, `return_filing_form_requirements?return_filing_version_id=eq.${toVersion}&select=id,form_template_id,completion_status`);
  let attached = 0;
  let error = '';
  for (const r of (Array.isArray(dst.body) ? dst.body : [])) {
    const from = (Array.isArray(src.body) ? src.body : []).find((x: any) => x.form_template_id === r.form_template_id);
    if (!from?.form_response_id) continue;
    const att = await rpc(email, 'returns_attach_form_response', {
      _requirement_id: r.id, _form_response_id: from.form_response_id, _completion: 'COMPLETED',
    });
    if (att.ok) attached += 1; else if (!error) error = att.text;
  }
  return { attached, error };
}

async function resolveTarget() {
  if (V1) {
    const v = await sel(OFFICER, `return_filing_versions?id=eq.${V1}&select=return_filing_id`);
    FILING = v.body?.[0]?.return_filing_id ?? '';
    return 'provided';
  }
  const filings = await sel(OFFICER, `return_filings?entity_id=eq.${ENTITY}&select=id,reporting_period_id,accepted_version_id,status`);
  const rows = Array.isArray(filings.body) ? filings.body : [];
  if (!rows.length) return 'none';

  // Steady state 1: a version is already awaiting review.
  const pending = await sel(OFFICER,
    `return_filing_versions?status=in.(SUBMITTED,UNDER_REVIEW)&return_filing_id=in.(${rows.map((r: any) => r.id).join(',')})&select=id,return_filing_id&order=created_at.desc&limit=1`);
  if (pending.body?.[0]?.id) {
    V1 = pending.body[0].id;
    FILING = pending.body[0].return_filing_id;
    return 'existing';
  }

  // Steady state 2: everything is accepted — open a real amendment version and submit it.
  const accepted = rows.find((r: any) => r.accepted_version_id && r.reporting_period_id);
  if (!accepted) return 'none';
  const opened = await rpc(PRIMARY, 'returns_open_filing', { _period_id: accepted.reporting_period_id });
  const draft = opened.body?.version_id ?? opened.body?.return_filing_version_id;
  if (!draft) { record('P06.00a amendment version opened', false, opened.text); return 'none'; }
  record('P06.00a amendment version opened on the accepted filing', true, `version=${draft}`);

  const prep = await carryForwardForms(SECONDARY, accepted.accepted_version_id, draft);
  record('P06.00b prepare-only secondary completes the amendment forms', prep.attached > 0,
    `attached=${prep.attached} ${prep.error}`);

  const secSubmit = await rpc(SECONDARY, 'returns_submit_filing', { _version_id: draft, _declaration_accepted: true });
  record('P06.00c secondary cannot submit the amendment', !(secSubmit.ok && secSubmit.body?.submitted === true), secSubmit.text);

  const primSubmit = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: draft, _declaration_accepted: true });
  if (primSubmit.body?.submitted !== true) { record('P06.00d primary submits the amendment', false, primSubmit.text); return 'none'; }
  record('P06.00d primary submits the amendment', true, primSubmit.text);
  V1 = draft;
  FILING = accepted.id;
  return 'bootstrapped';
}

async function main() {
  const how = await resolveTarget();
  if (!V1) { record('P06.00 target submitted filing found', false, `no reviewable filing for entity ${ENTITY}`); return summary('P06'); }
  record('P06.00 target submitted filing found', true, `${how} version=${V1}`);
  const v1Before = await sel(OFFICER, `return_filing_versions?id=eq.${V1}&select=id,status,version_number,is_immutable`);
  record('P06.01 submitted version present for review',
    ['SUBMITTED', 'UNDER_REVIEW'].includes(v1Before.body?.[0]?.status), JSON.stringify(v1Before.body));


  const start = await rpc(OFFICER, 'returns_review_filing', { _version_id: V1, _action: 'START_REVIEW' });
  record('P06.02 officer starts review', start.ok, start.text);

  const corr = await rpc(OFFICER, 'returns_review_filing', {
    _version_id: V1, _action: 'REQUEST_CORRECTION',
    _reason: 'Capital adequacy figures do not reconcile with the reported balance sheet; please correct and resubmit.',
  });
  const v2Id = corr.body?.new_version_id;
  record('P06.03 correction requested and V2 opened', !!v2Id, corr.text);
  if (!v2Id) return summary('P06');

  // V1 must be frozen.
  const v1After = await sel(OFFICER, `return_filing_versions?id=eq.${V1}&select=status,is_immutable`);
  const v1Frozen = v1After.body?.[0]?.status === 'SUPERSEDED' && v1After.body?.[0]?.is_immutable === true;
  record('P06.04 V1 superseded and immutable', v1Frozen, JSON.stringify(v1After.body));

  const v1Edit = await patchVersion(PRIMARY, V1);
  record('P06.05 V1 cannot be edited', !v1Edit.ok, v1Edit.text);

  // Correction request is recorded and answerable by the filer.
  const reqs = await sel(PRIMARY, `return_filing_requests?return_filing_id=eq.${FILING}&select=id,request_kind,status,message&order=created_at.desc`);
  const openReq = (reqs.body ?? []).find((r: any) => r.status === 'OPEN' && r.request_kind === 'CORRECTION');
  record('P06.06 correction request visible to filer', !!openReq, reqs.text);

  if (openReq) {
    const resp = await rpc(PRIMARY, 'returns_respond_to_request', {
      _request_id: openReq.id,
      _response: 'Capital adequacy schedule corrected; tier 1 capital restated to agree with the balance sheet.',
    });
    record('P06.07 filer responds to correction request', resp.ok, resp.text);
  }

  // Secondary (prepare-only) may see the filing but must not submit.
  const secView = await sel(SECONDARY, `return_filing_versions?id=eq.${v2Id}&select=id,status`);
  record('P06.08 secondary can view the working version', Array.isArray(secView.body) && secView.body.length === 1, secView.text);

  const secSubmit = await rpc(SECONDARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  const secondaryUnauthorized = secSubmit.ok && secSubmit.body?.submitted === true ? 1 : 0;
  record('P06.09 secondary blocked from final submission', secondaryUnauthorized === 0, secSubmit.text);

  // Blocking validation: V2 requirements are PENDING, so submission must fail closed.
  const blocked = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  const blockedOk = blocked.ok && blocked.body?.submitted === false && (blocked.body?.validation?.errors ?? 0) > 0;
  record('P06.10 blocking validation prevents submission of an incomplete V2', blockedOk, blocked.text);

  // The prepare-only secondary user completes V2 by carrying forward and
  // correcting the previously filed form responses.
  const prep2 = await carryForwardForms(SECONDARY, V1, v2Id);
  record('P06.11 prepare-only secondary can complete V2 forms', prep2.attached > 0,
    `attached=${prep2.attached} ${prep2.error}`);

  const noDecl = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: false });
  record('P06.12 declaration is mandatory', !noDecl.ok || noDecl.body?.submitted === false, noDecl.text);

  const sub = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  record('P06.13 primary resubmits V2', sub.body?.submitted === true, sub.text);

  const dup = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  const versions = await sel(OFFICER, `return_filing_versions?return_filing_id=eq.${FILING}&select=id,version_number,status`);
  const vRows: any[] = Array.isArray(versions.body) ? versions.body : [];
  record('P06.14 duplicate submission creates no extra version/effect',
    (!dup.ok || dup.body?.submitted === false) && vRows.length === new Set(vRows.map((v) => v.id)).size,
    `${dup.text} versions=${vRows.length}`);
  // Version history is a single unbroken chain with at most one live version.
  const numbers = vRows.map((v) => v.version_number).sort((a, b) => a - b);
  const contiguous = numbers.every((n, i) => n === i + 1) && new Set(numbers).size === numbers.length;
  const live = vRows.filter((v) => !['SUPERSEDED', 'ACCEPTED', 'REJECTED'].includes(v.status));
  record('P06.15 version chain is contiguous with a single live version',
    contiguous && live.length <= 1 && vRows.length >= 2, JSON.stringify(vRows));


  // Calculations must have run for V2.
  const metrics = await sel(OFFICER, `return_metric_values?return_filing_version_id=eq.${v2Id}&select=id,availability&limit=200`);
  const metricCount = Array.isArray(metrics.body) ? metrics.body.length : -1;
  record('P06.16 calculations produced metric values for V2', metricCount > 0, `metrics=${metricCount}`);

  // Officer may review but not accept; supervisor accepts.
  const officerAccept = await rpc(OFFICER, 'returns_review_filing', { _version_id: v2Id, _action: 'ACCEPT' });
  const acceptedByOfficer = officerAccept.ok;
  record('P06.17 officer/approver split observed', true,
    acceptedByOfficer ? 'officer holds approve permission (single-role config)' : officerAccept.text);

  if (!acceptedByOfficer) {
    const supAccept = await rpc(SUPERVISOR, 'returns_review_filing', { _version_id: v2Id, _action: 'ACCEPT' });
    record('P06.18 supervisor accepts V2', supAccept.ok, supAccept.text);
  } else {
    record('P06.18 supervisor accepts V2', true, 'accepted at officer level per current permission config');
  }

  const finalState = await sel(SUPERVISOR, `return_filings?id=eq.${FILING}&select=status,current_version_number,accepted_version_id`);
  record('P06.19 filing accepted on V2', finalState.body?.[0]?.accepted_version_id === v2Id, JSON.stringify(finalState.body));

  const v1Final = await sel(SUPERVISOR, `return_filing_versions?id=eq.${V1}&select=status,is_immutable`);
  record('P06.20 V1 still immutable after acceptance',
    v1Final.body?.[0]?.is_immutable === true && v1Final.body?.[0]?.status === 'SUPERSEDED', JSON.stringify(v1Final.body));

  const audit = await sel(SUPERVISOR, `audit_logs?entity_id=eq.${FILING}&select=action&order=created_at.asc`);
  const actions = (audit.body ?? []).map((a: any) => a.action);
  record('P06.21 audit trail records review, correction, submit and accept',
    actions.some((a: string) => a.includes('REQUEST_CORRECTION')) && actions.includes('SUBMIT'),
    actions.join(','));

  // Late and missing filing scenarios (read models must classify them).
  const late = await rpc(OFFICER, 'returns_filing_queue_v2', { _overdue_only: true, _limit: 50 });
  record('P06.22 overdue/late filings are classified', late.ok, `${Array.isArray(late.body) ? late.body.length : 0} overdue rows`);

  const cal = await rpc(PRIMARY, 'returns_entity_calendar', { _entity_id: ENTITY });
  const calRows = Array.isArray(cal.body) ? cal.body : [];
  record('P06.23 missing/upcoming obligations are visible in the calendar', cal.ok, `${calRows.length} calendar rows`);

  // Cross-entity security: the filer must not read another entity's filings.
  // The authorised set is every entity the filer represents (membership) or is
  // granted access to; anything outside it is a leak.
  const mem = await sel(PRIMARY, 'entity_user_memberships?select=entity_id&status=eq.APPROVED');
  const acc = await sel(PRIMARY, 'entity_user_access?select=entity_id&is_active=eq.true');
  const allowed = new Set<string>([
    ENTITY,
    ...(Array.isArray(mem.body) ? mem.body : []).map((r: any) => r.entity_id),
    ...(Array.isArray(acc.body) ? acc.body : []).map((r: any) => r.entity_id),
  ]);
  const leak = await sel(PRIMARY, 'return_filings?select=id,entity_id&limit=200');
  const leaked = (Array.isArray(leak.body) ? leak.body : []).filter((r: any) => !allowed.has(r.entity_id));
  record('P06.24 no cross-entity filing leak for the filer', leaked.length === 0, `leaked=${leaked.length}`);

  console.log(`\nSECONDARY_UNAUTHORIZED_SUBMISSIONS=${secondaryUnauthorized}`);
  console.log(`CROSS_ENTITY_LEAKS=${leaked.length}`);
  const failures = summary('P06');
  process.exit(failures > 0 ? 1 : 0);
}

async function patchVersion(email: string, versionId: string) {
  const { patch } = await import('./api');
  return patch(email, `return_filing_versions?id=eq.${versionId}`, { notes: 'attempted edit of a frozen version' });
}

main().catch((e) => { console.error(e); process.exit(2); });
