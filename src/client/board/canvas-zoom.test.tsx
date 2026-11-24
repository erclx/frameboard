import '../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { PageRecord } from '@/shared/records/list'
import type { BoardNote } from '@/shared/records/notes'
import { frameOf, pageOf } from '@/test/board'

import { Canvas } from './canvas'
import { closeNote } from './notes/tool'
import { canvasView } from './view'

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

/** `steps` of a trackpad pinch's smallest ctrlKey wheel, each zooming in by 2 ** 0.03. */
function nudge(container: HTMLElement, steps: number) {
  for (let sent = 0; sent < steps; sent++) {
    wheel(container, { deltaY: -3, ctrlKey: true })
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

  it('writes a lone zoom step at once', () => {
    const { container } = renderCanvas(squarePage('lone', 200))

    wheel(container, { deltaY: -100, ctrlKey: true })

    expect(zoomOf(layerOf(container))).toBeCloseTo(1.2)
  })

  it('holds the steps after the first and catches up within 100 ms', () => {
    const { container } = renderCanvas(squarePage('bound', 200))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    nudge(container, 5)
    const held = zoomOf(layerOf(container))
    vi.advanceTimersByTime(100)

    expect(held).toBeCloseTo(2 ** 0.03)
    expect(zoomOf(layerOf(container))).toBeCloseTo(2 ** 0.15)
  })

  it('writes early once the held steps drift past 15%', () => {
    const { container } = renderCanvas(squarePage('drift', 200))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    nudge(container, 9)

    expect(zoomOf(layerOf(container))).toBeCloseTo(2 ** 0.24)
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

  describe('with a note card open', () => {
    afterEach(() => {
      act(() => {
        closeNote()
        liveStore.setState({ notes: {} })
      })
    })

    // Fits at 40% with hero's corner pin 100 px above the viewport's center, so a zoom to 100% keeps it in view.
    const pinned = () =>
      pageOf(
        [
          frameOf('hero', {
            ref: 'studio/pinned/hero',
            page: 'pinned',
            box: { x: 0, y: 0, width: 390, height: 840 },
          }),
          frameOf('side', {
            ref: 'studio/pinned/side',
            page: 'pinned',
            box: { x: 390, y: -340, width: 390, height: 1180 },
          }),
        ],
        'pinned',
      )
    const cardBox = () => {
      const { left, top } = screen
        .getByRole('region', { name: 'Note 1' })
        .getBoundingClientRect()
      return { left: Math.round(left), top: Math.round(top) }
    }

    it('keeps the card through a 40% to 100% zoom, where a fresh one opens', async () => {
      act(() =>
        liveStore.setState({ notes: { 'studio/pinned': [pinnedNote()] } }),
      )
      const { container } = renderCanvas(pinned())
      const marker = screen.getByRole('button', { name: 'Note 1 on hero' })
      await userEvent.click(marker)
      expect(scaleOf(container)).toBeCloseTo(0.4)

      act(() => canvasView.zoomTo(1))
      await act(() => expect.poll(() => zoomOf(layerOf(container))).toBe(1))
      const caught = cardBox()
      await userEvent.keyboard('{Escape}')
      await userEvent.click(marker)

      expect(caught).toEqual(cardBox())
    })
  })
})

/** An open developer note pinned to hero's top right corner, numbered 1. */
function pinnedNote(): BoardNote {
  return {
    id: 'n_1',
    number: 1,
    frame: 'hero',
    anchor: null,
    text: 'Tighten the header',
    from: 'developer',
    author: 'Ada Lovelace',
    session: null,
    to: null,
    state: 'open',
    thread: null,
    createdAt: '2026-10-19T16:12:00.000Z',
    updatedAt: '2026-10-19T16:12:00.000Z',
    element: null,
  }
}
