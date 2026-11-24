import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one frame of a button a rule styles, a card a rule places
 * with a badge of its own, and a table, so an element in the flow and a placed
 * one drag out of it and a table row is refused.
 */
const DRAG_OUT = { project: 'webapp', page: 'dragout', frame: 'assistant' }

const ASSISTANT_PAGE = join(import.meta.dirname, '../drive-dragout.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, DRAG_OUT, ASSISTANT_PAGE, { width: 640, height: 400 })
}
