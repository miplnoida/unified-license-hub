import { test, expect } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restSelect } from './support/api';

/**
 * AML-CLOSE-02B — governed runtime authority (overlay + fact settings + sources).
 *
 * Read-only against the preserved certification assessment
 * SUP-AML_CFT-2026-00838: it opens the working file in the real UI and pairs
 * each "not recordable" expectation with a forged authenticated server call,
 * which must be refused. No fact value of the assessment is changed.
 */
const AML_OFFICER = persona('aml_supervision_officer');
const A838 = '66cc17e3-f944-4b93-be22-8857565a1213';
const REFUSED = ['AML_TECH_CERT_RETIRED', 'AML_TECH_CERT_OTHER_SECTOR'];
const RECORDED = ['AML_TECH_CERT_STR_COUNT', 'AML_TECH_CERT_HAS_FLAG'];

type Fact = { fact_code: string; permitted: boolean; not_permitted_reason?: string | null; recorded?: boolean; source_type?: string | null };

test.describe('AML/CFT governed runtime authority (00838)', () => {
  test('authority read model: refused facts carry a reason, recorded facts keep provenance', async () => {
    const r = await rpc(AML_OFFICER, 'supervisory_assessment_configuration_authority', { _assessment_id: A838 });
    expect(r.ok, r.bodyText).toBeTruthy();
    const facts = ((r.body as { facts: Fact[] }).facts) ?? [];
    for (const code of REFUSED) {
      const f = facts.find((x) => x.fact_code === code);
      expect(f, code).toBeTruthy();
      expect(f!.permitted, `${code} must not be permitted`).toBe(false);
      expect(f!.not_permitted_reason, `${code} must explain why`).toBeTruthy();
    }
    const str = facts.find((x) => x.fact_code === 'AML_TECH_CERT_STR_COUNT');
    const flag = facts.find((x) => x.fact_code === 'AML_TECH_CERT_HAS_FLAG');
    expect(str?.permitted && str?.recorded && str?.source_type).toBe('RETURN');
    expect(flag?.permitted && flag?.recorded && flag?.source_type).toBe('MANUAL');
  });

  test('forged authenticated fact submissions for refused facts are rejected by the server', async () => {
    for (const code of REFUSED) {
      const r = await rpc(AML_OFFICER, 'supervisory_assessment_fact_set', {
        _assessment_id: A838, _payload: { fact_code: code, value: '1', source_type: 'MANUAL' },
      });
      expect(r.ok, `${code} must be refused: ${r.bodyText}`).toBeFalsy();
      expect(r.bodyText).toMatch(/retired|does not apply|not a permitted/i);
    }
  });

  test('pinned configuration content is unchanged since the assessment was stamped', async () => {
    const r = await rpc(AML_OFFICER, 'supervisory_assessment_policy_basis_integrity', { _assessment_id: A838 });
    expect(r.ok, r.bodyText).toBeTruthy();
    const body = r.body as { status: string; snapshot_content_hash: string };
    expect(body.status).toBe('CONTENT_UNCHANGED');
    expect(body.snapshot_content_hash).toBe('7e5bed5e523315dec267329dbca344c2');
  });

  test('working file: refused facts offer no Record action and explain why', async ({ page }) => {
    const landing = await loginAs(page, AML_OFFICER);
    expect(landing).not.toBe('/login');
    await page.goto(`/supervision/aml/assessments/${A838}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('config-authority-panel')).toBeVisible({ timeout: 45_000 });

    for (const code of REFUSED) {
      const row = page.getByTestId(`config-fact-${code}`);
      await expect(row).toContainText(/No —/);
      await expect(page.getByTestId(`fact-not-permitted-${code}`)).toBeVisible();
      const item = page.locator('li', { has: page.getByTestId(`fact-not-permitted-${code}`) });
      await expect(item.getByRole('button', { name: /^(Record|Update|Change value)$/ })).toHaveCount(0);
    }
    for (const code of RECORDED) {
      await expect(page.getByTestId(`config-fact-${code}`)).toContainText(/Recorded \((RETURN|MANUAL)\)/);
    }
  });

  test('AML-CLOSE-02C: forged authenticated creation without supervisory applicability is refused and writes nothing', async () => {
    const HELEN = 'fdf5c81f-9aa8-40da-9df0-781f3c2e7adc';
    const elig = await rpc(AML_OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: HELEN, _domain_code: 'AML_CFT' });
    expect(elig.ok, elig.bodyText).toBeTruthy();
    expect((elig.body as { allowed: boolean; state: string }).allowed).toBe(false);
    const before = await restSelect(AML_OFFICER, `supervisory_assessment?select=id&entity_id=eq.${HELEN}`);
    const r = await rpc(AML_OFFICER, 'supervisory_assessment_create', { _entity_id: HELEN, _domain_code: 'AML_CFT' });
    expect(r.ok).toBeFalsy();
    expect(r.bodyText).toMatch(/perimeter_not_established/);
    const after = await restSelect(AML_OFFICER, `supervisory_assessment?select=id&entity_id=eq.${HELEN}`);
    expect((after.body as unknown[]).length).toBe((before.body as unknown[]).length);
  });
});
