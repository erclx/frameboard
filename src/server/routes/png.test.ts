import { afterEach, describe, expect, it } from 'vitest'

import type { RenderFrame } from '@/server/capture/render'
import { FrameboardError } from '@/shared/errors'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { pngRoutes } from './png'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

describe('GET /api/frames/png', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function get(query: string, render: RenderFrame) {
    board = writeBoard({ 'studio/home/hero.html': '<p>Hello</p>' })
    return pngRoutes(board.root, render).request(`/api/frames/png?${query}`)
  }

  it('answers the rendered bytes as image/png', async () => {
    const asked: string[] = []
    const response = await get(
      'ref=home/hero&theme=dark',
      async (frame, theme) => {
        asked.push(
          `${frame.ref} ${theme} ${frame.box.width}x${frame.box.height}`,
        )
        return PNG
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(Buffer.from(await response.arrayBuffer())).toEqual(PNG)
    expect(asked).toEqual(['studio/home/hero dark 1440x900'])
  })

  it('answers 404 with the envelope for an unknown frame', async () => {
    const response = await get('ref=home/missing&theme=light', async () => PNG)

    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'frame-not-found' },
    })
  })

  it('answers 422 for a frame missing a font', async () => {
    const response = await get('ref=home/hero&theme=light', async () => {
      throw new FrameboardError('font-missing', 'No Brand.', {
        family: 'Brand',
      })
    })

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'font-missing', details: { family: 'Brand' } },
    })
  })

  it('answers 503 when no browser launches', async () => {
    const response = await get('ref=home/hero&theme=light', async () => {
      throw new FrameboardError('browser-not-found', 'No browser.')
    })

    expect(response.status).toBe(503)
  })

  it('answers 400 for a theme other than light or dark', async () => {
    const response = await get('ref=home/hero&theme=both', async () => PNG)

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: { code: 'usage' } })
  })
  it('passes the scale asked for to the render', async () => {
    const scales: (number | undefined)[] = []
    const response = await get(
      'ref=home/hero&theme=light&scale=3',
      async (_frame, _theme, scale) => {
        scales.push(scale)
        return PNG
      },
    )

    expect(response.status).toBe(200)
    expect(scales).toEqual([3])
  })

  it('renders at 2x when no scale is asked for', async () => {
    const scales: (number | undefined)[] = []
    await get('ref=home/hero&theme=light', async (_frame, _theme, scale) => {
      scales.push(scale)
      return PNG
    })

    expect(scales).toEqual([2])
  })

  it.each(['0', '4', '1.5', '2x', 'x', ''])(
    'answers 400 usage for a scale of %j',
    async (scale) => {
      const response = await get(
        `ref=home/hero&theme=light&scale=${scale}`,
        async () => PNG,
      )

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'usage' } })
    },
  )

  it('answers 422 for a frame too large at its scale', async () => {
    const response = await get(
      'ref=home/hero&theme=light&scale=3',
      async () => {
        throw new FrameboardError('capture-too-large', 'Too large.')
      },
    )

    expect(response.status).toBe(422)
    expect(await response.json()).toMatchObject({
      error: { code: 'capture-too-large' },
    })
  })
})
