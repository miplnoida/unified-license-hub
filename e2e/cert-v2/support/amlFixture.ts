import fs from 'node:fs';
import path from 'node:path';

/**
 * Run-scoped AML TEST fixture created through the configuration SCREENS by
 * aml.fixture.setup.ts and retired through the screens by aml.fixture.teardown.ts.
 * Only browser-created ids are shared; sessions are never shared between personas.
 */
export interface AmlFixture {
  runTag: string;
  profileId: string;
  profileVersion: string;
  judgementComponentId: string;
  judgementCode: string;
  judgementVersion: string;
  responseComponentId?: string;
  responseCode?: string;
  slaComponentId?: string;
  slaCode?: string;
  assessments: Record<string, string>;
}

const FILE = path.resolve(process.env.E2E_OUTPUT_DIR ?? '/tmp/e2e-artifacts', 'aml-fixture.json');

export function readAmlFixture(): AmlFixture | null {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')) as AmlFixture; } catch { return null; }
}

export function writeAmlFixture(f: AmlFixture) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(f, null, 2));
}

export function recordFixtureAssessment(key: string, id: string) {
  const f = readAmlFixture();
  if (!f) return;
  f.assessments[key] = id;
  writeAmlFixture(f);
}

export function clearAmlFixture() {
  try { fs.unlinkSync(FILE); } catch { /* none */ }
}

/** Template used only as the copy source for a new version; it is never reactivated. */
export const TEST_PROFILE_TEMPLATE = '69f01d12-fe20-40e4-bd52-282bd2bf74ba';
export const TEST_TAG = 'TEST ONLY — TECHNICAL CERTIFICATION — NOT FSRA REGULATORY POLICY';
/** TEST judgement rule (TEST ONLY): upward only, at most one rating step, rationale of at least 40 characters. */
export const TEST_JUDGEMENT = { direction: 'UPWARD', maxSteps: 1, minRationale: 40 } as const;
/** AML-CLOSE-08A TEST SLA rule (TEST ONLY — synthetic): plan opened within 1 calendar day, hold permitted. */
export const TEST_SLA = { days: 1, warning: 50, stage: 'TEST AML08A open supervisory plan', rating: 'MEDIUM_HIGH', ratingLabel: 'MEDIUM_HIGH', ratingOption: /^Medium[ _-]?high$/i } as const;
