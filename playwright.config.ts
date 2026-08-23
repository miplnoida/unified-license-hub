import { defineConfig, devices } from '@playwright/test';

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
    ['json', { outputFile: 'e2e/.artifacts/results.json' }],
    ['html', { outputFolder: 'e2e/.artifacts/report', open: 'never' }],
  ],
  outputDir: 'e2e/.artifacts/output',
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
          executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
});
