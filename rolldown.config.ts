import { fileURLToPath } from 'node:url'

import { defineConfig } from 'rolldown'

const resolve = {
  alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
}

// One config per entry, so a later entry never shares a chunk with the CLI.
export default defineConfig([
  {
    input: 'src/cli/index.ts',
    platform: 'node',
    resolve,
    output: {
      file: 'dist/cli.js',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  },
  // The plugin's write hook, kept apart so it loads the rules and nothing else.
  {
    input: 'src/cli/hook.ts',
    platform: 'node',
    resolve,
    output: { file: 'dist/hook.js', format: 'esm' },
  },
])
