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
const states = Object.entries(seeded.seeds).map(
  ([page, state]) => `${page} ${state}`,
)
console.log(
  `Seeded ${board}: ${states.join(', ')}, reserved ${seeded.reserved.join(', ')}`,
)
