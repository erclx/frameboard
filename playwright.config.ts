import { defineConfig, devices } from '@playwright/test'

const port = 4173 + Number(process.env.WORKTREE_PORT_OFFSET ?? 0)
const serve = `node dist/cli.js serve --port ${port}`

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
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
