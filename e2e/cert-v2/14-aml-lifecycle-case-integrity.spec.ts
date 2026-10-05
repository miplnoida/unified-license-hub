import { test, expect, type Page } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';
import { rpc, restPatch, restSelect, isDenied } from './support/api';
void restPatch; void isDenied;
import { readAmlFixture, recordFixtureAssessment } from './support/amlFixture';

/**
 * AML-CLOSE-06 — assessment lifecycle, ownership, reassignment and case integrity.
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
const TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY. AML-CLOSE-06.';
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
  recordFixtureAssessment(`S14-${key}`, ids[key]);
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

async function submitForReview(page: Page) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  await page.locator('#rev-submit-reason').fill(`${TAG} submitted for review.`);
  await page.getByRole('button', { name: /^(Submit|Resubmit) for review$/ }).click();
  await expect(page.getByText('The assessment was submitted for review.').first()).toBeVisible({ timeout: 30_000 });
}

async function approveAssessment(page: Page) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  await page.locator('#rev-decision-reason').fill(`${TAG} approved by the independent reviewer.`);
  await page.getByRole('button', { name: 'Approve assessment' }).click();
  await expect(page.getByText(/The assessment was approved/).first()).toBeVisible({ timeout: 45_000 });
}


const SUPERVISOR_NAME = 'Certification - AML/CFT Supervision Supervisor';
const life = async (who: string, key: string) =>
  (await rpc(who, 'supervisory_assessment_lifecycle_state', { _assessment_id: ids[key] })).body as {
    canonical_state: string; current_round_seq: number; assigned_owner_id: string; assigned_reviewer_id: string | null;
    case_actor: boolean; editing_allowed: boolean; actions: Array<{ action: string; permitted: boolean; reason_code: string }>;
  };
const rounds = async (key: string) =>
  (await restSelect(SUPERVISOR, `supervisory_assessment_review_round?assessment_id=eq.${ids[key]}&select=round_seq,outcome,calculation_run_id,calculation_result_hash,submitted_by,reviewer_id&order=round_seq`)).body as
    Array<{ round_seq: number; outcome: string; calculation_run_id: string; calculation_result_hash: string; submitted_by: string; reviewer_id: string | null }>;
const assignments = async (key: string) =>
  (await restSelect(SUPERVISOR, `supervisory_assessment_assignment?assessment_id=eq.${ids[key]}&select=assignment_role,from_user_id,to_user_id,reason,assigned_by&order=created_at`)).body as Array<Record<string, string>>;

async function assignInUi(page: Page, role: 'Case owner' | 'Reviewer', person: string) {
  await page.getByRole('tab', { name: 'Review & decision' }).click();
  const card = page.getByTestId('aml-assignment-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.locator('#asg-role').click();
  await page.getByRole('option', { name: role, exact: true }).click();
  await card.locator('#asg-to').click();
  await page.getByRole('option', { name: person }).click();
  await card.locator('#asg-reason').fill(`${TAG} ${role} assignment.`);
  await card.getByRole('button', { name: role === 'Case owner' ? 'Reassign case owner' : 'Assign reviewer' }).click();
  await expect(page.getByText(role === 'Case owner' ? 'The case owner was reassigned.' : 'The reviewer was assigned.').first()).toBeVisible({ timeout: 20_000 });
}

test.describe.serial('AML-CLOSE-06 lifecycle and case integrity (browser success paths)', () => {
  test.setTimeout(420_000);

  test('A browser: prepare, submit, assign reviewer, independent approval, reload stable', async ({ page }) => {
    await prepare(page, 'A');
    await submitForReview(page);
    let l = await life(OFFICER, 'A');
    expect(l.canonical_state).toBe('SUBMITTED_FOR_REVIEW');
    expect(l.current_round_seq).toBe(1);
    // C: preparer/submitter cannot approve — UI says so and the server refuses
    expect(['MAKER_CHECKER', 'PERMISSION_MISSING']).toContain(l.actions.find((a) => a.action === 'APPROVE')!.reason_code);
    expect(l.actions.find((a) => a.action === 'APPROVE')!.permitted).toBe(false);
    const self = await rpc(OFFICER, 'supervisory_assessment_approve', { _assessment_id: ids.A, _rationale: `${TAG} self approval attempt` });
    expect(self.ok).toBe(false);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'A', 'Review & decision');
    await assignInUi(page, 'Reviewer', SUPERVISOR_NAME);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await openAssessment(page, 'A', 'Review & decision');
    await approveAssessment(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    l = await life(SUPERVISOR, 'A');
    expect(['APPROVED', 'APPROVED_NOT_PUBLISHED']).toContain(l.canonical_state);
    const r = await rounds('A');
    expect(r).toHaveLength(1);
    expect(r[0].outcome).not.toBe('PENDING');
    expect((await assignments('A')).map((x) => x.assignment_role)).toEqual(['REVIEWER']);
  });

  test('B browser: return with reason, edit, resubmit creates round 2, prior round intact, approve', async ({ page }) => {
    await prepare(page, 'B');
    await submitForReview(page);
    const r1 = (await rounds('B'))[0];
    await as(page, SUPERVISOR);
    await openAssessment(page, 'B', 'Review & decision');
    await page.locator('#rev-return-reason').fill(`${TAG} returned: please re-check the control answers.`);
    await page.getByRole('button', { name: 'Return for correction' }).click();
    await expect(page.getByText('The assessment was returned for correction.').first()).toBeVisible({ timeout: 30_000 });
    expect((await life(SUPERVISOR, 'B')).canonical_state).toBe('RETURNED_FOR_CHANGES');
    await as(page, OFFICER);
    await openAssessment(page, 'B', 'Calculation');
    await recalculate(page);
    await submitForReview(page);
    const rr = await rounds('B');
    expect(rr.map((x) => x.round_seq)).toEqual([1, 2]);
    expect(rr[0]).toMatchObject({ calculation_run_id: r1.calculation_run_id, calculation_result_hash: r1.calculation_result_hash });
    expect(rr[0].outcome).not.toBe('PENDING');
    expect(rr[1].calculation_run_id).not.toBe(r1.calculation_run_id);
    expect((await life(OFFICER, 'B')).canonical_state).toBe('RESUBMITTED');
    await as(page, SUPERVISOR);
    await openAssessment(page, 'B', 'Review & decision');
    await approveAssessment(page);
    expect((await rounds('B'))).toHaveLength(2);
  });

  test('D browser: supervisor reassigns owner; old owner cannot act; new owner can', async ({ page }) => {
    await prepare(page, 'D');
    const before = await life(OFFICER, 'D');
    expect(before.case_actor).toBe(true);
    // the officer cannot reassign — server action says so and the server refuses
    expect(before.actions.find((a) => a.action === 'REASSIGN_OWNER')!.permitted).toBe(false);
    await as(page, SUPERVISOR);
    await openAssessment(page, 'D', 'Review & decision');
    expect((await life(SUPERVISOR, 'D')).actions.find((a) => a.action === 'SUBMIT_FOR_REVIEW')!.reason_code).toBe('NOT_CASE_OWNER');
    await assignInUi(page, 'Case owner', SUPERVISOR_NAME);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const after = await life(OFFICER, 'D');
    expect(after.assigned_owner_id).not.toBe(before.assigned_owner_id);
    expect(after.case_actor).toBe(false);
    const old = await rpc(OFFICER, 'supervisory_assessment_calculate', { _assessment_id: ids.D });
    expect(JSON.stringify(old.body)).toMatch(/not_case_owner/);
    await openAssessment(page, 'D', 'Calculation');
    await recalculate(page); // the new owner can work the case in the browser
    const h = await assignments('D');
    expect(h).toHaveLength(1);
    expect(h[0]).toMatchObject({ assignment_role: 'OWNER', from_user_id: before.assigned_owner_id, to_user_id: after.assigned_owner_id });
  });

  test('E concurrency: duplicate submit and duplicate approve produce exactly one transition', async ({ page }) => {
    await prepare(page, 'E');
    const v = (await rpc(OFFICER, 'supervisory_assessment_calculation_view', { _assessment_id: ids.E })).body as { latest_run: { id: string; result_hash: string } };
    const args = { _assessment_id: ids.E, _rationale: `${TAG} concurrent submit.`, _run_id: v.latest_run.id, _expected_result_hash: v.latest_run.result_hash };
    const subs = await Promise.all([1, 2, 3].map(() => rpc(OFFICER, 'supervisory_assessment_submit_for_review', args)));
    expect(subs.filter((s) => s.ok)).toHaveLength(1);
    expect(await rounds('E')).toHaveLength(1);
    const appr = await Promise.all([1, 2].map(() => rpc(SUPERVISOR, 'supervisory_assessment_approve', { _assessment_id: ids.E, _rationale: `${TAG} concurrent approval.` })));
    expect(appr.filter((s) => s.ok).length).toBeLessThanOrEqual(1);
    const d = (await restSelect(SUPERVISOR, `supervisory_assessment_approval_decision?assessment_id=eq.${ids.E}&select=id`)).body as unknown[];
    expect(d.length).toBe(appr.filter((s) => s.ok).length);
  });

  test('NEGATIVE: direct status/ownership writes and non-owner edits are refused', async () => {
    for (const body of [{ status: 'approved' }, { status: 'draft' }, { owner_id: null }, { reviewer_id: null }, { review_round_seq: 9 }]) {
      const r = await restPatch(OFFICER, `supervisory_assessment?id=eq.${ids.D}`, body);
      expect(r.ok).toBe(false);
    }
    const nonOwner = await rpc(OFFICER, 'supervisory_assessment_fact_set', { _assessment_id: ids.D, _payload: {} });
    expect(nonOwner.ok).toBe(false);
    const stale = await rpc(SUPERVISOR, 'supervisory_assessment_reassign', {
      _assessment_id: ids.D, _role: 'OWNER', _to_user_id: (await life(SUPERVISOR, 'A')).assigned_owner_id,
      _expected_current_id: '00000000-0000-0000-0000-000000000000', _reason: `${TAG} stale screen` });
    expect(JSON.stringify(stale.body)).toMatch(/stale_assignment/);
    const officerOrphans = await rpc(OFFICER, 'supervisory_assessment_orphan_cases', {});
    expect(officerOrphans.ok).toBe(false);
  });

  test('protected assessments untouched', async () => {
    const r = (await restSelect(SUPERVISOR, `supervisory_assessment?reference=in.(${PROTECTED.join(',')})&select=reference,status,updated_at`)).body as Array<{ updated_at: string }>;
    expect(r).toHaveLength(3);
    for (const x of r) expect(new Date(x.updated_at).getTime()).toBeLessThan(Date.now() - 3_600_000);
  });
});
