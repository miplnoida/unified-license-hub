import { test, expect } from '@playwright/test';
import { persona } from './support/personas';
import { rpc, restSelect, restInsert, restPatch, isDenied, accessToken } from './support/api';

/**
 * AML-CLOSE-08B — direct-call authority of the deadline management RPCs and direct-write refusal.
 * Negative/read-only probes only; no successful mutation is attempted (the allowed path is browser spec 17).
 * Uses the existing closed TEST obligation: authentication, scope and authority are checked before state,
 * so an authorised supervisor reaches `sla_not_open`, everyone else is refused earlier.
 */
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const SUP = persona('aml_supervision_supervisor');
const DENIED = {
  licensee: persona('licensee_primary_user'),
  aml_officer: persona('aml_supervision_officer'),
  other_domain_supervisor: persona('prudential_supervisor'),
};
const ZERO = '00000000-0000-4000-8000-0000000008b1';

test.describe('AML-CLOSE-08B SLA management RPC authority', () => {
  let obl = '';
  let stage = '';
  test.beforeAll(async () => {
    const rows = (await restSelect(SUP, 'supervisory_response_sla_obligation?sla_policy_code=like.TEST-AML08A-SLA-*&outcome=eq.ON_TIME&select=id,stage_instance_id&limit=1')).body as Array<{ id: string; stage_instance_id: string }>;
    obl = rows[0]?.id; stage = rows[0]?.stage_instance_id;
  });

  const calls = (o: string) => ([
    ['pause', 'supervisory_response_sla_pause', { _obligation_id: o, _reason: 'AWAITING_ENTITY_INFORMATION', _resume: false, _rationale: 'TEST 08B authority probe' }],
    ['resume', 'supervisory_response_sla_pause', { _obligation_id: o, _reason: '', _resume: true, _rationale: 'TEST 08B authority probe' }],
    ['complete', 'supervisory_response_sla_complete', { _obligation_id: o, _reason: 'TEST 08B authority probe' }],
  ] as const);

  test('signed-out callers are refused', async () => {
    expect(obl).toBeTruthy();
    for (const [, fn, args] of calls(obl)) {
      const r = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
      expect([401, 403]).toContain(r.status);
    }
  });

  for (const [who, email] of Object.entries(DENIED)) {
    test(`${who} is refused for pause, resume and complete`, async () => {
      for (const [k, fn, args] of calls(obl)) {
        const r = await rpc(email, fn, args);
        expect(isDenied(r), `${who}/${k}: ${r.bodyText}`).toBe(true);
        expect(r.bodyText).not.toMatch(/sla_not_open/);
      }
    });
  }

  test('scoped AML supervisor passes authority and reaches the server state check; no actor parameter exists', async () => {
    for (const [, fn, args] of calls(obl)) {
      const r = await rpc(SUP, fn, args);
      expect(r.bodyText).toMatch(/sla_not_open/);
      const forged = await rpc(SUP, fn, { ...args, _actor_id: ZERO });
      expect(forged.ok).toBe(false);
    }
  });

  test('direct INSERT/UPDATE/DELETE on deadline and consequence tables changes nothing', async () => {
    const tok = await accessToken(SUP);
    const h = { apikey: ANON, Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
    const targets: Array<[string, string]> = [
      ['supervisory_consequence_decision', `id=eq.${ZERO}`],
      ['supervisory_response_sla_obligation', `id=eq.${obl}`],
      ['sla_stage_instances', `id=eq.${stage}`],
      ['sla_stage_events', `stage_instance_id=eq.${stage}`],
      ['sla_escalation_dispatches', `id=eq.${ZERO}`],
    ];
    for (const [t, filter] of targets) {
      expect((await restInsert(SUP, t, { id: ZERO })).ok, `insert ${t}`).toBe(false);
      const up = await restPatch(SUP, `${t}?${filter}`, { metadata: {} });
      expect(up.ok && Array.isArray(up.body) && (up.body as unknown[]).length > 0, `update ${t}`).toBe(false);
      const del = await fetch(`${URL_BASE}/rest/v1/${t}?${filter}`, { method: 'DELETE', headers: h });
      const body = del.ok ? await del.json() : [];
      expect(Array.isArray(body) ? body.length : 0, `delete ${t}`).toBe(0);
    }
    const after = (await restSelect(SUP, `supervisory_response_sla_obligation?id=eq.${obl}&select=outcome`)).body as Array<{ outcome: string }>;
    expect(after[0].outcome).toBe('ON_TIME');
    expect(((await restSelect(SUP, `sla_stage_events?stage_instance_id=eq.${stage}&select=id`)).body as unknown[]).length).toBeGreaterThan(0);
  });
});
