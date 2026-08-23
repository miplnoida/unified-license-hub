import { test, expect } from '@playwright/test';
import { PERSONAS } from './support/personas';
import { loginAs } from './support/auth';

/**
 * WAVE 3A / SCN-SURFACE — discovery pass over the process work surfaces each
 * internal persona owns. This test is a gap detector: it fails on server
 * rejections (4xx/5xx) or unhandled runtime errors raised while the owning
 * persona opens its own queue. Findings feed the Wave 3A gap register.
 */

interface Surface { code: string; persona: string; routes: string[] }

const SURFACES: Surface[] = [
  { code: 'P03-LICENSING', persona: PERSONAS.licensingOfficer, routes: ['/applications/queue', '/licensing/onboarding-oversight'] },
  { code: 'P04-LICENCE', persona: PERSONAS.licensingSupervisor, routes: ['/licenses', '/licenses/lifecycle'] },
  { code: 'P05-FITPROPER', persona: PERSONAS.fitProperOfficer, routes: ['/fpa', '/fpa/individuals'] },
  { code: 'P06-RETURNS', persona: PERSONAS.returnsOfficer, routes: ['/returns/queue', '/returns/obligations', '/returns/calendar'] },
  { code: 'P07-PRUDENTIAL', persona: PERSONAS.prudentialAnalyst, routes: ['/prudential/work', '/prudential/dashboard', '/supervision/early-warnings'] },
  { code: 'P08-CONDUCT', persona: PERSONAS.conductAnalyst, routes: ['/conduct/work-queue', '/conduct/alerts'] },
  { code: 'P09-COMPLAINTS', persona: PERSONAS.complaintsOfficer, routes: ['/complaints', '/complaints/escalations'] },
  { code: 'P10-INSPECTION', persona: PERSONAS.inspector, routes: ['/inspections', '/prudential/examinations'] },
  { code: 'P11-ENFORCEMENT', persona: PERSONAS.enforcementOfficer, routes: ['/enforcement'] },
  { code: 'P12-CORRESPONDENCE', persona: PERSONAS.superAdmin, routes: ['/correspondence/inbox', '/correspondence/threads'] },
  { code: 'P13-ENTITY-RES', persona: PERSONAS.entityResolutionOfficer, routes: ['/licensing/entity-resolution', '/entities'] },
];

for (const s of SURFACES) {
  test(`SCN-SURFACE-${s.code}: owning persona opens its work surfaces cleanly`, async ({ page }) => {
    const failures: string[] = [];
    page.on('console', m => {
      if (m.type() === 'error') failures.push(`console: ${m.text().slice(0, 240)}`);
    });
    page.on('pageerror', e => failures.push(`pageerror: ${String(e.message).slice(0, 240)}`));
    page.on('response', r => {
      if (r.status() >= 400 && !r.url().includes('/auth/v1/')) {
        failures.push(`http ${r.status()} ${r.url().split('?')[0].slice(-90)}`);
      }
    });

    await loginAs(page, s.persona);
    failures.length = 0; // only judge the process surfaces, not the login hop

    for (const route of s.routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(3000);
      const body = (await page.locator('body').innerText().catch(() => '')) || '';
      expect(body.length, `${route} rendered an empty document for ${s.code}`).toBeGreaterThan(50);
      if (/access denied|not authorized|unauthorized|permission denied/i.test(body)) {
        failures.push(`denied-ui ${route}`);
      }
    }

    expect(failures, `${s.code} surface defects`).toEqual([]);
  });
}
