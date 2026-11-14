// Lays the states a drive films into the drive copy's `basic` board, being a
// 40-frame `marketing/crowd` page, an animated `marketing/motion` frame, a
// `webapp/raw` frame stating raw colors, a `webapp/feed` phone frame that
// scrolls, a `webapp/deck` page of three slides, the last arriving with webapp's own
// `wipe` transition, a `webapp/shapes` frame of free elements, a `webapp/stacked` page of three frames whose lower two hide their labels, a Drives folder of two
// projects, and a live reservation on
// `webapp/settings`,
// which the committed fixture lacks so the evidence baselines never move. Run
// by the `launch` line in `canon/config/app-drive.toml` before `preview`.
//
// CANON_PREVIEW_ROOT names the checkout whose board is seeded, the way
// `scripts/preview.ts` reads it, and is required here rather than defaulting to
// `.`, since a bare run would write into the tracked fixture.
import { join } from 'node:path'

import { seedDrive } from './lib/drive-seed.ts'

const copy = process.env.CANON_PREVIEW_ROOT
if (!copy) {
  console.error(
    'CANON_PREVIEW_ROOT is not set. Point it at a drive copy, since seeding this checkout writes into test/fixtures/boards/basic.',
  )
  process.exit(1)
}

const board = join(copy, 'test', 'fixtures', 'boards', 'basic')
const seeded = await seedDrive(board, new Date())
console.log(
  `Seeded ${board}: crowd page ${seeded.crowd}, motion page ${seeded.motion}, raw colors page ${seeded.raw}, feed page ${seeded.feed}, deck page ${seeded.deck}, webapp transition ${seeded.transition}, shapes page ${seeded.shapes}, stacked page ${seeded.stacked}, Drives folder ${seeded.folder}, reserved ${seeded.reserved.join(', ')}`,
)
