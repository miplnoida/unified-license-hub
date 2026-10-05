import { test, expect } from '@playwright/test';
import { PERSONAS } from './support/personas';
import { loginAs, probeRoute } from './support/auth';

/**
 * WAVE 3A / SCN-BOUNDARY — declared audience boundaries are authoritative.
 * External users must not reach internal supervisory routes by direct URL, and
 * read-only/auditor personas must not reach mutation surfaces.
 */

const INTERNAL_ONLY = [
  '/returns/queue',
  '/prudential/work',
  '/conduct/work-queue',
  '/enforcement',
  '/inspections',
  '/admin/users',
  '/admin/roles',
  '/admin/audit-logs',
  '/licensing/entity-resolution',
];

const EXTERNAL_PERSONAS: Array<[string, string]> = [
  ['applicant_user', PERSONAS.applicant],
  ['licensee_primary_user', PERSONAS.licenseePrimary],
  ['entity_ppoc', PERSONAS.entityPpoc],
];

for (const [label, email] of EXTERNAL_PERSONAS) {
  test(`SCN-BOUNDARY-EXT-${label}: internal routes are refused by direct URL`, async ({ page }) => {
    await loginAs(page, email);
    const leaks: string[] = [];
    const unresolved: string[] = [];
    for (const route of INTERNAL_ONLY) {
      const r = await probeRoute(page, route);
      if (r.unresolved) { unresolved.push(route); continue; }
      const blocked = r.denied || r.notFound || r.redirected;
      if (!blocked) leaks.push(`${route} rendered for ${label} (final path ${r.path})`);
    }
    expect(leaks, `cross-audience route leaks for ${label}`).toEqual([]);
    expect(unresolved, `routes never resolved an authorization outcome for ${label}`).toEqual([]);
  });
}

test('SCN-BOUNDARY-AUDITOR: auditor reaches read surfaces but no admin mutation surface', async ({ page }) => {
  await loginAs(page, PERSONAS.auditor);
  const leaks: string[] = [];
  for (const route of ['/admin/users', '/admin/roles', '/settings/security']) {
    const r = await probeRoute(page, route);
    if (!(r.denied || r.notFound || r.redirected)) leaks.push(`${route} rendered for auditor`);
  }
  expect(leaks, 'auditor admin-surface leaks').toEqual([]);
});

test('SCN-BOUNDARY-READONLY: read_only persona cannot reach configuration surfaces', async ({ page }) => {
  await loginAs(page, PERSONAS.readOnly);
  const leaks: string[] = [];
  for (const route of ['/admin/roles', '/admin/forms', '/settings/security']) {
    const r = await probeRoute(page, route);
    if (!(r.denied || r.notFound || r.redirected)) leaks.push(`${route} rendered for read_only`);
  }
  expect(leaks, 'read_only configuration leaks').toEqual([]);
});
