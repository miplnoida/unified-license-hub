import { expect, type Page } from '@playwright/test';
import { restSelect } from './api';
import { TEST_TAG } from './amlFixture';

/**
 * Browser-only authoring of one governed policy component (maker side).
 * Approval is always done separately by an independent checker.
 */
export type EntryValue =
  | { kind: 'text'; label: string; value: string }
  | { kind: 'select'; label: string; option: RegExp }
  | { kind: 'switch'; label: string; on: boolean }
  | { kind: 'check'; option: RegExp };

export async function componentStatus(who: string, id: string) {
  const r = await restSelect(who, `supervisory_policy_component?id=eq.${id}&select=status`);
  return (r.body as Array<{ status: string }>)[0]?.status;
}

export async function authorComponent(page: Page, opts: {
  typeLabel: string; code: string; name: string; purpose: string; entries: EntryValue[][];
}): Promise<string> {
  await page.goto('/admin/supervisory-policy-components', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'New component version' }).click();
  await page.locator('#pc-type').click();
  await page.getByRole('option', { name: opts.typeLabel, exact: true }).click();
  await page.locator('#pc-domain').click();
  await page.getByRole('option', { name: /aml/i }).first().click();
  await page.locator('#pc-regulator').click();
  await page.getByRole('option', { name: 'FSRA', exact: true }).click();
  await page.locator('#pc-code').fill(opts.code);
  await page.locator('#pc-version').fill('1.0');
  await page.locator('#pc-name').fill(opts.name);
  await page.locator('#pc-purpose').fill(opts.purpose);
  await page.getByRole('button', { name: 'Create draft' }).click();
  await page.waitForURL(/supervisory-policy-components\/[0-9a-f-]{36}/, { timeout: 30_000 });
  const id = page.url().split('/').pop()!.split('?')[0];

  for (let i = 0; i < opts.entries.length; i++) {
    const n = i + 1;
    await page.getByRole('button', { name: /^Add / }).click();
    for (const f of opts.entries[i]) {
      if (f.kind === 'text') await page.getByLabel(`${f.label} ${n}`, { exact: true }).fill(f.value);
      else if (f.kind === 'select') {
        await page.getByLabel(`${f.label} ${n}`, { exact: true }).click();
        await page.getByRole('option', { name: f.option }).first().click();
      } else if (f.kind === 'switch') {
        const sw = page.getByLabel(`${f.label} ${n}`, { exact: true });
        if (((await sw.getAttribute('aria-checked')) === 'true') !== f.on) await sw.click();
      } else {
        await page.getByRole('checkbox', { name: f.option }).nth(i).click();
      }
    }
  }
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('The server accepts this configuration.')).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await page.locator('#pc-rationale').fill(`${TEST_TAG}. Submitted for independent approval.`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  return id;
}

export async function approveComponent(page: Page, id: string) {
  await page.goto(`/admin/supervisory-policy-components/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await page.locator('#pc-rationale').fill(`${TEST_TAG}. Independently approved for certification only.`);
  await page.getByRole('button', { name: 'Confirm' }).click();
}

export async function bindInProfile(page: Page, typeLabel: string, code: string) {
  const row = page.getByRole('row').filter({ hasText: typeLabel });
  await row.getByRole('button', { name: /^(Bind|Change)$/ }).click();
  await page.locator('#pp-component').click();
  await page.getByRole('option').filter({ hasText: code }).first().click();
  await page.locator('#pp-bind-rationale').fill(`${TEST_TAG}. Bind run ${typeLabel}.`);
  await page.getByRole('button', { name: 'Bind version' }).click();
  await expect(row).toContainText(code, { timeout: 20_000 });
}

export async function retireComponent(page: Page, id: string, why: string) {
  await page.goto(`/admin/supervisory-policy-components/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Retire', exact: true }).click();
  await page.locator('#pc-rationale').fill(why);
  await page.getByRole('button', { name: 'Confirm' }).click();
}
