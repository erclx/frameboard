import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one frame of two free shapes, two free texts side by
 * side, and one text in the flow, so a group has members to box, move,
 * scale, align, and wrap, and Arrange has a selection it refuses.
 */
const GROUP = { project: 'webapp', page: 'shapes', frame: 'group' }

const GROUP_PAGE = join(import.meta.dirname, '../drive-group.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, GROUP, GROUP_PAGE)
}
