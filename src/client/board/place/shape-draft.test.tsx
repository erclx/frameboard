import '../../styles.css'

import { act, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import type { FrameRecord } from '@/shared/records/list'

import { modeStore } from '../mode'
import { ShapeDraft } from './shape-draft'
import { shapeStore } from './tool'

const HASH = 'f'.repeat(64)

const FRAME: FrameRecord = {
  ref: 'studio/home/hero',
  project: 'studio',
  page: 'home',
  name: 'hero',
  path: '/board/studio/home/hero.html',
  box: { x: 0, y: 0, width: 400, height: 300 },
  order: 0,
  hidden: false,
  locked: false,
  hugWidth: false,
  hugHeight: false,
  scroll: false,
  widths: [],
  placed: true,
  modifiedAt: '2026-11-13T00:00:00.000Z',
}

afterEach(() => {
  act(() => {
    modeStore.setState({ mode: 'edit', tool: 'move' })
    shapeStore.setState({ shape: 'rectangle' })
  })
})

/**
 * The draft over a 400 by 300 frame drawn at the board's origin, its board
 * points the viewport's own pixels, so a client point reads as a board point.
 * The layer reaches the draft once it mounts, as the canvas hands it over.
 */
function Board() {
  const viewport = useRef<HTMLDivElement>(null)
  const [layer, setLayer] = useState<HTMLDivElement | null>(null)
  return (
    <div
      ref={viewport}
      data-viewport
      style={{ position: 'relative', width: 800, height: 600 }}
    >
      <div ref={setLayer} style={{ position: 'absolute', inset: 0 }}>
        <div
          data-frame={FRAME.ref}
          style={{ position: 'absolute', left: 0, top: 0 }}
        >
          <iframe
            title="hero"
            style={{ display: 'block', width: 400, height: 300, border: 0 }}
            srcDoc={`<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body style="margin:0"><main style="height:300px"></main></body></html>`}
          />
        </div>
        <ShapeDraft
          viewport={viewport}
          toBoard={(event) => {
            const rect = viewport.current?.getBoundingClientRect()
            return {
              x: event.clientX - (rect?.left ?? 0),
              y: event.clientY - (rect?.top ?? 0),
            }
          }}
          container={layer}
          frames={() => [FRAME]}
          project="studio"
        />
      </div>
    </div>
  )
}

async function mount() {
  const { container } = render(<Board />)
  await expect
    .poll(() =>
      container.querySelector('iframe')?.contentDocument?.querySelector('main'),
    )
    .toBeTruthy()
  const target = container.querySelector<HTMLElement>('[data-viewport]')
  if (!target) throw new Error('no viewport')
  return { container, target }
}

/** A press at one viewport point and a move to another, held there. */
function drag(
  target: HTMLElement,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const rect = target.getBoundingClientRect()
  const at = (point: { x: number; y: number }) => ({
    bubbles: true,
    button: 0,
    clientX: rect.left + point.x,
    clientY: rect.top + point.y,
  })
  act(() => {
    target.dispatchEvent(new PointerEvent('pointerdown', at(from)))
    window.dispatchEvent(new PointerEvent('pointermove', at(to)))
  })
}

describe('ShapeDraft', () => {
  it('draws an Ellipse drag as an ellipse', async () => {
    act(() => {
      modeStore.setState({ mode: 'edit', tool: 'shape' })
      shapeStore.setState({ shape: 'ellipse' })
    })
    const { container, target } = await mount()

    drag(target, { x: 40, y: 40 }, { x: 160, y: 120 })

    const fill = container.querySelector<HTMLElement>('[data-shape-fill]')
    expect(fill?.style.borderRadius).toBe('50%')
  })

  it('names the drawn size under a Rectangle drag', async () => {
    act(() => {
      modeStore.setState({ mode: 'edit', tool: 'shape' })
      shapeStore.setState({ shape: 'rectangle' })
    })
    const { container, target } = await mount()

    drag(target, { x: 40, y: 40 }, { x: 160.4, y: 120 })

    expect(container.querySelector('[data-chip]')?.textContent).toBe('120 × 80')
  })

  it('fills a shape with the raw grey when the project sets no color token', async () => {
    act(() => {
      modeStore.setState({ mode: 'edit', tool: 'shape' })
      shapeStore.setState({ shape: 'rectangle' })
    })
    const { container, target } = await mount()

    drag(target, { x: 40, y: 40 }, { x: 160, y: 120 })

    const fill = container.querySelector<HTMLElement>('[data-shape-fill]')
    expect(fill ? getComputedStyle(fill).backgroundColor : null).toBe(
      'rgb(217, 217, 217)',
    )
  })

  it('draws no shape for a press on bare canvas, where a release places nothing', async () => {
    act(() => {
      modeStore.setState({ mode: 'edit', tool: 'shape' })
      shapeStore.setState({ shape: 'rectangle' })
    })
    const { container, target } = await mount()

    drag(target, { x: 500, y: 400 }, { x: 600, y: 500 })

    expect(container.querySelector('[data-shape-draft]')).toBeNull()
  })

  it('draws a Frame drag as the tinted box, with no fill or size', async () => {
    act(() => {
      modeStore.setState({ mode: 'edit', tool: 'frame' })
    })
    const { container, target } = await mount()

    drag(target, { x: 40, y: 40 }, { x: 160, y: 120 })

    expect(container.querySelector('[data-shape-draft]')).not.toBeNull()
    expect(container.querySelector('[data-shape-fill]')).toBeNull()
    expect(container.querySelector('[data-chip]')).toBeNull()
  })
})
