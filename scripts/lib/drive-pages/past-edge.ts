import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/** The page holding one clipped frame with an element below its edge and one crossing it. */
const PAST_EDGE = { project: 'webapp', page: 'past-edge', frame: 'edges' }

const EDGES_PAGE = join(import.meta.dirname, '../drive-past-edge.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, PAST_EDGE, EDGES_PAGE)
}
