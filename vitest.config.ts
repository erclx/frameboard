import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: import.meta.dirname,
    // The base config's `strictPort: true` suits dev and preview, which must
    // fail loud on a taken port, but it reaches vitest's browser server too,
    // so parallel runs fail with "Port 63315 is already in use". Let it hop.
    server: { strictPort: false },
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            include: [
              'src/{cli,server,shared}/**/*.test.ts',
              'scripts/**/*.test.ts',
            ],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            include: ['src/client/**/*.test.{ts,tsx}'],
            setupFiles: ['src/test/setup.ts'],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              // Wide enough for the board's panels, which hide below 1024.
              viewport: { width: 1280, height: 800 },
              instances: [{ browser: 'chromium' }],
            },
          },
        },
      ],
    },
  }),
)
