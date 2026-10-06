import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restPatch, restSelect, restInsert } from './support/api';
import { readAmlFixture, recordFixtureAssessment } from './support/amlFixture';

/**
 * AML-CLOSE-07A — publication action contract, different-rating movement and as-of.
 *
 * Successful steps (create, fill in, calculate, submit, approve, publish) are normal browser
 * actions on the dedicated TEST/demo licensee. Direct calls are used ONLY for read-only checks,
 * refused-bypass attempts and concurrency.
 * All values are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.
 */
const OFFICER = persona('aml_supervision_officer');
const SUPERVISOR = persona('aml_supervision_supervisor');
const PRU = persona('prudential_supervisor');
const LICENSEE = persona('licensee_primary_user');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const PROTECTED = ['SUP-AML_CFT-2026-00830', 'SUP-AML_CFT-2026-00836', 'SUP-AML_CFT-2026-00838'];
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-07A.';
const RUN_TAG = readAmlFixture()?.runTag ?? `${Date.now()}`;
const URL_BASE = process.env.VITE_SUPABASE_URL as string;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type Answer = [RegExp, RegExp];
const STANDARD: Answer[] = [
  [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
  [/^AML_TECH_CERT_INHERENT_B weight/, /^No$/i],
  [/^TEST ONLY control dimension weight/, /^Yes$/i],
];

const ids: Record<string, string> = {};
const ALT: Answer[] = [
  [/^AML_TECH_CERT_INHERENT weight/, /^Yes$/i],
  [/^AML_TECH_CERT_INHERENT_B weight/, /^Yes$/i],
  [/^TEST ONLY control dimension weight/, /^No$/i],
];

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
  const inputs = d.locator('input:not([type=date])');
  await inputs.nth(0).fill(value);
  await page.waitForLoadState('networkidle').catch(() => {});
  const src = d.locator('#fact-source');
  if ((await src.evaluate((e) => e.tagName)) === 'BUTTON') {
    if (/choose a source/i.test(await src.innerText()) || !(await src.innerText()).trim()) {
      await src.click(); await page.getByRole('option').first().click();
    }
  } else if (!(await src.inputValue())) {
    await src.fill('MANUAL');
  }
  await d.locator('#fact-ref').fill(`TEST-AML-CLOSE-05A-${code}`);
  const ta = d.locator('textarea');
  if (await ta.count()) await ta.first().fill(TAG);
  await d.getByRole('button', { name: /Record fact|Save|Update/ }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
}

async function answer(page: Page, plan: Answer[]) {
  await page.getByRole('tab', { name: 'Working file' }).click();
  for (const [dim, ans] of plan) {
    const head = page.getByRole('button', { name: dim });
    if (!(await head.count())) continue; // not applicable under the recorded facts
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    const region = page.locator(`[role="region"][aria-labelledby="${await head.getAttribute('id')}"]`);
    const trigs = region.locator('button[id^="resp-"]');
    await expect(trigs.first()).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < await trigs.count(); i++) {
      const trig = trigs.nth(i);
      const qid = (await trig.getAttribute('id'))!.slice(5);
      await trig.click();
      await page.getByRole('option', { name: ans }).first().click();
      await page.locator(`#obs-${qid}`).fill('TEST ONLY observation — AML-CLOSE-05');
      const card = page.locator('div').filter({ has: page.locator(`#resp-${qid}`) })
        .filter({ has: page.getByRole('button', { name: 'Save response' }) }).last();
      const save = (await card.getByRole('button', { name: 'Save response' }).first().elementHandle())!;
      await save.click();
      await page.waitForFunction((b) => b.textContent?.trim() === 'Save response', save, { timeout: 20_000 });
      await page.waitForTimeout(600);
    }
  }
}

async function recalculate(page: Page) {
  await page.getByRole('tab', { name: 'Calculation' }).click();
  const before = await page.getByText(/^Run #\d+$/).first().textContent().catch(() => null);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('The server recorded a new numbered calculation run.').first()).toBeVisible({ timeout: 45_000 });
  if (before) await expect(page.getByText(/^Run #\d+$/).first()).not.toHaveText(before, { timeout: 20_000 });
}

/** Officer: new assessment → facts → answers → browser calculation. */
async function prepare(page: Page, key: string, plan: Answer[] = STANDARD, strCount = '60') {
  await as(page, OFFICER);
  await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
  for (let attempt = 0; ; attempt++) {
    try {
      await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
      await page.locator('#aml-entity-pick').click();
      await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click({ timeout: 20_000 });
      break;
    } catch (e) {
      if (attempt >= 2) throw e;
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
  }
  await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
  await page.getByRole('option').filter({ hasText: /periodic/i }).first().click();
  await expect(page.getByText(/AML_TECH_CERT_METHOD v11/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  const d = page.getByRole('dialog');
  for (const ta of await d.locator('textarea').all()) await ta.fill(`${TAG} Journey ${key} ${RUN_TAG}`);
  await d.getByRole('button', { name: 'Create assessment' }).click();
  await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ids[key] = page.url().split('/').pop()!.split('?')[0];
  recordFixtureAssessment(`S16-${key}`, ids[key]);
  await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
  await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
  await recordFact(page, 'AML_TECH_CERT_STR_COUNT', strCount);
  if (plan.length) await answer(page, plan);
  await recalculate(page);
}

async function openAssessment(page: Page, key: string, tab: 'Calculation' | 'Review & decision') {
  await page.goto(`/supervision/aml/assessments/${ids[key]}`, { waitUntil: 'domcontentloaded' });
  const t = page.getByRole('tab', { name: tab });
  try { await t.click({ timeout: 45_000 }); }
  catch { await page.reload({ waitUntil: 'domcontentloaded' }); await t.click({ timeout: 45_000 }); }
}

async function proposeOverride(page: Page, rating: string, rationale: string) {
  await page.getByRole('tab', { name: 'Calculation' }).click();
  await page.locator('#calc-override-rating').click();
  await page.getByRole('option', { name: new RegExp(`^${rating}( —|$)`) }).click();
  await page.locator('#calc-override-rationale').fill(rationale);
  await page.getByRole('button', { name: 'Propose override' }).click();
  await expect(page.getByText('Override proposed. It awaits an independent decision.').first()).toBeVisible({ timeout: 20_000 });
}

async function submitForReview(page: Page) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  await page.locator('#rev-submit-reason').fill(`${TAG} submitted for review.`);
  await page.getByRole('button', { name: /^(Submit|Resubmit) for review$/ }).click();
  await expect(page.getByText('The assessment was submitted for review.').first()).toBeVisible({ timeout: 30_000 });
}

async function approveAssessment(page: Page, publishNow = true) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  await page.locator('#rev-decision-reason').fill(`${TAG} approved by the independent reviewer.`);
  const box = page.locator('#rev-approve-publish');
  if ((await box.isChecked()) !== publishNow) await box.click();
  await page.getByRole('button', { name: 'Approve assessment' }).click();
  await expect(page.getByText(/The assessment was approved/).first()).toBeVisible({ timeout: 45_000 });
}



type RiskState = { residual_rating: string | null; driving_assessment_id: string | null; effective_from: string; updated_at: string } | undefined;
const riskState = async (domain = 'AML_CFT'): Promise<RiskState> =>
  ((await restSelect(SUPERVISOR, `entity_risk_state?entity_id=eq.${ENTITY_ID}&domain_code=eq.${domain}&select=residual_rating,driving_assessment_id,effective_from,updated_at`)).body as RiskState[])[0];
const riskRows = async () =>
  ((await restSelect(SUPERVISOR, `entity_risk_state?entity_id=eq.${ENTITY_ID}&domain_code=eq.AML_CFT&select=id`)).body as unknown[]).length;
const pubs = async (key: string) =>
  (await restSelect(SUPERVISOR, `supervisory_assessment_risk_publication?assessment_id=eq.${ids[key]}&select=id,approval_decision_id,published_rating,previous_rating,previous_assessment_id,effective_from,published_by,published_at,movement_id,reason`)).body as Array<Record<string, string>>;
const moveCount = async () =>
  ((await restSelect(SUPERVISOR, `entity_risk_state_movement?entity_id=eq.${ENTITY_ID}&domain_code=eq.AML_CFT&select=id`)).body as unknown[]).length;
const runCount = async (key: string) =>
  ((await restSelect(SUPERVISOR, `supervisory_assessment_calculation_run?assessment_id=eq.${ids[key]}&select=id`)).body as unknown[]).length;
const decision = async (key: string) =>
  ((await restSelect(SUPERVISOR, `supervisory_assessment_approval_decision?assessment_id=eq.${ids[key]}&select=id,final_rating,final_rating_source,calculation_run_id,calculation_result_hash,review_round_id,decided_at,effective_date`)).body as Array<Record<string, string>>)[0];
const life = async (key: string) =>
  ((await rpc(SUPERVISOR, 'supervisory_assessment_lifecycle_state', { _assessment_id: ids[key] })).body as { canonical_state: string }).canonical_state;
const asOf = async (at: string) =>
  (await rpc(SUPERVISOR, 'supervisory_entity_risk_as_of', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _at: at })).body as { provenance: string; rating: string | null; assessment_id?: string };
const anonRpc = async (fn: string, args: Record<string, unknown>) =>
  (await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(args) })).status;

async function publishInUi(page: Page, key: string) {
  await openAssessment(page, key, 'Review & decision');
  await page.locator('#rev-publish-reason').fill(`${TAG} publish ${key} ${RUN_TAG}.`);
  await page.getByRole('button', { name: 'Publish risk-of-record' }).click();
  await expect(page.getByText('The entity risk-of-record was published.').first()).toBeVisible({ timeout: 30_000 });
}


const SUPERVISOR_NAME = 'Certification - AML/CFT Supervision Supervisor';
type Action = { action: string; permitted: boolean; reason_code: string };
const pubAction = async (who: string, key: string) => {
  const r = await rpc(who, 'supervisory_assessment_lifecycle_state', { _assessment_id: ids[key] });
  if (!r.ok) return { refused: true, status: r.status } as const;
  const a = ((r.body as { actions: Action[] }).actions).find((x) => x.action === 'PUBLISH_RISK_OF_RECORD')!;
  return { refused: false, permitted: a.permitted, reason_code: a.reason_code, allowed: (r.body as { publication_allowed: boolean }).publication_allowed } as const;
};
const movement = async (id: string) =>
  ((await restSelect(SUPERVISOR, `entity_risk_state_movement?id=eq.${id}&select=id,entity_id,domain_code,previous_assessment_id,new_assessment_id,previous_rating,new_rating,trend`)).body as Array<Record<string, string>>)[0];
const ORD: Record<string, number> = { LOW: 1, MODERATE: 2, MEDIUM: 3, MEDIUM_HIGH: 4, HIGH: 5, VERY_HIGH: 6, SEVERE: 7, CRITICAL: 8 };

async function assignOwnerToSelf(page: Page, key: string) {
  await openAssessment(page, key, 'Review & decision');
  const card = page.getByTestId('aml-assignment-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('#asg-role').click();
  await page.getByRole('option', { name: 'Case owner' }).click();
  await card.locator('#asg-to').click();
  await page.getByRole('option', { name: new RegExp(SUPERVISOR_NAME) }).first().click();
  await card.locator('#asg-reason').fill(`${TAG} supervisor takes ownership (self-prepared case).`);
  await card.getByRole('button', { name: 'Reassign case owner' }).click();
  await expect(page.getByText('The case owner was reassigned.').first()).toBeVisible({ timeout: 20_000 });
}

const t: Record<string, string> = {};
const r: Record<string, string> = {};
let baseline: RiskState;

test.describe.serial('AML-CLOSE-07A publication contract and rating-change (browser success, API read-only/negative)', () => {
  test.setTimeout(600_000);

  test('F: lower-risk assessment calculated, approved and published in the browser', async ({ page }) => {
    baseline = await riskState();
    t.before = new Date().toISOString();
    await prepare(page, 'F', STANDARD, '12');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'F', 'Review & decision');
    await approveAssessment(page, false);
    const fresh = await pubAction(SUPERVISOR, 'F');
    expect(fresh).toMatchObject({ refused: false, permitted: true, reason_code: 'OK', allowed: true });
    expect(await pubAction(OFFICER, 'F')).toMatchObject({ permitted: false, reason_code: 'PERMISSION_MISSING' });
    await publishInUi(page, 'F');
    r.F = (await decision('F')).final_rating;
    expect((await riskState())).toMatchObject({ driving_assessment_id: ids.F, residual_rating: r.F });
    expect(await pubAction(SUPERVISOR, 'F')).toMatchObject({ permitted: false, reason_code: 'ALREADY_PUBLISHED' });
    t.afterF = new Date().toISOString();
  });

  test('G/H: different-rating successor G; earlier-approved H becomes stale; contract refuses before the RPC', async ({ page }) => {
    await prepare(page, 'H', STANDARD, '60');
    await submitForReview(page);
    await prepare(page, 'G', STANDARD, '60');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'H', 'Review & decision');
    await approveAssessment(page, false);
    await openAssessment(page, 'G', 'Review & decision');
    await approveAssessment(page, false);
    r.G = (await decision('G')).final_rating;
    expect(r.G).not.toBe(r.F);
    expect((await riskState())?.driving_assessment_id).toBe(ids.F); // approval alone changes nothing
    expect(await pubAction(SUPERVISOR, 'G')).toMatchObject({ permitted: true, reason_code: 'OK' });
    await publishInUi(page, 'G');
    t.afterG = new Date().toISOString();
    const pG = (await pubs('G'))[0];
    const m = await movement(pG.movement_id);
    const expected = ORD[r.G] > ORD[r.F] ? 'DETERIORATING' : 'IMPROVING';
    expect(m).toMatchObject({ entity_id: ENTITY_ID, domain_code: 'AML_CFT', previous_assessment_id: ids.F,
      new_assessment_id: ids.G, previous_rating: r.F, new_rating: r.G, trend: expected });
    expect(pG).toMatchObject({ previous_assessment_id: ids.F, previous_rating: r.F, published_rating: r.G });
    expect(await pubs('F')).toHaveLength(1);
    expect(await life('F')).toBe('SUPERSEDED');
    // stale H: the action contract refuses first, the UI does not enable Publish, the RPC still refuses
    expect(await pubAction(SUPERVISOR, 'H')).toMatchObject({ permitted: false, reason_code: 'STALE_PUBLICATION', allowed: false });
    await openAssessment(page, 'H', 'Review & decision');
    await page.locator('#rev-publish-reason').fill(`${TAG} stale attempt`).catch(() => undefined);
    const btnH = page.getByRole('button', { name: 'Publish risk-of-record' });
    if (await btnH.count()) await expect(btnH).toBeDisabled();
    await expect(page.getByText(/A later approved assessment is already the official risk-of-record/).first()).toBeVisible({ timeout: 20_000 });
    const stale = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.H, _reason: `${TAG} stale publish` });
    expect(stale.bodyText).toMatch(/stale_publication/);
    expect((await riskState())?.driving_assessment_id).toBe(ids.G);
    console.log('AML-CLOSE-07A movement', JSON.stringify(m));
  });

  test('S: self-owned case — Publish unavailable in contract and UI; RPC refuses', async ({ page }) => {
    await prepare(page, 'S', STANDARD, '60');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await assignOwnerToSelf(page, 'S');
    await openAssessment(page, 'S', 'Review & decision');
    await approveAssessment(page, false);
    expect(await pubAction(SUPERVISOR, 'S')).toMatchObject({ permitted: false, reason_code: 'MAKER_CHECKER', allowed: false });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openAssessment(page, 'S', 'Review & decision');
    const btn = page.getByRole('button', { name: 'Publish risk-of-record' });
    if (await btn.count()) await expect(btn).toBeDisabled();
    const self = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.S, _reason: `${TAG} self publish` });
    expect(self.bodyText).toMatch(/cannot publish it/);
    expect(await pubs('S')).toHaveLength(0);
    expect((await riskState())?.driving_assessment_id).toBe(ids.G);
  });

  test('ACTION MATRIX: officer, out-of-scope, licensee, signed-out', async () => {
    for (const k of ['G', 'H', 'S']) expect(await pubAction(OFFICER, k)).toMatchObject({ permitted: false });
    for (const who of [PRU, LICENSEE]) for (const k of ['G', 'H', 'S']) {
      const x = await pubAction(who, k);
      expect(x.refused || x.permitted === false).toBe(true);
    }
    expect(await anonRpc('supervisory_assessment_lifecycle_state', { _assessment_id: ids.S })).toBeGreaterThanOrEqual(400);
    expect(await anonRpc('supervisory_assessment_publication_eligibility_internal', { _assessment_id: ids.S, _uid: null })).toBeGreaterThanOrEqual(400);
    const direct = await rpc(SUPERVISOR, 'supervisory_assessment_publication_eligibility_internal', { _assessment_id: ids.S, _uid: null });
    expect(direct.ok).toBe(false);
  });

  test('AS-OF across the rating change (deterministic)', async () => {
    for (let i = 0; i < 3; i++) {
      const b = await asOf(t.before); const f = await asOf(t.afterF); const g = await asOf(t.afterG);
      expect(b.assessment_id ?? null).toBe(baseline?.driving_assessment_id ?? null);
      expect(f).toMatchObject({ provenance: 'GOVERNED_PUBLICATION', assessment_id: ids.F, rating: r.F });
      expect(g).toMatchObject({ provenance: 'GOVERNED_PUBLICATION', assessment_id: ids.G, rating: r.G });
    }
  });

  test('CONSUMERS show the new official rating', async ({ page }) => {
    const show = (x: unknown) => JSON.stringify(x);
    const panel = (await rpc(SUPERVISOR, 'aml_entity_panel', { _entity_id: ENTITY_ID })).body;
    const e360 = (await rpc(SUPERVISOR, 'entity_supervisory_360', { _entity_id: ENTITY_ID })).body;
    const port = (await rpc(SUPERVISOR, 'aml_portfolio_page', { _page: 1, _page_size: 25, _sort_key: 'name', _sort_direction: 'asc', _search: 'Virtual Asset Business Demo', _rating: null, _coverage: null, _sector: null })).body;
    const mon = (await rpc(SUPERVISOR, 'supervisory_monitoring_register', { _domain: 'AML_CFT', _regulator_id: null, _sector_id: null, _risk: null, _attention_state: null, _reassessment_state: null, _returns_state: null, _engagement_type: null, _open_finding: null, _overdue_remediation: null, _owner_id: null, _team_id: null, _search: 'Virtual Asset Business Demo', _sort_key: null, _sort_direction: null, _page: 1, _page_size: 25 })).body;
    console.log('AML-CLOSE-07A consumers', show({ panel, e360, port, mon }).slice(0, 6000));
    for (const x of [panel, e360, port, mon]) expect(show(x)).toContain(r.G);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'G', 'Review & decision');
    await expect(page.getByText(new RegExp(`Current published risk: .*${r.G.replace('_', '.')}`, 'i')).first()).toBeVisible({ timeout: 30_000 });
    console.log('AML-CLOSE-07A ids', JSON.stringify({ ids, t, r }));
  });
});
