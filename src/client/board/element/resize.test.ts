import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import type { LiveLayout } from '@/shared/frame-bridge/live-element'
import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../bridge/channel'
import { shownHashOf } from '../bridge/shown'
import type { ElementKey } from '../selection'
import { useGhosts, useMeasures } from './measures'
import {
  cornerSize,
  dragSize,
  placedOffsets,
  resizeDeclarations,
  shownGroup,
  shownResize,
  startElementResize,
  startGroupEdit,
} from './resize'
import { newTextStore } from './text-in-place'

const BOX = { x: 100, y: 100, width: 200, height: 100 }

describe('cornerSize', () => {
  it('grows from the south-east corner by the drag', () => {
    expect(cornerSize(BOX, 'se', 40, 20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('grows from the north-west corner as the drag moves away from it', () => {
    expect(cornerSize(BOX, 'nw', -40, -20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })

  it('clamps at 1 px past the opposite corner rather than flipping', () => {
    expect(cornerSize(BOX, 'se', -500, -500, false)).toEqual({
      width: 1,
      height: 1,
    })
  })

  it('keeps the starting ratio by the side that moved further', () => {
    expect(cornerSize(BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('drops the ratio for a shape drawn with a side at 0 px', () => {
    expect(
      cornerSize({ x: 0, y: 0, width: 200, height: 0 }, 'se', 20, 30, true),
    ).toEqual({ width: 220, height: 30 })
  })

  it('keeps the ratio at no less than 1 px a side', () => {
    expect(cornerSize(BOX, 'se', -500, -500, true)).toEqual({
      width: 2,
      height: 1,
    })
  })

  it('keeps a ratio given apart from the box it starts from', () => {
    expect(
      cornerSize(BOX, 'se', 100, 10, true, { width: 4, height: 3 }),
    ).toEqual({ width: 300, height: 225 })
  })
})

describe('dragSize', () => {
  it('moves only the width of text, whatever the vertical drag and Shift', () => {
    const text = {
      kind: 'text',
      natural: null,
      hugsHeight: true,
      inset: { width: 0, height: 0 },
      sizing: null,
    } as const

    expect(dragSize(text, BOX, 'se', 40, 90, true)).toEqual({
      width: 240,
      height: 100,
    })
  })

  it('keeps a box to the ratio it starts from under Shift', () => {
    const box = {
      kind: 'box',
      natural: null,
      hugsHeight: false,
      inset: { width: 0, height: 0 },
      sizing: null,
    } as const

    expect(dragSize(box, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('keeps media to its natural ratio under Shift', () => {
    const media = {
      kind: 'media',
      natural: { width: 1, height: 1 },
      hugsHeight: false,
      inset: { width: 0, height: 0 },
      sizing: null,
    } as const

    expect(dragSize(media, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 300,
    })
  })

  it('keeps media with no natural size yet to the ratio of its box', () => {
    const media = {
      kind: 'media',
      natural: null,
      hugsHeight: false,
      inset: { width: 0, height: 0 },
      sizing: null,
    } as const

    expect(dragSize(media, BOX, 'se', 100, 10, true)).toEqual({
      width: 300,
      height: 150,
    })
  })

  it('writes both sides of media freely without Shift', () => {
    const media = {
      kind: 'media',
      natural: { width: 1, height: 1 },
      hugsHeight: false,
      inset: { width: 0, height: 0 },
      sizing: null,
    } as const

    expect(dragSize(media, BOX, 'se', 40, 20, false)).toEqual({
      width: 240,
      height: 120,
    })
  })
})

describe('resizeDeclarations', () => {
  const SIZE = { width: 240, height: 90 }
  const NO_INSET = { width: 0, height: 0 }

  it('writes the width alone for text, so its height keeps hugging', () => {
    expect(resizeDeclarations({ kind: 'text', inset: NO_INSET }, SIZE)).toEqual(
      [{ property: 'width', value: '240px' }],
    )
  })

  it.each(['box', 'media'] as const)('writes both sides of %s', (kind) => {
    expect(resizeDeclarations({ kind, inset: NO_INSET }, SIZE)).toEqual([
      { property: 'width', value: '240px' },
      { property: 'height', value: '90px' },
    ])
  })

  it('takes a content box padding and border off what it writes', () => {
    const inset = { width: 52, height: 28 }

    expect(resizeDeclarations({ kind: 'box', inset }, SIZE)).toEqual([
      { property: 'width', value: '188px' },
      { property: 'height', value: '62px' },
    ])
  })

  describe('on a container', () => {
    /** A container drawn 200 by 40 under a block parent, unless overridden. */
    const layoutOf = (overrides: Partial<LiveLayout> = {}): LiveLayout => ({
      flow: 'horizontal',
      inline: false,
      direction: 'row',
      wrap: 'nowrap',
      justify: 'normal',
      alignItems: 'normal',
      ownJustify: false,
      rowGap: 0,
      columnGap: 0,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      parent: 'block',
      parentAlignItems: 'normal',
      width: 200,
      height: 40,
      ...overrides,
    })

    it('writes only the side a drag changed, so the other keeps hugging', () => {
      const sizing = { layout: layoutOf(), fills: false }

      expect(
        resizeDeclarations(
          { kind: 'container', inset: NO_INSET, sizing },
          { width: 240, height: 40.4 },
        ),
      ).toEqual([{ property: 'width', value: '240px' }])
    })

    it('writes both sides when a drag changes both', () => {
      const sizing = { layout: layoutOf(), fills: false }

      expect(
        resizeDeclarations(
          { kind: 'container', inset: NO_INSET, sizing },
          SIZE,
        ),
      ).toEqual([
        { property: 'width', value: '240px' },
        { property: 'height', value: '90px' },
      ])
    })

    it('drops a Fill child’s flex along its row parent, as the Size row’s Fixed does', () => {
      const sizing = {
        layout: layoutOf({ parent: 'horizontal' }),
        fills: true,
      }

      expect(
        resizeDeclarations(
          { kind: 'container', inset: NO_INSET, sizing },
          { width: 240, height: 40 },
        ),
      ).toEqual([
        { property: 'width', value: '240px' },
        { property: 'flex', value: '0 1 auto' },
      ])
    })

    it('leaves a Fill child’s flex when the drag changes only the cross side', () => {
      const sizing = {
        layout: layoutOf({ parent: 'horizontal' }),
        fills: true,
      }

      expect(
        resizeDeclarations(
          { kind: 'container', inset: NO_INSET, sizing },
          { width: 200, height: 90 },
        ),
      ).toEqual([{ property: 'height', value: '90px' }])
    })

    it('takes a content box padding and border off each side it writes', () => {
      const sizing = { layout: layoutOf(), fills: false }

      expect(
        resizeDeclarations(
          { kind: 'container', inset: { width: 52, height: 28 }, sizing },
          SIZE,
        ),
      ).toEqual([
        { property: 'width', value: '188px' },
        { property: 'height', value: '62px' },
      ])
    })
  })

  it('writes no less than 0 px when the drag is narrower than the padding', () => {
    const inset = { width: 52, height: 28 }

    expect(
      resizeDeclarations({ kind: 'text', inset }, { width: 10, height: 10 }),
    ).toEqual([{ property: 'width', value: '0px' }])
  })
})

describe('a live element', () => {
  const HASH = 'd'.repeat(64)
  const KEY = { frame: 'studio/home/hero', index: 3, hash: HASH }
  const at = (index: number) => ({ ...KEY, index })
  let container: HTMLDivElement | undefined
  let stop = () => {}

  // Indices past the injected style and script, which are skipped: html 0, head 1, body 2, then the body's children.
  async function mount(body: string): Promise<HTMLDivElement> {
    container = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = KEY.frame
    const iframe = document.createElement('iframe')
    frame.append(iframe)
    container.append(frame)
    document.body.append(container)
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body>${body}</body></html>`
    await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
    return container
  }

  /** Follows the named elements' measures as the overlay does, resolved once the frame answered. */
  async function measure(
    shown: HTMLDivElement,
    keys: readonly ElementKey[],
  ): Promise<void> {
    const { unmount } = renderHook(() => useMeasures(shown, keys))
    stop = unmount
    const iframe = shown.querySelector('iframe')
    // The frame answers a later request after the measure it was sent first.
    if (iframe) await request(iframe, 'element-box', { index: 0, hash: '' })
  }

  afterEach(() => {
    stop()
    stop = () => {}
    container?.remove()
    container = undefined
    newTextStore.setState({ key: null })
  })

  /** Resolves once the frame ran every preview sent before now, since it answers a later request after them. */
  async function settled(shown: HTMLDivElement): Promise<void> {
    const iframe = shown.querySelector('iframe')
    if (iframe) await request(iframe, 'element-box', { index: 0, hash: '' })
  }

  describe('shownGroup', () => {
    it('reads each free member with its offsets and box', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 10px; top: 20px; width: 30px; height: 40px"></div><div style="position: absolute; left: 100px; top: 5px; width: 10px; height: 10px"></div>',
      )
      await measure(shown, [at(3), at(4)])

      expect(shownGroup(shown, [at(3), at(4)])).toMatchObject([
        {
          index: 3,
          placed: { left: 10, top: 20 },
          box: { x: 10, y: 20, width: 30, height: 40 },
        },
        { index: 4, placed: { left: 100, top: 5 } },
      ])
    })

    it('leaves a free member inside another selected one unplaced, since its parent carries it', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 0; top: 0; width: 200px; height: 200px"><div style="position: absolute; left: 10px; top: 10px; width: 20px; height: 20px"></div></div>',
      )
      await measure(shown, [at(3), at(4)])

      expect(
        shownGroup(shown, [at(3), at(4)])?.map(({ placed }) => placed),
      ).toEqual([{ left: 0, top: 0 }, null])
    })

    it('leaves a member in the flow unplaced', async () => {
      const shown = await mount(
        '<p>Words</p><div style="position: absolute; left: 0; top: 0; width: 20px; height: 20px"></div>',
      )
      await measure(shown, [at(3), at(4)])

      expect(
        shownGroup(shown, [at(3), at(4)])?.map(({ placed }) => placed),
      ).toEqual([null, { left: 0, top: 0 }])
    })

    it('leaves out a hidden member, whose box and offsets read as no place it draws', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 50%; top: 20px; display: none"></div><div style="position: absolute; left: 100px; top: 5px; width: 10px; height: 10px"></div>',
      )
      await measure(shown, [at(3), at(4)])

      expect(
        shownGroup(shown, [at(3), at(4)])?.map(({ index }) => index),
      ).toEqual([4])
    })

    it('answers null for keys read from other bytes', async () => {
      const shown = await mount('<div></div><div></div>')
      const stale = [
        { ...at(3), hash: 'e'.repeat(64) },
        { ...at(4), hash: 'e'.repeat(64) },
      ]
      await measure(shown, stale)

      expect(shownGroup(shown, stale)).toBeNull()
    })

    it('answers null for elements nothing measured', async () => {
      const shown = await mount('<div></div><div></div>')

      expect(shownGroup(shown, [at(3), at(4)])).toBeNull()
    })
  })

  describe('shownResize', () => {
    it('reads how the measured element takes a corner drag', async () => {
      const shown = await mount('<div style="width: 40px; height: 40px"></div>')
      await measure(shown, [KEY])

      expect(shownResize(shown, KEY)?.kind).toBe('box')
    })

    it('reads nothing for a locked element, whose corners draw no marks', async () => {
      const shown = await mount(
        '<div data-locked style="width: 40px; height: 40px"></div>',
      )
      await measure(shown, [KEY])

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('reads nothing from a frame showing other bytes', async () => {
      const shown = await mount('<p>Words</p>')
      const stale = { ...KEY, hash: 'f'.repeat(64) }
      await measure(shown, [stale])

      expect(shownResize(shown, stale)).toBeNull()
    })

    it('reads nothing for a placed Text open for typing, whose corners draw no marks', async () => {
      const shown = await mount('<p>Words</p>')
      await measure(shown, [KEY])

      newTextStore.setState({ key: KEY })

      expect(shownResize(shown, KEY)).toBeNull()
    })
  })

  describe('placedOffsets', () => {
    it('reads the offsets a placed element holds', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 12px; top: 34px"></div>',
      )
      await measure(shown, [KEY])

      expect(placedOffsets(shown, KEY)).toEqual({ left: 12, top: 34 })
    })

    it('reads a locked element as holding none for a drag', async () => {
      const shown = await mount(
        '<div data-locked style="position: absolute; left: 10px; top: 20px"></div>',
      )
      await measure(shown, [KEY])

      expect(placedOffsets(shown, KEY)).toBeNull()
    })

    it('reads an element in the flow as unplaced', async () => {
      const shown = await mount(
        '<div style="position: relative; left: 12px"></div>',
      )
      await measure(shown, [KEY])

      expect(placedOffsets(shown, KEY)).toBeNull()
    })

    it("reads a ghost's offsets, which a press on it drags before any measure", async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 900px; top: 34px; width: 10px; height: 10px"></div>',
      )
      const { result, unmount } = renderHook(() =>
        useGhosts(shown, [KEY.frame]),
      )
      stop = unmount
      await expect.poll(() => result.current.size).toBe(1)

      expect(placedOffsets(shown, KEY)).toEqual({ left: 900, top: 34 })
    })
  })

  describe('startGroupEdit', () => {
    it('puts back a side an earlier preview wrote once a later one leaves it', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 0; top: 0; width: 20px; height: 20px"></div><div style="position: absolute; left: 40px; top: 0"><p>a</p></div>',
      )
      const edit = startGroupEdit('studio/home', [KEY, { ...KEY, index: 4 }])
      const container = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelectorAll<HTMLElement>('body > div')[1]

      edit?.preview([
        { index: 4, declarations: [{ property: 'width', value: '120px' }] },
      ])
      edit?.preview([
        { index: 4, declarations: [{ property: 'top', value: '5px' }] },
      ])

      await settled(shown)
      expect(container?.style.width).toBe('')
      expect(container?.style.top).toBe('5px')
    })

    it('leaves a member stating no offsets as it was after a cancel', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 0; top: 0; width: 20px; height: 20px"></div><div style="position: absolute"><p>a</p></div>',
      )
      const edit = startGroupEdit('studio/home', [KEY, { ...KEY, index: 4 }])
      const member = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelectorAll('body > div')[1]

      edit?.preview([
        {
          index: 4,
          declarations: [
            { property: 'left', value: '40px' },
            { property: 'top', value: '10px' },
            { property: 'width', value: '120px' },
          ],
        },
      ])
      edit?.cancel()

      await settled(shown)
      expect(member?.getAttribute('style')).toBe('position: absolute')
    })
  })

  describe('startElementResize', () => {
    const paragraph = (shown: HTMLElement) => {
      const element = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('p')
      if (!element) throw new Error('No paragraph mounted')
      return element
    }

    /** How the element takes a corner drag, once the frame measured it. */
    async function readOf(shown: HTMLDivElement, key: ElementKey) {
      await measure(shown, [key])
      const read = shownResize(shown, key)
      if (!read) throw new Error('The element reads no resize')
      return read
    }

    it('previews only the width of text, whose height keeps hugging', async () => {
      const shown = await mount('<p>Words</p>')
      const resize = startElementResize('studio/home', KEY, {
        kind: 'text',
        inset: { width: 0, height: 0 },
      })

      resize?.preview({ width: 240, height: 90 })

      await settled(shown)
      expect(paragraph(shown).style.width).toBe('240px')
      expect(paragraph(shown).style.height).toBe('')
    })

    it('puts the width a preview replaced back on a cancel', async () => {
      const shown = await mount('<p style="width: fit-content">Words</p>')
      const resize = startElementResize('studio/home', KEY, {
        kind: 'text',
        inset: { width: 0, height: 0 },
      })

      resize?.preview({ width: 240, height: 90 })
      resize?.cancel()

      await settled(shown)
      expect(paragraph(shown).style.width).toBe('fit-content')
    })

    it('puts back every declaration a container’s preview wrote on a cancel', async () => {
      const shown = await mount(
        '<div style="display: flex; width: 400px"><div style="flex: 1 1 0"><p>a</p></div></div>',
      )
      const key = { ...KEY, index: 4 }
      const read = await readOf(shown, key)
      const resize = startElementResize('studio/home', key, read)
      const child = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector<HTMLElement>('div > div')

      resize?.preview({ width: 120, height: read.sizing?.layout.height ?? 0 })
      await settled(shown)
      expect(child?.style.flex).toBe('0 1 auto')
      resize?.cancel()
      await settled(shown)

      expect(child?.style.flex).toBe('1 1 0px')
      expect(child?.style.width).toBe('')
    })

    it('leaves a hugging container’s style as it was after a cancel of a drag on both sides', async () => {
      const shown = await mount(
        '<div style="display: flex; gap: 8px"><p>a</p><p>b</p></div>',
      )
      const read = await readOf(shown, KEY)
      const resize = startElementResize('studio/home', KEY, read)
      const container = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('body > div')

      resize?.preview({ width: 300, height: 200 })
      resize?.cancel()

      await settled(shown)
      expect(container?.getAttribute('style')).toBe('display: flex; gap: 8px')
    })

    it('leaves a Fill row child’s style as it was after a cancel of a drag on both sides', async () => {
      const shown = await mount(
        '<style>.grow { flex: 1 }</style><div style="display: flex; width: 400px"><div class="grow" style="width: 100px"><p>a</p></div></div>',
      )
      const key = { ...KEY, index: 5 }
      const read = await readOf(shown, key)
      const resize = startElementResize('studio/home', key, read)
      const child = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('.grow')

      resize?.preview({
        width: 160,
        height: (read.sizing?.layout.height ?? 0) + 40,
      })
      resize?.cancel()

      await settled(shown)
      expect(child?.getAttribute('style')).toBe('width: 100px;')
    })
  })
})
