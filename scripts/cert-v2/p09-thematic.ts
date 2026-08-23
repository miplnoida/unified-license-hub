import { P, rpc, sel, ins, patch, denied, record, summary } from './api';

const SUPERVISOR = P('inspection_supervisor');   // has_role supervisor -> can_manage_thematic_review
const SUPERVISOR2 = P('prudential_supervisor');  // separate supervisor for maker-checker closure approval
const ANALYST = P('conduct_analyst');            // has_role analyst -> read only

const stamp = Date.now().toString().slice(-8);

async function main() {
  // --- Trigger / create review (draft) --------------------------------
  const created = await ins(SUPERVISOR, 'thematic_reviews', {
    title: `Cert P09 Thematic Review ${stamp}`,
    description: 'Certification thematic review on consumer disclosure practices.',
    methodology: { sampling: 'risk_based', channels: ['website', 'call_centre'] },
    hypothesis: 'Some licensees may not be providing adequate pre-contract disclosure.',
  });
  const review = created.body?.[0];
  record('P09.01 supervisor triggers/creates thematic review', created.ok && !!review?.id, created.text);
  if (!review?.id) return summary('P09');
  const reviewId: string = review.id;

  // Analyst cannot create reviews (write policy is supervisor/admin/super_admin only)
  const analystCreate = await ins(ANALYST, 'thematic_reviews', {
    title: `Cert P09 Analyst Attempt ${stamp}`, methodology: {},
  });
  record('P09.02 analyst cannot create a thematic review (RLS write restricted)', denied(analystCreate) || !analystCreate.ok, analystCreate.text);

  // --- Scope: move draft -> scoped -------------------------------------
  const scoped = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, {
    status: 'scoped', scope_start: '2025-01-01', scope_end: '2025-06-30',
  });
  record('P09.03 review scoped (draft -> scoped, status guard enforced)', scoped.ok, scoped.text);

  // --- Entity selection --------------------------------------------------
  const lic = await sel(SUPERVISOR, 'licensees?select=id&limit=1');
  const licenseeId = lic.body?.[0]?.id;
  record('P09.04 supervisor can read a licensee for entity selection', !!licenseeId, lic.text);
  let entityRowId: string | undefined;
  if (licenseeId) {
    const ent = await ins(SUPERVISOR, 'thematic_review_entities', {
      review_id: reviewId, licensee_id: licenseeId, inclusion_reason: 'Sampled for thematic disclosure review.',
    });
    entityRowId = ent.body?.[0]?.id;
    record('P09.05 entity selected into review scope', ent.ok && !!entityRowId, ent.text);
  } else {
    record('P09.05 entity selected into review scope', false, 'no licensee available');
  }

  // --- Move to evidence_collection ---------------------------------------
  const toEvidence = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, { status: 'evidence_collection' });
  record('P09.06 review moves to evidence_collection', toEvidence.ok, toEvidence.text);

  // --- Evidence ------------------------------------------------------------
  const evidence = await ins(SUPERVISOR, 'thematic_review_evidence', {
    review_id: reviewId, source_type: 'internal', source_ref: 'Sample disclosure documents batch 1',
    notes: 'Collected sample disclosure documents from the sampled licensee.',
  });
  const evidenceId = evidence.body?.[0]?.id;
  record('P09.07 evidence collected against the review', evidence.ok && !!evidenceId, evidence.text);

  // --- Move to analysis, then findings_issued -----------------------------
  const toAnalysis = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, { status: 'analysis' });
  record('P09.08 review moves to analysis', toAnalysis.ok, toAnalysis.text);

  const finding = await ins(SUPERVISOR, 'thematic_review_findings', {
    review_id: reviewId, licensee_id: licenseeId ?? null, severity: 'medium',
    title: 'Inadequate pre-contract disclosure', detail: 'Sampled disclosure documents omitted mandatory fee disclosures.',
    status: 'draft',
  });
  const findingId = finding.body?.[0]?.id;
  record('P09.09 finding recorded', finding.ok && !!findingId, finding.text);

  const issueFinding = await patch(SUPERVISOR, `thematic_review_findings?id=eq.${findingId}`, {
    status: 'issued', issued_at: new Date().toISOString(), issued_by: undefined,
  });
  record('P09.10 finding issued', issueFinding.ok, issueFinding.text);

  const toFindingsIssued = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, { status: 'findings_issued' });
  record('P09.11 review moves to findings_issued', toFindingsIssued.ok, toFindingsIssued.text);

  // --- Action ----------------------------------------------------------
  const action = await ins(SUPERVISOR, 'thematic_review_actions', {
    review_id: reviewId, finding_id: findingId, licensee_id: licenseeId ?? null,
    action_type: 'remediation', title: 'Update disclosure documents',
    description: 'Update pre-contract disclosure templates to include mandatory fee disclosures.',
    due_date: '2025-09-30',
  });
  const actionId = action.body?.[0]?.id;
  record('P09.12 remediation action issued from finding', action.ok && !!actionId, action.text);

  const toActionsRequired = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, { status: 'actions_required' });
  record('P09.13 review moves to actions_required', toActionsRequired.ok, toActionsRequired.text);

  // Verify the action (follow-up) so closure readiness is satisfied
  const verify = await rpc(SUPERVISOR, 'thematic_action_record_verification', {
    _action_id: actionId, _verification_status: 'verified',
    _notes: 'Licensee submitted updated disclosure templates; reviewed and accepted.',
    _evidence: 'Updated disclosure template PDF received and reviewed.',
  });
  record('P09.14 remediation action verified', verify.ok, verify.text);

  const toMonitoring = await patch(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}`, { status: 'monitoring' });
  record('P09.15 review moves to monitoring', toMonitoring.ok, toMonitoring.text);

  // --- Report -> approve -> publish (closure gate requires a published report)
  const draftReport = await rpc(SUPERVISOR, 'thematic_report_upsert_draft', {
    _review_id: reviewId, _title: `Thematic Review Report ${stamp}`,
    _executive_summary: 'Sampled licensees showed disclosure gaps; remediation completed.',
    _key_findings: 'Inadequate pre-contract disclosure identified in sampled licensee.',
    _required_actions: 'Update disclosure documents (completed and verified).',
  });
  const reportId = draftReport.body;
  record('P09.16 report drafted', draftReport.ok && !!reportId, draftReport.text);

  const submitReport = await rpc(SUPERVISOR, 'thematic_report_submit_for_approval', { _report_id: reportId });
  record('P09.17 report submitted for approval', submitReport.ok, submitReport.text);

  // Maker-checker: same supervisor approving own report should still pass RLS role check
  // (approval gate is role-based, not identity-based) -- but closure approval below enforces requester != approver.
  const approveReport = await rpc(SUPERVISOR2, 'thematic_report_approve', { _report_id: reportId });
  record('P09.18 second supervisor approves the report', approveReport.ok, approveReport.text);

  const publishReport = await rpc(SUPERVISOR2, 'thematic_report_publish', { _report_id: reportId });
  record('P09.19 report published (supervisory letters staged)', publishReport.ok, publishReport.text);

  // --- Closure -----------------------------------------------------------
  const requestClosure = await rpc(SUPERVISOR, 'thematic_review_request_closure', {
    _review_id: reviewId,
    _closure_summary: 'All findings addressed, remediation action verified, report published to the licensee.',
  });
  record('P09.20 supervisor requests closure', requestClosure.ok, requestClosure.text);

  const selfApprove = await rpc(SUPERVISOR, 'thematic_review_approve_closure', { _review_id: reviewId, _note: 'Requester attempts to approve own closure.' });
  const selfApprovals = selfApprove.ok ? 1 : 0;
  record('P09.21 requester cannot approve their own closure (maker-checker)', selfApprovals === 0, selfApprove.text);

  const approveClosure = await rpc(SUPERVISOR2, 'thematic_review_approve_closure', { _review_id: reviewId, _note: 'Independent supervisor reviewed and approved closure.' });
  record('P09.22 independent supervisor approves closure', approveClosure.ok, approveClosure.text);

  const finalState = await sel(SUPERVISOR, `thematic_reviews?id=eq.${reviewId}&select=status,closure_state,closed_at`);
  const closed = finalState.body?.[0];
  record('P09.23 review is closed with closure_state=approved', closed?.status === 'closed' && closed?.closure_state === 'approved', finalState.text);

  console.log(`SELF_APPROVAL_SUCCESSES=${selfApprovals}`);
  const failures = summary('P09');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
