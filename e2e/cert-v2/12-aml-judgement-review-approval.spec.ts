import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restPatch, restSelect, isDenied } from './support/api';
import { readAmlFixture, recordFixtureAssessment } from './support/amlFixture';

/**
 * AML-CLOSE-05 — supervisory judgement, override, review and approval authority.
 *
 * Every successful step is a normal browser action: the TEST policy package version
 * is created and approved in the configuration screens, and assessments are created,
 * filled in, calculated, overridden, submitted and approved in the assessment screens.
 * Direct calls are used ONLY for read-only checks and refused-bypass tests.
 *
 * All values are TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY.
 */
const OFFICER = persona('aml_supervision_officer');
const SUPERVISOR = persona('aml_supervision_supervisor');
const ENTITY_NAME = 'Virtual Asset Business Demo Licensee';
const ENTITY_ID = '9ca17098-001b-2d98-fe0f-b79021972020';
const PROTECTED = ['SUP-AML_CFT-2026-00830', 'SUP-AML_CFT-2026-00836', 'SUP-AML_CFT-2026-00838'];
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-05.';
const RUN_TAG = readAmlFixture()?.runTag ?? `${Date.now()}`;

type Answer = [RegExp, RegExp];
const STANDARD: Answer[] = [
  [/^AML_TECH_CERT_INHERENT weight/, /Partially/i],
  [/^AML_TECH_CERT_INHERENT_B weight/, /^No$/i],
  [/^TEST ONLY control dimension weight/, /^Yes$/i],
];

const ids: Record<string, string> = {};

async function as(page: Page, who: string) {
  await page.context().clearCookies();
  await page.goto('/login', { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }).catch(() => undefined);
  expect(await loginAs(page, who)).not.toBe('/login');
}

async function recordFact(page: Page, code: string, value: string) {
  const card = page.locator('li', { hasText: code })
    .filter({ has: page.getByRole('button', { name: /^(Record|Update|Change value)$/ }) }).last();
  await card.getByRole('button', { name: /^(Record|Update|Change value)$/ }).click();
  const d = page.getByRole('dialog');
  const inputs = d.locator('input:not([type=date])');
  await inputs.nth(0).fill(value);
  await page.waitForLoadState('networkidle').catch(() => {});
  const src = d.locator('#fact-source');
  if ((await src.evaluate((e) => e.tagName)) === 'BUTTON') {
    if (/choose a source/i.test(await src.innerText()) || !(await src.innerText()).trim()) {
      await src.click(); await page.getByRole('option').first().click();
    }
  } else if (!(await src.inputValue())) {
    await src.fill('MANUAL');
  }
  await d.locator('#fact-ref').fill(`TEST-AML-CLOSE-05A-${code}`);
  const ta = d.locator('textarea');
  if (await ta.count()) await ta.first().fill(TAG);
  await d.getByRole('button', { name: /Record fact|Save|Update/ }).click();
  await expect(d).toBeHidden({ timeout: 20_000 });
}

async function answer(page: Page, plan: Answer[]) {
  await page.getByRole('tab', { name: 'Working file' }).click();
  for (const [dim, ans] of plan) {
    const head = page.getByRole('button', { name: dim });
    if ((await head.getAttribute('aria-expanded')) !== 'true') await head.click();
    const region = page.locator(`[role="region"][aria-labelledby="${await head.getAttribute('id')}"]`);
    const trigs = region.locator('button[id^="resp-"]');
    await expect(trigs.first()).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < await trigs.count(); i++) {
      const trig = trigs.nth(i);
      const qid = (await trig.getAttribute('id'))!.slice(5);
      await trig.click();
      await page.getByRole('option', { name: ans }).first().click();
      await page.locator(`#obs-${qid}`).fill('TEST ONLY observation — AML-CLOSE-05');
      const card = page.locator('div').filter({ has: page.locator(`#resp-${qid}`) })
        .filter({ has: page.getByRole('button', { name: 'Save response' }) }).last();
      const save = (await card.getByRole('button', { name: 'Save response' }).first().elementHandle())!;
      await save.click();
      await page.waitForFunction((b) => b.textContent?.trim() === 'Save response', save, { timeout: 20_000 });
      await page.waitForTimeout(600);
    }
  }
}

async function recalculate(page: Page) {
  await page.getByRole('tab', { name: 'Calculation' }).click();
  const before = await page.getByText(/^Run #\d+$/).first().textContent().catch(() => null);
  await page.getByRole('button', { name: 'Recalculate' }).click();
  await expect(page.getByText('The server recorded a new numbered calculation run.').first()).toBeVisible({ timeout: 45_000 });
  if (before) await expect(page.getByText(/^Run #\d+$/).first()).not.toHaveText(before, { timeout: 20_000 });
}

/** Officer: new assessment → facts → answers → browser calculation. */
async function prepare(page: Page, key: string, plan: Answer[] = STANDARD) {
  await as(page, OFFICER);
  await page.goto('/supervision/aml/assessments', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /New AML\/CFT assessment/i }).first().click();
  await page.locator('#aml-entity-pick').click();
  await page.getByRole('option', { name: new RegExp(ENTITY_NAME) }).first().click();
  await page.locator('#aml-programme-pick').click({ timeout: 30_000 });
  await page.getByRole('option').filter({ hasText: /periodic/i }).first().click();
  await expect(page.getByText(/AML_TECH_CERT_METHOD v11/)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  const d = page.getByRole('dialog');
  for (const ta of await d.locator('textarea').all()) await ta.fill(`${TAG} Journey ${key} ${RUN_TAG}`);
  await d.getByRole('button', { name: 'Create assessment' }).click();
  await page.waitForURL(/\/supervision\/aml\/assessments\/[0-9a-f-]{36}/, { timeout: 45_000 });
  ids[key] = page.url().split('/').pop()!.split('?')[0];
  recordFixtureAssessment(`S12-${key}`, ids[key]);
  await expect(page.getByTestId('aml-factor-authority')).toBeVisible({ timeout: 45_000 });
  await recordFact(page, 'AML_TECH_CERT_HAS_FLAG', 'yes');
  await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '60');
  if (plan.length) await answer(page, plan);
  await recalculate(page);
}

async function openAssessment(page: Page, key: string, tab: 'Calculation' | 'Review & decision') {
  await page.goto(`/supervision/aml/assessments/${ids[key]}`, { waitUntil: 'domcontentloaded' });
  const t = page.getByRole('tab', { name: tab });
  try { await t.click({ timeout: 45_000 }); }
  catch { await page.reload({ waitUntil: 'domcontentloaded' }); await t.click({ timeout: 45_000 }); }
}

async function proposeOverride(page: Page, rating: string, rationale: string) {
  await page.getByRole('tab', { name: 'Calculation' }).click();
  await page.locator('#calc-override-rating').click();
  await page.getByRole('option', { name: new RegExp(`^${rating}( —|$)`) }).click();
  await page.locator('#calc-override-rationale').fill(rationale);
  await page.getByRole('button', { name: 'Propose override' }).click();
  await expect(page.getByText('Override proposed. It awaits an independent decision.').first()).toBeVisible({ timeout: 20_000 });
}

async function openTab(page: Page, name: string) {
  // The workspace can re-render while its read model settles; a click landing
  // during that render is lost. Retry until the tab is actually selected.
  const tab = page.getByRole('tab', { name });
  await expect(async () => {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

async function submitForReview(page: Page) {
  await openTab(page, 'Review & decision');
  await page.locator('#rev-submit-reason').fill(`${TAG} submitted for review.`);
  await page.getByRole('button', { name: /^(Submit|Resubmit) for review$/ }).click();
  await expect(page.getByText('The assessment was submitted for review.').first()).toBeVisible({ timeout: 30_000 });
}

async function approveAssessment(page: Page) {
  await openTab(page, 'Review & decision');
  await page.locator('#rev-decision-reason').fill(`${TAG} approved by the independent reviewer.`);
  await page.getByRole('button', { name: 'Approve assessment' }).click();
  await expect(page.getByText(/The assessment was approved/).first()).toBeVisible({ timeout: 45_000 });
}

const view = async (key: string) =>
  (await rpc(OFFICER, 'supervisory_assessment_calculation_view', { _assessment_id: ids[key] })).body as {
    latest_run: { id: string; run_seq: number; residual_rating: string; result_hash: string; status: string };
    runs: Array<{ id: string; run_seq: number; result_hash: string; residual_rating: string }>;
    overrides: Array<{ id: string; run_id: string; status: string; proposed_rating: string; proposed_by: string;
      decided_by: string | null; rationale: string; computed_residual_rating: string; computed_result_hash: string }>;
  };
const assessmentRow = async (key: string) => {
  const r = await restSelect(OFFICER, `supervisory_assessment?id=eq.${ids[key]}&select=reference,status,residual_rating,approved_rating,approved_rating_source,approval_decision_id`);
  return (r.body as Array<Record<string, string>>)[0];
};

test.describe.serial('AML-CLOSE-05 judgement, review and approval (browser-only TEST journeys)', () => {
  test.beforeAll(async () => {
    test.skip(!readAmlFixture(), 'AML run fixture missing — run with --project=aml');
    const elig = await rpc(OFFICER, 'supervisory_assessment_creation_eligibility', { _entity_id: ENTITY_ID, _domain_code: 'AML_CFT' });
    test.skip(!(elig.body as { allowed?: boolean })?.allowed, `TEST perimeter not available: ${elig.bodyText}`);
  });


  test('A browser: calculated result approved unchanged — approver cannot choose a rating', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'A');
    await expect(page.getByTestId('calc-decision-rating')).toContainText('MEDIUM_HIGH');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'A', 'Review & decision');
    await expect(page.getByRole('combobox').filter({ hasText: /rating/i })).toHaveCount(0);
    await approveAssessment(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Review & decision' }).click();
    const diff = page.getByTestId('review-judgement-difference');
    await expect(diff).toHaveAttribute('data-source', 'COMPUTED', { timeout: 30_000 });
    await expect(diff).toContainText('MEDIUM_HIGH (calculated) → MEDIUM_HIGH (unchanged)');
    const a = await assessmentRow('A');
    expect(a.approved_rating).toBe('MEDIUM_HIGH');
    expect(a.approved_rating_source).toBe('COMPUTED');
    console.log('AML-CLOSE-05 A', JSON.stringify({ id: ids.A, ...a }));
  });

  test('B browser: officer proposes, cannot decide; supervisor approves override; final uses judgement and keeps the calculation', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'B');
    const before = await view('B');
    await proposeOverride(page, 'HIGH', `${TAG} Upward judgement: TEST scenario of concentrated virtual-asset exposure.`);
    await expect(page.getByRole('button', { name: 'Approve override' })).toBeDisabled();

    await as(page, SUPERVISOR);
    await openAssessment(page, 'B', 'Calculation');
    await page.locator('#calc-override-note').fill(`${TAG} independently accepted.`);
    await page.getByRole('button', { name: 'Approve override' }).click();
    await expect(page.getByText('Override approved.').first()).toBeVisible({ timeout: 20_000 });

    await as(page, OFFICER);
    await openAssessment(page, 'B', 'Review & decision');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'B', 'Review & decision');
    await approveAssessment(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Review & decision' }).click();
    const diff = page.getByTestId('review-judgement-difference');
    await expect(diff).toHaveAttribute('data-source', 'APPROVED_OVERRIDE', { timeout: 30_000 });
    await expect(diff).toContainText('MEDIUM_HIGH (calculated) → HIGH (approved judgement)');
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(page.getByTestId('calc-decision-rating')).toContainText('MEDIUM_HIGH');
    await expect(page.getByTestId('calc-override-row').first()).toHaveAttribute('data-status', 'APPROVED');

    const after = await view('B');
    expect(after.runs.map((r) => [r.id, r.result_hash, r.residual_rating])).toEqual(before.runs.map((r) => [r.id, r.result_hash, r.residual_rating]));
    const o = after.overrides[0];
    expect(o.run_id).toBe(before.latest_run.id);
    expect(o.computed_result_hash).toBe(before.latest_run.result_hash);
    expect(o.proposed_by).not.toBe(o.decided_by);
    const a = await assessmentRow('B');
    expect(a.approved_rating).toBe('HIGH');
    expect(a.approved_rating_source).toBe('APPROVED_OVERRIDE');
    const dec = await restSelect(SUPERVISOR, `supervisory_assessment_approval_decision?id=eq.${a.approval_decision_id}&select=computed_rating,override_id,override_rating,final_rating,final_rating_source,calculation_run_id,calculation_result_hash`);
    const pub = await restSelect(SUPERVISOR, `entity_risk_state?entity_id=eq.${ENTITY_ID}&domain_code=eq.AML_CFT&select=residual_rating,driving_assessment_id`);
    console.log('AML-CLOSE-05 B', JSON.stringify({ id: ids.B, ...a, decision: dec.body, published: pub.body, override: o }));
  });

  test('C browser: supervisor rejects override; rejection kept; calculated result approved', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'C');
    await proposeOverride(page, 'HIGH', `${TAG} First upward proposal: TEST scenario of mitigating controls not captured.`);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'C', 'Calculation');
    await page.locator('#calc-override-note').fill(`${TAG} rejected — calculation stands.`);
    await page.getByRole('button', { name: 'Reject override' }).click();
    await expect(page.getByText('Override rejected.').first()).toBeVisible({ timeout: 20_000 });
    await as(page, OFFICER);
    await openAssessment(page, 'C', 'Calculation');
    // A second proposal is a new record; the rejected one stays in history.
    await proposeOverride(page, 'HIGH', `${TAG} Second proposal after rejection — TEST only.`);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'C', 'Calculation');
    await page.locator('#calc-override-note').fill(`${TAG} second proposal also rejected.`);
    await page.getByRole('button', { name: 'Reject override' }).click();
    await expect(page.getByText('Override rejected.').first()).toBeVisible({ timeout: 20_000 });
    await as(page, OFFICER);
    await openAssessment(page, 'C', 'Review & decision');
    await submitForReview(page);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'C', 'Review & decision');
    await approveAssessment(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Review & decision' }).click();
    await expect(page.getByTestId('review-judgement-difference')).toHaveAttribute('data-source', 'COMPUTED', { timeout: 30_000 });
    await page.getByRole('tab', { name: 'Calculation' }).click();
    await expect(page.locator('[data-testid="calc-override-row"][data-status="REJECTED"]')).toHaveCount(2);
    const v = await view('C');
    expect(v.overrides.map((o) => o.status).sort()).toEqual(['REJECTED', 'REJECTED']);
    const a = await assessmentRow('C');
    expect(a.approved_rating).toBe('MEDIUM_HIGH');
    expect(a.approved_rating_source).toBe('COMPUTED');
    console.log('AML-CLOSE-05 C', JSON.stringify({ id: ids.C, ...a, overrides: v.overrides.map((o) => [o.proposed_rating, o.status]) }));
  });

  test('D browser: proposer cannot approve own override; recalculation makes it stale and it can no longer be decided', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'D');
    await as(page, SUPERVISOR);
    await openAssessment(page, 'D', 'Calculation');
    await proposeOverride(page, 'HIGH', `${TAG} Supervisor proposal — must be decided by someone else.`);
    await page.getByRole('button', { name: 'Approve override' }).click();
    await expect(page.getByText('An override must be decided by someone other than the person who proposed it.').first()).toBeVisible({ timeout: 20_000 });
    const pend = (await view('D')).overrides[0];
    expect(pend.status).toBe('PENDING_APPROVAL');

    await as(page, OFFICER);
    await openAssessment(page, 'D', 'Calculation');
    await page.getByRole('tab', { name: 'Working file' }).click();
    await recordFact(page, 'AML_TECH_CERT_STR_COUNT', '75');
    await recalculate(page);
    await expect(page.locator('[data-testid="calc-override-row"][data-status="STALE"]')).toHaveCount(1, { timeout: 20_000 });
    await as(page, SUPERVISOR);
    await openAssessment(page, 'D', 'Calculation');
    await expect(page.getByRole('button', { name: 'Approve override' })).toHaveCount(0);

    const v = await view('D');
    expect(v.overrides[0].status).toBe('STALE');
    expect(v.overrides[0].run_id).not.toBe(v.latest_run.id);
    // Negative: deciding the stale override directly is refused.
    const r = await rpc(persona('super_admin'), 'supervisory_calculation_override_decide', { _override_id: pend.id, _decision: 'APPROVED', _note: TAG });
    expect(r.ok).toBe(false);
    console.log('AML-CLOSE-05 D', JSON.stringify({ id: ids.D, override: v.overrides[0].status, run: v.latest_run.run_seq, decide: r.bodyText.slice(0, 160) }));
  });

  test('E browser: withheld calculation offers no override; direct proposal refused', async ({ page }) => {
    test.setTimeout(300_000);
    await prepare(page, 'E', STANDARD.filter(([d]) => !String(d).includes('INHERENT_B')));
    await expect(page.getByText('Not calculable — no result was invented')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Propose override' })).toHaveCount(0);
    const r = await rpc(SUPERVISOR, 'supervisory_calculation_override_propose', { _assessment_id: ids.E, _proposed_rating: 'LOW', _rationale: `${TAG} bypass attempt` });
    expect(r.ok).toBe(false);
    expect(r.bodyText).toMatch(/not_calculated/);
  });

  test('NEGATIVE direct-call bypasses are refused server-side', async () => {
    test.skip(!ids.A || !ids.B || !ids.C, 'journeys did not run');
    const out: Record<string, string> = {};
    const refuse = async (label: string, p: Promise<{ ok: boolean; bodyText: string; status: number }>, re?: RegExp) => {
      const r = await p;
      out[label] = `${r.status} ${r.bodyText.slice(0, 110)}`;
      expect(r.ok, `${label}: ${r.bodyText}`).toBe(false);
      if (re) expect(r.bodyText).toMatch(re);
    };
    const b = await view('B');
    await refuse('propose on approved', rpc(SUPERVISOR, 'supervisory_calculation_override_propose', { _assessment_id: ids.A, _proposed_rating: 'HIGH', _rationale: `${TAG} after approval` }), /assessment_closed/);
    await refuse('recalculate approved', rpc(OFFICER, 'supervisory_assessment_calculation_run_record', { _assessment_id: ids.A, _event_reason: 'MANUAL_RUN' }), /assessment_locked/);
    await refuse('re-decide approved override', rpc(SUPERVISOR, 'supervisory_calculation_override_decide', { _override_id: b.overrides[0].id, _decision: 'REJECTED', _note: `${TAG} rewrite` }));
    await refuse('edit override row', restPatch(SUPERVISOR, `supervisory_assessment_calculation_override?id=eq.${b.overrides[0].id}`, { proposed_rating: 'LOW' }).then(async (r) => {
      const after = (await view('B')).overrides[0];
      return { ...r, ok: r.ok && after.proposed_rating === 'LOW' };
    }));
    await refuse('edit calculation run', restPatch(SUPERVISOR, `supervisory_assessment_calculation_run?id=eq.${b.latest_run.id}`, { residual_rating: 'LOW' }).then(async (r) => {
      const after = (await view('B')).latest_run;
      return { ...r, ok: r.ok && after.residual_rating === 'LOW' };
    }));
    await refuse('edit approved rating', restPatch(SUPERVISOR, `supervisory_assessment?id=eq.${ids.B}`, { approved_rating: 'LOW', residual_rating: 'LOW' }).then(async (r) => {
      const after = await assessmentRow('B');
      return { ...r, ok: r.ok && after.approved_rating === 'LOW' };
    }));
    await refuse('legacy transition sets rating', rpc(SUPERVISOR, 'supervisory_assessment_transition', { _assessment_id: ids.A, _to_status: 'approved', _rationale: TAG, _residual_rating: 'LOW', _next_review_date: null }));
    await refuse('officer approves assessment', rpc(OFFICER, 'supervisory_assessment_approve', { _assessment_id: ids.C, _rationale: `${TAG} no approval permission` }));
    for (const p of ['read_only', 'complaints_officer', 'licensee_primary_user', 'auditor']) {
      await refuse(`${p} proposes`, rpc(persona(p), 'supervisory_calculation_override_propose', { _assessment_id: ids.D, _proposed_rating: 'HIGH', _rationale: `${TAG} unauthorised` }));
      await refuse(`${p} decides`, rpc(persona(p), 'supervisory_calculation_override_decide', { _override_id: b.overrides[0].id, _decision: 'APPROVED', _note: TAG }));
    }
    const anon = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/supervisory_calculation_override_propose`, {
      method: 'POST', headers: { apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY as string, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _assessment_id: ids.D, _proposed_rating: 'HIGH', _rationale: TAG }),
    });
    out['signed-out proposes'] = String(anon.status);
    expect(anon.ok).toBe(false);
    expect(isDenied({ status: anon.status, ok: anon.ok, body: null, bodyText: await anon.text() }) || anon.status >= 400).toBe(true);
    console.log('AML-CLOSE-05 NEGATIVE', JSON.stringify(out));
  });

  test('protected assessments untouched', async () => {
    const r = await restSelect(SUPERVISOR, `supervisory_assessment?reference=in.(${PROTECTED.join(',')})&select=reference,status,updated_at`);
    console.log('AML-CLOSE-05 protected', r.bodyText);
    for (const id of Object.values(ids)) expect(r.bodyText).not.toContain(id);
  });

});
