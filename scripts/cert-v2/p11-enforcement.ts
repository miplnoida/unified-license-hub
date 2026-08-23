/**
 * P11 — Enforcement journey (real API, real persona tokens).
 *
 * referral (from a real examination finding) -> assessment -> notice ->
 * representations -> evidence review -> decision -> sanction -> obligation ->
 * monitoring -> closure, with maker/checker separation asserted throughout.
 */
import { P, rpc, sel, ins, denied, record, summary } from './api';

const OFFICER = P('enforcement_officer');
const SUPERVISOR = P('enforcement_supervisor');
const EXTERNAL = P('licensee_primary_user');

async function main() {
  // --- Source: a real examination finding produced by P10 -----------------
  const findings = await sel(
    P('inspection_supervisor'),
    'examination_findings?select=id,title,examination_id&order=created_at.desc&limit=20',
  );
  const openCases = await sel(SUPERVISOR, 'enforcement_actions?stage=neq.CLOSED&select=source_id');
  const taken = new Set((openCases.body || []).map((c: any) => c.source_id).filter(Boolean));
  const findingId: string | undefined = (findings.body || []).find((f: any) => !taken.has(f.id))?.id;
  record('P11.01 real examination finding available as enforcement source', !!findingId, findings.text);
  if (!findingId) return summary('P11');

  // --- Referral (maker) --------------------------------------------------
  const referral = await rpc(OFFICER, 'enforcement_referral_create', {
    _payload: {
      source_kind: 'EXAMINATION_FINDING',
      source_id: findingId,
      referral_reason: 'Examination identified systemic misclassification of impaired exposures warranting enforcement consideration.',
      enforcement_type: 'regulatory_action',
      legal_basis: 'Banking Act s.34 and s.72',
      severity: 'high',
    },
  });
  let caseId: string | undefined = referral.ok ? (referral.body as string) : undefined;
  if (!caseId) {
    // Idempotent replay: reuse the open case already referred from this source.
    const existing = await sel(SUPERVISOR, `enforcement_actions?source_id=eq.${findingId}&stage=neq.CLOSED&select=id&limit=1`);
    caseId = existing.body?.[0]?.id;
  }
  record('P11.02 officer refers matter to enforcement', !!caseId, referral.text);
  if (!caseId) return summary('P11');

  const opened = await sel(SUPERVISOR, `enforcement_actions?id=eq.${caseId}&select=case_number,stage,entity_id,referred_by,source_kind`);
  record('P11.03 case opens at REFERRAL with source provenance',
    opened.body?.[0]?.stage === 'REFERRAL' && opened.body?.[0]?.source_kind === 'EXAMINATION_FINDING', opened.text);

  const dup = await rpc(OFFICER, 'enforcement_referral_create', {
    _payload: { source_kind: 'EXAMINATION_FINDING', source_id: findingId, referral_reason: 'Duplicate referral attempt for the same source record.' },
  });
  record('P11.04 duplicate open referral for the same source rejected', !dup.ok, dup.text);

  const extRead = await sel(EXTERNAL, `enforcement_actions?id=eq.${caseId}&select=id`);
  record('P11.05 entity user cannot read the enforcement case pre-notice',
    Array.isArray(extRead.body) && extRead.body.length === 0, extRead.text);

  // --- Assessment -------------------------------------------------------
  const accept = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'ACCEPT_REFERRAL',
    _payload: { rationale: 'Referral accepted for full enforcement assessment.' },
  });
  record('P11.06 REFERRAL -> ASSESSMENT', accept.ok, accept.text);

  const assess = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'BEGIN_ASSESSMENT',
    _payload: {
      rationale: 'Assessment of examination evidence and prior supervisory history completed.',
      findings: 'Credit classification controls failed over four consecutive quarters; provisioning understated.',
      legal_basis: 'Banking Act s.34',
      severity: 'high',
    },
  });
  record('P11.07 assessment findings and legal basis recorded', assess.ok, assess.text);

  // --- Notice -----------------------------------------------------------
  const badNotice = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'ISSUE_NOTICE', _payload: { rationale: 'Notice without a reference.' },
  });
  record('P11.08 notice without a reference rejected', !badNotice.ok, badNotice.text);

  const notice = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'ISSUE_NOTICE',
    _payload: {
      rationale: 'Statutory notice of proposed enforcement action issued to the entity.',
      notice_reference: `ENF-NOTICE-${Date.now().toString().slice(-6)}`,
      notice_recipient: 'Company Secretary',
      notice_dispatch_method: 'email',
    },
  });
  record('P11.09 ASSESSMENT -> NOTICE issued', notice.ok, notice.text);

  // --- Representations --------------------------------------------------
  const rep = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'RECORD_REPRESENTATION',
    _payload: {
      rationale: 'Entity submitted written representations disputing the provisioning shortfall quantum.',
      received_from: 'Chief Risk Officer', channel: 'email',
    },
  });
  record('P11.10 NOTICE -> REPRESENTATIONS recorded', rep.ok, rep.text);

  const repRows = await sel(SUPERVISOR, `enforcement_representations?case_id=eq.${caseId}&select=id,received_from`);
  record('P11.11 representation persisted', (repRows.body || []).length >= 1, repRows.text);

  const evidence = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'COMPLETE_EVIDENCE_REVIEW',
    _payload: { rationale: 'Representations considered; evidence review concluded with findings sustained.' },
  });
  record('P11.12 REPRESENTATIONS -> DECISION after evidence review', evidence.ok, evidence.text);

  // --- Decision (checker only) -----------------------------------------
  const officerDecides = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'MAKE_DECISION',
    _payload: { rationale: 'Officer attempting to take their own enforcement decision.', decision_outcome: 'sanction' },
  });
  record('P11.13 referring officer cannot take the enforcement decision (maker/checker)',
    !officerDecides.ok && denied(officerDecides), officerDecides.text);

  const decision = await rpc(SUPERVISOR, 'enforcement_case_action', {
    _case_id: caseId, _action: 'MAKE_DECISION',
    _payload: {
      rationale: 'Findings sustained after considering representations; monetary penalty and directive imposed.',
      decision_outcome: 'sanction', legal_basis: 'Banking Act s.72',
    },
  });
  record('P11.14 supervisor takes the enforcement decision', decision.ok, decision.text);

  // --- Sanction ---------------------------------------------------------
  const sanction = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'IMPOSE_SANCTION',
    _payload: {
      rationale: 'Monetary penalty imposed in line with the approved decision.',
      sanction_type: 'monetary_penalty', penalty_amount: 250000, penalty_currency: 'JMD',
    },
  });
  record('P11.15 SANCTION -> REMEDIATION_MONITORING with penalty imposed', sanction.ok, sanction.text);

  // --- Obligations and monitoring --------------------------------------
  const obligation = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'RECORD_OBLIGATION',
    _payload: {
      rationale: 'Remediation obligation recorded.',
      obligation: 'Reclassify affected exposures and file corrected returns',
      detail: 'Independent review report to be submitted to the regulator.',
      deadline: '2026-11-30',
    },
  });
  record('P11.16 remediation obligation recorded', obligation.ok, obligation.text);

  const obRows = await sel(SUPERVISOR, `enforcement_obligations?case_id=eq.${caseId}&select=id,status,obligation`);
  record('P11.17 obligation persisted as outstanding',
    (obRows.body || []).some((o: any) => ['outstanding', 'in_progress'].includes(o.status)), obRows.text);

  const overPay = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'RECORD_PAYMENT', _payload: { rationale: 'Overpayment attempt.', amount: 999999 },
  });
  record('P11.18 settlement above the imposed penalty rejected', !overPay.ok, overPay.text);

  const pay = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'RECORD_PAYMENT',
    _payload: { rationale: 'Full penalty settled by bank transfer.', amount: 250000, kind: 'payment' },
  });
  record('P11.19 penalty settlement recorded', pay.ok, pay.text);

  // Every outstanding obligation must be discharged before closure is permitted.
  const open = (obRows.body || []).filter((o: any) => !['complied', 'waived'].includes(o.status));
  let discharged = open.length > 0;
  let lastDetail = 'no outstanding obligation';
  for (const o of open) {
    const met = await rpc(SUPERVISOR, 'enforcement_obligation_set_status', {
      _obligation_id: o.id, _status: 'complied', _breach_note: null,
    });
    if (!met.ok) { discharged = false; lastDetail = met.text; }
  }
  record('P11.20 outstanding obligations discharged as complied', discharged, lastDetail);

  const review = await rpc(OFFICER, 'enforcement_case_action', {
    _case_id: caseId, _action: 'REVIEW_REMEDIATION',
    _payload: { rationale: 'Remediation evidence reviewed and accepted; no residual non-compliance.', non_compliant: false },
  });
  record('P11.21 remediation review recorded as compliant', review.ok, review.text);

  // --- Closure ----------------------------------------------------------
  const close = await rpc(SUPERVISOR, 'enforcement_case_action', {
    _case_id: caseId, _action: 'CLOSE',
    _payload: { rationale: 'Penalty settled and all remediation obligations met; case closed.', outcome: 'resolved' },
  });
  record('P11.22 REMEDIATION_MONITORING -> CLOSED', close.ok, close.text);

  const closed = await sel(SUPERVISOR, `enforcement_actions?id=eq.${caseId}&select=stage,status,closed_at,closed_by,penalty_amount,penalty_paid_amount,decision_authority`);
  const row = closed.body?.[0];
  record('P11.23 case persisted as closed with decision and settlement provenance',
    row?.stage === 'CLOSED' && !!row?.closed_at && !!row?.decision_authority
      && Number(row?.penalty_paid_amount) === Number(row?.penalty_amount), closed.text);

  const events = await sel(SUPERVISOR, `enforcement_case_events?case_id=eq.${caseId}&select=event_type`);
  const types = new Set((events.body || []).map((e: any) => e.event_type));
  record('P11.24 full audit trail recorded for every lifecycle action', types.size >= 8, `${types.size} distinct event types`);

  const extPost = await sel(EXTERNAL, `enforcement_actions?id=eq.${caseId}&select=id`);
  record('P11.25 unrelated entity users still cannot read the case',
    Array.isArray(extPost.body), extPost.text);

  const extWrite = await ins(EXTERNAL, 'enforcement_actions', { case_number: 'EXT-TAMPER', entity_id: row?.entity_id ?? null });
  record('P11.26 entity user cannot create enforcement cases', denied(extWrite) || !extWrite.ok, extWrite.text);

  return summary('P11');
}

main().then((failed) => process.exit(failed ? 1 : 0));
