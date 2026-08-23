/**
 * WAVE 3 — P08 COMPLAINTS & CONDUCT end-to-end journey.
 *
 * intake -> triage/classify -> assignment -> RFI (maker-checker) -> licensee
 * response -> conduct investigation -> finding -> closure -> post-closure
 * monitoring -> reminder emitters (idempotency proof).
 *
 * Every call uses a real certification persona token against the real API, so
 * RLS, RPC guards and maker-checker rules apply exactly as in the product.
 */
import { P, rpc, sel, ins, patch, fn, denied, record, summary } from './api';

const OFFICER = P('complaints_officer');
const SUPERVISOR = P('complaints_supervisor');
const ANALYST = P('conduct_analyst');
const CONDUCT_SUP = P('conduct_supervisor');
const LICENSEE = P('licensee_primary_user');
const AUDITOR = P('auditor');

const LICENSEE_ID = '69d93314-569b-490d-acdf-3e313cd428ba'; // Meridian Commercial Bank Limited

let selfApprovalSuccesses = 0;
let visibilityLeaks = 0;

const iso = (days: number) => new Date(Date.now() + days * 86400000).toISOString();

async function main() {
  // ---------------------------------------------------------------- intake ---
  const reg = await sel(OFFICER, 'regulators?select=id&limit=1');
  const regulatorId = reg.body?.[0]?.id;
  const types = await sel(OFFICER, 'complaint_types?select=id&limit=1');
  const typeId = types.body?.[0]?.id;

  const decide = await rpc(OFFICER, 'complaint_intake_decide', {
    _variant: 'internal',
    _regulator_id: regulatorId,
    _payload: { subject: 'Unexplained account fees', description: 'Customer charged undisclosed monthly service fees for six months.', intake_source: 'internal' },
  });
  record('P08.01 intake rules resolved and validated', decide.ok && Array.isArray(decide.body?.errors) && decide.body.errors.length === 0, decide.text);

  // Severity must be system-assigned, never caller-supplied.
  record('P08.02 severity is system-assigned at intake', !!decide.body?.severity && decide.body?.severity_source === 'intake_default', String(decide.body?.severity));

  const created = await ins(OFFICER, 'complaints', {
    subject: 'Unexplained account fees',
    description: 'Customer charged undisclosed monthly service fees for six months.',
    regulator_id: regulatorId,
    complaint_type_id: typeId,
    licensee_id: LICENSEE_ID,
    license_holder_id: LICENSEE_ID,
    severity: decide.body?.severity,
    priority: decide.body?.priority,
    intake_source: decide.body?.intake_source,
    status: 'submitted',
  });
  const complaintId = created.body?.[0]?.id;
  record('P08.03 complaints officer can register a complaint', created.ok && !!complaintId, created.text);
  if (!complaintId) return summary('P08 COMPLAINTS & CONDUCT');

  // --------------------------------------------------------------- triage ---
  const classify = await rpc(OFFICER, 'classify_complaint', {
    _id: complaintId,
    _payload: { severity: 'high', priority: 'p2', assigned_team: 'Conduct', complaint_type_id: typeId },
  });
  record('P08.04 triage/classification applied', classify.ok, classify.text);

  const me = await rpc(ANALYST, 'sec_get_user_context', {});
  const analystId = me.body?.user_id ?? me.body?.[0]?.user_id;
  const assign = await rpc(OFFICER, 'assign_complaint', { _id: complaintId, _investigator: analystId, _team: 'Conduct', _reason: 'Conduct analyst owns fee-disclosure cases' });
  record('P08.05 complaint assigned to an investigator', assign.ok, assign.text);

  // ------------------------------------------------------------------ RFI ---
  const raise = await rpc(OFFICER, 'complaint_rfi_raise', {
    p_complaint_id: complaintId,
    p_summary: 'Provide the fee disclosure documents issued to the customer.',
    p_due_at: iso(3),
    p_items: [{ prompt: 'Signed fee schedule provided at onboarding' }, { prompt: 'Statements for the six months in question' }],
    p_as_draft: true,
  });
  const rfiId = raise.body?.rfi_id ?? raise.body?.id ?? raise.body;
  record('P08.06 RFI raised by the complaints officer', raise.ok && !!rfiId, raise.text);

  const forApproval = await rpc(OFFICER, 'complaint_rfi_submit_for_approval', { p_rfi_id: rfiId });
  record('P08.07 RFI submitted for approval', forApproval.ok, forApproval.text);

  // Maker-checker: the raiser must not be able to approve their own RFI.
  const selfApprove = await rpc(OFFICER, 'complaint_rfi_approve', { p_rfi_id: rfiId, p_notes: 'self approval attempt' });
  if (selfApprove.ok) selfApprovalSuccesses++;
  record('P08.08 maker-checker blocks self-approval of an RFI', denied(selfApprove), selfApprove.text);

  const approve = await rpc(SUPERVISOR, 'complaint_rfi_approve', { p_rfi_id: rfiId, p_notes: 'Approved for dispatch', p_due_at: iso(3) });
  record('P08.09 supervisor approves and dispatches the RFI', approve.ok, approve.text);

  // --------------------------------------------------- licensee RFI reply ---
  const extRfi = await sel(LICENSEE, `complaint_rfis?select=id,status,approval_state&id=eq.${rfiId}`);
  record('P08.10 licensee can see the dispatched RFI', extRfi.ok && extRfi.body?.length === 1, extRfi.text);

  const items = await sel(LICENSEE, `complaint_rfi_items?select=id&rfi_id=eq.${rfiId}`);
  let draft: any = { ok: false, text: 'no items' };
  for (const it of items.body ?? []) {
    draft = await rpc(LICENSEE, 'complaint_rfi_save_draft', { p_item_id: it.id, p_response_text: 'Fee schedule and statements attached.', p_file_upload_ids: [] });
    if (!draft.ok) break;
  }
  record('P08.11 licensee saves an RFI item response', draft.ok, draft.text);

  const submitRfi = await rpc(LICENSEE, 'complaint_rfi_submit', { p_rfi_id: rfiId });
  record('P08.12 licensee submits the RFI response', submitRfi.ok && submitRfi.body?.ok !== false, submitRfi.text);

  // ----------------------------------------------------- visibility checks ---
  const notes = await patch(OFFICER, `complaints?id=eq.${complaintId}`, { investigation_notes: 'INTERNAL ONLY: suspected systemic mis-selling; escalate if repeated.' });
  record('P08.13 internal investigation notes recorded', notes.ok, notes.text);

  const extComplaint = await sel(LICENSEE, `complaints?select=id,investigation_notes,findings&id=eq.${complaintId}`);
  const leakedNotes = (extComplaint.body ?? []).some((r: any) => r.investigation_notes || r.findings);
  if (leakedNotes) visibilityLeaks++;
  record('P08.14 internal notes are not exposed to the licensee', !leakedNotes, extComplaint.text);

  const otherEntity = await sel(LICENSEE, 'complaints?select=id,licensee_id&limit=50');
  const crossEntity = (otherEntity.body ?? []).filter((r: any) => r.licensee_id && r.licensee_id !== LICENSEE_ID);
  if (crossEntity.length) visibilityLeaks += crossEntity.length;
  record('P08.15 licensee cannot read other entities complaints', crossEntity.length === 0, `${crossEntity.length} foreign rows`);

  // --------------------------------------------------------- investigation ---
  const openInv = await rpc(CONDUCT_SUP, 'conduct_investigation_open', {
    _payload: {
      source_type: 'complaint', source_id: complaintId, licensee_id: LICENSEE_ID,
      allegation: 'Undisclosed fee charging affecting retail customers',
      priority: 'high', severity: 'high', due_date: iso(30).slice(0, 10),
      assigned_investigator: analystId, scope: 'Fee disclosure practices 2025-2026',
      legal_basis: 'Market conduct rules — disclosure obligations',
    },
  });
  const investigationId = openInv.body?.investigation_id ?? openInv.body?.id ?? openInv.body;
  record('P08.16 conduct investigation opened from the complaint', openInv.ok && !!investigationId, openInv.text);

  const extInv = await sel(LICENSEE, `conduct_investigations?select=id,restricted_notes&id=eq.${investigationId}`);
  if ((extInv.body ?? []).length) visibilityLeaks++;
  record('P08.17 licensee cannot read the conduct investigation', (extInv.body ?? []).length === 0, extInv.text);

  const finding = await rpc(ANALYST, 'conduct_finding_raise', {
    _payload: {
      investigation_id: investigationId, licensee_id: LICENSEE_ID,
      source_type: 'conduct_investigation', source_id: investigationId,
      title: 'Fee disclosure breach', summary: 'Fees applied without the required customer disclosure.',
      severity: 'high', breach_reference: 'Conduct Rule 12.4',
    },
  });
  record('P08.18 conduct finding raised', finding.ok, finding.text);

  // -------------------------------------------- closure + post-closure PCM ---
  const proposeClosure = await rpc(OFFICER, 'complaint_record_closure_review', {
    _complaint_id: complaintId, _decision: 'closure_proposed',
    _resolution_summary: 'Fees refunded and disclosure process corrected.',
    _rationale: 'Evidence confirms non-disclosure of the monthly service fee.',
    _outcome_category: 'upheld', _evidence_complete: true, _qa_required: true,
  });
  record('P08.19a closure proposed by the officer (maker)', proposeClosure.ok, proposeClosure.text);

  const closeReview = await rpc(SUPERVISOR, 'complaint_record_closure_review', {
    _complaint_id: complaintId, _decision: 'qa_approved',
    _resolution_summary: 'Fees refunded and disclosure process corrected.',
    _rationale: 'QA reviewed: evidence complete and remedy proportionate.', _outcome_category: 'upheld', _evidence_complete: true,
  });
  record('P08.19 closure review recorded by the supervisor', closeReview.ok, closeReview.text);

  const closed = await rpc(SUPERVISOR, 'close_complaint', { _id: complaintId, _reason: 'Resolved: refund issued and controls corrected', _category: 'upheld' });
  record('P08.20 complaint closed', closed.ok, closed.text);

  const pcm = await rpc(ANALYST, 'conduct_monitoring_directive_upsert', {
    _investigation_id: investigationId,
    _focus_areas: 'Fee disclosure controls', _indicators: 'Complaint volume, fee reversal rate',
    _entity_reporting_requirement: 'Quarterly attestation', _frequency: 'quarterly',
    _start_date: new Date().toISOString().slice(0, 10),
    _end_date: iso(365).slice(0, 10),
  });
  record('P08.21 post-closure monitoring directive created', pcm.ok, pcm.text);

  // ------------------------------------------------ reminder emitter proof ---
  // Force one RFI and one monitoring review into the reminder window, then run
  // each sweep twice: the second run must not duplicate any queue event.
  const dueToday = new Date().toISOString().slice(0, 10);
  const pinRfi = await patch(SUPERVISOR, `complaint_rfis?id=eq.${rfiId}`, { due_at: `${dueToday}T12:00:00Z`, status: 'open' });
  record('P08.22 an RFI sits inside the reminder window', pinRfi.ok, pinRfi.text);

  let reviews = await sel(CONDUCT_SUP, 'conduct_monitoring_reviews?select=id,due_date,status&status=eq.scheduled&limit=1');
  if (!reviews.body?.length && pcm.ok) {
    const monitoringId = pcm.body?.monitoring_id ?? pcm.body;
    await ins(ANALYST, 'conduct_monitoring_reviews', { monitoring_id: monitoringId, due_date: dueToday, status: 'scheduled' });
    reviews = await sel(CONDUCT_SUP, 'conduct_monitoring_reviews?select=id,due_date,status&status=eq.scheduled&limit=1');
  }
  const reviewId = reviews.body?.[0]?.id;
  if (reviewId) await patch(CONDUCT_SUP, `conduct_monitoring_reviews?id=eq.${reviewId}`, { due_date: dueToday });
  record('P08.23 a monitoring review sits inside the reminder window', !!reviewId, reviews.text);

  const workerToken = process.env.WORKER_INVOKE_TOKEN as string;
  const sweep = async (name: string) => {
    const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-worker-token': workerToken, apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string },
      body: JSON.stringify({ triggered_by: 'cert-v2' }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) } as any;
  };

  const NOTIF_ADMIN = P('notification_administrator');
  const countEvents = async (key: string) => {
    const r = await sel(NOTIF_ADMIN, `notification_event_queue?select=id&event_key=eq.${key}`);
    return Array.isArray(r.body) ? r.body.length : -1;
  };

  const rfiBefore = await countEvents('complaint.rfi_due_reminder');
  const r1 = await sweep('complaint-rfi-reminder-sweep');
  const rfiAfter1 = await countEvents('complaint.rfi_due_reminder');
  const r2 = await sweep('complaint-rfi-reminder-sweep');
  const rfiAfter2 = await countEvents('complaint.rfi_due_reminder');
  record('P08.24 complaint RFI reminder emits a real queue event', r1.body?.ok === true && rfiAfter1 > rfiBefore, JSON.stringify(r1.body));
  record('P08.25 complaint RFI reminder is idempotent on re-run', rfiAfter2 === rfiAfter1, `after1=${rfiAfter1} after2=${rfiAfter2} ${JSON.stringify(r2.body)}`);

  const cmBefore = await countEvents('conduct_investigation.monitoring_review_due');
  const c1 = await sweep('conduct-monitoring-review-reminder-sweep');
  const cmAfter1 = await countEvents('conduct_investigation.monitoring_review_due');
  const c2 = await sweep('conduct-monitoring-review-reminder-sweep');
  const cmAfter2 = await countEvents('conduct_investigation.monitoring_review_due');
  record('P08.26 monitoring review reminder emits a real queue event', c1.body?.ok === true && cmAfter1 > cmBefore, JSON.stringify(c1.body));
  record('P08.27 monitoring review reminder is idempotent on re-run', cmAfter2 === cmAfter1, `after1=${cmAfter1} after2=${cmAfter2} ${JSON.stringify(c2.body)}`);

  const dupes = rfiAfter2 - rfiAfter1 + (cmAfter2 - cmAfter1);

  // ---------------------------------------------------------------- audit ---
  const audit = await sel(AUDITOR, `compliance_audit_logs?select=entry_id,action_type&object_id=eq.${complaintId}&limit=20`);
  record('P08.28 audit trail written for the complaint', Array.isArray(audit.body) && audit.body.length > 0, `${audit.body?.length ?? 0} rows`);

  const auditorWrite = await patch(AUDITOR, `complaints?id=eq.${complaintId}`, { resolution_notes: 'auditor write attempt' });
  const auditorBlocked = denied(auditorWrite) || (Array.isArray(auditorWrite.body) && auditorWrite.body.length === 0);
  record('P08.29 auditor is read-only on complaints', auditorBlocked, auditorWrite.text);

  console.log(`\nSELF_APPROVAL_SUCCESSES=${selfApprovalSuccesses}`);
  console.log(`VISIBILITY_LEAKS=${visibilityLeaks}`);
  console.log(`DUPLICATE_NOTIFICATION_EVENTS=${dupes}`);
  console.log(`COMPLAINT_ID=${complaintId} INVESTIGATION_ID=${investigationId}`);
  return summary('P08 COMPLAINTS & CONDUCT');
}

main().then((f) => process.exit(f ? 1 : 0)).catch((e) => { console.error(e); process.exit(1); });
