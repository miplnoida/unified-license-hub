import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restSelect, restInsert, restPatch, isDenied } from './support/api';
import { readAmlFixture, recordFixtureAssessment, TEST_SLA } from './support/amlFixture';

/**
 * AML-CLOSE-08A — governed supervisory response → live SLA obligation → hold → resume → close.
 *
 * Every successful step (assessment, calculation, approval, publication, consequence, hold,
 * resume, close) is a normal browser action. Direct calls are used ONLY for read-only checks
 * and refused attempts. TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.
 */
const OFFICER = persona('aml_supervision_officer');
const SUPERVISOR = persona('aml_supervision_supervisor');
const LICENSEE = persona('licensee_primary_user');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-08A.';
const FX = readAmlFixture();
const RUN_TAG = FX?.runTag ?? `${Date.now()}`;
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Answer = [RegExp, RegExp];
const STANDARD: Answer[] = [
  [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
  [/^AML_TECH_CERT_INHERENT_B weight/, /^No$/i],
  [/^TEST ONLY control dimension weight/, /^Yes$/i],
];

let assessmentId = '';

async function as(page: Page, who: string) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => undefined);
  expect(await loginAs(page, who)).not.toBe('/login');
}

async function recordFact(page: Page, code: string, value: string) {
  const card = page.locator('li', { hasText: code })
    .filter({ has: page.getByRole('button', { name: /^(Record|Update|Change value)$/ }) }).last();
  await card.getByRole('button', { name: /^(Record|Update|Change value)$/ }).click();
  const d = page.getByRole('dialog');
  await d.locator('input:not([type=date])').nth(0).fill(value);
  await page.waitForLoadState('networkidle').catch(() => {});
  const src = d.locator('#fact-source');
  if ((await src.evaluate((e) => e.tagName)) === 'BUTTON') {
    if (/choose a source/i.test(await src.innerText()) || !(await src.innerText()).trim()) {
      await src.click(); await page.getByRole('option').first().click();
    }
  } else if (!(await src.inputValue())) {
    await src.fill('MANUAL');
  }
  await d.locator('#fact-ref').fill(`TEST-AML-CLOSE-08A-${code}`);
  const ta = d.locator('textarea');
  if (await ta.count()) await ta.first().fill(TAG);
  await d.getByRole('button', { name: /Record fact|Save|Update/ }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
}

async function answer(page: Page, plan: Answer[]) {
  await page.getByRole('tab', { name: 'Working file' }).click();
  for (const [dim, ans] of plan) {
    const head = page.getByRole('button', { name: dim });
    if (!(await head.count())) continue;
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    const region = page.locator(`[role="region"][aria-labelledby="${await head.getAttribute('id')}"]`);
    const trigs = region.locator('button[id^="resp-"]');
    await expect(trigs.first()).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < await trigs.count(); i++) {
      const trig = trigs.nth(i);
      const qid = (await trig.getAttribute('id'))!.slice(5);
      await trig.click();
      await page.getByRole('option', { name: ans }).first().click();
      await page.locator(`#obs-${qid}`).fill('TEST ONLY observation — AML-CLOSE-08A');
      const card = page.locator('div').filter({ has: page.locator(`#resp-${qid}`) })
        .filter({ has: page.getByRole('button', { name: 'Save response' }) }).last();
      const save = (await card.getByRole('button', { name: 'Save response' }).first().elementHandle())!;
      await save.click();
      await page.waitForFunction((b) => b.textContent?.trim() === 'Save response', save, { timeout: 20_000 });
      await page.waitForTimeout(600);
    }
  }
}

async function openTab(page: Page, tab: string) {
  await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });
  const t = page.getByRole('tab', { name: tab });
  try { await t.click({ timeout: 45_000 }); }
  catch { await page.reload({ waitUntil: 'domcontentloaded' }); await t.click({ timeout: 45_000 }); }
}

type Obl = { obligation_id: string; decision_id: string; outcome: string; sla_policy_code: string; sla_policy_version: string;
  sla_policy_rule_code: string; sla_duration_days: number; sla_calendar_mode: string; pause_permitted: boolean;
  pause_reasons: string[]; due_at: string; policy_action: string; operational_action: string;
  stage: { stage_instance_id: string; state: string; paused_at: string | null; pause_seconds: number; due_at: string; completed_at: string | null } | null };
type SlaView = { viewer_can_manage?: boolean; obligations: Obl[] };
const slaView = async (who: string) =>
  (await rpc(who, 'supervisory_response_sla_view', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _assessment_id: assessmentId })).body as SlaView;
const decisionsFor = async () =>
  (await restSelect(SUPERVISOR, `supervisory_consequence_decision?assessment_id=eq.${assessmentId}&select=id,action_type,status`)).body as Array<{ id: string; action_type: string; status: string }>;
const events = async (stageId: string) =>
  (await restSelect(SUPERVISOR, `sla_stage_events?stage_instance_id=eq.${stageId}&select=id,event_type,actor_id,reason,metadata,occurred_at&order=occurred_at.asc`)).body as Array<{ id: string; event_type: string; actor_id: string | null; reason: string | null; metadata: Record<string, unknown> | null }>;
const riskState = async () =>
  ((await restSelect(SUPERVISOR, `entity_risk_state?entity_id=eq.${ENTITY_ID}&domain_code=eq.AML_CFT&select=residual_rating,driving_assessment_id,updated_at`)).body as Array<Record<string, string>>)[0];
const hold = (who: string, obl: string, reason: string, rationale: string | null, resume = false) =>
  rpc(who, 'supervisory_response_sla_pause', { _obligation_id: obl, _reason: reason, _resume: resume, _rationale: rationale });

test.describe.serial('AML-CLOSE-08A supervisory response and SLA (browser)', () => {
  test.setTimeout(420_000);
  let obl: Obl;

  test('1. a fresh TEST assessment pins the TEST response and SLA policy and is published', async ({ page }) => {
    test.skip(!FX?.slaComponentId || !FX?.responseComponentId, 'TEST response/SLA package not created by the fixture');
    await as(page, OFFICER);
    await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
    for (let attempt = 0; ; attempt++) {
      try {
        await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
        await page.locator('#aml-entity-pick').click();
        await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click({ timeout: 20_000 });
        break;
      } catch (e) { if (attempt >= 2) throw e; await page.reload({ waitUntil: 'domcontentloaded' }); }
    }
    await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
    await page.getByRole('option').filter({ hasText: /periodic/i }).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
    const d = page.getByRole('dialog');
    for (const ta of await d.locator('textarea').all()) await ta.fill(`${TAG} ${RUN_TAG}`);
    await d.getByRole('button', { name: 'Create assessment' }).click();
    await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
    assessmentId = page.url().split('/').pop()!.split('?')[0];
    recordFixtureAssessment('S17', assessmentId);

    // pinned basis contains exactly the run's TEST response + SLA components
    const snap = ((await restSelect(SUPERVISOR, `supervisory_assessment_policy_snapshot?assessment_id=eq.${assessmentId}&select=policy_profile_id,policy_profile_code,policy_profile_version,components`)).body as Array<{ policy_profile_id: string; components: unknown }>)[0];
    expect(snap.policy_profile_id).toBe(FX!.profileId);
    const comps = JSON.stringify(snap.components);
    expect(comps).toContain(FX!.slaComponentId!);
    expect(comps).toContain(FX!.responseComponentId!);
    expect(comps).not.toContain('FSRA-AML-SLA');

    await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
    await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
    await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '60');
    await answer(page, STANDARD);
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await page.getByRole('button', { name: 'Recalculate' }).click();
    await expect(page.getByText('The server recorded a new numbered calculation run.').first()).toBeVisible({ timeout: 45_000 });
    await page.getByRole('tab', { name: 'Review & decision' }).click();
    await page.locator('#rev-submit-reason').fill(`${TAG} submitted for review.`);
    await page.getByRole('button', { name: /^(Submit|Resubmit) for review$/ }).click();
    await expect(page.getByText('The assessment was submitted for review.').first()).toBeVisible({ timeout: 30_000 });

    await as(page, SUPERVISOR);
    await openTab(page, 'Review & decision');
    await page.locator('#rev-decision-reason').fill(`${TAG} approved by the independent reviewer.`);
    const box = page.locator('#rev-approve-publish');
    if (!(await box.isChecked())) await box.click();
    await page.getByRole('button', { name: 'Approve assessment' }).click();
    await expect(page.getByText(/The assessment was approved/).first()).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => (await riskState())?.driving_assessment_id, { timeout: 30_000 }).toBe(assessmentId);
    expect((await riskState()).residual_rating).toBe(TEST_SLA.rating);
  });

  test('2. REQUIRED response is shown but nothing is created automatically', async () => {
    test.skip(!assessmentId);
    const pol = (await rpc(SUPERVISOR, 'supervisory_consequence_response_policy_view', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _assessment_id: assessmentId })).body;
    expect(JSON.stringify(pol)).toContain('REQUIRED');
    expect(JSON.stringify(pol)).toContain(FX!.responseCode!);
    expect(await decisionsFor()).toHaveLength(0);
    expect((await slaView(SUPERVISOR)).obligations.filter((o) => o.sla_policy_code === FX!.slaCode)).toHaveLength(0);
    const src = (await rpc(SUPERVISOR, 'supervisory_consequence_view', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _assessment_id: assessmentId })).body as { source: { eligible: boolean; assessment: { id: string } } };
    expect(src.source.eligible).toBe(true);
    expect(src.source.assessment.id).toBe(assessmentId);
  });

  test('3. supervisor records the plan consequence in the browser → exactly one obligation', async ({ page }) => {
    test.skip(!assessmentId);
    const before = await riskState();
    await as(page, SUPERVISOR);
    await openTab(page, 'Supervisory consequence');
    await page.getByRole('combobox', { name: 'Consequence' }).click();
    await page.getByRole('option', { name: /supervisory plan/i }).first().click();
    await page.getByRole('combobox', { name: 'How to link' }).click();
    await page.getByRole('option', { name: 'Create a new record' }).click();
    await page.locator('#conseq-title').fill(`${TAG} plan ${RUN_TAG}`);
    await page.locator('#conseq-rationale').fill(`${TAG} The TEST response policy requires a plan at this rating; supervisor decision.`);
    await page.getByRole('button', { name: 'Record supervisory consequence' }).click();
    await expect(page.getByText('The supervisory consequence was recorded.').first()).toBeVisible({ timeout: 30_000 });

    const decs = await decisionsFor();
    expect(decs).toHaveLength(1);
    expect(decs[0].action_type).toBe('OPEN_SUPERVISORY_PLAN');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const mine = (await slaView(SUPERVISOR)).obligations.filter((o) => o.decision_id === decs[0].id);
    expect(mine).toHaveLength(1);
    obl = mine[0];
    expect(obl).toMatchObject({ sla_policy_code: FX!.slaCode, sla_policy_version: '1.0', sla_duration_days: TEST_SLA.days,
      sla_calendar_mode: 'CALENDAR_DAYS', pause_permitted: true, outcome: 'PENDING', policy_action: 'SUPERVISORY_PLAN' });
    expect(obl.pause_reasons).toEqual(['AWAITING_ENTITY_INFORMATION']);
    expect(obl.stage?.state).toBe('active');
    expect(await riskState()).toEqual(before);
    console.log('S17 obligation', JSON.stringify({ id: obl.obligation_id, due_at: obl.due_at, stage: obl.stage?.stage_instance_id }));
  });

  test('4. supervisor sees controls; officer does not and is refused; licensee/anon refused', async ({ page }) => {
    test.skip(!obl);
    expect((await slaView(SUPERVISOR)).viewer_can_manage).toBe(true);
    expect((await slaView(OFFICER)).viewer_can_manage).toBe(false);
    await as(page, OFFICER);
    await openTab(page, 'Supervisory consequence');
    await expect(page.getByTestId('aml-response-sla-panel')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Put deadline on hold' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close response' })).toHaveCount(0);
    expect(isDenied(await hold(OFFICER, obl.obligation_id, 'AWAITING_ENTITY_INFORMATION', 'TEST officer bypass attempt'))).toBe(true);
    expect(isDenied(await hold(LICENSEE, obl.obligation_id, 'AWAITING_ENTITY_INFORMATION', 'TEST licensee bypass attempt'))).toBe(true);
    const anon = await fetch(`${URL_BASE}/rest/v1/rpc/supervisory_response_sla_pause`, { method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _obligation_id: obl.obligation_id, _reason: 'AWAITING_ENTITY_INFORMATION', _resume: false, _rationale: 'TEST anon attempt' }) });
    expect([401, 403]).toContain(anon.status);
    // invalid holds by the authorised supervisor are refused before any state change
    for (const [reason, why] of [['AWAITING_ENTITY_INFORMATION', null], ['AWAITING_ENTITY_INFORMATION', 'short'], ['NOT_A_POLICY_REASON', 'TEST unsupported reason attempt']] as const) {
      const r = await hold(SUPERVISOR, obl.obligation_id, reason, why);
      expect(r.ok, `${reason}/${why}`).toBe(false);
    }
    expect((await slaView(SUPERVISOR)).obligations.find((o) => o.obligation_id === obl.obligation_id)!.stage!.state).toBe('active');
    // direct table writes are refused
    for (const t of ['supervisory_response_sla_obligation', 'sla_stage_events', 'sla_escalation_dispatches', 'supervisory_consequence_decision']) {
      const ins = await restInsert(SUPERVISOR, t, { id: '00000000-0000-4000-8000-0000000008a1' });
      expect(ins.ok, `insert ${t}`).toBe(false);
    }
    const upd = await restPatch(SUPERVISOR, `sla_stage_instances?id=eq.${obl.stage!.stage_instance_id}`, { state: 'completed' });
    expect(upd.ok && Array.isArray(upd.body) && (upd.body as unknown[]).length > 0).toBe(false);
  });

  test('5. browser hold → reload paused → double hold refused', async ({ page }) => {
    test.skip(!obl);
    await as(page, SUPERVISOR);
    await openTab(page, 'Supervisory consequence');
    const ctl = page.getByTestId(`sla-controls-${obl.obligation_id}`);
    await ctl.locator('textarea').fill(`${TAG} waiting on the entity's TEST information return.`);
    await ctl.getByRole('combobox', { name: 'Hold reason' }).click();
    await page.getByRole('option', { name: /awaiting entity information/i }).click();
    await ctl.getByRole('button', { name: 'Put deadline on hold' }).click();
    await expect(page.getByText('Deadline put on hold').first()).toBeVisible({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const v = (await slaView(SUPERVISOR)).obligations.find((o) => o.obligation_id === obl.obligation_id)!;
    expect(v.stage!.state).toBe('paused');
    expect(v.stage!.paused_at).not.toBeNull();
    expect(v.outcome).toBe('PENDING');
    const ev = (await events(obl.stage!.stage_instance_id)).filter((e) => e.event_type === 'paused');
    expect(ev).toHaveLength(1);
    expect(JSON.stringify(ev[0])).toContain('AWAITING_ENTITY_INFORMATION');
    expect(JSON.stringify(ev[0].metadata)).toContain("waiting on the entity's TEST information return");
    const dbl = await hold(SUPERVISOR, obl.obligation_id, 'AWAITING_ENTITY_INFORMATION', 'TEST double hold attempt');
    expect(dbl.ok).toBe(false);
  });

  test('6. browser resume → active, pause retained → duplicate resume refused', async ({ page }) => {
    test.skip(!obl);
    const pausedEvent = (await events(obl.stage!.stage_instance_id)).find((e) => e.event_type === 'paused')!;
    await as(page, SUPERVISOR);
    await openTab(page, 'Supervisory consequence');
    const ctl = page.getByTestId(`sla-controls-${obl.obligation_id}`);
    await ctl.locator('textarea').fill(`${TAG} TEST information received; clock resumes.`);
    await ctl.getByRole('button', { name: 'Resume deadline' }).click();
    await expect(page.getByText('Deadline resumed').first()).toBeVisible({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    const v = (await slaView(SUPERVISOR)).obligations.find((o) => o.obligation_id === obl.obligation_id)!;
    expect(v.stage!.state).toBe('active');
    expect(v.stage!.pause_seconds).toBeGreaterThan(0);
    expect(new Date(v.stage!.due_at).getTime()).toBeGreaterThanOrEqual(new Date(obl.stage!.due_at).getTime());
    const ev = await events(obl.stage!.stage_instance_id);
    expect(ev.filter((e) => e.event_type === 'resumed')).toHaveLength(1);
    expect(ev.find((e) => e.id === pausedEvent.id)).toEqual(pausedEvent);
    const dup = await hold(SUPERVISOR, obl.obligation_id, '', 'TEST duplicate resume attempt', true);
    expect(dup.ok).toBe(false);
  });

  test('7. browser close → server decides ON_TIME → controls gone → closed refusals', async ({ page }) => {
    test.skip(!obl);
    const before = await riskState();
    await as(page, SUPERVISOR);
    await openTab(page, 'Supervisory consequence');
    const ctl = page.getByTestId(`sla-controls-${obl.obligation_id}`);
    await ctl.locator('textarea').fill(`${TAG} TEST supervisory plan opened; response closed.`);
    await ctl.getByRole('button', { name: 'Close response' }).click();
    await expect(page.getByText(/Response closed — on time/).first()).toBeVisible({ timeout: 20_000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId(`sla-controls-${obl.obligation_id}`)).toHaveCount(0);
    const v = (await slaView(SUPERVISOR)).obligations.find((o) => o.obligation_id === obl.obligation_id)!;
    expect(v.outcome).toBe('ON_TIME');
    expect(v.stage!.state).toBe('completed');
    expect((await events(obl.stage!.stage_instance_id)).filter((e) => e.event_type === 'completed')).toHaveLength(1);
    for (const r of [
      await hold(SUPERVISOR, obl.obligation_id, 'AWAITING_ENTITY_INFORMATION', 'TEST hold after close'),
      await hold(SUPERVISOR, obl.obligation_id, '', 'TEST resume after close', true),
      await rpc(SUPERVISOR, 'supervisory_response_sla_complete', { _obligation_id: obl.obligation_id, _reason: 'TEST close again attempt' }),
    ]) expect(r.bodyText).toMatch(/sla_not_open/);
    expect(await riskState()).toEqual(before);
    expect((await restSelect(SUPERVISOR, `supervisory_assessment?reference=in.(SUP-AML_CFT-2026-00830,SUP-AML_CFT-2026-00836,SUP-AML_CFT-2026-00838)&select=reference,status,updated_at`)).body).toHaveLength(3);
  });
});
