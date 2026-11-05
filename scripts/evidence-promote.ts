// Copies a capture's evidence over the committed set, skipping any image within
// the raster tolerance, so a run on an unchanged head rewrites nothing.
// Usage: bun scripts/evidence-promote.ts <captured-root>
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { changedImages, listImages } from './lib/evidence-drift.ts'

const COMMITTED = 'e2e/evidence'

const [root] = process.argv.slice(2)
if (!root) {
  console.error('Usage: bun scripts/evidence-promote.ts <captured-root>')
  process.exit(2)
}

const captured = listImages(root)
for (const image of changedImages(captured, listImages(COMMITTED))) {
  const target = join(COMMITTED, image)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(join(root, image), target)
  console.log(`updated ${target}`)
}
