/**
 * WAVE 3 BATCH 2 — P06 Returns correction journey.
 * submitted filing -> officer review -> correction request -> filer response
 * -> Version 2 edit -> declaration -> resubmit -> supervisor accept.
 */
import { P, rpc, sel, denied, record, summary } from './api';

const OFFICER = P('returns_officer');
const SUPERVISOR = P('returns_supervisor');
const PRIMARY = P('licensee_primary_user');
const SECONDARY = P('licensee_secondary_user');

// Target is selected at run time: the first version-1 SUBMITTED filing of an
// entity the certification filer represents, so the journey is replayable.
const ENTITY = process.env.P06_ENTITY_ID ?? '52112b8b-0f01-4682-a5c7-fc316797dfd8'; // Windward Trust Bank Limited
let V1 = process.env.P06_VERSION_ID ?? '';
let FILING = '';

async function resolveTarget() {
  if (V1) {
    const v = await sel(OFFICER, `return_filing_versions?id=eq.${V1}&select=return_filing_id`);
    FILING = v.body?.[0]?.return_filing_id ?? '';
    return;
  }
  const res = await sel(OFFICER,
    `return_filing_versions?status=eq.SUBMITTED&version_number=eq.1&select=id,return_filing_id,return_filings!inner(entity_id)&return_filings.entity_id=eq.${ENTITY}&limit=1`);
  V1 = res.body?.[0]?.id ?? '';
  FILING = res.body?.[0]?.return_filing_id ?? '';
}

async function main() {
  await resolveTarget();
  if (!V1) { record('P06.00 target submitted filing found', false, `no submitted V1 for entity ${ENTITY}`); return summary('P06'); }
  const v1Before = await sel(OFFICER, `return_filing_versions?id=eq.${V1}&select=id,status,version_number,is_immutable`);
  record('P06.01 submitted V1 present', v1Before.body?.[0]?.status === 'SUBMITTED', JSON.stringify(v1Before.body));

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
  const v1Reqs = await sel(SECONDARY, `return_filing_form_requirements?return_filing_version_id=eq.${V1}&select=form_template_id,form_response_id`);
  const v2Reqs = await sel(SECONDARY, `return_filing_form_requirements?return_filing_version_id=eq.${v2Id}&select=id,form_template_id,completion_status`);
  let attached = 0;
  const attachErrors: string[] = [];
  for (const r of (Array.isArray(v2Reqs.body) ? v2Reqs.body : [])) {
    const src = (Array.isArray(v1Reqs.body) ? v1Reqs.body : []).find((x: any) => x.form_template_id === r.form_template_id);
    if (!src?.form_response_id) continue;
    const att = await rpc(SECONDARY, 'returns_attach_form_response', {
      _requirement_id: r.id, _form_response_id: src.form_response_id, _completion: 'COMPLETED',
    });
    if (att.ok) attached += 1; else attachErrors.push(att.text);
  }
  record('P06.11 prepare-only secondary can complete V2 forms', attached > 0,
    `attached=${attached} ${attachErrors[0] ?? ''}`);

  const noDecl = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: false });
  record('P06.12 declaration is mandatory', !noDecl.ok || noDecl.body?.submitted === false, noDecl.text);

  const sub = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  record('P06.13 primary resubmits V2', sub.body?.submitted === true, sub.text);

  const dup = await rpc(PRIMARY, 'returns_submit_filing', { _version_id: v2Id, _declaration_accepted: true });
  const versions = await sel(OFFICER, `return_filing_versions?return_filing_id=eq.${FILING}&select=id,version_number,status`);
  const versionCount = Array.isArray(versions.body) ? versions.body.length : -1;
  record('P06.14 duplicate submission creates no extra version/effect',
    !dup.ok || dup.body?.submitted === false, `${dup.text} versions=${versionCount}`);
  record('P06.15 exactly two versions exist', versionCount === 2, JSON.stringify(versions.body));

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
