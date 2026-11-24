import '../../styles.css'

import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { flipFrame, themeStore } from '@/client/theme/store'
import { elementIndex } from '@/shared/frame-bridge/elements'
import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import CLIP from '../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import { request } from '../bridge/channel'
import { dropPending, holdBoxes } from '../geometry/write'
import { modeStore } from '../mode'
import { endPreview, setPreview } from '../preview/store'
import {
  clear,
  select,
  selectElement,
  selectElements,
  selectionStore,
} from '../selection'
import { heldOutline, holdOutline } from './held'
import { ElementOverlay } from './overlay'
import { newTextStore } from './text-in-place'

const HASH = 'c'.repeat(64)
const HERO = frameOf('hero', {
  box: { x: 100, y: 50, width: 400, height: 300 },
})

// Indices past the skipped injected style and bridge: html 0, head 1, body 2, h1 3.
const SOURCE = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}h1{margin:20px 0 0 30px;width:248px}</style></head><body><h1>Hello, world</h1></body></html>`

let layer: HTMLDivElement | undefined

afterEach(() => {
  act(() => holdOutline(null))
  act(() => newTextStore.setState({ key: null }))
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
  // Every source loads the bridge, which the overlay reads the page through.
  iframe.srcdoc = source.replace('</head>', `${BRIDGE}</head>`)
  frame.append(iframe)
  layer.append(frame)
  document.body.append(layer)
  await loaded
  // Its reply follows the hash the bridge announced as it started.
  await request(iframe, 'element-box', { index: 0, hash: '' })
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

    it('draws one outline each inside one box carrying their size', async () => {
      const mounted = await mountFrame(TWO)
      act(() => selectElements(selectionStore, 'studio/home', members))

      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      await vi.waitFor(() =>
        expect(container.querySelector('[data-chip]')).toHaveTextContent(
          '400 × 80',
        ),
      )
      const drawn = container.querySelectorAll<HTMLElement>(
        '[data-element-selection]',
      )
      expect([...drawn].map((outline) => outline.dataset.elementIndex)).toEqual(
        ['3', '4'],
      )
      expect(container.querySelectorAll('[data-element-group]')).toHaveLength(1)
    })

    it('draws no corner marks on the box while a member sits in the flow', async () => {
      const mounted = await mountFrame(TWO)
      act(() => selectElements(selectionStore, 'studio/home', members))

      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      await vi.waitFor(() =>
        expect(container.querySelector('[data-element-group]')).not.toBeNull(),
      )
      expect(container.querySelector('[data-element-corner]')).toBeNull()
    })

    it('draws four corner marks on the box once every member is free', async () => {
      const free = TWO.replace(
        'h1,h2{margin:0;height:40px}',
        'h1,h2{margin:0;height:40px;position:absolute;left:10px}h1{top:10px}h2{top:100px}',
      )
      const mounted = await mountFrame(free)
      act(() => selectElements(selectionStore, 'studio/home', members))

      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      await vi.waitFor(() =>
        expect(
          container.querySelectorAll(
            '[data-element-group] [data-element-corner]',
          ),
        ).toHaveLength(4),
      )
    })

    it('follows a member whose inline offsets a drag previews', async () => {
      const free = TWO.replace(
        'h1,h2{margin:0;height:40px}',
        'h1,h2{margin:0;height:40px;width:100px;position:absolute;left:10px}h1{top:10px}h2{top:100px}',
      )
      const mounted = await mountFrame(free)
      act(() => selectElements(selectionStore, 'studio/home', members))
      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )
      await vi.waitFor(() =>
        expect(container.querySelector('[data-chip]')).toHaveTextContent(
          '100 × 130',
        ),
      )

      const h2 = mounted
        .querySelector('iframe')
        ?.contentDocument?.querySelector('h2')
      act(() => h2?.style.setProperty('left', '110px'))

      await vi.waitFor(() =>
        expect(container.querySelector('[data-chip]')).toHaveTextContent(
          '200 × 130',
        ),
      )
    })

    it('draws the marks again once one is left', async () => {
      const mounted = await mountFrame(TWO)
      act(() => selectElements(selectionStore, 'studio/home', members))
      const { container } = render(
        <ElementOverlay frames={[HERO]} container={mounted} />,
      )

      act(() => selectElement(selectionStore, 'studio/home', members[1]!))

      await waitFor(() =>
        expect(
          container.querySelectorAll('[data-element-selection]'),
        ).toHaveLength(1),
      )
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

    await waitFor(() => expect(outline(drawn)?.style.left).toBe('130px'))
    expect(outline(drawn)?.style.top).toBe('70px')
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
      const drawn = render(
        <ElementOverlay frames={[HERO]} container={container} />,
      ).container
      // Drawn once the frame answers with the element's measure.
      await waitFor(() => expect(outline(drawn)).not.toBeNull())
      return drawn
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
        'a divider',
        '<hr style="width: 80px; height: 2px; border: 0">',
        /^80 × 2$/,
      ],
      [
        'rotated text',
        '<p style="width: 80px; height: 40px; rotate: 90deg">Turned</p>',
        /^40 × 80$/,
      ],
      [
        'a rotated container',
        '<section style="width: 80px; height: 40px; rotate: 90deg"><p>Held</p></section>',
        /^40 × 80$/,
      ],
      [
        'a shape under 24px tall',
        '<div style="width: 80px; height: 23px"></div>',
        /^80 × 23$/,
      ],
      [
        'a shape under 24px wide',
        '<div style="width: 23px; height: 80px"></div>',
        /^23 × 80$/,
      ],
    ])('draws no marks on %s', async (_name, body, size) => {
      const drawn = await selecting(body)

      expect(marks(drawn)).toBe(0)
      expect(chip(drawn)).toHaveTextContent(size)
    })

    it('draws the box of a placed Text open for typing with no outline, marks, or chip', async () => {
      act(() =>
        newTextStore.setState({
          key: { frame: HERO.ref, index: 3, hash: HASH },
        }),
      )

      const drawn = await selecting('<h1>Hello, world</h1>')

      expect(outline(drawn)?.style.outline).toBe('none')
      expect(marks(drawn)).toBe(0)
      expect(chip(drawn)).toBeNull()
    })

    it('draws them again once the placed Text ends its edit', async () => {
      act(() =>
        newTextStore.setState({
          key: { frame: HERO.ref, index: 3, hash: HASH },
        }),
      )
      const drawn = await selecting('<h1>Hello, world</h1>')

      act(() => newTextStore.setState({ key: null }))

      expect(outline(drawn)?.style.outline).toContain('solid')
      expect(marks(drawn)).toBe(4)
      expect(chip(drawn)).toHaveTextContent(/^248 × Hug$/)
    })

    it('keeps four marks on a shape 24px on both sides', async () => {
      const drawn = await selecting(
        '<div style="width: 24px; height: 24px"></div>',
      )

      expect(marks(drawn)).toBe(4)
      expect(chip(drawn)).toHaveTextContent(/^24 × 24$/)
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
            sizing: null,
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

  describe('the media bar', () => {
    let notes: HTMLDivElement | undefined

    afterEach(() => {
      notes?.remove()
      notes = undefined
    })

    /** Draws the overlay over a frame holding `media` selected, and answers its bar and the media's box. */
    async function drawBar(media: string) {
      const container = await mountFrame(
        `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}</style></head><body>${media}</body></html>`,
      )
      // The bar draws in the notes layer beside the frames' layer, both at the page's origin.
      container.style.cssText = 'position:absolute;left:0;top:0'
      notes = document.createElement('div')
      notes.dataset.notesLayer = ''
      notes.style.cssText = 'position:absolute;left:0;top:0'
      document.body.append(notes)
      const frame = { ...HERO, box: { ...HERO.box, x: 0, y: 0 } }
      act(() =>
        selectElement(selectionStore, 'studio/home', {
          frame: HERO.ref,
          index: 3,
          hash: HASH,
        }),
      )
      render(<ElementOverlay frames={[frame]} container={container} />)
      const bar = await waitFor(() => {
        const found = notes?.querySelector<HTMLElement>('[data-media-bar]')
        if (!found) throw new Error('no media bar drawn yet')
        return found
      })
      const element = container
        .querySelector('iframe')
        ?.contentDocument?.querySelector('video, audio')
      if (!element) throw new Error('the frame holds no media')
      return {
        element,
        bar: bar.getBoundingClientRect(),
        media: element.getBoundingClientRect(),
        time: bar.querySelector('[data-media-time]'),
        track: bar.querySelector('input[type="range"]'),
      }
    }

    /** The rules in the media's page that hide a video's own strip. */
    function stripRules(media: Element): string[] {
      return [...media.ownerDocument.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .map((rule) => rule.cssText)
        .filter(
          (text) =>
            text.includes('::-webkit-media-controls') &&
            text.includes('display: none'),
        )
    }

    it("draws a video's bar inside its bottom edge, 4px in on three sides", async () => {
      const { bar, media } = await drawBar(
        `<video src="${CLIP}" style="display:block;width:320px;height:180px"></video>`,
      )

      expect(bar.left).toBeCloseTo(media.left + 4, 0)
      expect(bar.right).toBeCloseTo(media.right - 4, 0)
      expect(bar.bottom).toBeCloseTo(media.bottom - 4, 0)
      expect(bar.top).toBeGreaterThan(media.top)
    })

    it('keeps the bar inside a video 80px wide, dropping the time and the track', async () => {
      const { bar, media, time, track } = await drawBar(
        `<video src="${CLIP}" style="display:block;width:80px;height:45px"></video>`,
      )

      expect(bar.left).toBeGreaterThanOrEqual(media.left)
      expect(bar.right).toBeLessThanOrEqual(media.right)
      expect(time).not.toBeVisible()
      expect(track).not.toBeVisible()
    })

    it('holds the track and the time in a bar wide enough for them', async () => {
      const { time, track } = await drawBar(
        `<video src="${CLIP}" style="display:block;width:320px;height:180px"></video>`,
      )

      expect(time).toBeVisible()
      expect(track).toBeVisible()
    })

    it("hides the browser's own strip under a video's bar", async () => {
      const { element } = await drawBar(
        `<video src="${CLIP}" controls style="display:block;width:320px;height:180px"></video>`,
      )

      // A computed style never reads the strip's pseudo-element, so the rule is read off the page's sheets.
      await waitFor(() => expect(stripRules(element)).toHaveLength(1))
    })

    it('keeps the video at its file index while its strip is hidden', async () => {
      const { element } = await drawBar(
        `<video src="${CLIP}" controls style="display:block;width:320px;height:180px"></video>`,
      )
      await waitFor(() => expect(stripRules(element)).toHaveLength(1))

      expect(elementIndex(element.ownerDocument, element)).toBe(3)
    })

    it("leaves an audio's own player drawn above its bar", async () => {
      const { element } = await drawBar(
        `<audio src="${CLIP}" controls style="display:block;width:120px"></audio>`,
      )

      expect(stripRules(element)).toHaveLength(0)
    })

    it("draws an audio's bar under it at the audio's width", async () => {
      const { bar, media } = await drawBar(
        `<audio src="${CLIP}" controls style="display:block;width:120px"></audio>`,
      )

      expect(bar.top).toBeGreaterThanOrEqual(media.bottom)
      expect(bar.width).toBeCloseTo(media.width, 0)
    })
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

      await waitFor(() => expect(ghosts(drawn)).toHaveLength(1))
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
      await waitFor(() => expect(ghosts(drawn)).toHaveLength(1))

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

    // Drawn plain first, so the empty read follows a ghost that had arrived.
    it.each([
      ['an upright phone', { device: 'phone' }],
      ['an upright tablet', { device: 'tablet' }],
      ['an upright foldable', { device: 'foldable' }],
      ['a turned phone', { device: 'phone', turn: 'left' }],
      ['a laptop', { device: 'laptop' }],
    ] as const)(
      'drops the ghost once a selected frame shows %s',
      async (_name, shown) => {
        const container = await mountFrame(PAST)
        act(() => select(selectionStore, 'studio/home', [HERO.ref]))
        const { container: drawn, rerender } = render(
          <ElementOverlay frames={[HERO]} container={container} />,
        )
        await waitFor(() => expect(ghosts(drawn)).toHaveLength(1))

        rerender(
          <ElementOverlay
            frames={[{ ...HERO, ...shown }]}
            container={container}
          />,
        )

        expect(ghosts(drawn)).toEqual([])
      },
    )

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

  describe('painting an element past the edge', () => {
    // A box at 350, 20 in the 400 px wide hero, its right 50 px past the edge.
    const BOX =
      '<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"></div>'
    const PAST = SOURCE.replace('<h1>Hello, world</h1>', BOX)
    const OPEN = { ...HERO, order: 3, showOverflow: true as const }

    function pictures(container: HTMLElement): HTMLImageElement[] {
      return [...container.querySelectorAll('img')]
    }

    /** What the nth picture asks the board for. */
    function asked(container: HTMLElement, at = 0): URLSearchParams {
      const src = pictures(container)[at]?.src ?? ''
      return new URL(src, location.href).searchParams
    }

    async function draw(frame: FrameRecord = OPEN, source = PAST) {
      const container = await mountFrame(source)
      return render(<ElementOverlay frames={[frame]} container={container} />)
    }

    async function drawPainted(frame: FrameRecord = OPEN, source = PAST) {
      const drawn = await draw(frame, source)
      await waitFor(() =>
        expect(pictures(drawn.container).length).toBeGreaterThan(0),
      )
      return drawn
    }

    afterEach(() => {
      act(() => {
        modeStore.setState({ mode: 'edit', tool: 'move' })
        themeStore.setState({ choice: 'system', system: 'light' })
        themeStore.setState({ flipped: new Set() })
        liveStore.setState({ reloads: {}, kept: {} })
        endPreview([HERO.ref])
        dropPending([HERO.ref])
      })
    })

    it('paints the picture of the element at its place while nothing is selected', async () => {
      const { container } = await drawPainted()

      const query = asked(container)
      expect([
        query.get('ref'),
        query.get('element'),
        query.get('hash'),
        query.get('theme'),
        query.get('scale'),
      ]).toEqual([HERO.ref, '3', HASH, 'light', '2'])
      const at = pictures(container)[0]?.parentElement?.style
      expect([at?.left, at?.top, at?.width, at?.height]).toEqual([
        '450px',
        '70px',
        '100px',
        '50px',
      ])
    })

    it('shows the picture past the edge alone, stacked with its frame', async () => {
      const { container } = await drawPainted()

      const at = pictures(container)[0]?.parentElement?.style
      expect(at?.clipPath).toContain('evenodd')
      expect(at?.zIndex).toBe('3')
    })

    it('draws an unselected frame’s picture with no ghost for a press to take', async () => {
      const { container } = await drawPainted()

      expect(container.querySelector('[data-element-ghost]')).toBeNull()
      expect(pictures(container)[0]?.parentElement?.style.outline).toBe('')
    })

    it('paints the picture inside the ghost of a selected frame that clips', async () => {
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))

      const { container } = await drawPainted(HERO)

      expect(
        container.querySelector('[data-element-ghost] > img'),
      ).not.toBeNull()
    })

    it('tints the ghost only until its picture loads', async () => {
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))
      const { container } = await drawPainted(HERO)
      const [picture] = pictures(container)
      if (!picture) throw new Error('no picture')
      const tinted = () =>
        getComputedStyle(picture.parentElement as Element).backgroundColor
      expect(tinted()).not.toBe('rgba(0, 0, 0, 0)')

      fireEvent.load(picture)

      expect(tinted()).toBe('rgba(0, 0, 0, 0)')
    })

    it('keeps the picture mounted as its frame is selected and left', async () => {
      const { container } = await drawPainted()
      const [before] = pictures(container)

      act(() => select(selectionStore, 'studio/home', [HERO.ref]))
      const selected = container.querySelector('[data-element-ghost] > img')
      act(() => clear(selectionStore))

      expect(selected).toBe(before)
      expect(pictures(container)[0]).toBe(before)
    })

    it.each([
      ['the Note tool', { tool: 'note' }],
      ['the Frame tool', { tool: 'frame' }],
    ] as const)('paints under %s', async (_name, state) => {
      act(() => modeStore.setState(state))

      const { container } = await drawPainted()

      expect(pictures(container)).toHaveLength(1)
    })

    it('paints nothing in Play, where frames draw as they ship', async () => {
      const { container } = await drawPainted()

      act(() => modeStore.setState({ mode: 'play' }))

      expect(pictures(container)).toEqual([])
    })

    it.each([
      ['scrolls past its height', { scroll: true }],
      ['shows its device', { device: 'phone' }],
    ] as const)('paints nothing once the frame %s', async (_name, shown) => {
      const { container, rerender } = await drawPainted()
      const layerShown = layer ?? null

      rerender(
        <ElementOverlay
          frames={[{ ...OPEN, ...shown }]}
          container={layerShown}
        />,
      )

      expect(pictures(container)).toEqual([])
    })

    it('paints nothing once the switch is off again', async () => {
      const { container, rerender } = await drawPainted()
      const layerShown = layer ?? null

      rerender(<ElementOverlay frames={[HERO]} container={layerShown} />)

      expect(pictures(container)).toEqual([])
    })

    it('paints nothing at a previewed width, which the picture is not laid out at', async () => {
      const { container } = await drawPainted()

      act(() => setPreview([HERO.ref], 320))

      expect(pictures(container)).toEqual([])
    })

    it('asks for the other theme’s picture once the frame is flipped', async () => {
      const { container } = await drawPainted()

      act(() => flipFrame(HERO.ref))

      expect(asked(container).get('theme')).toBe('dark')
    })

    it('asks again for a frame reloaded with the same bytes, as a token write does', async () => {
      const { container } = await drawPainted()
      const [before] = pictures(container)
      const first = before?.src

      act(() => liveStore.setState({ reloads: { [HERO.ref]: 1 } }))

      expect(pictures(container)[0]?.src).not.toBe(first)
      // A fresh image, so the old pixels are gone before the new ones arrive.
      expect(pictures(container)[0]).not.toBe(before)
    })

    it('asks once for a reload the frame’s own page was kept through', async () => {
      const { container } = await drawPainted()
      const first = pictures(container)[0]?.src

      act(() =>
        liveStore.setState({
          reloads: { [HERO.ref]: 1 },
          kept: { [HERO.ref]: 1 },
        }),
      )

      expect(pictures(container)[0]?.src).toBe(first)
    })

    it('asks by the new bytes once the page is restamped', async () => {
      const { container } = await drawPainted()
      const iframe = layer?.querySelector('iframe')
      if (!iframe) throw new Error('no iframe')

      await act(() => request(iframe, 'restamp', { hash: 'e'.repeat(64) }))

      await expect.poll(() => asked(container).get('hash')).toBe('e'.repeat(64))
    })

    it('asks again at the frame’s new size, and not while a drag previews one', async () => {
      const { container, rerender } = await drawPainted()
      const first = pictures(container)[0]?.src
      const grown = { ...HERO.box, height: 320 }

      act(() => holdBoxes({ [HERO.ref]: grown }))
      const dragged = pictures(container)[0]?.src
      rerender(
        <ElementOverlay
          frames={[{ ...OPEN, box: grown }]}
          container={layer ?? null}
        />,
      )

      expect(dragged).toBe(first)
      expect(pictures(container)[0]?.src).not.toBe(first)
    })

    it.each([
      ['left', 'left:-50px;top:20px'],
      ['top', 'left:20px;top:-25px'],
    ])(
      'ghosts an element past the %s edge and paints none, which a page shot trims',
      async (_edge, place) => {
        act(() => select(selectionStore, 'studio/home', [HERO.ref]))

        const { container } = await drawPainted(
          OPEN,
          SOURCE.replace(
            '<h1>Hello, world</h1>',
            `<div style="position:absolute;${place};width:100px;height:50px"></div>${BOX}`,
          ),
        )

        const ghosts = [...container.querySelectorAll('[data-element-ghost]')]
        expect(
          ghosts.map((ghost) => ghost.querySelectorAll('img').length),
        ).toEqual([0, 1])
      },
    )

    it('paints twenty past the right or bottom edge behind one past the left', async () => {
      const { container } = await drawPainted(
        OPEN,
        SOURCE.replace(
          '<h1>Hello, world</h1>',
          `<div style="position:absolute;left:-50px;top:20px;width:100px;height:50px"></div>${BOX.repeat(21)}`,
        ),
      )

      await waitFor(() => expect(pictures(container)).toHaveLength(20))
      expect(asked(container, 0).get('element')).toBe('4')
    })

    it('paints the first twenty in document order and leaves the rest', async () => {
      const { container } = await drawPainted(
        OPEN,
        SOURCE.replace('<h1>Hello, world</h1>', BOX.repeat(21)),
      )

      await waitFor(() => expect(pictures(container)).toHaveLength(20))
      expect(asked(container, 0).get('element')).toBe('3')
      expect(asked(container, 19).get('element')).toBe('22')
    })

    it('still ghosts the elements past the twentieth of a selected frame', async () => {
      act(() => select(selectionStore, 'studio/home', [HERO.ref]))

      const { container } = await drawPainted(
        OPEN,
        SOURCE.replace('<h1>Hello, world</h1>', BOX.repeat(21)),
      )

      await waitFor(() =>
        expect(container.querySelectorAll('[data-element-ghost]')).toHaveLength(
          21,
        ),
      )
      expect(pictures(container)).toHaveLength(20)
    })
  })
})
