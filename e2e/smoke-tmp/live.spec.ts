import { test, expect } from '@playwright/test';
import { loginAs } from '../cert-v2/support/auth';
test('live read-only smoke', async ({ page }) => {
  expect(await loginAs(page, 'aml_supervision_officer' as any)).not.toBe('/login');
  await page.goto('/supervision/aml/assessments/d6df22f7-3da5-44db-8d80-1e2fe5281317');
  await page.getByRole('tab', { name: 'Calculation' }).click();
  await expect(page.getByTestId('calc-factor-AML_TECH_CERT_INHERENT_B')).toHaveAttribute('data-contribution', 'INCLUDED', { timeout: 45000 });
  console.log('LIVE', await page.getByTestId('calc-agg-inherent').innerText(), '|', await page.getByTestId('calc-agg-residual').innerText());
  await page.screenshot({ path: '/tmp/e2e-artifacts/live-smoke-04a.png' });
});
