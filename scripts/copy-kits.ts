// Copies the shipped kits into dist/kits/, beside the bundle, which reads
// them from there once built.
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { SHIPPED_KITS } from '../src/shared/kits'

const from = fileURLToPath(
  new URL('../src/server/kits/shipped', import.meta.url),
)
const out = fileURLToPath(new URL('../dist/kits', import.meta.url))

rmSync(out, { recursive: true, force: true })
cpSync(from, out, { recursive: true })
console.log(`Copied ${SHIPPED_KITS.length} kits into ${out}`)
