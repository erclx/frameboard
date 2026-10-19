import { describe, expect, it } from 'vitest'

import { copyFrameImage } from './copy-image'

describe('copyFrameImage', () => {
  it('starts the clipboard write before the image arrives, inside the key press', () => {
    const items: ClipboardItem[][] = []
    const clipboard = {
      write: async (data: ClipboardItem[]) => {
        items.push(data)
        // No board serves the image here, so the pending value refuses.
        await data[0]?.getType('image/png').catch(() => null)
      },
    }

    void copyFrameImage('studio/home/hero', 'dark', clipboard)

    expect(items).toHaveLength(1)
    expect(items[0]?.[0]?.types).toEqual(['image/png'])
  })
})
