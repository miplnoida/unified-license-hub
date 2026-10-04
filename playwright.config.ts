import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve the Chromium already present in the environment. The bundled
 * browser revision expected by @playwright/test may not match the preinstalled
 * one, so we bind to whatever full Chromium build exists.
 */
function resolveChromium(): string | undefined {
  if (process.env.E2E_CHROMIUM_PATH) return process.env.E2E_CHROMIUM_PATH;
  const root = '/opt/ms-playwright';
  if (!fs.existsSync(root)) return undefined;
  const dir = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort().pop();
  if (!dir) return undefined;
  const bin = path.join(root, dir, 'chrome-linux', 'chrome');
  return fs.existsSync(bin) ? bin : undefined;
}


/**
 * Enterprise SupTech certification browser E2E configuration.
 *
 * Specs live under e2e/cert-v2/ and drive the REAL application:
 * real login UI, real routes, real controls, real backend.
 *
 * Credentials are read from CERT_V2_DEFAULT_PASSWORD at runtime and are
 * never written into specs, reports or traces.
 */
export default defineConfig({
  testDir: './e2e/cert-v2',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: '/tmp/e2e-artifacts/results.json' }],
    ['html', { outputFolder: '/tmp/e2e-artifacts/report', open: 'never' }],
  ],
  outputDir: process.env.E2E_OUTPUT_DIR ?? '/tmp/e2e-artifacts/output',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          executablePath: resolveChromium(),
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
