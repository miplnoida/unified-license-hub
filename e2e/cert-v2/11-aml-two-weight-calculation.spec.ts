import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc } from './support/api';

/**
 * AML-CLOSE-04A — two differently weighted inherent factors contributing to one browser-calculated result
 * (TEST package v8: methodology AML_TECH_CERT_METHOD v11, settings fb0d058f).
 *
 * Browser journey on a NEW disposable assessment for the TEST-perimeter Virtual
 * Asset demo licensee, using the TEST-only package AML_TECH_CERT_POLICY. Two
 * inherent factors with different TEST weights contribute, one factor is not
 * applicable and excluded from the denominator. The server breakdown is
 * reconciled independently against the pinned TEST settings.
 *
 * All values are TEST ONLY technical certification values, never FSRA policy.
 */
const OFFICER = persona('aml_supervision_officer');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const PROTECTED = ['66cc17e3-f944-4b93-be22-8857565a1213'];
const TAG = 'TEST ONLY — AML-CLOSE-04 calculation certification; not FSRA policy.';

type Dim = { dimension_code: string; side: string; status: string; contribution: string; score: number | null; weight: number | null; weighted_contribution: number | null };
type Side = { numerator: number; denominator: number; unrounded: number; score: number; band: string };
type Trace = { dimensions: Dim[]; aggregation: { inherent: Side; control: Side; residual: { inherent_band: string; control_band: string; residual_rating: string }; rounding: { mode: string; decimals: number } } };

async function recordFact(page: Page, code: string, value: string, btn: RegExp = /^Record$/) {
  const card = page.locator('li', { hasText: code }).filter({ has: page.getByRole('button', { name: btn }) }).last();
  await card.getByRole('button', { name: btn }).click();
  const d = page.getByRole('dialog');
  const inputs = d.locator('input:not([type=date])');
  await inputs.nth(0).fill(value);
  await inputs.nth(1).fill(`TEST-AML-CLOSE-04-${code}`);
  await d.getByRole('button', { name: 'Record fact' }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
}

// Independent copy of the pinned TEST settings (config v1) — TEST ONLY values.
const TEST_BANDS = {
  INHERENT: [['LOW', 0, 20], ['MODERATE', 20, 40], ['MEDIUM_HIGH', 40, 60], ['HIGH', 60, 80], ['SEVERE', 80, 100]],
  CONTROL: [['WEAK', 0, 40], ['NEEDS_IMPROVEMENT', 40, 60], ['SATISFACTORY', 60, 80], ['STRONG', 80, 100]],
} as const;
const TEST_MATRIX: Record<string, string> = {
  'LOW|STRONG': 'LOW', 'MODERATE|STRONG': 'LOW', 'MEDIUM_HIGH|STRONG': 'MODERATE', 'HIGH|STRONG': 'MEDIUM_HIGH', 'SEVERE|STRONG': 'HIGH',
  'LOW|SATISFACTORY': 'LOW', 'MODERATE|SATISFACTORY': 'MODERATE', 'MEDIUM_HIGH|SATISFACTORY': 'MEDIUM_HIGH', 'HIGH|SATISFACTORY': 'HIGH', 'SEVERE|SATISFACTORY': 'SEVERE',
};
const run = async (id: string) => {
  const r = await rpc(OFFICER, 'supervisory_assessment_calculation_run_record', { _assessment_id: id, _event_reason: 'MANUAL_RUN' });
  expect(r.ok, r.bodyText.slice(0, 300)).toBeTruthy();
  const res = (r.body as { result: Trace & { engine_version?: string; status?: string } }).result;
  return { ...res, trace: res };
};
const halfUp = (x: number, d: number) => Math.round(x * 10 ** d + Number.EPSILON) / 10 ** d;
function band(score: number, bands: ReadonlyArray<readonly [string, number, number]>) {
  return bands.find(([, lo, hi]) => score >= lo && (score < hi || hi === 100))?.[0];
}

test.describe.serial('AML-CLOSE-04A two-weight calculation (TEST package)', () => {
  let id = '';
  test.beforeAll(async () => {
    const elig = await rpc(OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT' });
    test.skip(!(elig.body as { allowed?: boolean })?.allowed, `TEST perimeter not available: ${elig.bodyText}`);
  });

  test('browser: two weighted inherent factors both included; result survives reload', async ({ page }) => {
    test.setTimeout(240_000);
    expect(await loginAs(page, OFFICER)).not.toBe('/login');
    await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
    await page.locator('#aml-entity-pick').click();
    await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click();
    await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
    const opt = page.getByRole('option').filter({ hasText: /periodic/i }).first();
    test.skip(!(await opt.isVisible().catch(() => false)), 'No selectable periodic programme (TEST package retired)');
    await opt.click();
    await expect(page.getByText(/AML_TECH_CERT_METHOD v11/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    const d = page.getByRole('dialog');
    for (const ta of await d.locator('textarea').all()) await ta.fill(TAG);
    await d.getByRole('button', { name: 'Create assessment' }).click();
    await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
    id = page.url().split('/').pop()!.split('?')[0];
    expect(PROTECTED).not.toContain(id);

    await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
    await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
    await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '60'); // TEST: >=50 makes factor B material
    await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT"]')).toHaveAttribute('data-outcome', 'INCLUDED', { timeout: 30_000 });
    await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT_B"]')).toHaveAttribute('data-outcome', 'INCLUDED', { timeout: 30_000 });

    const plan: Array<[RegExp, RegExp]> = [
      [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
      [/^AML_TECH_CERT_INHERENT_B weight/, /^Yes$/i],
      [/^TEST ONLY control dimension weight/, /^Yes$/i],
    ];
    for (const [dim, answer] of plan) {
      const head = page.getByRole('button', { name: dim });
      if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
      const region = page.locator(`[role="region"][aria-labelledby="${await head.getAttribute('id')}"]`);
      const trigs = region.locator('button[id^="resp-"]');
      await expect(trigs.first()).toBeVisible({ timeout: 20_000 });
      for (let i = 0; i < await trigs.count(); i++) {
        const trig = trigs.nth(i);
        const qid = (await trig.getAttribute('id'))!.slice(5);
        await trig.click();
        await page.getByRole('option', { name: answer }).first().click();
        await page.locator(`#obs-${qid}`).fill('TEST ONLY observation — AML-CLOSE-04A');
        const card = page.locator('div').filter({ has: page.locator(`#resp-${qid}`) }).filter({ has: page.getByRole('button', { name: 'Save response' }) }).last();
        const save = (await card.getByRole('button', { name: 'Save response' }).first().elementHandle())!;
        await save.click();
        await page.waitForFunction((b) => b.textContent?.trim() === 'Save response', save, { timeout: 20_000 });
        await page.waitForTimeout(800);
      }
    }
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await page.getByRole('button', { name: 'Recalculate' }).click();
    const A = page.getByTestId('calc-factor-AML_TECH_CERT_INHERENT');
    const B = page.getByTestId('calc-factor-AML_TECH_CERT_INHERENT_B');
    await expect(A).toHaveAttribute('data-contribution', 'INCLUDED', { timeout: 45_000 });
    await expect(B).toHaveAttribute('data-contribution', 'INCLUDED');
    await expect(page.getByTestId('calc-factor-AML_TECH_CERT_INHERENT_C')).toHaveAttribute('data-contribution', 'EXCLUDED_FROM_DENOMINATOR');
    const shown = async () => ({
      a: await A.innerText(), b: await B.innerText(),
      inh: await page.getByTestId('calc-agg-inherent').innerText(),
      ctl: await page.getByTestId('calc-agg-control').innerText(),
      res: await page.getByTestId('calc-agg-residual').innerText(),
    });
    const first = await shown();
    console.log('AML-CLOSE-04A browser', JSON.stringify({ id, ...first }));
    await page.screenshot({ path: '/tmp/e2e-artifacts/aml-close-04a-two-weight.png' });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(A).toHaveAttribute('data-contribution', 'INCLUDED', { timeout: 45_000 });
    expect(await shown()).toEqual(first);
  });

  test('independent two-weight reconciliation equals the server result exactly', async () => {
    test.skip(!id, 'assessment not created');
    const res = await run(id);
    expect(res.status).toBe('CALCULATED');
    const t = res.trace;
    const inh = t.dimensions.filter((x) => x.side === 'INHERENT' && x.contribution === 'INCLUDED');
    expect(inh.map((x) => x.dimension_code).sort()).toEqual(['AML_TECH_CERT_INHERENT', 'AML_TECH_CERT_INHERENT_B']);
    const w = inh.map((x) => Number(x.weight));
    expect(new Set(w).size, 'different non-zero TEST weights').toBe(2);
    expect(w.every((x) => x > 0)).toBe(true);
    const num = inh.reduce((s, x) => s + Number(x.score) * Number(x.weight), 0);
    const den = inh.reduce((s, x) => s + Number(x.weight), 0);
    for (const x of inh) expect(Number(x.weighted_contribution)).toBeCloseTo(Number(x.score) * Number(x.weight), 6);
    const inherent = halfUp(num / den, 2);
    expect(Number(t.aggregation.inherent.numerator)).toBeCloseTo(num, 6);
    expect(Number(t.aggregation.inherent.denominator)).toBe(den);
    expect(Number(t.aggregation.inherent.score)).toBe(inherent);
    expect(t.aggregation.inherent.band).toBe(band(inherent, TEST_BANDS.INHERENT));
    const ctl = Number(t.aggregation.control.score);
    expect(t.aggregation.control.band).toBe(band(ctl, TEST_BANDS.CONTROL));
    expect(t.aggregation.residual.residual_rating).toBe(TEST_MATRIX[`${t.aggregation.inherent.band}|${t.aggregation.control.band}`]);
    console.log('AML-CLOSE-04A reconciliation', JSON.stringify({ id, factors: inh.map((x) => [x.dimension_code, x.score, x.weight, x.weighted_contribution]), num, den, inherent, inherentBand: t.aggregation.inherent.band, ctl, controlBand: t.aggregation.control.band, residual: t.aggregation.residual.residual_rating }));
  });
});
