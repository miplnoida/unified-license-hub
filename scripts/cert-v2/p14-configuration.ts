/**
 * P14 — Regulatory configuration: version pinning proof.
 *
 * One representative governed form-configuration journey:
 *   identify current published version -> start Case A (pins current version)
 *   -> branch + publish a new version through governed RPCs
 *   -> Case A stays pinned (no silent migration)
 *   -> Case B receives the new published version
 * Also proves draft/publish authority, published-version immutability and audit.
 */
import { P, rpc, sel, patch, record, summary, denied } from './api';

const SYSADM = P('system_administrator');   // governed configuration administrator
const ANALYST = P('regulatory_analyst');    // no configuration authority
const APPLICANT = P('applicant_user');      // starts cases
const AUDIT = P('auditor');

const TEMPLATE = 'eb86a8a0-a913-40ff-bb6c-e26e9b1fe590'; // Merchant Bank License Application

const published = async (email: string) =>
  sel(email, `form_versions?template_id=eq.${TEMPLATE}&status=eq.published&select=id,version,status,published_at&order=version.desc`);

async function startCase(label: string) {
  const app = await rpc(APPLICANT, 'create_application_draft', {
    _license_type: `P14 ${label}`, _data: {}, _regulator_id: null,
  });
  const id = Array.isArray(app.body) ? app.body[0]?.id : app.body?.id;
  record(`P14 ${label} draft application created`, !!id, app.text);
  if (!id) return null;
  const res = await rpc(APPLICANT, 'resolve_application_form_version', { _application_id: id, _template_id: TEMPLATE });
  record(`P14 ${label} form version resolved`, res.body?.success === true, res.text);
  return { id, versionId: res.body?.version_id as string, versionNumber: res.body?.version_number, reason: res.body?.assigned_reason };
}

async function main() {
  let inFlightChanged = 0;

  // 1. current published version
  const cur = await published(SYSADM);
  const v1 = cur.body?.[0];
  record('P14.01 current published version identified', !!v1?.id, cur.text);
  if (!v1?.id) return summary('P14');

  // 2. Case A starts on the current published version
  const caseA = await startCase('CaseA');
  if (!caseA) return summary('P14');
  record('P14.02 Case A pinned to current published version', caseA.versionId === v1.id, `case=${caseA.versionId} published=${v1.id} reason=${caseA.reason}`);

  // 3. draft authority: unauthorised persona cannot branch a new version
  const analystBranch = await rpc(ANALYST, 'branch_form_version', { _version_id: v1.id });
  record('P14.03 non-configuration persona cannot create a draft version', denied(analystBranch), analystBranch.text);

  const branch = await rpc(SYSADM, 'branch_form_version', { _version_id: v1.id });
  const draftId = branch.body?.version_id as string;
  record('P14.04 configuration administrator can create a draft version', !!draftId, branch.text);
  if (!draftId) return summary('P14');

  // 4. publish authority
  const analystPub = await rpc(ANALYST, 'publish_form_version', { _version_id: draftId, _effective_from: null });
  record('P14.05 non-configuration persona cannot publish a version', denied(analystPub), analystPub.text);

  const pub = await rpc(SYSADM, 'publish_form_version', { _version_id: draftId, _effective_from: null });
  record('P14.06 configuration administrator can publish a version', pub.body?.success === true, pub.text);

  const after = await published(SYSADM);
  const newPublished = after.body?.[0];
  record('P14.07 exactly one published version after publish', (after.body || []).length === 1 && newPublished?.id === draftId, after.text);

  const oldRow = await sel(SYSADM, `form_versions?id=eq.${v1.id}&select=id,status`);
  record('P14.08 previously published version archived (not deleted)', oldRow.body?.[0]?.status === 'archived', oldRow.text);

  // 5. immutability of the superseded published record
  const mutate = await patch(SYSADM, `form_versions?id=eq.${draftId}`, { schema_snapshot: { tampered: true }, version: 999 });
  const recheck = await sel(SYSADM, `form_versions?id=eq.${draftId}&select=id,version,schema_snapshot`);
  const untouched = recheck.body?.[0]?.version !== 999 && !recheck.body?.[0]?.schema_snapshot?.tampered;
  record('P14.09 published version is immutable to direct mutation',
    (denied(mutate) || mutate.status >= 400 || (mutate.body || []).length === 0) && untouched,
    `HTTP ${mutate.status} rows=${(mutate.body || []).length} untouched=${untouched} ${mutate.text}`);


  // 6. no silent migration of Case A
  const reA = await rpc(APPLICANT, 'resolve_application_form_version', { _application_id: caseA.id, _template_id: TEMPLATE });
  const stillPinned = reA.body?.version_id === v1.id;
  if (!stillPinned) inFlightChanged += 1;
  record('P14.10 Case A remains pinned to the old version', stillPinned, reA.text);

  const pinRows = await sel(SYSADM, `application_form_versions?application_id=eq.${caseA.id}&select=version_id,status,assigned_reason`);
  const activePins = (pinRows.body || []).filter((r: any) => r.status === 'active');
  record('P14.11 Case A has a single active pin on the old version', activePins.length === 1 && activePins[0].version_id === v1.id, pinRows.text);

  // 7. Case B receives the new published version
  const caseB = await startCase('CaseB');
  if (caseB) record('P14.12 Case B receives the newly published version', caseB.versionId === draftId, `case=${caseB.versionId} new=${draftId} reason=${caseB.reason}`);

  // 8. audit evidence
  const audit = await sel(AUDIT, `audit_logs?action=eq.form.version.published&entity_id=eq.${draftId}&select=id,action,entity_id,user_id,created_at`);
  record('P14.13 publish is audited and readable by the auditor', (audit.body || []).length > 0, audit.text);

  record('P14.14 IN_FLIGHT_VERSION_CHANGED = 0', inFlightChanged === 0, `in_flight_changed=${inFlightChanged}`);

  const failures = summary('P14');
  console.log(`IN_FLIGHT_VERSION_CHANGED=${inFlightChanged}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
