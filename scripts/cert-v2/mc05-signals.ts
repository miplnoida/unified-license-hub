/**
 * MC-05 certification — Conduct Signals & Alerts runtime checks (A–L).
 * Executes against the live API as authenticated certification personas only.
 */
import { P, rpc, sel, ins, patch, record, summary, denied } from './api';

const OFFICER = P('conduct_supervisor');
const ANALYST = P('conduct_analyst');
const AUDITOR = P('auditor');

const LICENSEE = '2adb1fba-1ee4-4a28-a970-35ae8c92de4d'; // Brimstone Payments Limited
const REGULATOR = '8dd8ac87-4e11-4a6b-8991-bf88cb03d7c3'; // FSRA
const COMPLAINT = '14646ee1-c295-44ab-9693-3169f43ef863';

async function raise(title: string) {
  const r = await rpc(OFFICER, 'conduct_signal_create', {
    _payload: {
      title,
      summary: 'Certification signal raised through the governed operation.',
      source_type: 'supervisory_observation',
      signal_category: 'sales_practice',
      severity: 'high',
      systemic_potential: 'medium',
      rationale: 'Recurring supervisory observation warranting a conduct intelligence item.',
      licensee_id: LICENSEE,
      regulator_id: REGULATOR,
    },
  });
  return r;
}

async function counts() {
  const q = async (path: string) => (await sel(P('super_admin'), path)).body;
  return {
    complaints: (await q('complaints?select=id&limit=2000'))?.length ?? -1,
    findings: (await q('conduct_findings?select=id&limit=2000'))?.length ?? -1,
    investigations: (await q('conduct_investigations?select=id&limit=2000'))?.length ?? -1,
    enforcement: (await q('enforcement_actions?select=id&limit=2000'))?.length ?? -1,
  };
}

async function main() {
  const before = await counts();

  // A — authorised officer can raise a signal
  const a = await raise('Certification signal — sales practice concentration');
  const signalId: string | undefined = a.body?.id;
  record('A authorised officer can raise a signal', a.ok && !!signalId, a.text);
  if (!signalId) return finish();

  // B — signal appears in register and detail read models
  const reg = await rpc(OFFICER, 'conduct_signal_register', { _limit: 100 });
  const rows: any[] = Array.isArray(reg.body) ? reg.body : (reg.body?.rows ?? []);
  const inRegister = JSON.stringify(reg.body ?? '').includes(signalId);
  const detail = await rpc(OFFICER, 'conduct_signal_case', { _signal_id: signalId });
  record('B signal appears in register', reg.ok && inRegister, `rows=${rows.length} ${reg.text}`);
  record('B signal appears in detail read model', detail.ok && !!detail.body, detail.text);

  // C — assign owner
  const ownerId = (await sel(P('super_admin'), `profiles?email=eq.${encodeURIComponent(ANALYST)}&select=id`)).body?.[0]?.id;
  const assign = await rpc(OFFICER, 'conduct_signal_assign', { _signal_id: signalId, _owner_id: ownerId, _note: 'Assigned for certification review.' });
  record('C assign owner', assign.ok, assign.text);

  // D — validate with rationale (and short rationale rejected)
  const shortVal = await rpc(OFFICER, 'conduct_signal_validate', { _signal_id: signalId, _rationale: 'too short' });
  const val = await rpc(OFFICER, 'conduct_signal_validate', {
    _signal_id: signalId,
    _rationale: 'Validated after review of complaint volumes and product disclosures.',
    _severity: 'high', _systemic_potential: 'high', _risk_score: 72,
  });
  record('D validate rejects insufficient rationale', !shortVal.ok, shortVal.text);
  record('D validate signal with rationale', val.ok, val.text);

  // E — link complaint source
  const src = await rpc(OFFICER, 'conduct_signal_link_source', {
    _signal_id: signalId, _source_type: 'complaint', _source_id: COMPLAINT,
    _source_table: 'complaints', _note: 'Originating consumer complaint.',
  });
  record('E link complaint/outcome source', src.ok, src.text);

  // F — link existing evidence (reuses the conduct evidence engine)
  const ev = await rpc(OFFICER, 'conduct_evidence_upload', {
    _payload: { title: 'Certification evidence — disclosure sample', evidence_type: 'document', confidentiality_level: 'internal', entity_id: LICENSEE, complaint_id: COMPLAINT },
  });
  const evidenceId: string | undefined = ev.body?.id;
  const link = evidenceId
    ? await rpc(OFFICER, 'conduct_signal_link_evidence', { _signal_id: signalId, _evidence_id: evidenceId, _note: 'Linked existing evidence item.' })
    : { ok: false, text: ev.text } as any;
  record('F link existing evidence', link.ok, link.text);

  // G — escalate to alert; alert created + linked; signal stays separate
  const esc = await rpc(OFFICER, 'conduct_signal_escalate_to_alert', {
    _signal_id: signalId, _rationale: 'Systemic potential confirmed; escalated for threshold attention.',
  });
  const alertId: string | undefined = esc.body?.alert_id;
  const alert = alertId ? await sel(OFFICER, `conduct_alerts?id=eq.${alertId}&select=id,status,source`) : { body: null, text: 'no alert' } as any;
  const links = await sel(OFFICER, `conduct_signal_alert_links?signal_id=eq.${signalId}&select=alert_id,link_type`);
  const sig = await sel(OFFICER, `conduct_signals?id=eq.${signalId}&select=id,status,escalated_alert_id`);
  record('G escalation creates a linked alert', esc.ok && !!alertId && !!alert.body?.[0]?.id, `${esc.text} ${alert.text}`);
  record('G signal remains a separate linked record', sig.body?.[0]?.id === signalId && sig.body?.[0]?.status === 'escalated' && (links.body?.length ?? 0) > 0, `${sig.text} ${links.text}`);

  // H — dismiss requires rationale (second signal)
  const b = await raise('Certification signal — disposal lifecycle');
  const s2: string = b.body?.id;
  const badDismiss = await rpc(OFFICER, 'conduct_signal_dismiss', { _signal_id: s2, _reason: 'no' });
  const dismiss = await rpc(OFFICER, 'conduct_signal_dismiss', { _signal_id: s2, _reason: 'No conduct concern substantiated after review.' });
  record('H dismiss requires rationale', !badDismiss.ok, badDismiss.text);
  record('H dismiss with rationale succeeds', dismiss.ok, dismiss.text);

  // I — reopen only from an allowed state
  const reopenOk = await rpc(OFFICER, 'conduct_signal_reopen', { _signal_id: s2, _reason: 'New consumer information received warranting further review.' });
  const reopenBad = await rpc(OFFICER, 'conduct_signal_reopen', { _signal_id: s2, _reason: 'Attempting to reopen an already reopened signal record.' });
  record('I reopen works from a disposed state', reopenOk.ok, reopenOk.text);
  record('I reopen blocked from a disallowed state', !reopenBad.ok, reopenBad.text);

  // J — out-of-scope (wrong regulator/entity) mutation denied
  const outOfScope = await rpc(ANALYST, 'conduct_signal_create', {
    _payload: {
      title: 'Out of scope signal attempt', source_type: 'manual_intelligence',
      rationale: 'Attempting to raise a signal outside the acting officer scope.',
      licensee_id: '69d93314-569b-490d-acdf-3e313cd428ba',
      regulator_id: 'ca6e0616-55a9-48e7-8652-2b19536afb8a',
    },
  });
  record('J out-of-regulator-scope mutation denied', denied(outOfScope) || !outOfScope.ok, outOfScope.text);

  // K — auditor read-only
  const auditRead = await rpc(AUDITOR, 'conduct_signal_register', { _limit: 5 });
  const auditWrite = await rpc(AUDITOR, 'conduct_signal_dismiss', { _signal_id: signalId, _reason: 'Auditor attempting a governed mutation.' });
  const auditDml = await patch(AUDITOR, `conduct_signals?id=eq.${signalId}`, { severity: 'low' });
  const auditIns = await ins(AUDITOR, 'conduct_signals', { title: 'auditor direct insert', source_type: 'manual_intelligence' });
  record('K auditor can read the signal register', auditRead.ok, auditRead.text);
  record('K auditor governed mutation denied', !auditWrite.ok, auditWrite.text);
  record('K auditor direct table write denied', !auditDml.ok || (Array.isArray(auditDml.body) && auditDml.body.length === 0), auditDml.text);
  record('K auditor direct table insert denied', !auditIns.ok, auditIns.text);

  // L — no downstream case objects auto-created
  const after = await counts();
  record('L no complaint auto-created', after.complaints === before.complaints, `${before.complaints}->${after.complaints}`);
  record('L no conduct finding auto-created', after.findings === before.findings, `${before.findings}->${after.findings}`);
  record('L no investigation auto-created', after.investigations === before.investigations, `${before.investigations}->${after.investigations}`);
  record('L no enforcement case auto-created', after.enforcement === before.enforcement, `${before.enforcement}->${after.enforcement}`);

  finish();
}

function finish() {
  const failed = summary('MC-05');
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
