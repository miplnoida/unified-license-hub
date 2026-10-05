import { test, expect } from '@playwright/test';
import { loginAs } from '/dev-server/e2e/cert-v2/support/auth';
import { persona } from '/dev-server/e2e/cert-v2/support/personas';
test('settings screen hides provider secret', async ({ page }) => {
  const bodies: string[] = [];
  page.on('response', async (r) => { if (/site_settings|email_provider/.test(r.url())) bodies.push(await r.text().catch(() => '')); });
  await loginAs(page, persona('super_admin'));
  await page.goto(process.env.ROUTE!, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: '/tmp/browser/rec/settings.png' });
  const html = await page.content();
  console.log('placeholder-keep', /Leave blank to keep existing password/.test(html), 'responses', bodies.length, 'secretInResponses', bodies.some((b) => /"password"\s*:|"apiKey"\s*:|"value"\s*:\s*"[^"]{12,}"/.test(b) && /smtp_password|password/.test(b)));
});
