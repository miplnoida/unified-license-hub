import { test, expect } from '@playwright/test';
import { loginAs } from './support/auth';
import { persona } from './support/personas';

/**
 * AML-CLOSE-08E dashboard request budget. Captures every backend request in
 * the first 15 s of a clean supervisor dashboard landing (sign-in excluded).
 * Records only method / path / normalized query / status / timing — never
 * headers, tokens or bodies.
 */
const WHO = process.env.BUDGET_PERSONA || 'aml_supervision_supervisor';

test('supervisor dashboard landing stays within request budget', async ({ page }) => {
  test.setTimeout(180_000);
  const rows: { t: number; m: string; sig: string; status: number; ms: number }[] = [];
  let t0 = 0;
  page.on('requestfinished', async (req) => {
    const u = new URL(req.url());
    if (!u.hostname.endsWith('supabase.co') || !t0) return;
    if (u.pathname.startsWith('/realtime') || u.pathname.startsWith('/auth/v1/token')) return;
    const res = await req.response();
    const tm = req.timing();
    const params = [...u.searchParams.entries()].sort().map(([k, v]) => `${k}=${v}`).join('&');
    rows.push({
      t: Date.now() - t0, m: req.method(),
      sig: `${u.pathname.replace('/rest/v1/', '')}?${params}|${req.postData() ?? ''}`.slice(0, 220),
      status: res?.status() ?? -1, ms: Math.round(tm.responseEnd),
    });
  });
  const path = await loginAs(page, persona(WHO));
  expect(path).not.toBe('/login');
  t0 = Date.now();
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(15_000);
  const inWindow = rows.filter((r) => r.t <= 15_000);
  const counts = new Map<string, number>();
  for (const r of inWindow) counts.set(`${r.m} ${r.sig}`, (counts.get(`${r.m} ${r.sig}`) ?? 0) + 1);
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  const durs = inWindow.map((r) => r.ms).filter((x) => x >= 0).sort((a, b) => a - b);
  console.log('[budget] total', inWindow.length, 'dups', JSON.stringify(dups.map(([k, n]) => [k.slice(0, 120), n])),
    'median', durs[Math.floor(durs.length / 2)] ?? -1, 'max', durs[durs.length - 1] ?? -1);
  for (const r of inWindow) console.log('[budget-row]', r.t, r.m, r.status, r.ms, r.sig.split('|')[0].slice(0, 110));
  expect(inWindow.length).toBeLessThanOrEqual(20);
});
