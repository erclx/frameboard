// Lays the drive's states into the drive copy, kept out of the fixture so the
// evidence baselines never move. CANON_PREVIEW_ROOT is required, since a bare
// run would write into the tracked fixture.
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
  `Seeded ${board}: crowd page ${seeded.crowd}, motion page ${seeded.motion}, raw colors page ${seeded.raw}, feed page ${seeded.feed}, deck page ${seeded.deck}, device page ${seeded.device}, foldable page ${seeded.fold}, phone feed page ${seeded.phoneFeed},webapp transition ${seeded.transition}, shapes page ${seeded.shapes}, stacked page ${seeded.stacked}, tuner page ${seeded.tuner}, mixed text page ${seeded.mixed}, tilted card page ${seeded.tilt}, model page ${seeded.model}, Drives folder ${seeded.folder}, long sheet path ${seeded.longPath}, reserved ${seeded.reserved.join(', ')}`,
)
