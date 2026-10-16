import { defineConfig } from '@playwright/test'

// A measurement of the operator's own browser, so never part of the gate.
export default defineConfig({
  testDir: '.',
  testMatch: '*.perf.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: 'list',
  use: {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1440, height: 900 },
  },
})
