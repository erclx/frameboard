import { describe, expect, it } from 'vitest'

import type { FrameGap } from './gap'
import { newestOnly } from './gap'

/** A gap answer naming only the parent it lands in, which tells one answer from another. */
function gap(parent: number): FrameGap {
  return {
    frame: { ref: 'studio/home/hero' } as FrameGap['frame'],
    hash: 'c'.repeat(64),
    gap: {
      parent,
      before: null,
      row: false,
      flow: false,
      origin: { x: 0, y: 0 },
      room: 0,
      line: { x: 0, y: 0, width: 0, height: 0 },
    },
  }
}

/** A promise and the function that settles it, so a test orders the answers. */
function answer(): {
  asked: Promise<FrameGap | null>
  give: (value: FrameGap | null) => void
} {
  let give: (value: FrameGap | null) => void = () => {}
  const asked = new Promise<FrameGap | null>((resolve) => {
    give = resolve
  })
  return { asked, give }
}

describe('newestOnly', () => {
  it("draws the newer move's answer when the older one answers last", async () => {
    const drawn: (number | null)[] = []
    const newest = newestOnly()
    const older = answer()
    const newer = answer()

    newest(older.asked, (under) => drawn.push(under?.gap.parent ?? null))
    newest(newer.asked, (under) => drawn.push(under?.gap.parent ?? null))
    newer.give(gap(2))
    await newer.asked
    older.give(gap(1))
    await older.asked

    expect(drawn).toEqual([2])
  })

  it('draws each answer that lands in order', async () => {
    const drawn: (number | null)[] = []
    const newest = newestOnly()
    const first = answer()
    const second = answer()

    newest(first.asked, (under) => drawn.push(under?.gap.parent ?? null))
    newest(second.asked, (under) => drawn.push(under?.gap.parent ?? null))
    first.give(gap(1))
    await first.asked
    second.give(gap(2))
    await second.asked

    expect(drawn).toEqual([1, 2])
  })

  it('drops an answer still out once a null draws, as a leave does', async () => {
    const drawn: (number | null)[] = []
    const newest = newestOnly()
    const out = answer()

    newest(out.asked, (under) => drawn.push(under?.gap.parent ?? null))
    newest(null, () => drawn.push(null))
    out.give(gap(1))
    await out.asked

    expect(drawn).toEqual([null])
  })
})
