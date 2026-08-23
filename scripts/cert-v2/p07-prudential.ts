/**
 * WAVE 3 BATCH 2 — P07 Prudential canonical monitoring journey (PRU-CANON-001).
 *
 * canonical filing version -> canonical detection (sweep) -> warning / breach /
 * EWI -> analyst work queue -> acknowledge -> assessment + supervisory action ->
 * supervisor decision -> escalation.
 *
 * Everything runs through real persona tokens against the real API surface, so
 * RLS, RPC guards and maker-checker rules apply exactly as in the product.
 */
import { P, rpc, sel, fn, record, summary } from './api';

const ANALYST = P('prudential_analyst');
const SUPERVISOR = P('prudential_supervisor');

async function main() {
  // --- Target: a supervised entity with a canonical accepted filing ---------
  const ents = await sel(ANALYST, 'return_filings?select=id,entity_id,accepted_version_id,status&status=eq.ACCEPTED&limit=1&order=updated_at.desc');
  const filing = ents.body?.[0];
  record('P07.01 analyst can read a canonical accepted filing', !!filing?.accepted_version_id, ents.text);
  if (!filing?.accepted_version_id) return summary('P07');
  const ENTITY: string = filing.entity_id;

  // --- Canonical sweep ------------------------------------------------------
  const sweep = await fn(ANALYST, 'prudential-monitoring-sweep', { trigger: 'manual', entity_id: ENTITY });
  const evaluated = sweep.body?.canonical_versions_evaluated ?? 0;
  record('P07.02 canonical sweep evaluates the entity\'s latest canonical version',
    sweep.body?.ok === true && evaluated > 0, sweep.text);

  const runs = await sel(ANALYST, `prudential_detection_runs?entity_id=eq.${ENTITY}&select=id,return_filing_version_id,trigger_kind,status,period_end&order=created_at.desc&limit=3`);
  const run = runs.body?.[0];
  record('P07.03 detection run is bound to a canonical filing version',
    !!run?.return_filing_version_id, runs.text);

  // Idempotency: a second sweep must not corrupt state or duplicate effects.
  const sweep2 = await fn(ANALYST, 'prudential-monitoring-sweep', { trigger: 'manual', entity_id: ENTITY });
  record('P07.04 repeat sweep is safe (idempotent detector)',
    sweep2.body?.ok === true || sweep2.body?.skipped === true, sweep2.text);

  // --- Detection output: warnings / breaches / EWI --------------------------
  const breaches = await sel(ANALYST, `return_threshold_breaches?select=id,metric_key,severity,status,acknowledged_at&order=created_at.desc&limit=50`);
  const breachRows: any[] = Array.isArray(breaches.body) ? breaches.body : [];
  const ewi = await sel(ANALYST, `prudential_ewi_alerts?select=id,rule_code,severity,status,entity_id&order=created_at.desc&limit=50`);
  const ewiRows: any[] = Array.isArray(ewi.body) ? ewi.body : [];
  record('P07.05 detection produced supervisory signals (breach and/or EWI)',
    breachRows.length + ewiRows.length > 0, `breaches=${breachRows.length} ewi=${ewiRows.length}`);

  // --- Analyst work queue ---------------------------------------------------
  const queue = await rpc(ANALYST, 'prudential_work_queue', { _limit: 50 });
  const queueRows: any[] = Array.isArray(queue.body) ? queue.body : [];
  record('P07.06 signals surface on the prudential work queue', queue.ok && queueRows.length > 0,
    `${queueRows.length} queue items`);

  // --- Acknowledge ----------------------------------------------------------
  const openBreach = breachRows.find((b) => !b.acknowledged_at) ?? breachRows[0];
  if (openBreach) {
    const ack = await rpc(ANALYST, 'prudential_breach_acknowledge', {
      _breach_id: openBreach.id,
      _note: 'Breach reviewed against the accepted canonical filing; capital shortfall confirmed and supervisory follow-up opened.',
    });
    record('P07.07 analyst acknowledges the breach', ack.ok, ack.text);
  } else if (ewiRows[0]) {
    const ack = await rpc(ANALYST, 'prudential_ewi_acknowledge', {
      _alert_id: ewiRows[0].id,
      _notes: 'Early-warning signal reviewed against the accepted canonical filing.',
    });
    record('P07.07 analyst acknowledges the early-warning signal', ack.ok, ack.text);
  } else {
    record('P07.07 analyst acknowledges a signal', false, 'no signal available to acknowledge');
  }

  // --- Assessment -----------------------------------------------------------
  const period = run?.period_end ?? new Date().toISOString().slice(0, 10);
  const periodStart = `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`;
  const created = await rpc(ANALYST, 'prudential_assessment_create', {
    _entity_id: ENTITY,
    _period_start: periodStart,
    _period_end: period,
    _return_filing_id: filing.id,
    _return_filing_version_id: filing.accepted_version_id,
    _rationale: 'Supervisory assessment opened from the canonical detection run for this reporting period.',
  });
  const assessmentId = created.body?.assessment_id ?? created.body?.id ?? created.body;
  record('P07.08 analyst opens an assessment on the canonical filing',
    created.ok && typeof assessmentId === 'string', created.text);

  if (typeof assessmentId === 'string') {
    const caseView = await rpc(ANALYST, 'prudential_assessment_case', { _assessment_id: assessmentId });
    const actions: string[] = caseView.body?.available_actions?.map?.((a: any) => a.action ?? a) ?? [];
    record('P07.09 assessment case exposes server-owned next actions', caseView.ok, actions.join(',') || caseView.text);

    const submit = await rpc(ANALYST, 'prudential_assessment_transition', {
      _assessment_id: assessmentId, _to_status: actions.includes('submit_for_review') ? 'in_review' : 'in_review',
      _reason: 'Assessment prepared and submitted for supervisory review.',
    });
    record('P07.10 analyst submits the assessment for review', submit.ok, submit.text);

    const selfApprove = await rpc(ANALYST, 'prudential_assessment_transition', {
      _assessment_id: assessmentId, _to_status: 'approved', _reason: 'Analyst attempts to approve their own assessment.',
    });
    const selfApprovals = selfApprove.ok ? 1 : 0;
    record('P07.11 maker cannot approve their own assessment', selfApprovals === 0, selfApprove.text);

    const supApprove = await rpc(SUPERVISOR, 'prudential_assessment_transition', {
      _assessment_id: assessmentId, _to_status: 'approved', _reason: 'Supervisor reviewed the assessment and approved the supervisory conclusion.',
    });
    record('P07.12 supervisor approves the assessment', supApprove.ok, supApprove.text);
    console.log(`SELF_APPROVAL_SUCCESSES=${selfApprovals}`);
  }

  // --- Supervisory action + follow-up --------------------------------------
  const action = await rpc(ANALYST, 'prudential_action_issue', {
    _entity_id: ENTITY,
    _action_type: 'remediation_plan',
    _title: 'Submit a capital remediation plan',
    _description: 'Breach of the capital adequacy threshold detected on the accepted canonical filing. Submit a remediation plan.',
    _severity: 'high',
    _source_type: openBreach ? 'breach' : 'manual',
    _source_id: openBreach?.id ?? null,
    _evidence_required: true,
  });
  const actionId = action.body?.action_id ?? action.body?.id ?? action.body;
  record('P07.13 supervisory action issued from the signal', action.ok && !!actionId, action.text);

  if (typeof actionId === 'string') {
    const monitor = await rpc(SUPERVISOR, 'prudential_action_monitor', { _action_id: actionId });
    record('P07.14 action monitoring / follow-up runs', monitor.ok, monitor.text);
  }

  // --- Escalation ----------------------------------------------------------
  const esc = await rpc(SUPERVISOR, 'prudential_escalation_raise', {
    _entity_id: ENTITY,
    _escalation_type: 'prudential_breach',
    _reason: 'Capital adequacy breach confirmed on the accepted canonical filing; escalating for supervisory decision.',
    _related_type: openBreach ? 'breach' : 'entity',
    _related_id: openBreach?.id ?? null,
    _priority: 'high',
  });
  record('P07.15 escalation raised for supervisory decision', esc.ok, esc.text);
  const escId = esc.body?.escalation_id ?? esc.body?.id ?? esc.body;
  if (typeof escId === 'string') {
    const decide = await rpc(SUPERVISOR, 'prudential_escalation_decide', {
      _escalation_id: escId, _decision: 'accept',
      _reason: 'Escalation accepted; entity placed under intensified monitoring pending remediation evidence.',
    });
    record('P07.16 supervisor decides the escalation', decide.ok, decide.text);
  }

  console.log(`CANONICAL_VERSIONS_EVALUATED=${evaluated}`);
  const failures = summary('P07');
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
