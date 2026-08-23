import { test, expect } from '@playwright/test';
import { PERSONAS } from './support/personas';
import { loginAs } from './support/auth';

/**
 * WAVE 3A / SCN-AUTH — every certification persona must be able to
 * authenticate through the real login UI and reach an authenticated surface.
 */
const SUBJECTS: Array<[string, string]> = [
  ['super_admin', PERSONAS.superAdmin],
  ['licensing_officer', PERSONAS.licensingOfficer],
  ['licensing_supervisor', PERSONAS.licensingSupervisor],
  ['returns_officer', PERSONAS.returnsOfficer],
  ['returns_supervisor', PERSONAS.returnsSupervisor],
  ['prudential_supervisor', PERSONAS.prudentialSupervisor],
  ['complaints_officer', PERSONAS.complaintsOfficer],
  ['inspector', PERSONAS.inspector],
  ['enforcement_officer', PERSONAS.enforcementOfficer],
  ['fit_proper_officer', PERSONAS.fitProperOfficer],
  ['auditor', PERSONAS.auditor],
  ['read_only', PERSONAS.readOnly],
  ['applicant_user', PERSONAS.applicant],
  ['licensee_primary_user', PERSONAS.licenseePrimary],
  ['licensee_secondary_user', PERSONAS.licenseeSecondary],
  ['entity_ppoc', PERSONAS.entityPpoc],
];

for (const [label, email] of SUBJECTS) {
  test(`SCN-AUTH-${label}: authenticates via real login UI`, async ({ page }) => {
    const landing = await loginAs(page, email);
    expect(landing, `${label} should not remain on /login`).not.toBe('/login');
  });
}
