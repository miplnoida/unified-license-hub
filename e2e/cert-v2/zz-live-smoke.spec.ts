import { test, expect } from '@playwright/test';
import { loginAs } from './support/auth';
const D = '065dbb77-548d-4848-9921-3ffdd45b1a52'; // SUP-AML_CFT-2026-01045 TEST, owner = supervisor after reassignment
const O = '5b5b930c-6f5d-4dec-9117-e8affd1439dc'; // SUP-AML_CFT-2026-01038 TEST, owner = officer
async function open(page, id) {
  await page.goto(`/supervision/aml/assessments/${id}`);
  await page.getByRole('tab', { name: 'Review & decision' }).click({ timeout: 45000 });
}
test('live: AML officer', async ({ page }) => {
  await loginAs(page, 'aml_supervision_officer@mishainfotech.com');
  await page.goto('/supervision/aml/assessments');
  await expect(page.getByRole('heading', { name: 'AML/CFT Risk Assessments' })).toBeVisible({ timeout: 45000 });
  await expect(page.getByTestId('aml-orphan-cases')).toHaveCount(0);
  await open(page, O);
  const card = page.getByTestId('aml-assignment-card');
  await expect(card).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Reassign case owner').first()).toBeVisible();
  await expect(card.getByRole('button', { name: /Reassign case owner|Assign reviewer/ })).toHaveCount(0);
  await page.reload(); await open(page, O); await expect(card).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: '/root/w/live-officer.png' });
});
test('live: AML supervisor', async ({ page }) => {
  await loginAs(page, 'aml_supervision_supervisor@mishainfotech.com');
  await page.goto('/supervision/aml/assessments');
  await expect(page.getByTestId('aml-orphan-cases')).toBeVisible({ timeout: 45000 });
  await open(page, D);
  const card = page.getByTestId('aml-assignment-card');
  await expect(card).toBeVisible({ timeout: 30000 });
  await card.locator('#asg-to').click();
  await expect(page.getByRole('option').first()).toBeVisible({ timeout: 20000 });
  console.log('candidates', await page.getByRole('option').count());
  await page.keyboard.press('Escape');
  await page.reload(); await open(page, D); await expect(card).toBeVisible({ timeout: 30000 });
  await page.screenshot({ path: '/root/w/live-supervisor.png' });
});
test('live: licensee refused', async ({ page }) => {
  await loginAs(page, 'licensee_primary_user@mishainfotech.com');
  await page.goto(`/supervision/aml/assessments/${D}`);
  await page.waitForTimeout(6000);
  await expect(page.getByTestId('aml-assignment-card')).toHaveCount(0);
  console.log('licensee url', new URL(page.url()).pathname);
});
