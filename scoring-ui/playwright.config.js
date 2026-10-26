import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:3099',
    locale: 'fi-FI',
    trace: 'off',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
      testIgnore: /tablet\.spec\.js/,
    },
    {
      name: 'tablet',
      use: {
        browserName: 'chromium',
        viewport: { width: 1024, height: 768 },
        hasTouch: true,
      },
      testMatch: /tablet\.spec\.js/,
    },
  ],
  webServer: {
    command: 'node ../scoring-proxy/test/e2e/start-e2e-servers.js',
    url: 'http://127.0.0.1:3099/api/v1/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
})
