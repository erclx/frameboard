import { join } from 'node:path'

import { FRAME_SIZES } from '@/shared/frame-sizes'

import { layOne } from '../drive-seed.ts'

/** The feed in a phone frame as tall as its page, off Scroll, so present mode and Play show one screen that scrolls. */
const PHONE_FEED = { project: 'webapp', page: 'phone-feed', frame: 'feed' }

/** The feed's twelve 172 tall sections, their gaps, and padding, 2272, under the phone's 54 tall status bar. */
const PHONE_FEED_HEIGHT = 2326

const FEED_PAGE = join(import.meta.dirname, '../drive-feed.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, PHONE_FEED, FEED_PAGE, {
    width: FRAME_SIZES.phone.width,
    height: PHONE_FEED_HEIGHT,
    showDevice: true,
  })
}
