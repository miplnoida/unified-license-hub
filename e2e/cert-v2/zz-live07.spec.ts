import { test, expect } from '@playwright/test';
import { loginAs } from './support/auth';
const C = '2f69689b-f16f-4257-a64a-6769f9392022'; // 01070 approved, not published (TEST)
const E7 = '92d8e8ef-582f-4a7c-b2a0-b3d2ce9e938c'; // 01072 published (TEST)
async function review(page, id) {
  await page.goto(`/supervision/aml/assessments/${id}`);
  await page.getByRole('tab', { name: 'Review & decision' }).click({ timeout: 60000 });
}
test('live: supervisor sees approved-not-published', async ({ page }) => {
  await loginAs(page, 'aml_supervision_supervisor@mishainfotech.com');
  await review(page, C);
  await expect(page.getByText('Approved — not yet official risk-of-record').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole('button', { name: 'Publish risk-of-record' })).toBeVisible();
  await expect(page.locator('#rev-approve-publish')).toBeVisible();
});
test('live: officer sees official current risk', async ({ page }) => {
  await loginAs(page, 'aml_supervision_officer@mishainfotech.com');
  await page.goto(`/supervision/aml/assessments/${E7}`);
  await expect(page.getByText(/Current published risk: /).first()).toBeVisible({ timeout: 60000 });
  await page.reload();
  await expect(page.getByText(/Current published risk: /).first()).toBeVisible({ timeout: 60000 });
});
test('live: licensee has no publication controls', async ({ page }) => {
  await loginAs(page, 'licensee_primary_user@mishainfotech.com');
  await page.goto(`/supervision/aml/assessments/${C}`);
  await page.waitForTimeout(8000);
  await expect(page.getByRole('button', { name: 'Publish risk-of-record' })).toHaveCount(0);
  await expect(page.getByText(/Current published risk: /)).toHaveCount(0);
});
