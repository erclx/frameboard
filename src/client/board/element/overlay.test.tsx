import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { frameOf } from '@/test/board'

import { modeStore } from '../mode'
import {
  clear,
  select,
  selectElement,
  selectElements,
  selectionStore,
} from '../selection'
import { heldOutline, holdOutline } from './held'
import { ElementOverlay } from './overlay'

const HASH = 'c'.repeat(64)
const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

// Indices past the skipped injected style: html 0, head 1, body 2, h1 3.
const SOURCE = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1{margin:20px 0 0 30px;width:248px}</style></head><body><h1>Hello, world</h1></body></html>`

let layer: HTMLDivElement | undefined

afterEach(() => {
  act(() => holdOutline(null))
  act(() => clear(selectionStore))
  layer?.remove()
  layer = undefined
})

async function mountFrame(source = SOURCE): Promise<HTMLDivElement> {
  layer = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = HERO.ref
  frame.style.cssText = `position:absolute;width:${HERO.box.width}px;height:${HERO.box.height}px`
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:100%;height:100%;border:0'
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = source
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
  describe('with several selected', () => {
    // Indices past the skipped injected style: html 0, head 1, body 2, h1 3, h2 4.
    const TWO = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1,h2{margin:0;height:40px}</style></head><body><h1>One</h1><h2>Two</h2></body></html>`
    const members = [
      { frame: HERO.ref, index: 3, hash: HASH },
      { frame: HERO.ref, index: 4, hash: HASH },
    ]

    it('draws one outline each, with no corner marks or size chip', async () => {
      const mounted = await mountFrame(TWO)
      act(() => selectElements(selectionStore, 'studio/home', members))

      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      const drawn = container.querySelectorAll<HTMLElement>(
        '[data-element-selection]',
      )
      expect([...drawn].map((outline) => outline.dataset.elementIndex)).toEqual(
        ['3', '4'],
      )
      expect(container.querySelector('[data-element-corner]')).toBeNull()
      expect(container.querySelector('[data-chip]')).toBeNull()
    })

    it('draws the marks again once one is left', async () => {
      const mounted = await mountFrame(TWO)
      act(() => selectElements(selectionStore, 'studio/home', members))
      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      act(() => selectElement(selectionStore, 'studio/home', members[1]!))

      expect(
        container.querySelectorAll('[data-element-selection]'),
      ).toHaveLength(1)
      expect(container.querySelector('[data-chip]')).not.toBeNull()
    })
  })

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
  })

  describe('corner marks and the size chip', () => {
    /** Draws the overlay with the frame's first body element selected. */
    async function selecting(body: string): Promise<HTMLElement> {
      const container = await mountFrame(
        SOURCE.replace('<h1>Hello, world</h1>', body),
      )
      act(() =>
        selectElement(selectionStore, 'studio/home', {
          frame: HERO.ref,
          index: 3,
          hash: HASH,
        }),
      )
      return render(<ElementOverlay frames={[HERO]} container={container} />)
        .container
    }
    const marks = (drawn: HTMLElement) =>
      drawn.querySelectorAll('[data-element-corner]').length
    const chip = (drawn: HTMLElement) => drawn.querySelector('[data-chip]')

    it('draws four marks on text, whose chip names its height as hugging', async () => {
      const drawn = await selecting('<h1>Hello, world</h1>')

      expect(marks(drawn)).toBe(4)
      expect(chip(drawn)).toHaveTextContent(/^248 × Hug$/)
    })

    it('names a height text states on itself in px', async () => {
      const drawn = await selecting(
        '<h1 style="height: 30px">Hello, world</h1>',
      )

      expect(marks(drawn)).toBe(4)
      expect(chip(drawn)).toHaveTextContent(/^248 × 30$/)
    })

    it.each([
      ['a shape', '<div style="width: 80px; height: 40px"></div>', /^80 × 40$/],
      [
        'an image',
        '<img alt="" style="width: 80px; height: 40px">',
        /^80 × 40$/,
      ],
      [
        'a video',
        '<video style="width: 80px; height: 40px"></video>',
        /^80 × 40$/,
      ],
    ])(
      'draws four marks on %s, with both sides in px',
      async (_name, body, size) => {
        const drawn = await selecting(body)

        expect(marks(drawn)).toBe(4)
        expect(chip(drawn)).toHaveTextContent(size)
      },
    )

    it.each([
      [
        'a container',
        '<section style="width: 80px; height: 40px"><p>Held</p></section>',
        /^80 × 40$/,
      ],
      [
        'text holding an inline element',
        '<p style="width: 80px; height: 40px">Some <b>bold</b></p>',
        /^80 × 40$/,
      ],
      [
        'a divider',
        '<hr style="width: 80px; height: 2px; border: 0">',
        /^80 × 2$/,
      ],
      [
        'rotated text',
        '<p style="width: 80px; height: 40px; rotate: 90deg">Turned</p>',
        /^40 × 80$/,
      ],
    ])('draws no marks on %s', async (_name, body, size) => {
      const drawn = await selecting(body)

      expect(marks(drawn)).toBe(0)
      expect(chip(drawn)).toHaveTextContent(size)
    })

    it('keeps the marks a held drop read while the written key waits on the reload', async () => {
      const container = await mountFrame()
      const key = { frame: HERO.ref, index: 3, hash: HASH }
      act(() =>
        holdOutline({
          key,
          box: { x: 300, y: 200, width: 248, height: 30 },
          read: {
            kind: 'text',
            natural: null,
            hugsHeight: true,
            inset: { width: 0, height: 0 },
          },
        }),
      )
      act(() =>
        selectElement(selectionStore, 'studio/home', {
          ...key,
          hash: 'd'.repeat(64),
        }),
      )

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      expect(marks(drawn)).toBe(4)
      expect(chip(drawn)).toHaveTextContent(/^248 × Hug$/)
    })
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
      act(() => holdOutline({ key: HEADING, box: DROP, read: null }))

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
      act(() => holdOutline({ key: HEADING, box: DROP, read: null }))
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
      act(() => holdOutline({ key: HEADING, box: DROP, read: null }))
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
      act(() => holdOutline({ key: HEADING, box: DROP, read: null }))
      render(<ElementOverlay frames={[HERO]} container={container} />)

      act(() => clear(selectionStore))

      await expect.poll(() => heldOutline()).toBeNull()
    })
  })

  describe('ghosting an element past the edge', () => {
    // A box at 350, 20 in the 400 px wide hero, its right 50 px past the edge.
    const PAST = SOURCE.replace(
      '<h1>Hello, world</h1>',
      '<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"></div>',
    )

    function ghosts(container: HTMLElement): HTMLElement[] {
      return [
        ...container.querySelectorAll<HTMLElement>('[data-element-ghost]'),
      ]
    }

    afterEach(() => {
      act(() => modeStore.setState({ mode: 'edit', tool: 'move' }))
    })

    it('draws a ghost at the element box while its frame is selected', async () => {
      const container = await mountFrame(PAST)
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      const [ghost] = ghosts(drawn)
      expect([
        ghost?.dataset.ghostIndex,
        ghost?.dataset.ghostHash,
        ghost?.style.left,
        ghost?.style.top,
        ghost?.style.width,
      ]).toEqual(['3', HASH, '450px', '70px', '100px'])
    })

    it('reads again as a drag previews the element further out', async () => {
      const container = await mountFrame(PAST)
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))
      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )
      const box = container
        .querySelector('iframe')
        ?.contentDocument?.querySelector<HTMLElement>('body > div')
      expect(ghosts(drawn)).toHaveLength(1)

      act(() => box?.style.setProperty('left', '380px'))

      await expect.poll(() => ghosts(drawn)[0]?.style.left).toBe('480px')
    })

    it('draws none for a selected frame that scrolls past its height', async () => {
      const container = await mountFrame(PAST)
      const scrolling = { ...HERO, scroll: true }
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))

      const { container: drawn } = render(
        <ElementOverlay frames={[scrolling]} container={container} />,
      )

      expect(ghosts(drawn)).toEqual([])
    })

    it('draws none while nothing on the frame is selected', async () => {
      const container = await mountFrame(PAST)

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      expect(ghosts(drawn)).toEqual([])
    })

    it.each([
      ['Play', { mode: 'play' }],
      ['the Note tool', { tool: 'note' }],
    ] as const)('draws none in %s', async (_name, state) => {
      const container = await mountFrame(PAST)
      act(() => modeStore.setState(state))
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))

      const { container: drawn } = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      )

      expect(ghosts(drawn)).toEqual([])
    })
  })
})
