import { describe, expect, it } from 'vitest'

import { mountedRefs } from './cull'

const VIEWPORT = { width: 1000, height: 800 }

function frameAt(ref: string, x: number, y: number) {
  return { ref, box: { x, y, width: 100, height: 100 } }
}

describe('mountedRefs', () => {
  it('keeps a frame inside the viewport', () => {
    const refs = mountedRefs(
      [frameAt('in', 10, 10)],
      { x: 0, y: 0, k: 1 },
      VIEWPORT,
    )

    expect([...refs]).toEqual(['in'])
  })

  it('keeps a frame within one viewport past the right edge', () => {
    const refs = mountedRefs(
      [frameAt('near', 1950, 0)],
      { x: 0, y: 0, k: 1 },
      VIEWPORT,
    )

    expect([...refs]).toEqual(['near'])
  })

  it('drops a frame past the margin on each side', () => {
    const refs = mountedRefs(
      [
        frameAt('right', 2000, 0),
        frameAt('left', -1100, 0),
        frameAt('below', 0, 1600),
        frameAt('above', 0, -900),
      ],
      { x: 0, y: 0, k: 1 },
      VIEWPORT,
    )

    expect([...refs]).toEqual([])
  })

  it('reads the margin in canvas units, so zooming out keeps more', () => {
    const refs = mountedRefs(
      [frameAt('far', 3900, 0)],
      { x: 0, y: 0, k: 0.5 },
      VIEWPORT,
    )

    expect([...refs]).toEqual(['far'])
  })

  it('follows the translate, so a panned view keeps what it moved to', () => {
    const refs = mountedRefs(
      [frameAt('panned', 5000, 0)],
      { x: -4500, y: 0, k: 1 },
      VIEWPORT,
    )

    expect([...refs]).toEqual(['panned'])
  })
})
