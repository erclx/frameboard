import '../../styles.css'

import { render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from 'vitest'

import { pressRail } from './page'
import { ScrollRail } from './rail'

/** A page four times as tall as its 400px box. */
const PAGE = '<body style="margin:0"><div style="height:1600px"></div></body>'

function Box({ zoom, page = PAGE }: { zoom: number; page?: string }) {
  const iframe = useRef<HTMLIFrameElement>(null)
  return (
    <div
      data-layer
      className="absolute top-0 left-0 origin-top-left"
      style={{ transform: `scale(${zoom})`, ['--zoom' as string]: zoom }}
    >
      <div
        className="absolute"
        style={{ left: 0, top: 0, width: 300, height: 400 }}
      >
        <iframe
          ref={iframe}
          title="page"
          srcDoc={page}
          className="block size-full border-0"
        />
        <ScrollRail iframe={iframe} live />
      </div>
    </div>
  )
}

async function setup(zoom: number, page?: string) {
  const { container } = render(<Box zoom={zoom} page={page} />)
  const layer = container.querySelector<HTMLElement>('[data-layer]')
  const iframe = container.querySelector('iframe')
  if (!layer || !iframe) throw new Error('no box')
  await waitFor(() =>
    expect(container.querySelector('[data-rail-thumb]')).not.toBeNull(),
  )
  const rail = () => {
    const found = container.querySelector<HTMLElement>('[data-rail]')
    const thumb = container.querySelector<HTMLElement>('[data-rail-thumb]')
    if (!found || !thumb) throw new Error('no rail')
    return {
      track: found.getBoundingClientRect(),
      thumb: thumb.getBoundingClientRect(),
    }
  }
  const view = () => {
    const window = iframe.contentWindow
    if (!window) throw new Error('no page')
    return window
  }
  const press = (clientX: number, clientY: number) =>
    pressRail(
      layer,
      new PointerEvent('pointerdown', { clientX, clientY, button: 0 }),
    )
  return { container, rail, view, press }
}

describe('ScrollRail', () => {
  it('draws 6px wide, 8px right of the box, at any zoom', async () => {
    const { rail } = await setup(0.25)

    expect(rail().track.width).toBeCloseTo(6, 0)
    expect(rail().track.left - 300 * 0.25).toBeCloseTo(8, 0)
  })

  it('sizes the thumb to the share of the page in view', async () => {
    const { rail } = await setup(1)

    expect(rail().thumb.height).toBeCloseTo(100, 0)
    expect(rail().thumb.top).toBeCloseTo(rail().track.top, 0)
  })

  it('moves the thumb as the page scrolls', async () => {
    const { rail, view } = await setup(1)

    view().scrollTo({ top: 800 })

    await waitFor(() =>
      expect(rail().thumb.top - rail().track.top).toBeCloseTo(200, 0),
    )
  })

  it('pages by one screen toward a press on the track', async () => {
    const { rail, view, press } = await setup(1)
    const { track } = rail()

    expect(press(track.left + 3, track.bottom - 10)).toBe(true)

    expect(view().scrollY).toBe(400)
  })

  // A 40px drag on a track drawing 1600px of page at 400px times the zoom.
  it.each([
    [0.25, 640],
    [2, 80],
  ])(
    'drags the page at %sx zoom by the drag over the track ratio',
    async (zoom, scrolled) => {
      const { rail, view, press } = await setup(zoom)
      const { thumb } = rail()
      const x = thumb.left + 3
      const y = thumb.top + 5

      press(x, y)
      window.dispatchEvent(
        new PointerEvent('pointermove', { clientX: x, clientY: y + 40 }),
      )
      window.dispatchEvent(
        new PointerEvent('pointerup', { clientX: x, clientY: y + 40 }),
      )

      expect(view().scrollY).toBeCloseTo(scrolled, 0)
    },
  )

  it('draws nothing for a page that fits its box', async () => {
    const { container } = render(
      <Box
        zoom={1}
        page='<body style="margin:0"><div style="height:100px"></div></body>'
      />,
    )
    const iframe = container.querySelector('iframe')
    await new Promise<void>((resolve) =>
      iframe?.addEventListener('load', () => resolve(), { once: true }),
    )

    expect(container.querySelector('[data-rail]')).toBeNull()
  })
})
