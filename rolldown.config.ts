import { fileURLToPath } from 'node:url'

import { defineConfig } from 'rolldown'

// One config per entry, so a later entry never shares a chunk with the CLI.
export default defineConfig([
  {
    input: 'src/cli/index.ts',
    platform: 'node',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    output: {
      file: 'dist/cli.js',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  },
])
