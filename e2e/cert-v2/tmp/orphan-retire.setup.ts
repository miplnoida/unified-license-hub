import { test, expect, type Page } from '@playwright/test';
import { loginAs } from '../support/auth';
import { persona } from '../support/personas';
import { restSelect } from '../support/api';
import { TEST_TAG } from '../support/amlFixture';
const SUP = persona('aml_supervision_supervisor');
test('retire orphaned TEST judgement components (browser)', async ({ page }) => {
  test.setTimeout(180_000);
  expect(await loginAs(page, SUP)).not.toBe('/login');
  for (const id of ['cf9fd721-2dad-416f-9cb8-a62cc14fb384', 'c0d3e427-7b7d-4080-88c6-9442b6d40331']) {
    await page.goto(`/admin/supervisory-policy-components/${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Retire', exact: true }).click();
    await page.locator('#pc-rationale').fill(`${TEST_TAG}. Orphan from interrupted run; TEST judgement policy retired.`);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => ((await restSelect(SUP, `supervisory_policy_component?id=eq.${id}&select=status`)).body as Array<{ status: string }>)[0]?.status, { timeout: 20_000 }).toBe('RETIRED');
  }
  await page.goto('/admin/supervisory-policy-profiles/28123d19-67ee-4f2c-bca0-bc8579fc64c1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const b = page.getByRole('button', { name: /^(Retire|Discard|Withdraw)/ });
  console.log('DRAFT profile actions', await page.getByRole('button').allInnerTexts());
  if (await b.count()) {
    await b.first().click();
    const r = page.locator('#pp-retire-rationale, textarea').first();
    await r.fill(`${TEST_TAG}. Orphan draft from interrupted run; retired.`);
    await page.getByRole('button', { name: /Retire profile|Confirm|Discard/ }).last().click();
    await page.waitForTimeout(3000);
  }
});
