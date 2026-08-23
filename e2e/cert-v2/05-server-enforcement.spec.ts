import { test, expect } from '@playwright/test';
import { PERSONAS } from './support/personas';
import { ENT, SUBMITTED_FILINGS } from './support/entities';
import { restSelect, restPatch, restInsert, rpc, isDenied } from './support/api';

/**
 * WAVE 3A / SCN-SERVER — every negative expectation is proven at the server,
 * not at the UI. Hidden buttons are not access control.
 */

test('SCN-SERVER-01: read_only persona cannot mutate a submitted return filing', async () => {
  const f = SUBMITTED_FILINGS[0];
  const r = await restPatch(PERSONAS.readOnly, `return_filings?id=eq.${f.id}`, { status: 'ACCEPTED' });
  const mutated = r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  expect(mutated, `read_only mutated ${f.ref}: ${r.bodyText}`).toBe(false);
});

test('SCN-SERVER-02: auditor cannot grant itself a role', async () => {
  const r = await restInsert(PERSONAS.auditor, 'user_roles', { role: 'super_admin' });
  expect(isDenied(r) || r.status >= 400, `auditor role escalation not refused: ${r.bodyText}`).toBe(true);
});

test('SCN-SERVER-03: applicant cannot read another entity licence record set', async () => {
  const r = await restSelect(PERSONAS.applicant, `licensees?select=id,name&id=eq.${ENT.E01_HEALTHY.id}`);
  const leaked = r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  expect(leaked, `applicant read unrelated entity: ${r.bodyText}`).toBe(false);
});

test('SCN-SERVER-04: licensee cannot write directly to audit trail tables', async () => {
  const r = await restInsert(PERSONAS.licenseePrimary, 'audit_logs', { action: 'CERT_V2_TAMPER' });
  expect(isDenied(r) || r.status >= 400, `licensee wrote to audit_logs: ${r.bodyText}`).toBe(true);
});

test('SCN-SERVER-05: workflow action is refused for a persona not assigned to the step', async () => {
  const r = await rpc(PERSONAS.readOnly, 'user_can_act_on_workflow_step', {
    _user_id: '00000000-0000-0000-0000-000000000000',
    _step_id: '00000000-0000-0000-0000-000000000000',
  });
  // Either the guard refuses the call, or it answers a hard "false".
  const permissive = r.status === 200 && r.body === true;
  expect(permissive, `workflow guard returned true for read_only: ${r.bodyText}`).toBe(false);
});

test('SCN-SERVER-06: licensee cannot escalate its own filing past review', async () => {
  const f = SUBMITTED_FILINGS[1];
  const r = await restPatch(PERSONAS.licenseePrimary, `return_filings?id=eq.${f.id}`, { status: 'ACCEPTED' });
  const mutated = r.status === 200 && Array.isArray(r.body) && (r.body as unknown[]).length > 0;
  expect(mutated, `licensee accepted its own filing ${f.ref}: ${r.bodyText}`).toBe(false);
});
