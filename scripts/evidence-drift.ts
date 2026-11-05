// Runs the full capture twice on one head and sorts every evidence image into
// noise (the runs disagree), stale (the runs agree against the committed set),
// or equal, within the raster tolerance `scripts/lib/evidence-drift.ts` states.
// Each run writes into its own folder under `screenshots/drift/`, which stays
// behind so a listed image can be opened, and the committed set is only read.
// Reports and never gates, so it exits 0 whatever the lists hold.
import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { join } from 'node:path'

import { listImages, sortDrift } from './lib/evidence-drift.ts'

const COMMITTED = 'e2e/evidence'
const RUNS_ROOT = 'screenshots/drift'

function capture(root: string): ReadonlyMap<string, string> {
  console.log(`Capturing into ${root}`)
  const run = spawnSync('bun', ['run', 'screenshot'], {
    env: { ...process.env, FRAMEBOARD_EVIDENCE_ROOT: root },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  if (run.status !== 0) {
    console.error(`The capture into ${root} exited ${run.status}`)
    process.exit(1)
  }
  return listImages(root)
}

function list(name: string, images: readonly string[]): void {
  console.log(`\n${name}: ${images.length}`)
  for (const image of images) console.log(`  ${image}`)
}

rmSync(RUNS_ROOT, { recursive: true, force: true })
const first = capture(join(RUNS_ROOT, 'run-1'))
const second = capture(join(RUNS_ROOT, 'run-2'))
const { noise, stale, equal, tolerated } = sortDrift(
  listImages(COMMITTED),
  first,
  second,
)

list('noise', noise)
list('stale', stale)
console.log(`\nequal: ${equal.length}`)
list('of which within the raster tolerance', tolerated)
console.log(`\ntotal: ${noise.length + stale.length + equal.length}`)
