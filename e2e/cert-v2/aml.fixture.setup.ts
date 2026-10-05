import { test as setup, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { restSelect } from './support/api';
import { TEST_JUDGEMENT, TEST_PROFILE_TEMPLATE, TEST_TAG, writeAmlFixture, clearAmlFixture } from './support/amlFixture';

/**
 * AML-CLOSE-05A run fixture — created ENTIRELY through the configuration screens.
 * 1. AML officer authors a TEST judgement policy and submits it; self-approval is refused.
 * 2. AML supervisor approves it.
 * 3. AML officer creates a run-specific TEST package version, binds the judgement policy, submits.
 * 4. AML supervisor approves and activates the package.
 * Ids are written to a run file; teardown retires everything through the screens.
 */
const OFFICER = persona('aml_supervision_officer');
const SUPERVISOR = persona('aml_supervision_supervisor');

async function as(page: Page, who: string) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => undefined);
  expect(await loginAs(page, who)).not.toBe('/login');
}

async function componentStatus(id: string) {
  const r = await restSelect(SUPERVISOR, `supervisory_policy_component?id=eq.${id}&select=status`);
  return (r.body as Array<{ status: string }>)[0]?.status;
}

setup('AML TEST package with governed judgement policy (browser only)', async ({ page }) => {
  setup.setTimeout(300_000);
  clearAmlFixture();
  const runTag = process.env.AML_RUN_TAG ?? `${Date.now()}`;
  const code = `AML_TECH_CERT_JUDGEMENT_${runTag.slice(-8)}`;

  // 1. judgement policy draft
  await as(page, OFFICER);
  await page.goto('/admin/supervisory-policy-components', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New component version' }).click();
  await page.locator('#pc-type').click();
  await page.getByRole('option', { name: 'Judgement and override policy' }).click();
  await page.locator('#pc-domain').click();
  await page.getByRole('option', { name: /aml/i }).first().click();
  await page.locator('#pc-regulator').click();
  await page.getByRole('option', { name: 'FSRA', exact: true }).click();
  await page.locator('#pc-code').fill(code);
  await page.locator('#pc-version').fill('1.0');
  await page.locator('#pc-name').fill(`${TEST_TAG} — judgement ${runTag}`);
  await page.locator('#pc-purpose').fill(`${TEST_TAG}. Upward only, one step, rationale ≥ ${TEST_JUDGEMENT.minRationale} characters.`);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/supervisory-policy-components\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const judgementComponentId = page.url().split('/').pop()!.split('?')[0];

  await page.getByRole('button', { name: /^Add / }).click();
  await page.getByLabel('Rule reference 1').fill(`TEST-JU-${runTag.slice(-6)}`);
  await page.getByLabel('Permitted direction 1').click();
  await page.getByRole('option', { name: 'Upward', exact: true }).click();
  await page.getByLabel('Maximum steps 1').fill(String(TEST_JUDGEMENT.maxSteps));
  const allow = page.getByLabel('Override allowed 1');
  if ((await allow.getAttribute('aria-checked')) !== 'true') await allow.click();
  const reasonReq = page.getByLabel('Reason required 1');
  if ((await reasonReq.getAttribute('aria-checked')) !== 'true') await reasonReq.click();
  await page.getByLabel('Minimum reason length 1').fill(String(TEST_JUDGEMENT.minRationale));
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('The server accepts this configuration.')).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.locator('#pc-rationale').fill(`${TEST_TAG}. Submitted for independent approval.`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => componentStatus(judgementComponentId), { timeout: 20_000 }).toBe('SUBMITTED');

  // maker cannot approve own submission: either no Approve control, or a refusal
  await page.reload({ waitUntil: 'domcontentloaded' });
  const selfApprove = page.getByRole('button', { name: 'Approve', exact: true });
  if (await selfApprove.isVisible().catch(() => false)) {
    await selfApprove.click();
    await page.locator('#pc-rationale').fill(`${TEST_TAG}. Self-approval attempt.`);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText(/maker_checker|not_authorized|cannot approve/i).first()).toBeVisible({ timeout: 20_000 });
  }
  expect(await componentStatus(judgementComponentId)).toBe('SUBMITTED');

  // 2. independent approval
  await as(page, SUPERVISOR);
  await page.goto(`/admin/supervisory-policy-components/${judgementComponentId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.locator('#pc-rationale').fill(`${TEST_TAG}. Independently approved for certification only.`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(() => componentStatus(judgementComponentId), { timeout: 20_000 }).toBe('APPROVED');

  // 3. package version + binding
  await as(page, OFFICER);
  await page.goto(`/admin/supervisory-policy-profiles/${TEST_PROFILE_TEMPLATE}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New Version' }).click();
  const profileVersion = `10.${runTag.slice(-6)}`;
  await page.locator('#pp-new-version').fill(profileVersion);
  await page.locator('#pp-version-rationale').fill(`${TEST_TAG}. Run ${runTag} certification package.`);
  await page.getByRole('button', { name: 'Create version' }).click();
  await page.waitForURL((u) => /supervisory-policy-profiles\/[0-9a-f-]{36}/.test(u.pathname) && !u.pathname.endsWith(TEST_PROFILE_TEMPLATE), { timeout: 30_000 });
  const profileId = page.url().split('/').pop()!.split('?')[0];

  await page.getByRole('tab', { name: 'Components' }).click();
  const row = page.getByRole('row').filter({ hasText: 'Judgement and override policy' });
  await row.getByRole('button', { name: /^(Bind|Change)$/ }).click();
  await page.locator('#pp-component').click();
  await page.getByRole('option').filter({ hasText: code }).first().click();
  await page.locator('#pp-bind-rationale').fill(`${TEST_TAG}. Bind run judgement policy.`);
  await page.getByRole('button', { name: 'Bind version' }).click();
  await expect(row).toContainText(code, { timeout: 20_000 });

  await page.getByRole('button', { name: 'Submit for Review' }).click();
  await page.locator('#pp-review-rationale').fill(`${TEST_TAG}. Submitted for independent approval.`);
  await page.getByRole('button', { name: 'Submit for review' }).click();
  await expect(page.getByRole('button', { name: 'Approve Profile' })).toBeDisabled({ timeout: 20_000 });

  // 4. independent approval + activation
  await as(page, SUPERVISOR);
  await page.goto(`/admin/supervisory-policy-profiles/${profileId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Approve Profile' }).click();
  await page.locator('#pp-approve-rationale').fill(`${TEST_TAG}. Independently approved.`);
  await page.getByRole('button', { name: 'Record approval' }).click();
  await page.getByRole('button', { name: 'Activate' }).click({ timeout: 20_000 });
  await page.locator('#pp-activate-rationale').fill(`${TEST_TAG}. Activated for run ${runTag} only.`);
  await page.getByRole('button', { name: 'Activate profile' }).click();
  await expect.poll(async () => ((await restSelect(SUPERVISOR, `supervisory_policy_profile?id=eq.${profileId}&select=status`)).body as Array<{ status: string }>)[0]?.status, { timeout: 20_000 }).toBe('ACTIVE');

  writeAmlFixture({ runTag, profileId, profileVersion, judgementComponentId, judgementCode: code, judgementVersion: '1.0', assessments: {} });
  console.log('AML fixture', JSON.stringify({ runTag, profileId, profileVersion, judgementComponentId, code }));
});
