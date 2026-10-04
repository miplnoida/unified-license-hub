import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc } from './support/api';

/**
 * AML-CLOSE-03A — complete browser journey for risk-factor applicability and
 * materiality, plus the missing-information fail-closed proof.
 *
 * Writes ONLY to a new, disposable assessment on the TEST-perimeter Virtual
 * Asset demo licensee, created through the New assessment dialog. Requires the
 * TEST-only package AML_TECH_CERT_POLICY to be ACTIVE for that sector; when it
 * is not (it is retired between certification runs), the journey is skipped
 * with an explicit reason rather than reported as passed.
 *
 * All values are TEST-only technical certification values, never FSRA policy.
 */
const OFFICER = persona('aml_supervision_officer');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const PROTECTED = ['66cc17e3-f944-4b93-be22-8857565a1213'];

type Factor = { dimension_code: string; outcome: string; applicability_status: string; materiality_status: string };

async function factorRows(page: Page): Promise<Record<string, string>> {
  const panel = page.getByTestId('aml-factor-authority');
  await expect(panel.locator('tr[data-factor]').first()).toBeVisible({ timeout: 45_000 });
  const rows = await panel.locator('tr[data-factor]').all();
  const out: Record<string, string> = {};
  for (const r of rows) out[(await r.getAttribute('data-factor'))!] = (await r.getAttribute('data-outcome'))!;
  return out;
}

async function recordFact(page: Page, code: string, value: string) {
  const card = page.locator('li', { hasText: code }).filter({ has: page.getByRole('button', { name: /^Record$/ }) }).last();
  await card.getByRole('button', { name: /^Record$/ }).click();
  const d = page.getByRole('dialog');
  const inputs = d.locator('input:not([type=date])');
  await inputs.nth(0).fill(value);
  await inputs.nth(1).fill(`TEST-AML-CLOSE-03A-${code}`);
  await d.getByRole('button', { name: 'Record fact' }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
}

test.describe.serial('AML-CLOSE-03A browser journey (TEST package)', () => {
  let assessmentId = '';

  test.beforeAll(async () => {
    const elig = await rpc(OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT' });
    test.skip(!(elig.body as { allowed?: boolean })?.allowed, `TEST perimeter not available: ${elig.bodyText}`);
  });

  test('create assessment through the dialog; policy, methodology and settings resolve', async ({ page }) => {
    expect(await loginAs(page, OFFICER)).not.toBe('/login');
    await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
    await page.locator('#aml-entity-pick').click();
    await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click();
    await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
    const opt = page.getByRole('option').filter({ hasText: /periodic/i }).first();
    test.skip(!(await opt.isVisible().catch(() => false)), 'No selectable periodic programme (TEST package retired)');
    await opt.click();
    await expect(page.getByText(/AML_TECH_CERT_METHOD v\d+/)).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    const d = page.getByRole('dialog');
    for (const ta of await d.locator('textarea').all()) await ta.fill('TEST ONLY — AML-CLOSE-03A browser certification; not FSRA policy.');
    await d.getByRole('button', { name: 'Create assessment' }).click();
    await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
    assessmentId = page.url().split('/').pop()!.split('?')[0];
    expect(PROTECTED).not.toContain(assessmentId);
  });

  test('missing facts fail closed; recording them refreshes the factor decision automatically', async ({ page }) => {
    test.skip(!assessmentId, 'assessment not created');
    await loginAs(page, OFFICER);
    await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });

    const before = await factorRows(page);
    expect(before.AML_TECH_CERT_INHERENT).toBe('PENDING_INFORMATION');
    expect(before.AML_TECH_CERT_INHERENT_B).toBe('PENDING_INFORMATION');
    expect(before.AML_TECH_CERT_INHERENT_C).toBe('NOT_APPLICABLE');
    await expect(page.getByTestId('aml-factor-authority')).toContainText('Missing: AML_TECH_CERT_HAS_FLAG');

    // Fail-closed at the server: submission is refused while information is pending.
    const sub = await rpc(OFFICER, 'supervisory_assessment_submit_for_review', { _assessment_id: assessmentId });
    expect(sub.ok, 'submission must be refused while factor information is pending').toBeFalsy();

    await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
    // Applicability resolves automatically; the factor stays pending only on its materiality fact.
    await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT"]')).toContainText('meets the applicability condition', { timeout: 30_000 });
    await expect(page.locator('tr[data-factor="AML_TECH_CERT_INHERENT"]')).toContainText('Missing: AML_TECH_CERT_STR_COUNT');
    await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '12');
    await expect.poll(async () => (await factorRows(page)).AML_TECH_CERT_INHERENT_B, { timeout: 30_000 }).toBe('EXCLUDED_NOT_MATERIAL');

    const after = await factorRows(page);
    expect(after).toMatchObject({
      AML_TECH_CERT_INHERENT: 'INCLUDED',
      AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL',
      AML_TECH_CERT_INHERENT_C: 'NOT_APPLICABLE',
      AML_TECH_CERT_CONTROL: 'INCLUDED',
    });
    await expect(page.getByTestId('aml-factor-authority')).not.toContainText('waiting for information');
  });

  test('answer questions, calculate, reload: same result', async ({ page }) => {
    test.skip(!assessmentId, 'assessment not created');
    await loginAs(page, OFFICER);
    await page.goto(`/supervision/aml/assessments/${assessmentId}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });

    // Answer each applicable dimension's questions in the working file (accordions open one at a time).
    const plan: Array<[RegExp, RegExp]> = [
      [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
      [/^AML_TECH_CERT_INHERENT_B weight/, /^Yes$/i],
      [/^TEST ONLY control dimension weight/, /^Yes$/i],
    ];
    let answered = 0;
    for (const [dim, answer] of plan) {
      const head = page.getByRole('button', { name: dim });
      if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
      const region = page.locator('[role="region"]', { has: page.locator('button[id^="resp-"]') }).filter({ visible: true }).last();
      const trigs = region.locator('button[id^="resp-"]');
      await expect(trigs.first()).toBeVisible({ timeout: 20_000 });
      for (let i = 0; i < await trigs.count(); i++) {
        const trig = trigs.nth(i);
        const qid = (await trig.getAttribute('id'))!.slice(5);
        await trig.click();
        await page.getByRole('option', { name: answer }).first().click();
        await page.locator(`#obs-${qid}`).fill('TEST ONLY observation — AML-CLOSE-03A');
        const save = trig.locator('xpath=ancestor::div[.//button[normalize-space()="Save response"]][1]').getByRole('button', { name: 'Save response' });
        await save.click();
        await expect(save).toHaveText('Save response', { timeout: 20_000 });
        answered++;
      }
    }
    expect(answered, 'questions answered through the working file').toBeGreaterThan(0);

    await page.getByRole('tab', { name: 'Calculation' }).click();
    await page.getByRole('button', { name: 'Recalculate' }).click();
    const result = page.locator('[role="tabpanel"]', { hasText: 'Calculation / risk result' });
    await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
    const first = await result.innerText();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(result).toContainText(/MODERATE/i, { timeout: 45_000 });
    expect(await factorRows(page)).toMatchObject({ AML_TECH_CERT_INHERENT_B: 'EXCLUDED_NOT_MATERIAL' });

    const fa = await rpc(OFFICER, 'supervisory_assessment_factor_authority', { _assessment_id: assessmentId });
    const body = fa.body as { latest_run: { status: string; engine_version: string; matches_current_evaluation: boolean }; evaluation: { factors: Factor[] } };
    expect(body.latest_run.status).toBe('CALCULATED');
    expect(body.latest_run.engine_version).toBe('AML06.2');
    expect(body.latest_run.matches_current_evaluation).toBe(true);
    expect(first.length).toBeGreaterThan(0);
  });
});

test.describe('AML-CLOSE-03A security proofs for new routines', () => {
  const A = '8f6e487f-68c1-4038-b3e2-693a2d91a360';
  const URL_BASE = process.env.VITE_SUPABASE_URL as string;
  const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const anon = (fn: string, body: unknown) => fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  test('factor authority: out-of-scope personas and anonymous are refused', async () => {
    for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
      const r = await rpc(persona(p), 'supervisory_assessment_factor_authority', { _assessment_id: A });
      expect(r.ok, `${p} must be refused`).toBeFalsy();
    }
    expect((await anon('supervisory_assessment_factor_authority', { _assessment_id: A })).status).toBe(401);
  });

  test('applicability set: only configuration managers, only on drafts; anonymous refused', async () => {
    const C1 = '18ca681c-cc57-44b3-9d85-276b0b930d8c';
    for (const p of ['complaints_officer', 'licensee_primary_user', 'read_only']) {
      const r = await rpc(persona(p), 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
      expect(r.ok, `${p} must be refused`).toBeFalsy();
    }
    const r = await rpc(OFFICER, 'supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] });
    expect(r.ok).toBeFalsy();
    expect(r.bodyText).toMatch(/only be edited while the configuration is a draft/);
    expect((await anon('supervisory_calculation_applicability_set', { _config_id: C1, _rows: [] })).status).toBe(401);
  });

  test('internal readiness routine is not callable directly', async () => {
    const r = await rpc(persona('complaints_officer'), 'supervisory_assessment_readiness_internal', { _assessment_id: A });
    expect(r.ok).toBeFalsy();
    expect(r.bodyText).toMatch(/permission denied/);
  });
});
