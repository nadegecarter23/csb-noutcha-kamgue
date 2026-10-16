import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const e2ePort = process.env.E2E_PORT ?? '5173';
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: './e2e',
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? join(tmpdir(), 'csbnk-playwright'),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: e2eBaseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(process.env.CI ? {} : { channel: 'chrome' as const }),
  },
  projects: [
    { name: 'desktop-chrome', grep: /@desktop/, use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', grep: /@mobile/, use: { ...devices['Pixel 7'] } },
    {
      name: 'tablet-chrome',
      grep: /@tablet/,
      use: {
        viewport: { width: 820, height: 1180 },
        deviceScaleFactor: 1,
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port ${e2ePort}`,
    url: e2eBaseUrl,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
