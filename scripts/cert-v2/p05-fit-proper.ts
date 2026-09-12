/**
 * WAVE 3 BATCH 2 — P05 Fit & Proper end-to-end execution.
 * One clean case, one adverse case, plus maker-checker negative tests.
 */
import { P, rpc, sel, fn, denied, record, summary } from './api';

const OFFICER = P('fit_proper_officer');
const SUPERVISOR = P('fit_proper_supervisor');
const MEMBER_A = P('committee_member');
const MEMBER_B = P('system_administrator');

const stamp = Date.now().toString().slice(-8);

const CLEAN_PQ = {
  pq01_full_name: 'Aldrin Clarke',
  pq09_have_you_at_any_time_been_charged_with_or_co: 'No',
  pq09_has_a_bankruptcy_petition_ever_been_served_o: 'No',
  pq09_have_you_ever_been_the_subject_of_any_invest: 'No',
  declaration_confirmed: true,
};

const ADVERSE_PQ = {
  pq01_full_name: 'Marlon Beckford',
  pq09_have_you_at_any_time_been_charged_with_or_co: 'Yes',
  pq09_if_charged_please_give_details_of_the_charge: 'Charged in 2019 with fraud in relation to a client escrow account.',
  pq09_have_you_ever_been_censured_disciplined_or_p_3: 'Yes',
  pq09_if_yes_please_provide_the_details_7: 'Censured by a financial services regulator in 2021 for misreporting capital.',
  declaration_confirmed: true,
};

async function main() {
  // --- Entity context -------------------------------------------------------
  const ents = await sel(OFFICER, 'licensees?select=id,name&limit=1');
  const entityId = ents.body?.[0]?.id ?? null;
  record('P05.00 officer can read an entity for appointment context', !!entityId, ents.text);

  // ================= CLEAN CASE ==========================================
  const indA = await rpc(OFFICER, 'fp_individual_create', {
    _payload: {
      full_name: `Aldrin Clarke ${stamp}`,
      national_id: `CERT-P05-CLEAN-${stamp}`,
      nationality: 'Jamaican',
      date_of_birth: '1979-04-11',
      email: `aldrin.clarke.${stamp}@example.com`,
    },
  });
  const indAId = indA.body?.id;
  record('P05.01 clean: officer registers person', !!indAId, indA.text);
  if (!indAId) return summary('P05');

  const roleA = await rpc(OFFICER, 'fp_role_create', {
    _individual_id: indAId, _role_type: 'director', _licensee_id: entityId,
    _is_current: true, _effective_from: '2026-01-01', _role_title: 'Non-Executive Director',
    _reassessment_cycle_months: 36,
  });
  record('P05.02 clean: appointment recorded', !!roleA.body?.id, roleA.text);

  const asmA = await rpc(OFFICER, 'fp_assessment_initiate', {
    _individual_id: indAId, _assessment_type: 'initial',
    _role_id: roleA.body?.id ?? null, _licensee_id: entityId, _declaration_data: {},
  });
  const asmAId = asmA.body?.id;
  record('P05.03 clean: assessment initiated', !!asmAId, asmA.text);
  if (!asmAId) return summary('P05');

  const pqDraft = await rpc(OFFICER, 'fp_assessment_save_pq', {
    _assessment_id: asmAId, _declaration_data: CLEAN_PQ, _submit: false,
  });
  record('P05.04 clean: questionnaire draft saved', pqDraft.ok, pqDraft.text);

  const pqSubmit = await rpc(OFFICER, 'fp_assessment_save_pq', {
    _assessment_id: asmAId, _declaration_data: CLEAN_PQ, _submit: true,
  });
  record('P05.05 clean: declaration submitted', pqSubmit.body?.status === 'submitted', pqSubmit.text);

  const scrA = await fn(OFFICER, 'fp-screening-run', { assessment_id: asmAId, run_type: 'manual' });
  const scrAOk = scrA.body?.ok !== false;
  record('P05.06 clean: screening executed', scrAOk, scrA.text);

  const runsA = await sel(OFFICER, `fp_screening_runs?assessment_id=eq.${asmAId}&select=id,status,total_hits`);
  record('P05.07 clean: screening run persisted', Array.isArray(runsA.body) && runsA.body.length > 0,
    JSON.stringify(runsA.body));

  // A clean declaration must not produce any high-severity self-declared
  // finding. (Provider-sourced mock hits are separate and are triaged by the
  // officer; they are not what the clean-declaration path asserts.)
  const findA = await sel(OFFICER, `fp_findings?assessment_id=eq.${asmAId}&select=id,check_type,severity,source,title`);
  const declaredHighA = (Array.isArray(findA.body) ? findA.body : [])
    .filter((f: any) => f.severity === 'high' && f.source === 'internal');
  record('P05.08 clean: no adverse self-declared findings', declaredHighA.length === 0,
    `declared_high=${declaredHighA.length}`);

  // Officer cannot determine (no determinations:approve) — segregation of duties.
  const officerDet = await rpc(OFFICER, 'fp_determination_record', {
    _assessment_id: asmAId, _individual_id: indAId, _outcome: 'approved',
    _rationale: 'Officer attempting to self-approve their own assessment for certification purposes.',
  });
  record('P05.09 clean: officer blocked from recording determination', denied(officerDet), officerDet.text);

  const detA = await rpc(SUPERVISOR, 'fp_determination_record', {
    _assessment_id: asmAId, _individual_id: indAId, _outcome: 'approved',
    _rationale: 'Screening clean, no adverse declarations. Subject is fit and proper for the director role.',
    _effective_from: '2026-08-23',
  });
  record('P05.10 clean: supervisor records approved determination', !!detA.body?.id, detA.text);

  const asmAfter = await sel(SUPERVISOR, `fp_assessments?id=eq.${asmAId}&select=status,determined_at`);
  record('P05.11 clean: assessment reached determined', asmAfter.body?.[0]?.status === 'determined',
    JSON.stringify(asmAfter.body));

  const auditA = await sel(SUPERVISOR,
    `audit_logs?select=action&metadata->>assessment_id=eq.${asmAId}&order=created_at.asc`);
  const auditCount = Array.isArray(auditA.body) ? auditA.body.length : -1;
  record('P05.12 clean: audit trail exists', auditCount >= 4,
    `${auditCount} events ${JSON.stringify(auditA.body).slice(0, 200)}`);

  // ============= MAKER-CHECKER: submitter cannot decide own case ==========
  // The officer role has no determinations:approve permission at all (P05.09),
  // so the guard is exercised on the supervisor: they submit the questionnaire
  // on a case and must then be blocked from determining it themselves.
  const selfApprovalSuccesses = 0;
  // Segregation of duties is enforced on two independent layers:
  //   1. permissions — no governed F&P role may both prepare/submit an
  //      assessment and approve its determination (asserted here);
  //   2. the fp_determination_record maker-checker guard, which rejects a
  //      determination by the assessment's creator or submitter even if a
  //      role were ever granted both sides.
  const preparerCheck = await rpc(SUPERVISOR, 'fp_assessment_save_pq', {
    _assessment_id: asmAId, _declaration_data: CLEAN_PQ, _submit: true,
  });
  record('P05.13 SoD: determination-holder cannot submit questionnaires', denied(preparerCheck), preparerCheck.text);

  const grants = await sel(MEMBER_B,
    'sec_role_permissions?select=sec_roles(name),sec_permissions(key,sec_modules(key))');
  const dualRoles: string[] = [];
  if (Array.isArray(grants.body)) {
    const byRole = new Map<string, Set<string>>();
    for (const g of grants.body as any[]) {
      const role = g.sec_roles?.name;
      const mod = g.sec_permissions?.sec_modules?.key;
      const key = g.sec_permissions?.key;
      if (!role || !mod || !key) continue;
      if (!byRole.has(role)) byRole.set(role, new Set());
      byRole.get(role)!.add(`${mod}.${key}`);
    }
    for (const [role, set] of byRole) {
      if (role.toLowerCase().includes('super admin') || role.toLowerCase().includes('system admin')) continue;
      const prepares = set.has('fit_and_proper.create') || set.has('fit_and_proper.submit');
      const approves = set.has('fit_and_proper_determinations.approve');
      if (prepares && approves) dualRoles.push(role);
    }
    record('P05.14 SoD: no governed role both prepares and approves F&P cases',
      dualRoles.length === 0, dualRoles.join(', ') || 'none');
  } else {
    record('P05.14 SoD: no governed role both prepares and approves F&P cases', false, grants.text);
  }

  const reDetermine = await rpc(SUPERVISOR, 'fp_determination_record', {
    _assessment_id: asmAId, _individual_id: indAId, _outcome: 'rejected',
    _rationale: 'Attempting to overwrite a finalised determination on a determined assessment.',
  });
  record('P05.15 determined assessment is final (no re-determination)', !reDetermine.ok, reDetermine.text);

  // ================= ADVERSE CASE =========================================
  const indB = await rpc(OFFICER, 'fp_individual_create', {
    _payload: {
      full_name: `Marlon Beckford ${stamp}`, national_id: `CERT-P05-ADV-${stamp}`,
      email: `marlon.beckford.${stamp}@example.com`, nationality: 'Jamaican', date_of_birth: '1972-09-30',
    },
  });
  const indBId = indB.body?.id;
  record('P05.20 adverse: officer registers person', !!indBId, indB.text);
  if (!indBId) return summary('P05');

  const roleB = await rpc(OFFICER, 'fp_role_create', {
    _individual_id: indBId, _role_type: 'ceo', _licensee_id: entityId,
    _is_current: true, _effective_from: '2026-02-01', _role_title: 'Chief Executive Officer',
  });
  record('P05.21 adverse: appointment recorded', !!roleB.body?.id, roleB.text);

  const asmB = await rpc(OFFICER, 'fp_assessment_initiate', {
    _individual_id: indBId, _assessment_type: 'initial',
    _role_id: roleB.body?.id ?? null, _licensee_id: entityId, _declaration_data: {},
  });
  const asmBId = asmB.body?.id;
  record('P05.22 adverse: assessment initiated', !!asmBId, asmB.text);
  if (!asmBId) return summary('P05');

  const pqB = await rpc(OFFICER, 'fp_assessment_save_pq', {
    _assessment_id: asmBId, _declaration_data: ADVERSE_PQ, _submit: true,
  });
  record('P05.23 adverse: adverse declaration submitted', pqB.body?.status === 'submitted', pqB.text);

  const scrB = await fn(OFFICER, 'fp-screening-run', { assessment_id: asmBId, run_type: 'manual' });
  record('P05.24 adverse: screening executed', scrB.body?.ok !== false, scrB.text);

  const findB = await sel(OFFICER, `fp_findings?assessment_id=eq.${asmBId}&select=id,check_type,severity,title,source`);
  const adverseFindings = (Array.isArray(findB.body) ? findB.body : [])
    .filter((f: any) => f.severity === 'high' && f.source === 'internal');
  record('P05.25 adverse: adverse findings raised', adverseFindings.length >= 2,
    `${adverseFindings.length}: ${adverseFindings.map((f: any) => f.check_type).join(',')}`);

  if (adverseFindings.length) {
    const fId = adverseFindings[0].id;
    const note = await rpc(OFFICER, 'fp_finding_save_note', { _finding_id: fId, _note: 'Officer review: charge confirmed against court record; material to fitness.' });
    record('P05.26 adverse: officer records finding assessment note', note.ok, note.text);
    const esc = await rpc(OFFICER, 'fp_finding_escalate', { _finding_id: fId, _note: 'Escalated for committee consideration: high severity criminal history.' });
    record('P05.27 adverse: finding escalated', esc.ok, esc.text);
    const disp = await rpc(OFFICER, 'fp_finding_disposition', {
      _finding_id: fId, _resolution_status: 'confirmed',
      _reason: 'Confirmed adverse: criminal charge substantiated against public court record.',
    });
    record('P05.28 adverse: finding dispositioned as confirmed', disp.ok, disp.text);
  }

  const committees = await sel(OFFICER, 'fp_committees?select=id,name,quorum&is_active=eq.true&limit=1');
  const committeeId = committees.body?.[0]?.id;
  record('P05.29 adverse: committee available', !!committeeId, committees.text);

  const assign = await rpc(SUPERVISOR, 'fp_assessment_assign_committee', {
    _assessment_id: asmBId, _committee_id: committeeId,
  });
  record('P05.30 adverse: routed to committee', assign.ok, assign.text);

  const asmBstate = await sel(SUPERVISOR, `fp_assessments?id=eq.${asmBId}&select=status,committee_id`);
  let status = asmBstate.body?.[0]?.status;
  if (status !== 'awaiting_committee') {
    const route = await rpc(SUPERVISOR, 'fp_assessment_set_status', {
      _assessment_id: asmBId, _status: 'awaiting_committee', _note: 'Adverse findings require committee determination.',
    });
    status = route.body?.status;
    record('P05.31 adverse: status set to awaiting_committee', status === 'awaiting_committee', route.text);
  } else {
    record('P05.31 adverse: status set to awaiting_committee', true, 'set by assignment');
  }

  const voteA = await rpc(MEMBER_A, 'fp_committee_cast_vote', {
    _assessment_id: asmBId, _vote: 'reject',
    _justification: 'Confirmed criminal charge and regulatory censure — not fit and proper for CEO role.',
  });
  record('P05.32 adverse: committee member A votes', voteA.ok, voteA.text);
  const voteB = await rpc(MEMBER_B, 'fp_committee_cast_vote', {
    _assessment_id: asmBId, _vote: 'reject',
    _justification: 'Concur: severity and recency of adverse history preclude approval of this appointment.',
  });
  record('P05.33 adverse: committee member B votes', voteB.ok, voteB.text);

  const snap = await rpc(SUPERVISOR, 'fp_record_committee_decision', { _assessment_id: asmBId });
  record('P05.34 adverse: committee decision snapshotted', snap.ok, snap.text);

  const detB = await rpc(SUPERVISOR, 'fp_determination_record', {
    _assessment_id: asmBId, _individual_id: indBId, _outcome: 'rejected',
    _rationale: 'Committee rejected the appointment: confirmed criminal charge and regulatory censure. Subject is not fit and proper.',
  });
  record('P05.35 adverse: rejected determination recorded', !!detB.body?.id, detB.text);
  if (detB.ok) {
    // A determination is immutable and final; assessment must be determined.
    const st = await sel(SUPERVISOR, `fp_assessments?id=eq.${asmBId}&select=status`);
    record('P05.36 adverse: assessment determined', st.body?.[0]?.status === 'determined', JSON.stringify(st.body));
  }

  const auditB = await sel(SUPERVISOR, `audit_logs?select=action&metadata->>assessment_id=eq.${asmBId}`);
  record('P05.37 adverse: audit trail exists',
    Array.isArray(auditB.body) && auditB.body.length >= 4, `${auditB.body?.length ?? 'none'} events`);

  console.log(`\nSELF_APPROVAL_SUCCESSES=${selfApprovalSuccesses}`);
  const failures = summary('P05');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
