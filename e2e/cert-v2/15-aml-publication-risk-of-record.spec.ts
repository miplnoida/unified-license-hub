import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restPatch, restSelect, restInsert } from './support/api';
import { readAmlFixture, recordFixtureAssessment } from './support/amlFixture';

/**
 * AML-CLOSE-07 — publication, effective risk-of-record and historical risk truth.
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
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-07.';
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
async function prepare(page: Page, key: string, plan: Answer[] = STANDARD) {
  await as(page, OFFICER);
  await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
  await page.locator('#aml-entity-pick').click();
  await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click();
  await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
  await page.getByRole('option').filter({ hasText: /periodic/i }).first().click();
  await expect(page.getByText(/AML_TECH_CERT_METHOD v11/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  const d = page.getByRole('dialog');
  for (const ta of await d.locator('textarea').all()) await ta.fill(`${TAG} Journey ${key} ${RUN_TAG}`);
  await d.getByRole('button', { name: 'Create assessment' }).click();
  await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ids[key] = page.url().split('/').pop()!.split('?')[0];
  recordFixtureAssessment(`S15-${key}`, ids[key]);
  await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
  await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
  await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '60');
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

const t: Record<string, string> = {};
let baseline: RiskState; let pruBefore: RiskState; let moves0 = 0;

test.describe.serial('AML-CLOSE-07 publication and risk-of-record (browser success paths)', () => {
  test.setTimeout(600_000);

  test('A: approve WITHOUT publication leaves official risk unchanged', async ({ page }) => {
    baseline = await riskState(); pruBefore = await riskState('PRUDENTIAL'); moves0 = await moveCount();
    t.before = new Date().toISOString();
    await prepare(page, 'A');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'A', 'Review & decision');
    await approveAssessment(page, false);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openAssessment(page, 'A', 'Review & decision');
    await expect(page.getByText('Approved — not yet official risk-of-record').first()).toBeVisible({ timeout: 30_000 });
    expect(await life('A')).toBe('APPROVED_NOT_PUBLISHED');
    expect(await decision('A')).toBeTruthy();
    expect(await pubs('A')).toHaveLength(0);
    expect(await moveCount()).toBe(moves0);
    expect(await riskState()).toEqual(baseline);
  });

  test('B: authorised supervisor publishes A in the UI; history, lineage and reload stable', async ({ page }) => {
    const runs = await runCount('A');
    await as(page, SUPERVISOR);
    await publishInUi(page, 'A');
    await page.reload({ waitUntil: 'domcontentloaded' });
    const d = await decision('A'); const p = await pubs('A'); const s = await riskState();
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ approval_decision_id: d.id, published_rating: d.final_rating,
      previous_rating: baseline?.residual_rating ?? null, previous_assessment_id: baseline?.driving_assessment_id ?? null });
    expect(s).toMatchObject({ driving_assessment_id: ids.A, residual_rating: d.final_rating });
    expect(await riskRows()).toBe(1);
    expect(await moveCount()).toBe(moves0 + 1);
    expect(await runCount('A')).toBe(runs); // publication never recalculates
    expect(await life('A')).toBe('APPROVED');
    t.afterA = new Date().toISOString();
    const lin = (await rpc(SUPERVISOR, 'supervisory_assessment_risk_lineage', { _assessment_id: ids.A })).body;
    expect(JSON.stringify(lin)).toContain(d.calculation_result_hash);
    expect(JSON.stringify(lin)).toContain(p[0].id);
  });

  test('C: later assessments B (stale candidate C) — approval alone changes nothing; publish B; stale C refused', async ({ page }) => {
    await prepare(page, 'C');
    await submitForReview(page);
    await prepare(page, 'B', ALT);
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'C', 'Review & decision');
    await approveAssessment(page, false);
    await openAssessment(page, 'B', 'Review & decision');
    await approveAssessment(page, false);
    expect((await riskState())?.driving_assessment_id).toBe(ids.A);
    await publishInUi(page, 'B');
    const dB = await decision('B'); const s = await riskState(); const pB = await pubs('B');
    expect(s).toMatchObject({ driving_assessment_id: ids.B, residual_rating: dB.final_rating });
    expect(pB[0]).toMatchObject({ previous_assessment_id: ids.A });
    expect(await riskRows()).toBe(1);
    // A's publication is untouched and A is no longer driving risk
    const pA = await pubs('A');
    expect(pA).toHaveLength(1);
    expect(await life('A')).toBe('SUPERSEDED');
    t.afterB = new Date().toISOString();
    // stale: C was approved before B but is older than the official B
    const stale = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.C, _reason: `${TAG} stale publish` });
    expect(stale.bodyText).toMatch(/stale_publication/);
    expect((await riskState())?.driving_assessment_id).toBe(ids.B);
    expect(await pubs('C')).toHaveLength(0);
  });

  test('E: future/backdated effect refused; concurrent publication creates exactly one record', async ({ page }) => {
    await prepare(page, 'E');
    await submitForReview(page);
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    for (const eff of [day(30), day(-30)]) {
      const r = await rpc(SUPERVISOR, 'supervisory_assessment_approve', { _assessment_id: ids.E, _rationale: `${TAG} dated approval`, _effective_date: eff, _publish: false });
      expect(r.bodyText).toMatch(/effective_date_refused/);
    }
    expect(await decision('E')).toBeUndefined();
    await as(page, SUPERVISOR);
    await openAssessment(page, 'E', 'Review & decision');
    await approveAssessment(page, false);
    const m = await moveCount();
    const many = await Promise.all([1, 2, 3, 4].map(() => rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.E, _reason: `${TAG} concurrent publish` })));
    const firsts = many.filter((r) => r.ok && (r.body as { already_published: boolean }).already_published === false);
    expect(firsts).toHaveLength(1);
    expect(await pubs('E')).toHaveLength(1);
    expect(await moveCount()).toBe(m + 1);
    const again = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.E, _reason: `${TAG} retry` });
    expect(JSON.stringify(again.body)).toMatch(/already_published|only an approved/);
    expect(await moveCount()).toBe(m + 1);
    expect(await riskRows()).toBe(1);
    t.afterE = new Date().toISOString();
  });

  test('AS-OF: deterministic historical risk truth', async () => {
    for (let i = 0; i < 2; i++) {
      const b = await asOf(t.before); const a = await asOf(t.afterA); const bb = await asOf(t.afterB); const e = await asOf(t.afterE);
      expect(b.assessment_id ?? null).toBe(baseline?.driving_assessment_id ?? null);
      expect(a).toMatchObject({ provenance: 'GOVERNED_PUBLICATION', assessment_id: ids.A });
      expect(bb).toMatchObject({ provenance: 'GOVERNED_PUBLICATION', assessment_id: ids.B });
      expect(e).toMatchObject({ provenance: 'GOVERNED_PUBLICATION', assessment_id: ids.E });
    }
  });

  test('D NEGATIVE: preparer, officer, out-of-scope, licensee, anon cannot publish; direct writes refused', async () => {
    const before = await pubs('C');
    for (const who of [OFFICER, PRU, LICENSEE]) {
      const r = await rpc(who, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.C, _reason: `${TAG} denied` });
      expect(r.ok).toBe(false);
    }
    expect(await anonRpc('supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.C, _reason: 'anon attempt' })).toBeGreaterThanOrEqual(400);
    expect(await anonRpc('supervisory_entity_risk_as_of', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _at: t.afterE })).toBeGreaterThanOrEqual(400);
    for (const who of [PRU, LICENSEE, OFFICER]) {
      const r = await rpc(who, 'supervisory_entity_risk_as_of', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT', _at: t.afterE });
      if (who !== OFFICER) expect(r.ok).toBe(false);
    }
    // forged entity argument does not exist on the governed command
    const forged = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: ids.C, _reason: `${TAG} forged`, _entity_id: '00000000-0000-0000-0000-000000000001' });
    expect(forged.ok).toBe(false);
    // a draft cannot publish
    const draft = await rpc(SUPERVISOR, 'supervisory_assessment_publish_risk_of_record', { _assessment_id: '5b5b930c-6f5d-4dec-9117-e8affd1439dc', _reason: `${TAG} draft` });
    expect(draft.bodyText).toMatch(/only an approved assessment/);
    expect(await pubs('C')).toEqual(before);
    // direct writes
    const p = (await pubs('E'))[0];
    for (const body of [{ published_rating: 'LOW' }, { entity_id: ENTITY_ID }, { effective_from: '2020-01-01' }, { published_by: null }, { reason: 'edited' }, { movement_id: null }]) {
      const r = await restPatch(SUPERVISOR, `supervisory_assessment_risk_publication?id=eq.${p.id}`, body);
      expect(r.ok && Array.isArray(r.body) && (r.body as unknown[]).length > 0).toBe(false);
    }
    for (const [tbl, body] of [['entity_risk_state', { residual_rating: 'LOW' }], ['entity_risk_state_movement', { new_rating: 'LOW' }]] as const) {
      const r = await restPatch(SUPERVISOR, `${tbl}?entity_id=eq.${ENTITY_ID}`, body);
      expect(r.ok && Array.isArray(r.body) && (r.body as unknown[]).length > 0).toBe(false);
    }
    for (const body of [{ risk_publication_id: null }, { risk_published_at: null }]) {
      const r = await restPatch(SUPERVISOR, `supervisory_assessment?id=eq.${ids.E}`, body);
      expect(r.ok && Array.isArray(r.body) && (r.body as unknown[]).length > 0).toBe(false);
    }
    for (const tbl of ['supervisory_assessment_risk_publication', 'entity_risk_state', 'entity_risk_state_movement']) {
      const r = await restInsert(SUPERVISOR, tbl, { entity_id: ENTITY_ID, domain_code: 'AML_CFT' });
      expect(r.ok).toBe(false);
      const del = await fetch(`${URL_BASE}/rest/v1/${tbl}?entity_id=eq.${ENTITY_ID}`, { method: 'DELETE', headers: { apikey: ANON, Authorization: `Bearer ${await (await import('./support/api')).accessToken(SUPERVISOR)}`, Prefer: 'return=representation' } });
      const txt = await del.text();
      expect(del.ok && txt.length > 2).toBe(false);
    }
    expect(await pubs('E')).toEqual([p]);
    expect(await riskState('PRUDENTIAL')).toEqual(pruBefore);
    // out-of-scope supervisor cannot read this entity's official risk directly
    const pruRead = (await restSelect(PRU, `entity_risk_state?entity_id=eq.${ENTITY_ID}&select=id`)).body as unknown[];
    expect(pruRead).toHaveLength(0);
    const licRead = (await restSelect(LICENSEE, `supervisory_assessment_risk_publication?entity_id=eq.${ENTITY_ID}&select=id`)).body as unknown[];
    expect(Array.isArray(licRead) ? licRead.length : 0).toBe(0);
  });

  test('protected assessments untouched', async () => {
    const r = (await restSelect(SUPERVISOR, `supervisory_assessment?reference=in.(${PROTECTED.join(',')})&select=reference,status,updated_at`)).body as Array<{ updated_at: string }>;
    expect(r).toHaveLength(3);
    for (const x of r) expect(new Date(x.updated_at).getTime()).toBeLessThan(Date.now() - 3_600_000);
    console.log('AML-CLOSE-07 ids', JSON.stringify({ ids, t }));
  });
});
