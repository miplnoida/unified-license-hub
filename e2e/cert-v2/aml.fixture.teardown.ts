import { test as teardown, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { restSelect, rpc } from './support/api';
import { readAmlFixture, TEST_TAG } from './support/amlFixture';

/** Retires the run's TEST package and judgement policy through the screens, then verifies pinning read-only. */
const SUPERVISOR = persona('aml_supervision_supervisor');
const OFFICER = persona('aml_supervision_officer');
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';

async function as(page: Page, who: string) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => undefined);
  expect(await loginAs(page, who)).not.toBe('/login');
}

teardown('retire AML TEST package and judgement policy (browser only)', async ({ page }) => {
  teardown.setTimeout(480_000);
  const f = readAmlFixture();
  teardown.skip(!f, 'no fixture created');
  await as(page, SUPERVISOR);
  const profStatus = ((await restSelect(SUPERVISOR, `supervisory_policy_profile?id=eq.${f!.profileId}&select=status`)).body as Array<{ status: string }>)[0]?.status;
  if (profStatus !== 'RETIRED') {
  await page.goto(`/admin/supervisory-policy-profiles/${f!.profileId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Retire' }).click({ timeout: 90_000 });
  await page.locator('#pp-retire-rationale').fill(`${TEST_TAG}. Run ${f!.runTag} finished; TEST package retired.`);
  await page.getByRole('button', { name: 'Retire profile' }).click();
  await expect.poll(async () => ((await restSelect(SUPERVISOR, `supervisory_policy_profile?id=eq.${f!.profileId}&select=status`)).body as Array<{ status: string }>)[0]?.status, { timeout: 20_000 }).toBe('RETIRED');
  }

  await page.goto(`/admin/supervisory-policy-components/${f!.judgementComponentId}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Retire', exact: true }).click({ timeout: 90_000 });
  await page.locator('#pc-rationale').fill(`${TEST_TAG}. Run ${f!.runTag} finished; TEST judgement policy retired.`);
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect.poll(async () => ((await restSelect(SUPERVISOR, `supervisory_policy_component?id=eq.${f!.judgementComponentId}&select=status`)).body as Array<{ status: string }>)[0]?.status, { timeout: 20_000 }).toBe('RETIRED');

  for (const id of [f!.responseComponentId, f!.slaComponentId].filter(Boolean) as string[]) {
    await page.goto(`/admin/supervisory-policy-components/${id}`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Retire', exact: true }).click({ timeout: 90_000 });
    await page.locator('#pc-rationale').fill(`${TEST_TAG}. Run ${f!.runTag} finished; AML-CLOSE-08A TEST policy retired.`);
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect.poll(async () => ((await restSelect(SUPERVISOR, `supervisory_policy_component?id=eq.${id}&select=status`)).body as Array<{ status: string }>)[0]?.status, { timeout: 20_000 }).toBe('RETIRED');
  }

  // Read-only: no new assessment can resolve to the TEST package; existing ones keep their pinned policy.
  const elig = await rpc(OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT' });
  const pinned: Record<string, unknown> = {};
  for (const [k, id] of Object.entries(f!.assessments)) {
    const v = await rpc(OFFICER, 'supervisory_assessment_judgement_policy_view', { _assessment_id: id });
    const e = (v.body as { evaluation: { status: string; policy?: { component_id?: string; code?: string; version?: string } } }).evaluation;
    pinned[k] = { status: e.status, policy: e.policy };
    if (k.startsWith('J')) {
      expect(e.status).toBe('EVALUATED');
      expect(JSON.stringify(e.policy)).toContain(f!.judgementCode);
    }
  }
  console.log('AML fixture teardown', JSON.stringify({ eligibility: elig.body, pinned }));
});
