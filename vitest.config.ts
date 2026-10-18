import { playwright } from '@vitest/browser-playwright'
import { defineConfig, mergeConfig } from 'vitest/config'

import viteConfig from './vite.config.ts'

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: import.meta.dirname,
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
