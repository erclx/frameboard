import { join } from 'node:path'

import { POSE_SIZES } from '@/shared/frame-device'

import { layOne } from '../drive-seed.ts'

/**
 * One frame naming the foldable, closed, holding a page that goes from one
 * column to two as it opens, so the pose buttons have a frame to fold.
 */
const FOLD = { project: 'webapp', page: 'fold', frame: 'inbox' }

const FOLD_PAGE = join(import.meta.dirname, '../drive-fold.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, FOLD, FOLD_PAGE, {
    ...POSE_SIZES.closed,
    showDevice: true,
    foldable: true,
    pose: 'closed',
  })
}
