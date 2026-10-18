import { execFileSync } from 'node:child_process'

import { defineConfig, devices } from '@playwright/test'

// The test:e2e scripts export the offset; a bare `playwright test` derives the
// same one, so a linked worktree never serves on the main checkout's port.
const offset =
  process.env.WORKTREE_PORT_OFFSET ??
  execFileSync('bash', ['scripts/worktree-port.sh'], {
    encoding: 'utf8',
  }).trim()
const port = 4173 + Number(offset)
const serve = `node dist/cli.js serve --root test/fixtures/boards/basic --no-open --port ${port}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  testIgnore: 'perf/**',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI downloads dist/ from the build job and sets DIST_PREBUILT, so the
    // server starts on that output rather than rebuilding it.
    command: process.env.DIST_PREBUILT ? serve : `bun run build && ${serve}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
