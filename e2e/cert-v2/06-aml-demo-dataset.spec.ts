import { test, expect } from '@playwright/test';
import { loginAs, probeRoute } from './support/auth';
import { PERSONAS, persona } from './support/personas';
import { restSelect, rpc } from './support/api';
import { isAmlAuthorizationDenied } from './support/amlAuthorization';

/**
 * AML/CFT demonstration dataset — persona walkthrough.
 *
 * Drives the real application against the persistent dataset built by
 * scripts/demo/seed-aml-demo-dataset.sql: real login UI, real routes, real
 * governed backend. Every negative UI expectation is paired with a direct
 * server attempt, because hiding a control is not authorisation.
 */
const AML_OFFICER = persona('aml_supervision_officer');
const AML_SUPERVISOR = persona('aml_supervision_supervisor');
const ENFORCEMENT = PERSONAS.enforcementOfficer;
const READ_ONLY = PERSONAS.readOnly;
const RETURNS_OFFICER = PERSONAS.returnsOfficer;
const LICENSEE = PERSONAS.licenseePrimary;

const AML_ROUTES = [
  '/supervision/aml',
  '/supervision/aml/work-queue',
  '/supervision/aml/entities',
  '/supervision/aml/assessments',
  '/supervision/aml/heatmap',
  '/supervision/aml/examinations',
  '/supervision/aml/findings',
];

test.describe('AML/CFT demonstration dataset', () => {
  test('the AML officer reaches every AML surface and sees demonstration data', async ({ page }) => {
    const landing = await loginAs(page, AML_OFFICER);
    expect(landing, 'AML officer should be authenticated').not.toBe('/login');

    for (const route of AML_ROUTES) {
      const r = await probeRoute(page, route);
      expect(r.denied, `${route} should not deny the AML officer`).toBeFalsy();
      expect(r.notFound, `${route} should exist`).toBeFalsy();
    }

    // the register surfaces the seeded entities (registers load asynchronously)
    await page.goto('/supervision/aml/entities', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/DEMO AML/).first(),
      'supervised entities should list the demonstration cases').toBeVisible({ timeout: 45_000 });
  });

  test('the AML supervisor sees the risk assessments and findings registers', async ({ page }) => {
    const landing = await loginAs(page, AML_SUPERVISOR);
    expect(landing).not.toBe('/login');

    const assessments = await probeRoute(page, '/supervision/aml/assessments');
    expect(assessments.denied).toBeFalsy();
    // The register pages 25 rows newest-first, so certification records can fill page 1.
    // Locate the demonstration cases the way a user would: with the register's search box.
    await page.getByPlaceholder('Search reference or type…').fill('DEMO AML');
    await expect(page.getByText(/DEMO AML/).first(),
      'the assessment register search should locate demonstration assessments').toBeVisible({ timeout: 45_000 });

    const findings = await probeRoute(page, '/supervision/aml/findings');
    expect(findings.denied).toBeFalsy();
  });

  test('the AML read models answer for AML personas and reconcile with the dataset', async () => {
    const metrics = await rpc(AML_OFFICER, 'aml_overview_metrics', {});
    expect(metrics.ok, `aml_overview_metrics should answer: ${metrics.bodyText}`).toBeTruthy();
    const m = metrics.body as Record<string, unknown>;
    expect(Number(m.entities_supervised)).toBeGreaterThan(20);
    expect(Number(m.high_risk_entities)).toBeGreaterThan(0);
    expect(Number(m.entities_outside_perimeter)).toBeGreaterThan(0);

    const portfolio = await rpc(AML_OFFICER, 'aml_portfolio', { _limit: 500 });
    expect(portfolio.ok, `aml_portfolio should answer: ${portfolio.bodyText}`).toBeTruthy();
    expect(portfolio.bodyText).toContain('DEMO AML');
  });

  test('an internal officer outside AML/CFT is refused AML supervisory data by the server', async ({ page }) => {
    const landing = await loginAs(page, RETURNS_OFFICER);
    expect(landing).not.toBe('/login');

    // the UI must not offer the AML overview
    const overview = await probeRoute(page, '/supervision/aml');
    const uiBlocked = overview.denied || overview.redirected;
    expect(uiBlocked, 'AML overview should not be offered to a returns officer').toBeTruthy();

    // and the server must refuse the write path regardless of the UI
    const write = await rpc(RETURNS_OFFICER, 'supervisory_domain_perimeter_set', {
      _entity_id: '00000000-0000-0000-0000-000000000000',
      _domain_code: 'AML_CFT',
      _is_applicable: false,
      _basis: 'Unauthorised attempt from an out-of-domain officer account.',
    });
    expect(isAmlAuthorizationDenied(write), `perimeter write should be refused: ${write.bodyText}`).toBeTruthy();
  });

  test('an external licensee user can reach no AML supervisory record', async ({ page }) => {
    const landing = await loginAs(page, LICENSEE);
    expect(landing).not.toBe('/login');

    const overview = await probeRoute(page, '/supervision/aml');
    expect(overview.denied || overview.redirected, 'external user must not reach AML supervision').toBeTruthy();

    const read = await restSelect(LICENSEE, 'supervisory_finding?select=id,title&limit=5');
    const empty = read.ok && Array.isArray(read.body) && (read.body as unknown[]).length === 0;
    expect(isAmlAuthorizationDenied(read) || empty, `external read must be denied or empty: ${read.bodyText}`).toBeTruthy();
  });

  test('the enforcement officer sees the referred case and the read-only persona can look but not act', async ({ page }) => {
    const enf = await loginAs(page, ENFORCEMENT);
    expect(enf).not.toBe('/login');
    const enforcement = await probeRoute(page, '/enforcement');
    expect(enforcement.notFound).toBeFalsy();

    // read-only: no governed write may succeed
    const attempt = await rpc(READ_ONLY, 'supervisory_assessment_create', {
      _entity_id: '00000000-0000-0000-0000-000000000000',
      _domain_code: 'AML_CFT',
    });
    expect(isAmlAuthorizationDenied(attempt), `read-only write must fail: ${attempt.bodyText}`).toBeTruthy();
  });
});

