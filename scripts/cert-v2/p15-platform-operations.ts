/**
 * P15 — Platform operations (representative only).
 *  - break-glass super admin (canonical sec_* role, is_bypass, protected module access)
 *  - normal administrator: no automatic business-decision bypass, no maker/checker bypass
 *  - auditor: read evidence, zero governed writes
 *  - user/role management through canonical sec_user_roles/sec_roles
 *  - forgot-password chain against real Auth endpoints (no faked email delivery)
 */
import { readFileSync } from 'node:fs';
import { P, rpc, sel, ins, patch, record, summary, denied } from './api';

const BG_SESSION = '/root/.cache/lovable-auth/session.json';
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const SYSADM = P('system_administrator');
const SECADM = P('security_administrator');
const AUDIT = P('auditor');
const READONLY = P('read_only');
const SUPER = P('super_admin');

const ROLE_READ_ONLY = '19f6be02-bebd-4873-b7ee-75702fbf8da6';
const ROLE_RETURNS_OFFICER = '9780988a-718e-44d3-bab5-35d83feca4f3';

let bgToken: string | null = null;
try { bgToken = JSON.parse(readFileSync(BG_SESSION, 'utf8')).session.access_token; } catch { bgToken = null; }

async function bg(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${bgToken}`, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let body: any = text; try { body = JSON.parse(text); } catch { /* keep */ }
  return { status: res.status, ok: res.ok, body, text: text.slice(0, 400) };
}

async function main() {
  let auditorWrites = 0;
  let normalAdminBypass = false;

  // ---------- BREAK-GLASS SUPER ADMIN ----------
  record('P15.01 break-glass session available (no credentials handled in code)', !!bgToken);
  let bypass = false;
  if (bgToken) {
    const ctx = await bg('rpc/sec_get_user_context', { method: 'POST', body: '{}' });
    const roles: any[] = ctx.body?.roles || [];
    bypass = ctx.body?.is_bypass === true;
    record('P15.02 break-glass context is_bypass = true', bypass, `roles=${roles.map((r) => r.key).join(',')}`);
    record('P15.03 exactly one canonical active role and it is super_admin',
      roles.length === 1 && roles[0]?.key === 'super_admin', JSON.stringify(roles.map((r) => r.key)));

    const modules = ['licensees?select=id&limit=1', 'applications?select=id&limit=1', 'return_filings?select=id&limit=1',
      'complaints?select=id&limit=1', 'enforcement_actions?select=id&limit=1', 'sec_roles?select=id&limit=1',
      'audit_logs?select=id&limit=1'];
    let okCount = 0;
    for (const m of modules) { const r = await bg(m); if (r.status === 200) okCount += 1; }
    record('P15.04 break-glass reaches representative protected admin + business modules', okCount === modules.length, `${okCount}/${modules.length}`);
  }

  // canonical registry proof (read through a governed persona, not the legacy tables)
  const canon = await sel(SUPER, 'sec_user_roles?select=user_id,status,sec_roles!inner(key,is_break_glass)&sec_roles.is_break_glass=eq.true&status=eq.active&user_id=eq.f26c4940-d64a-4734-bc79-04cc37567b2d');
  record('P15.05 designated break-glass account holds exactly one active break-glass assignment', (canon.body || []).length === 1, canon.text);


  // ---------- NORMAL ADMINISTRATOR ----------
  const admCtx = await rpc(SYSADM, 'sec_get_user_context', {});
  record('P15.06 normal administrator is not a bypass principal', admCtx.body?.is_bypass === false, `is_bypass=${admCtx.body?.is_bypass}`);

  const admAllowed = await sel(SYSADM, 'form_templates?select=id&limit=1');
  record('P15.07 normal administrator can administer what its permissions allow', admAllowed.status === 200, admAllowed.text);

  const monitoring = await sel(SUPER, 'enforcement_actions?select=id,stage&stage=eq.REMEDIATION_MONITORING&limit=1');
  const caseId = monitoring.body?.[0]?.id;
  if (caseId) {
    const admDecision = await rpc(SYSADM, 'enforcement_case_action', {
      _case_id: caseId, _action: 'CLOSE',
      _payload: { rationale: 'P15 negative control: administrator attempting a business decision without enforcement authority.' },
    });
    if (!denied(admDecision)) normalAdminBypass = true;
    record('P15.08 normal administrator cannot take an enforcement business decision', denied(admDecision), admDecision.text);
  } else {
    record('P15.08 monitoring-stage enforcement case available for the negative control', false, monitoring.text);
  }

  const admDecidePerm = await rpc(SYSADM, 'sec_has_permission', {
    p_user_id: admCtx.body?.user_id, p_module: 'enforcement_management', p_action: 'decide',
  });
  if (admDecidePerm.body === true) normalAdminBypass = true;
  record('P15.09 normal administrator holds no decide authority (no maker/checker bypass)', admDecidePerm.body === false, admDecidePerm.text);

  // maker/checker regression: the proposing officer role must not hold decide authority
  const enfOfficer = await sel(SUPER, 'cert_certification_users?select=user_id&role_key=eq.enforcement_officer');
  const enfUid = enfOfficer.body?.[0]?.user_id;
  const enfDecide = await rpc(SUPER, 'sec_has_permission', { p_user_id: enfUid, p_module: 'enforcement_management', p_action: 'decide' });
  record('P15.10 maker/checker invariant holds (enforcement officer cannot decide)', enfDecide.body === false, enfDecide.text);

  // ---------- AUDITOR ----------
  const auditReads = ['audit_logs?select=id&limit=1', 'compliance_audit_logs?select=*&limit=1',
    'return_filings?select=id&limit=1', 'complaints?select=id&limit=1', 'applications?select=id&limit=1'];
  let readOk = 0;
  const auditReadDetail: string[] = [];
  for (const r of auditReads) { const res = await sel(AUDIT, r); if (res.status === 200) readOk += 1; else auditReadDetail.push(`${r} -> ${res.status} ${res.text}`); }
  record('P15.11 auditor can read the required audit/supervisory evidence', readOk === auditReads.length, `${readOk}/${auditReads.length} ${auditReadDetail.join(' ;; ')}`);

  const w1 = await ins(AUDIT, 'complaints', { subject: 'P15 auditor write probe', description: 'negative control' });
  if (w1.status >= 200 && w1.status < 300) auditorWrites += 1;
  record('P15.12 auditor cannot create governed business records', denied(w1) || w1.status >= 400, `HTTP ${w1.status} ${w1.text}`);

  if (caseId) {
    const w2 = await patch(AUDIT, `enforcement_actions?id=eq.${caseId}`, { stage: 'CLOSED' });
    if (w2.status >= 200 && w2.status < 300 && (w2.body || []).length > 0) auditorWrites += 1;
    record('P15.13 auditor cannot mutate enforcement records', denied(w2) || w2.status >= 400 || (w2.body || []).length === 0, `HTTP ${w2.status} ${w2.text}`);

    const w3 = await rpc(AUDIT, 'enforcement_case_action', { _case_id: caseId, _action: 'CLOSE', _payload: { rationale: 'P15 auditor negative control for governed workflow write attempts.' } });
    if (w3.body?.success === true) auditorWrites += 1;
    record('P15.14 auditor cannot invoke governed workflow actions', denied(w3), w3.text);
  }

  // ---------- USER / ROLE MANAGEMENT (canonical sec_*) ----------
  const target = await sel(SUPER, 'cert_certification_users?select=user_id&role_key=eq.read_only');
  const targetUid = target.body?.[0]?.user_id as string;
  record('P15.15 role-management target resolved', !!targetUid, target.text);

  if (targetUid) {
    const before = await rpc(SECADM, 'sec_has_permission', { p_user_id: targetUid, p_module: 'returns_management', p_action: 'review' });
    record('P15.16 target does not hold the governed permission before assignment', before.body === false, before.text);

    const grant = await rpc(SECADM, 'sec_assign_user_roles', { p_user_id: targetUid, p_role_ids: [ROLE_READ_ONLY, ROLE_RETURNS_OFFICER] });
    record('P15.17 governed role assigned through sec_assign_user_roles', Array.isArray(grant.body?.role_ids) && grant.body.role_ids.length === 2, grant.text);

    const after = await rpc(SECADM, 'sec_has_permission', { p_user_id: targetUid, p_module: 'returns_management', p_action: 'review' });
    record('P15.18 security context gains the permission', after.body === true, after.text);

    const tgtCtx = await rpc(READONLY, 'sec_get_user_context', {});
    const perms: any[] = tgtCtx.body?.permissions || [];
    const nav: any[] = tgtCtx.body?.navigation || [];
    const hasReturnsNav = nav.some((n) => n.module === 'returns_management' && n.allowed === true);
    record('P15.19 route/action permissions visible to the user themselves',
      perms.some((p) => p.module === 'returns_management' && p.action === 'review') && hasReturnsNav,
      `perms=${perms.length} returns_nav_allowed=${hasReturnsNav}`);

    const revoke = await rpc(SECADM, 'sec_assign_user_roles', { p_user_id: targetUid, p_role_ids: [ROLE_READ_ONLY] });
    record('P15.20 governed role revoked', Array.isArray(revoke.body?.role_ids) && revoke.body.role_ids.length === 1, revoke.text);

    const post = await rpc(SECADM, 'sec_has_permission', { p_user_id: targetUid, p_module: 'returns_management', p_action: 'review' });
    record('P15.21 permission disappears after revocation', post.body === false, post.text);

    const roleAudit = await sel(AUDIT, `audit_logs?action=eq.security.assign_user_roles&entity_id=eq.${targetUid}&select=id&limit=1`);
    record('P15.22 role changes are audited', (roleAudit.body || []).length > 0, roleAudit.text);
  }

  // ---------- FORGOT PASSWORD (real Auth chain) ----------
  const redirectTo = 'https://uni-role-verse.lovable.app/reset-password';
  const recover = async (email: string) => {
    const res = await fetch(`${URL_BASE}/auth/v1/recover`, {
      method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, gotrue_meta_security: {} , redirect_to: redirectTo }),
    });
    return { status: res.status, text: (await res.text()).slice(0, 300) };
  };
  const r1 = await recover('rohit@mishainfotech.com');
  record('P15.23 Auth accepts the recovery request for the real account', r1.status === 200, `HTTP ${r1.status} ${r1.text}`);
  const r2 = await recover(`nobody-${Date.now()}@example.invalid`);
  record('P15.24 recovery response is account-enumeration safe', r2.status === r1.status, `known=${r1.status} unknown=${r2.status}`);

  const failures = summary('P15');
  console.log(`BREAK_GLASS_IS_BYPASS=${bypass ? 'YES' : 'NO'}`);
  console.log(`NORMAL_ADMIN_BUSINESS_BYPASS=${normalAdminBypass ? 'YES' : 'NO'}`);
  console.log(`AUDITOR_WRITE_SUCCESSES=${auditorWrites}`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
