/**
 * P10 — Onsite Inspection / Examination end-to-end certification journey.
 *
 * Real personas, real PostgREST/RPC surface. No service-role shortcuts.
 * Journey: plan -> scope (approve memo) -> team -> pre-exam data request ->
 * fieldwork -> workpapers (prepare/review) -> findings -> exit meeting ->
 * draft report -> management response -> final report -> remediation -> closed.
 *
 * Authority model asserted:
 *  - inspection_supervisor holds prudential_supervision.manage_examination (creator).
 *  - inspector holds inspection_management.edit/workflow_action (fieldwork).
 *  - external licensee users must never see an unissued examination.
 */
import { P, rpc, sel, ins, patch, denied, record, summary } from './api';

const SUPERVISOR = P('inspection_supervisor'); // creates examinations
const INSPECTOR = P('inspector');              // performs fieldwork
const EXTERNAL = P('licensee_primary_user');        // must be denied throughout

const stamp = Date.now().toString().slice(-8);

async function main() {
  // --- Entity selection -------------------------------------------------
  const lic = await sel(SUPERVISOR, 'licensees?select=id,name&limit=1');
  const entityId: string | undefined = lic.body?.[0]?.id;
  record('P10.01 supervisor can read a licensee to plan an examination', !!entityId, lic.text);
  if (!entityId) return summary('P10');

  // --- Plan -------------------------------------------------------------
  const created = await rpc(SUPERVISOR, 'examination_create', {
    _payload: {
      entity_id: entityId,
      title: `Cert P10 Onsite Examination ${stamp}`,
      examination_type: 'full_scope',
      risk_rating: 'high',
      period_under_review_start: '2025-01-01',
      period_under_review_end: '2025-12-31',
    },
  });
  const examId: string | undefined = created.body?.id;
  record('P10.02 supervisor plans examination (governed writer)', created.ok && !!examId, created.text);
  if (!examId) return summary('P10');
  record('P10.03 new examination opens in a workflow-recognised stage', created.body?.stage === 'planned', String(created.body?.stage));
  record('P10.04 reference auto-generated', !!created.body?.reference, String(created.body?.reference));

  // Inspector lacks manage_examination -> cannot create (maker-checker).
  const inspectorCreate = await rpc(INSPECTOR, 'examination_create', {
    _payload: { entity_id: entityId, title: `Cert P10 Inspector Attempt ${stamp}` },
  });
  record('P10.05 inspector cannot plan an examination', denied(inspectorCreate) || !inspectorCreate.ok, inspectorCreate.text);

  // External user must not see the examination.
  const extRead = await sel(EXTERNAL, `examinations?id=eq.${examId}&select=id`);
  record('P10.06 external user cannot read the examination', Array.isArray(extRead.body) && extRead.body.length === 0, extRead.text);

  // --- Scoping ----------------------------------------------------------
  const toScoping = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'scoping' });
  record('P10.07 planned -> scoping', toScoping.ok, toScoping.text);

  const scoping = await ins(INSPECTOR, 'examination_scoping', {
    examination_id: examId,
    objectives: 'Assess governance, credit risk and compliance controls.',
    risk_focus_areas: ['credit_risk', 'governance'],
    legal_basis: 'Banking Act s.34',
    budget_days: 15,
    methodology: 'Risk-based sampling of credit files and control walkthroughs.',
  });
  const scopingId: string | undefined = scoping.body?.[0]?.id;
  record('P10.08 inspector drafts scoping memo', scoping.ok && !!scopingId, scoping.text);

  // Fieldwork gate: scoping memo not yet approved.
  const prematureFieldwork = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'fieldwork' });
  record('P10.09 fieldwork blocked while scoping memo unapproved',
    !prematureFieldwork.ok && /scoping_memo_not_approved|invalid_stage_transition/i.test(prematureFieldwork.text), prematureFieldwork.text);

  if (scopingId) {
    const approve = await patch(SUPERVISOR, `examination_scoping?id=eq.${scopingId}`, {
      approved_at: new Date().toISOString(), approval_notes: 'Scope approved for fieldwork.',
    });
    record('P10.10 supervisor approves scoping memo', approve.ok, approve.text);
  } else {
    record('P10.10 supervisor approves scoping memo', false, 'no scoping row');
  }

  // --- Team -------------------------------------------------------------
  const team = await ins(SUPERVISOR, 'examination_team_members', {
    examination_id: examId, member_name: 'Cert Lead Examiner', team_role: 'lead_examiner',
    allocated_days: 15, specialisation: 'credit_risk', conflict_declared: false,
  });
  record('P10.11 lead examiner assigned', team.ok && !!team.body?.[0]?.id, team.text);

  // --- Pre-exam data request -------------------------------------------
  const toRequest = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'pre_exam_request' });
  record('P10.12 scoping -> pre_exam_request', toRequest.ok, toRequest.text);

  const dr = await ins(INSPECTOR, 'examination_data_requests', {
    examination_id: examId, item_no: 1, title: 'Credit file listing for FY2025',
    description: 'Full loan book extract with classification.', data_format: 'xlsx',
    due_date: '2026-09-15', status: 'issued', issued_at: new Date().toISOString(),
  });
  const drId: string | undefined = dr.body?.[0]?.id;
  record('P10.13 pre-examination data request issued', dr.ok && !!drId, dr.text);

  const extDrWrite = await ins(EXTERNAL, 'examination_data_requests', {
    examination_id: examId, item_no: 99, title: 'External tamper attempt',
  });
  record('P10.14 external user cannot create data requests', denied(extDrWrite) || !extDrWrite.ok, extDrWrite.text);

  if (drId) {
    const resp = await patch(INSPECTOR, `examination_data_requests?id=eq.${drId}`, {
      status: 'received', received_at: new Date().toISOString(), entity_response: 'Extract provided.',
    });
    record('P10.15 data request marked received', resp.ok, resp.text);
  } else {
    record('P10.15 data request marked received', false, 'no data request');
  }

  // --- Fieldwork --------------------------------------------------------
  const toFieldwork = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'fieldwork' });
  record('P10.16 pre_exam_request -> fieldwork (gates satisfied)', toFieldwork.ok, toFieldwork.text);

  const wp = await ins(INSPECTOR, 'examination_workpapers', {
    examination_id: examId, area: 'Credit risk — file review',
    procedure_performed: 'Sampled 25 credit files against classification policy.',
    evidence_reference: 'WP-CR-01', conclusion: 'Three files misclassified.', status: 'draft',
  });
  const wpId: string | undefined = wp.body?.[0]?.id;
  record('P10.17 workpaper created during fieldwork', wp.ok && !!wpId, wp.text);

  if (wpId) {
    const prep = await rpc(INSPECTOR, 'examination_signoff_workpaper', { _workpaper_id: wpId, _role: 'preparer', _notes: 'Prepared.' });
    record('P10.18 workpaper signed off by preparer', prep.ok, prep.text);
    const rev = await rpc(SUPERVISOR, 'examination_signoff_workpaper', { _workpaper_id: wpId, _role: 'reviewer', _notes: 'Reviewed and accepted.' });
    record('P10.19 workpaper reviewed by supervisor', rev.ok, rev.text);
  } else {
    record('P10.18 workpaper signed off by preparer', false, 'no workpaper');
    record('P10.19 workpaper reviewed by supervisor', false, 'no workpaper');
  }

  const finding = await ins(INSPECTOR, 'examination_findings', {
    examination_id: examId, workpaper_id: wpId ?? null, title: 'Misclassification of impaired credit exposures',
    category: 'credit_risk', severity: 'high', criteria_breached: 'Prudential classification standard',
    observation: 'Three sampled files were classified as performing despite arrears over 90 days.',
    root_cause: 'Manual classification without independent review.',
    recommendation: 'Implement independent classification review and remediate the sampled files.',
    status: 'open',
  });
  const findingId: string | undefined = finding.body?.[0]?.id;
  record('P10.20 finding raised from workpaper', finding.ok && !!findingId, finding.text);

  // --- Exit meeting -----------------------------------------------------
  const toExit = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'exit_meeting' });
  record('P10.21 fieldwork -> exit_meeting', toExit.ok, toExit.text);

  const exit = await ins(SUPERVISOR, 'examination_exit_meetings', {
    examination_id: examId, meeting_date: new Date().toISOString().slice(0, 10), location: 'Entity head office',
    regulator_attendees: ['Lead Examiner', 'Inspection Supervisor'], entity_attendees: ['CEO', 'CRO'],
    matters_discussed: 'Credit classification finding and remediation expectations.',
    entity_initial_response: 'Entity accepts the finding.',
    agreed_timelines: 'Remediation plan within 30 days.',
  });
  record('P10.22 exit meeting recorded', exit.ok && !!exit.body?.[0]?.id, exit.text);

  // --- Draft report -----------------------------------------------------
  const toDraft = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'draft_report' });
  record('P10.23 exit_meeting -> draft_report', toDraft.ok, toDraft.text);

  const report = await ins(INSPECTOR, 'examination_reports', {
    examination_id: examId, report_type: 'draft', version: 1,
    title: `Draft examination report ${stamp}`,
    executive_summary: 'One high-severity credit classification finding identified.',
    status: 'draft', prepared_by: null, response_due_date: '2026-09-30',
  });
  const reportId: string | undefined = report.body?.[0]?.id;
  record('P10.24 draft report prepared', report.ok && !!reportId, report.text);

  const extReportRead = await sel(EXTERNAL, `examination_reports?examination_id=eq.${examId}&select=id`);
  record('P10.25 external user cannot read an unissued report',
    Array.isArray(extReportRead.body) && extReportRead.body.length === 0, extReportRead.text);

  // --- Management response ---------------------------------------------
  const toMgmt = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'management_response' });
  record('P10.26 draft_report -> management_response', toMgmt.ok, toMgmt.text);

  if (reportId) {
    const mgmt = await patch(SUPERVISOR, `examination_reports?id=eq.${reportId}`, {
      management_response: 'Remediation plan attached; classification review implemented.',
      management_response_at: new Date().toISOString(),
    });
    record('P10.27 management response captured', mgmt.ok, mgmt.text);
  } else {
    record('P10.27 management response captured', false, 'no report');
  }

  // Final report gate: finding still has no remediation action.
  const prematureFinal = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'final_report' });
  record('P10.28 final report blocked while findings lack remediation',
    !prematureFinal.ok && /findings_without_remediation|workpapers_pending_review/i.test(prematureFinal.text), prematureFinal.text);

  // --- Remediation ------------------------------------------------------
  let actionId: string | undefined;
  if (findingId) {
    const rem = await rpc(SUPERVISOR, 'examination_create_remediation_action', {
      _finding_id: findingId, _due_date: '2026-10-31',
      _description: 'Reclassify affected exposures and implement independent review.',
    });
    actionId = rem.body?.action_id;
    record('P10.29 remediation action created from finding', rem.ok && !!actionId, rem.text);

    const dup = await rpc(SUPERVISOR, 'examination_create_remediation_action', { _finding_id: findingId, _due_date: '2026-10-31' });
    record('P10.30 duplicate remediation action rejected',
      !dup.ok && /remediation_already_linked/i.test(dup.text), dup.text);
  } else {
    record('P10.29 remediation action created from finding', false, 'no finding');
    record('P10.30 duplicate remediation action rejected', false, 'no finding');
  }

  const toFinal = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'final_report' });
  record('P10.31 management_response -> final_report once gates satisfied', toFinal.ok, toFinal.text);

  if (reportId) {
    const issue = await patch(SUPERVISOR, `examination_reports?id=eq.${reportId}`, {
      report_type: 'final', status: 'issued', approved_at: new Date().toISOString(), issued_at: new Date().toISOString(),
    });
    record('P10.32 final report issued', issue.ok, issue.text);
  } else {
    record('P10.32 final report issued', false, 'no report');
  }

  const toRemediation = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'remediation' });
  record('P10.33 final_report -> remediation', toRemediation.ok, toRemediation.text);

  // Closure gate: remediation action still open.
  const prematureClose = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'closed' });
  record('P10.34 closure blocked while remediation actions are open',
    !prematureClose.ok && /open_remediation_actions/i.test(prematureClose.text), prematureClose.text);

  if (actionId) {
    // Entity submits remediation evidence, supervisor accepts it, then the action closes.
    const doc = await ins(EXTERNAL, 'documents', {
      file_name: 'remediation-evidence.pdf',
      file_path: `cert-v2/examination/${examId}/remediation-evidence.pdf`,
      mime_type: 'application/pdf',
      entity_type: 'prudential_action',
      entity_id: actionId,
    });
    record('P10.33a entity uploads evidence document', !!doc.body?.[0]?.id, doc.text);
    const evidence = await rpc(EXTERNAL, 'submit_prudential_action_response', {
      _action_id: actionId,
      _narrative: 'Exposures reclassified and independent credit review implemented.',
      _document_ids: doc.body?.[0]?.id ? [doc.body[0].id] : [],
    });
    record('P10.34a entity submits remediation evidence', evidence.ok && !evidence.body?.error, evidence.text);

    const accepted = await rpc(SUPERVISOR, 'review_prudential_action_response', {
      _action_id: actionId, _decision: 'accepted', _notes: 'Evidence verified during follow-up review.',
    });
    record('P10.34b supervisor accepts remediation evidence', accepted.ok && !accepted.body?.error, accepted.text);

    const actionRow = await sel(SUPERVISOR, `prudential_actions?id=eq.${actionId}&select=status,closed_at,closed_by`);
    record('P10.35 remediation action completed',
      actionRow.body?.[0]?.status === 'completed' && !!actionRow.body?.[0]?.closed_by, actionRow.text);
  } else {
    record('P10.35 remediation action completed', false, 'no action');
  }

  const closed = await rpc(SUPERVISOR, 'examination_transition_stage', { _examination_id: examId, _to_stage: 'closed', _notes: 'All remediation verified.' });
  record('P10.36 examination closed', closed.ok, closed.text);

  // --- Side effects -----------------------------------------------------
  const finalExam = await sel(SUPERVISOR, `examinations?id=eq.${examId}&select=stage,closed_at,closed_by`);
  const row = finalExam.body?.[0];
  record('P10.37 examination persisted as closed with closure provenance',
    row?.stage === 'closed' && !!row?.closed_at && !!row?.closed_by, finalExam.text);

  const events = await sel(SUPERVISOR, `examination_events?examination_id=eq.${examId}&select=event_type,from_stage,to_stage`);
  const stageEvents = (events.body || []).filter((e: any) => e.event_type === 'stage_change');
  record('P10.38 full stage trail recorded in examination_events', stageEvents.length >= 8, `stage_change events=${stageEvents.length}`);
  record('P10.39 remediation creation event recorded',
    (events.body || []).some((e: any) => e.event_type === 'remediation_action_created'), events.text);

  const extFinal = await sel(EXTERNAL, `examinations?id=eq.${examId}&select=id`);
  record('P10.40 external user sees the examination only after a report was issued to them',
    Array.isArray(extFinal.body) && extFinal.body.length === 1, extFinal.text);

  return summary('P10');
}

main().then((failed) => process.exit(failed ? 1 : 0));
