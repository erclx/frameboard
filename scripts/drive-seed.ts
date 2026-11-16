// Lays the states a drive films into the drive copy's `basic` board: a
// 40-frame `marketing/crowd` page, an animated `marketing/motion` frame, a
// `webapp/raw` frame stating raw colors, a scrolling `webapp/feed` phone
// frame, a `webapp/deck` page of three slides, a `webapp/shapes` frame of free
// elements, a `webapp/stacked` page of three frames, a Drives folder of two
// projects, and a live reservation on `webapp/settings`. The committed
// fixture lacks them so the evidence baselines never move. Run by the
// `seed` key in `canon/config/preview.json` after each drive-copy rebuild.
// CANON_PREVIEW_ROOT is required, never defaulting to `.`, since a bare run
// would write into the tracked fixture.
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
  `Seeded ${board}: crowd page ${seeded.crowd}, motion page ${seeded.motion}, raw colors page ${seeded.raw}, feed page ${seeded.feed}, deck page ${seeded.deck}, webapp transition ${seeded.transition}, shapes page ${seeded.shapes}, stacked page ${seeded.stacked}, tuner page ${seeded.tuner}, Drives folder ${seeded.folder}, reserved ${seeded.reserved.join(', ')}`,
)
