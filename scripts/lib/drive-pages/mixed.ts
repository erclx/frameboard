import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/** The page holding one frame of list items whose text sits beside an inline child, so a double-click edits one run. */
const MIXED = { project: 'webapp', page: 'mixed', frame: 'notes' }

const MIXED_PAGE = join(import.meta.dirname, '../drive-mixed.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, MIXED, MIXED_PAGE)
}
