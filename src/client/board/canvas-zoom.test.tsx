import '../styles.css'

import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PageRecord } from '@/shared/records/list'
import { frameOf, pageOf } from '@/test/board'

import { Canvas } from './canvas'

function renderCanvas(content: PageRecord) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <Canvas page={content} reloads={{}} />
    </div>,
  )
}

function layerOf(container: HTMLElement): HTMLElement {
  const layer = container.querySelector<HTMLElement>('[data-layer]')
  if (!layer) throw new Error('no canvas layer')
  return layer
}

/** The layer's scale, read back off its transform. */
function scaleOf(container: HTMLElement): number {
  const match = /scale\((.+)\)/.exec(layerOf(container).style.transform)
  if (!match) throw new Error('no layer transform')
  return Number(match[1])
}

const zoomOf = (element: HTMLElement) =>
  Number(element.style.getPropertyValue('--zoom'))

function wheel(container: HTMLElement, init: WheelEventInit) {
  container
    .querySelector('[data-hit-layer]')
    ?.dispatchEvent(
      new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init }),
    )
}

/** A pinch of `deltaY` in all, sent as the small ctrlKey wheels a trackpad sends. */
function pinch(container: HTMLElement, deltaY: number, at: WheelEventInit) {
  const parts = Math.ceil(Math.abs(deltaY) / 25)
  for (let sent = 0; sent < parts; sent++) {
    wheel(container, { ...at, deltaY: deltaY / parts, ctrlKey: true })
  }
}

/** A page of its own per case, since the canvas keeps each page's view for the session. */
function squarePage(name: string, side: number): PageRecord {
  return pageOf(
    [
      frameOf('a', {
        ref: `studio/${name}/a`,
        page: name,
        box: { x: 0, y: 0, width: side, height: side },
      }),
    ],
    name,
  )
}

describe('the --zoom property the chrome reads', () => {
  afterEach(() => {
    if (vi.isFakeTimers()) vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('holds through the steps of a pinch and lands on the settled scale', async () => {
    const { container } = renderCanvas(squarePage('hold', 200))

    pinch(container, -200, { clientX: 100, clientY: 100 })

    expect(scaleOf(container)).toBeGreaterThan(1)
    expect(zoomOf(layerOf(container))).toBe(1)
    await expect
      .poll(() => zoomOf(layerOf(container)))
      .toBeCloseTo(scaleOf(container))
  })

  it('catches up within 100 ms while a zoom runs without a pause', () => {
    const { container } = renderCanvas(squarePage('bound', 200))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    wheel(container, { deltaY: -100, ctrlKey: true })
    vi.advanceTimersByTime(60)
    wheel(container, { deltaY: -100, ctrlKey: true })
    vi.advanceTimersByTime(60)

    expect(zoomOf(layerOf(container))).toBeCloseTo(1.44)
  })

  it('reads the opened view at once on the frames and the notes layer', () => {
    const { container } = renderCanvas(squarePage('open', 4000))
    const notes = container.querySelector<HTMLElement>('[data-notes-layer]')
    if (!notes) throw new Error('no notes layer')
    const k = scaleOf(container)

    expect(k).toBeLessThan(1)
    expect(zoomOf(layerOf(container))).toBeCloseTo(k)
    expect(zoomOf(notes)).toBeCloseTo(k)
  })
})
