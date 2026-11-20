import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

import { layOne } from '../drive-seed.ts'

/**
 * The page holding one phone frame on Scroll over a feed about twice its
 * screen, so the rail, the Height row's round trip, and a scroll frame with
 * no overflow ghost have a frame to show.
 */
const FEED = { project: 'webapp', page: 'feed', frame: 'feed-scroll' }

const FEED_PAGE = join(import.meta.dirname, '../drive-feed.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, FEED, FEED_PAGE, { ...FRAME_SIZES.phone, scroll: true })
}
