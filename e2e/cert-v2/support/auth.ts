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
  // Observe (never alter) the real auth response so a failure is diagnosable.
  // Only status, content-type, duration, request id and a safe error code are kept;
  // request bodies, headers and tokens are never read.
  const started = Date.now();
  const tokenResponse = page
    .waitForResponse((r) => r.url().includes('/auth/v1/token'), { timeout: 60_000 })
    .catch(() => null);
  // Scope to the login form: the public nav also carries a "Login" button.
  await page.locator('form button[type="submit"]').first().click();
  // Never let the credential survive into a failure snapshot or trace.
  await page.locator('#login-password').fill('').catch(() => {});

  // Either we land on an authenticated route, MFA is requested, or an error toast appears.
  const res = await tokenResponse;
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle').catch(() => {});
  const path = new URL(page.url()).pathname;
  if (path === '/login') {
    let code = '';
    if (res && res.status() < 500) {
      try {
        const body = (await res.json()) as { error_code?: string; error?: string; code?: string | number };
        code = String(body.error_code ?? body.error ?? body.code ?? '').replace(/[A-Za-z0-9_-]{24,}/g, '[redacted]');
      } catch { /* non-JSON body */ }
    }
    const diag = res
      ? `login failed: HTTP ${res.status()} / ${res.headers()['content-type'] ?? 'unknown'} / ${code || 'no-error-code'} / ${Date.now() - started}ms / req ${res.headers()['sb-request-id'] ?? res.headers()['cf-ray'] ?? 'n/a'}`
      : `login failed: no /auth/v1/token response within 60s`;
    console.log(`[auth-diag] ${email} ${diag}`);
  }
  return path;
}


export async function expectAuthenticated(page: Page, email: string) {
  const path = await loginAs(page, email);
  expect(path, `login for ${email} should leave /login`).not.toBe('/login');
  return path;
}

/** Navigate directly to a route and report what the app actually rendered. */
export async function probeRoute(page: Page, route: string) {
  // Wait for an explicit authorization outcome instead of a fixed sleep:
  // redirect, Access Denied marker, 404, or rendered content with no loading screen.
  await page.goto(route, { waitUntil: 'domcontentloaded' });
  let state: 'redirected' | 'denied' | 'notFound' | 'rendered' | 'unresolved' = 'unresolved';
  let stableSince = 0;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const path = new URL(page.url()).pathname;
    if (path !== route) { state = 'redirected'; break; }
    if (await page.locator('[data-route-state="denied"]').count()) { state = 'denied'; break; }
    const body = (await page.locator('body').innerText().catch(() => '')) || '';
    if (/404|page not found/i.test(body)) { state = 'notFound'; break; }
    const loading = await page.locator('[data-route-state="loading"]').count();
    if (!loading && body.trim().length > 0) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince > 1500) { state = 'rendered'; break; }
    } else stableSince = 0;
    await page.waitForTimeout(200);
  }
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const path = new URL(page.url()).pathname;
  const denied = state === 'denied' || /access denied|not authorized|unauthori[sz]ed|forbidden|no access/i.test(body) && state !== 'rendered';
  return {
    path, state,
    unresolved: state === 'unresolved',
    redirected: state === 'redirected',
    denied, notFound: state === 'notFound',
    text: body.slice(0, 4000),
  };
}
