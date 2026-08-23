import { Page, expect } from '@playwright/test';
import { certPassword } from './personas';

/**
 * Authenticate through the REAL login UI (no session injection).
 * Returns the landing route after authentication.
 */
export async function loginAs(page: Page, email: string): Promise<string> {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(certPassword());
  // Scope to the login form: the public nav also carries a "Login" button.
  await page.locator('form button[type="submit"]').first().click();
  // Never let the credential survive into a failure snapshot or trace.
  await page.locator('#login-password').fill('').catch(() => {});

  // Either we land on an authenticated route, MFA is requested, or an error toast appears.
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});
  return new URL(page.url()).pathname;
}


export async function expectAuthenticated(page: Page, email: string) {
  const path = await loginAs(page, email);
  expect(path, `login for ${email} should leave /login`).not.toBe('/login');
  return path;
}

/** Navigate directly to a route and report what the app actually rendered. */
export async function probeRoute(page: Page, route: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const path = new URL(page.url()).pathname;
  const denied = /access denied|not authorized|unauthorised|unauthorized|permission|forbidden|no access/i.test(body);
  const notFound = /404|page not found|doesn't exist|not found/i.test(body);
  const redirected = path !== route;
  return { path, redirected, denied, notFound, text: body.slice(0, 4000) };
}
