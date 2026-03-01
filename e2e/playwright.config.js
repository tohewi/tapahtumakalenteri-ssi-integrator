// ============================================================
// Playwright Configuration — UAT Tests for Match Management Platform
//
// Environment variables:
//   BASE_URL            - Target deployment (default: http://localhost:3001)
//   PLATFORM_EMAIL      - Owner account email (required)
//   PLATFORM_PASSWORD   - Owner account password (required)
//
// Usage:
//   npm test                          # headless, all browsers
//   npm run test:headed               # visible browser
//   BASE_URL=https://example.com npm test
// ============================================================

import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.BASE_URL || 'http://localhost:3001'

export default defineConfig({
  testDir: './tests',

  // Run tests in parallel within a file, but serial across files to avoid
  // shared test-data races (invitation tokens, account creation, etc.)
  fullyParallel: false,
  workers: 1,

  // Retry once on CI to handle transient network blips from preview env wakeup
  retries: process.env.CI ? 1 : 0,

  // Fail the suite if any test is left pending
  forbidOnly: !!process.env.CI,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list'], ['html', { open: 'on-failure', outputFolder: 'playwright-report' }]],

  use: {
    baseURL,
    // Capture screenshots / traces on failure for CI debugging
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // Preview environments can be slow to wake up
    navigationTimeout: 30_000,
    actionTimeout: 15_000,
  },

  // Run only on Chromium for UAT to keep CI fast.
  // Add Firefox / WebKit back if cross-browser coverage is needed.
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Allow up to 60 s per test (preview environments are on free-tier and may
  // be slow during first request after sleep).
  timeout: 60_000,
})
