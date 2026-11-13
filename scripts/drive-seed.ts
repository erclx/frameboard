// Lays the states a drive films into the drive copy's `basic` board, being a
// 40-frame `marketing/crowd` page, an animated `marketing/motion` frame, a
// `marketing/raw` frame stating raw colors, and a
// live reservation on `webapp/settings`,
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
  `Seeded ${board}: crowd page ${seeded.crowd}, motion page ${seeded.motion}, reserved ${seeded.reserved.join(', ')}`,
)
