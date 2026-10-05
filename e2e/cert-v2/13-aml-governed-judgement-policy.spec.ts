import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restPatch, restSelect, isDenied } from './support/api';
import { readAmlFixture, recordFixtureAssessment } from './support/amlFixture';

/**
 * AML-CLOSE-05A — governed TEST judgement policy (upward only, one step, rationale ≥ 40) enforced in the browser.
 *
 * Every successful step is a normal browser action: the TEST policy package version
 * is created and approved in the configuration screens, and assessments are created,
 * filled in, calculated, overridden, submitted and approved in the assessment screens.
 * Direct calls are used ONLY for read-only checks and refused-bypass tests.
 *
 * All values are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.
 */
const OFFICER = persona('aml_supervision_officer');
const SUPERVISOR = persona('aml_supervision_supervisor');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const PROTECTED = ['SUP-AML_CFT-2026-00830', 'SUP-AML_CFT-2026-00836', 'SUP-AML_CFT-2026-00838'];
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-05A.';
const RUN_TAG = readAmlFixture()?.runTag ?? `${Date.now()}`;

type Answer = [RegExp, RegExp];
const STANDARD: Answer[] = [
  [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
  [/^AML_TECH_CERT_INHERENT_B weight/, /^No$/i],
  [/^TEST ONLY control dimension weight/, /^Yes$/i],
];

const ids: Record<string, string> = {};

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
  for (const ta of await d.locator('textarea').all()) await ta.fill(`${TAG} Journey 05A-${key} ${RUN_TAG}`);
  await d.getByRole('button', { name: 'Create assessment' }).click();
  await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ids[key] = page.url().split('/').pop()!.split('?')[0];
  recordFixtureAssessment(`J${key}`, ids[key]);
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

async function approveAssessment(page: Page) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  await page.locator('#rev-decision-reason').fill(`${TAG} approved by the independent reviewer.`);
  await page.getByRole('button', { name: 'Approve assessment' }).click();
  await expect(page.getByText(/The assessment was approved/).first()).toBeVisible({ timeout: 45_000 });
}

const view = async (key: string) =>
  (await rpc(OFFICER, 'supervisory_assessment_calculation_view', { _assessment_id: ids[key] })).body as {
    latest_run: { id: string; run_seq: number; residual_rating: string; result_hash: string; status: string };
    runs: Array<{ id: string; run_seq: number; result_hash: string; residual_rating: string }>;
    overrides: Array<{ id: string; run_id: string; status: string; proposed_rating: string; proposed_by: string;
      decided_by: string | null; rationale: string; computed_residual_rating: string; computed_result_hash: string }>;
  };
const assessmentRow = async (key: string) => {
  const r = await restSelect(OFFICER, `supervisory_assessment?id=eq.${ids[key]}&select=reference,status,residual_rating,approved_rating,approved_rating_source,approval_decision_id`);
  return (r.body as Array<Record<string, string>>)[0];
};


const SHORT = 'TEST ONLY short reason.'; // 23 characters: above the platform 10, below the TEST policy 40
const LONG = `${TAG} Upward judgement within one step — TEST scenario only.`;

async function attempt(page: Page, rating: string, rationale: string, expected: RegExp) {
  await page.getByRole('tab', { name: 'Calculation' }).click();
  await page.locator('#calc-override-rating').click();
  await page.getByRole('option', { name: new RegExp(`^${rating}( —|$)`) }).click();
  await page.locator('#calc-override-rationale').fill(rationale);
  await page.getByRole('button', { name: 'Propose override' }).click();
  await expect(page.getByText(expected).first()).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('AML-CLOSE-05A governed judgement policy (browser-only)', () => {
  const fx = readAmlFixture();
  test.beforeAll(async () => {
    test.skip(!fx, 'AML run fixture missing — run with --project=aml');
  });

  test('A browser: policy shown; short rationale refused; one-step upward override allowed, independently approved, final HIGH', async ({ page }) => {
    test.setTimeout(360_000);
    await prepare(page, 'A');
    const panel = page.getByTestId('judgement-policy-panel');
    await expect(panel).toHaveAttribute('data-status', 'EVALUATED', { timeout: 30_000 });
    await expect(page.getByTestId('judgement-policy')).toContainText(fx!.judgementCode);
    await expect(page.getByTestId('judgement-profile')).toContainText(fx!.profileVersion);
    await expect(panel.locator('[data-target="HIGH"]')).toHaveAttribute('data-permitted', 'true');
    await expect(panel.locator('[data-target="SEVERE"]')).toHaveAttribute('data-permitted', 'false');
    await expect(panel.locator('[data-target="MODERATE"]')).toHaveAttribute('data-permitted', 'false');

    await attempt(page, 'HIGH', SHORT, /requires a longer written rationale/);
    expect((await view('A')).overrides).toHaveLength(0);

    await proposeOverride(page, 'HIGH', LONG);
    await expect(page.getByRole('button', { name: 'Approve override' })).toBeDisabled();

    await as(page, SUPERVISOR);
    await openAssessment(page, 'A', 'Calculation');
    await page.locator('#calc-override-note').fill(`${TAG} independently accepted within policy.`);
    await page.getByRole('button', { name: 'Approve override' }).click();
    await expect(page.getByText('Override approved.').first()).toBeVisible({ timeout: 20_000 });

    await as(page, OFFICER);
    await openAssessment(page, 'A', 'Review & decision');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'A', 'Review & decision');
    await approveAssessment(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Review & decision' }).click();
    await expect(page.getByTestId('review-judgement-difference')).toContainText('MEDIUM_HIGH (calculated) → HIGH (approved judgement)', { timeout: 30_000 });
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(page.getByTestId('calc-decision-rating')).toContainText('MEDIUM_HIGH');

    const o = (await view('A')).overrides[0] as unknown as Record<string, unknown>;
    expect(o.status).toBe('APPROVED');
    expect(o.policy_basis_status).toBe('EVALUATED');
    expect(o.judgement_policy_component_id).toBe(fx!.judgementComponentId);
    expect(o.judgement_policy_code).toBe(fx!.judgementCode);
    expect(o.judgement_direction).toBe('UPWARD');
    expect(o.judgement_max_band_steps).toBe(1);
    expect(o.judgement_rationale_min_length).toBe(40);
    const a = await assessmentRow('A');
    expect(a.approved_rating).toBe('HIGH');
    expect(a.approved_rating_source).toBe('APPROVED_OVERRIDE');
    const basis = await rpc(OFFICER, 'supervisory_assessment_policy_basis', { _assessment_id: ids.A });
    expect(JSON.stringify(basis.body)).toContain(fx!.profileId);
    expect(JSON.stringify(basis.body)).toContain(fx!.judgementComponentId);
    console.log('AML-CLOSE-05A A', JSON.stringify({ id: ids.A, ...a, override: { id: o.id, component: o.judgement_policy_component_id, code: o.judgement_policy_code, version: o.judgement_policy_version, profile: o.judgement_policy_profile_version, rule: o.judgement_rule_code } }));
  });

  test('B browser: wrong direction and too large a movement are refused; nothing recorded; calculation unchanged', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'B');
    const before = await view('B');
    await attempt(page, 'MODERATE', LONG, /does not allow the rating to move in that direction/);
    await attempt(page, 'SEVERE', LONG, /does not allow the rating to move that many steps/);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(page.getByTestId('calc-override-row')).toHaveCount(0);
    const after = await view('B');
    expect(after.overrides).toHaveLength(0);
    expect(after.runs.map((r) => [r.id, r.result_hash])).toEqual(before.runs.map((r) => [r.id, r.result_hash]));
    console.log('AML-CLOSE-05A B', JSON.stringify({ id: ids.B, run: after.latest_run.run_seq, residual: after.latest_run.residual_rating }));
  });

  test('NEGATIVE direct-call policy bypasses are refused', async () => {
    test.skip(!ids.B, 'journey B did not run');
    const out: Record<string, string> = {};
    const refuse = async (label: string, p: Promise<{ ok: boolean; bodyText: string; status: number }>, re?: RegExp) => {
      const r = await p;
      out[label] = `${r.status} ${r.bodyText.slice(0, 120)}`;
      expect(r.ok, `${label}: ${r.bodyText}`).toBe(false);
      if (re) expect(r.bodyText).toMatch(re);
    };
    const prop = (rating: string, rationale: string, who = SUPERVISOR) =>
      rpc(who, 'supervisory_calculation_override_propose', { _assessment_id: ids.B, _proposed_rating: rating, _rationale: rationale });
    await refuse('magnitude: two steps up', prop('SEVERE', LONG), /movement_refused/);
    await refuse('direction: one step down', prop('MODERATE', LONG), /direction_refused/);
    await refuse('direction: two steps down', prop('LOW', LONG), /direction_refused|movement_refused/);
    await refuse('rationale shorter than policy', prop('HIGH', SHORT), /rationale_required/);
    // The proposal command takes no policy argument: policy is resolved only from the pinned snapshot.
    await refuse('forged policy argument', rpc(SUPERVISOR, 'supervisory_calculation_override_propose', {
      _assessment_id: ids.B, _proposed_rating: 'SEVERE', _rationale: LONG, _judgement_policy_id: fx!.judgementComponentId }));
    await refuse('rewrite pinned snapshot', restPatch(SUPERVISOR, `supervisory_assessment_policy_snapshot?assessment_id=eq.${ids.B}`, { components: [] }).then(async (r) => {
      const b = await rpc(OFFICER, 'supervisory_assessment_policy_basis', { _assessment_id: ids.B });
      return { ...r, ok: r.ok && !JSON.stringify(b.body).includes(fx!.judgementComponentId) };
    }));
    await refuse('edit approved judgement component', restPatch(SUPERVISOR, `supervisory_policy_component?id=eq.${fx!.judgementComponentId}`, { content: { rules: [] } }).then(async (r) => {
      const c = await restSelect(SUPERVISOR, `supervisory_policy_component?id=eq.${fx!.judgementComponentId}&select=content`);
      return { ...r, ok: r.ok && !c.bodyText.includes('UPWARD') };
    }));
    await refuse('rebind component on an active package', rpc(OFFICER, 'supervisory_policy_profile_binding_set', {
      _profile_id: fx!.profileId, _payload: { component_type: 'JUDGEMENT_POLICY', component_id: fx!.judgementComponentId, rationale: `${TAG} rebind active package` } }));
    expect((await view('B')).overrides).toHaveLength(0);
    console.log('AML-CLOSE-05A NEGATIVE', JSON.stringify(out));
  });
});
