import { defineConfig, devices } from '@playwright/test';

// Promo captures: same build and port as the E2E suite, but a 1600×900 window and no time limit
// worth worrying about (frames are stepped by hand, so slow machines only take longer).
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.promo\.ts/,
  timeout: 600_000,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4317',
    ...devices['Desktop Chrome'],
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'pnpm --filter @dead-sector/game build && pnpm --filter @dead-sector/game preview',
    url: 'http://localhost:4317',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
