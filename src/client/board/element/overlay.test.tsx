import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { clear, selectElement, selectionStore } from '../selection'
import { heldOutline, holdOutline } from './held'
import { ElementOverlay } from './overlay'

const HASH = 'c'.repeat(64)
const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

// Indices past the skipped injected style: html 0, head 1, body 2, h1 3.
const SOURCE = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1{margin:20px 0 0 30px;width:248px;height:30px}</style></head><body><h1>Hello, world</h1></body></html>`

let layer: HTMLDivElement | undefined

afterEach(() => {
  act(() => holdOutline(null))
  act(() => clear(selectionStore))
  layer?.remove()
  layer = undefined
})

async function mountFrame(): Promise<HTMLDivElement> {
  layer = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = HERO.ref
  frame.style.cssText = `position:absolute;width:${HERO.box.width}px;height:${HERO.box.height}px`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = SOURCE
  frame.append(iframe)
  layer.append(frame)
  document.body.append(layer)
  await loaded
  return layer
}

function outline(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-element-selection]')
}

describe('ElementOverlay', () => {
  it("outlines the selected element at its box within the frame's box, with its size", async () => {
    const container = await mountFrame()
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: HERO.ref,
        index: 3,
        hash: HASH,
      }),
    )

    const { container: drawn } = render(
      <ElementOverlay frames={[HERO]} container={container} />,
    )

    const box = outline(drawn)
    expect(box?.style.left).toBe('130px')
    expect(box?.style.top).toBe('70px')
    expect(box?.querySelector('[data-chip]')).toHaveTextContent('248 × 30')
  })

  it('follows the element as it resizes', async () => {
    const container = await mountFrame()
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: HERO.ref,
        index: 3,
        hash: HASH,
      }),
    )
    const { container: drawn } = render(
      <ElementOverlay frames={[HERO]} container={container} />,
    )
    const heading = container
      .querySelector('iframe')
      ?.contentDocument?.querySelector('h1')

    act(() => heading?.style.setProperty('width', '120px'))

    await expect.poll(() => outline(drawn)?.style.width).toBe('120px')
  })

  it('draws nothing when the frame shows other bytes than the selection names', async () => {
    const container = await mountFrame()
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: HERO.ref,
        index: 3,
        hash: 'd'.repeat(64),
      }),
    )

    const { container: drawn } = render(
      <ElementOverlay frames={[HERO]} container={container} />,
    )

    expect(outline(drawn)).toBeNull()
  })

  describe('holding a dropped outline', () => {
    const HEADING = { frame: HERO.ref, index: 3, hash: HASH }
    const DROP = { x: 300, y: 200, width: 248, height: 30 }

    it('draws the held drop over the box the element still measures', async () => {
      const container = await mountFrame()
      act(() => selectElement(selectionStore, 'studio/home', HEADING))
      act(() => holdOutline({ key: HEADING, box: DROP }))

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      expect([outline(drawn)?.style.left, outline(drawn)?.style.top]).toEqual([
        '300px',
        '200px',
      ])
    })

    it('keeps drawing the drop while the written key waits on the reload', async () => {
      const container = await mountFrame()
      act(() => holdOutline({ key: HEADING, box: DROP }))
      act(() =>
        selectElement(selectionStore, 'studio/home', {
          ...HEADING,
          hash: 'd'.repeat(64),
        }),
      )

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      expect(outline(drawn)?.style.left).toBe('300px')
      expect(heldOutline()).not.toBeNull()
    })

    it('gives way once another key measures, as the reloaded frame does', async () => {
      const container = await mountFrame()
      act(() => holdOutline({ key: HEADING, box: DROP }))
      // The body, index 2, measures at once, as the reloaded element would.
      act(() =>
        selectElement(selectionStore, 'studio/home', { ...HEADING, index: 2 }),
      )

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      await expect.poll(() => heldOutline()).toBeNull()
      expect(outline(drawn)?.style.left).toBe('100px')
    })

    it('lets go when the selection leaves the frame', async () => {
      const container = await mountFrame()
      act(() => selectElement(selectionStore, 'studio/home', HEADING))
      act(() => holdOutline({ key: HEADING, box: DROP }))
      render(<ElementOverlay frames={[HERO]} container={container} />)

      act(() => clear(selectionStore))

      await expect.poll(() => heldOutline()).toBeNull()
    })
  })
})
