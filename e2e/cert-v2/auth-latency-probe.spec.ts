import { test, expect } from '@playwright/test';
import { loginAs } from './support/auth';

/**
 * AML-CLOSE-08D auth latency probe: 10 sequential REAL UI sign-ins as the
 * persona whose login failed in the isolated suite. Only timings/status are
 * reported; credentials and tokens are never logged.
 */
const WHO = process.env.PROBE_PERSONA || 'aml_supervision_officer@mishainfotech.com';

test('10 sequential UI sign-ins succeed', async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const results: { i: number; ms: number; status: number | null; path: string }[] = [];
  for (let i = 1; i <= 10; i++) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    let status: number | null = null;
    let ms = 0;
    page.on('response', (r) => {
      if (r.url().includes('/auth/v1/token')) {
        status = r.status();
        ms = Math.round(r.request().timing().responseEnd);
      }
    });
    const path = await loginAs(page, WHO);
    results.push({ i, ms, status, path });
    await ctx.close();
  }
  console.log('[auth-probe]', JSON.stringify(results));
  expect(results.filter((r) => r.path === '/login')).toEqual([]);
});
