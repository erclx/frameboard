import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * A frame between two scripts holding a flex container to hide, a hidden grid
 * to show, and a locked backdrop behind them both.
 */
const FLAGS = { project: 'webapp', page: 'flags', frame: 'flags' }

const FLAGS_PAGE = join(import.meta.dirname, '../drive-flags.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, FLAGS, FLAGS_PAGE)
}
