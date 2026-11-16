import { afterEach, describe, expect, it, vi } from 'vitest'

import CLIP from '../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import type { LiveLayout } from '../inspector/element/styles'
import {
  cornerSize,
  dragSize,
  placedOffsets,
  resizeDeclarations,
  resizeKindOf,
  shownGroup,
  shownResize,
  startElementResize,
  startGroupEdit,
} from './resize'

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

describe('resizeKindOf', () => {
  let host: HTMLDivElement | undefined

  // Attached, so a child's computed display reads as the page lays it out.
  const parse = (markup: string) => {
    host = document.createElement('div')
    host.innerHTML = markup
    document.body.append(host)
    return host.firstElementChild
  }

  afterEach(() => {
    host?.remove()
    host = undefined
  })

  it.each([
    ['a placed rectangle', '<div data-name="Rectangle"></div>', 'box'],
    ['text', '<p>Text</p>', 'text'],
    ['a box holding only text', '<div>Hi</div>', 'text'],
    ['an image', '<img alt="">', 'media'],
    ['a video', '<video></video>', 'media'],
    ['a video holding its sources', '<video><source></video>', 'media'],
    ['a box holding an element', '<div><span></span></div>', 'container'],
    ['text holding an inline element', '<p>Some <b>bold</b> words</p>', 'text'],
    ['a paragraph holding inline code', '<p><code>serve</code></p>', 'text'],
    [
      'a box holding words and a block element',
      '<div>Hi <p>there</p></div>',
      'container',
    ],
    [
      'a box holding a flex row',
      '<div><div style="display: flex"><span>a</span></div></div>',
      'container',
    ],
  ])('reads %s by what its corners write', (_name, markup, kind) => {
    expect(resizeKindOf(parse(markup))).toBe(kind)
  })

  it.each([
    ['a divider', '<hr>'],
    ['an empty paragraph', '<p></p>'],
  ])('reads %s as nothing its corners resize', (_name, markup) => {
    expect(resizeKindOf(parse(markup))).toBeNull()
  })

  it('reads the body as nothing its corners resize, though it holds elements', () => {
    const body = document.implementation.createHTMLDocument('').body
    body.append(document.createElement('div'))

    expect(resizeKindOf(body)).toBeNull()
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
  /** A 2 by 1 PNG, whose natural size no box in these tests shares. */
  const WIDE_PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC'
  let container: HTMLDivElement | undefined

  // Indices past the skipped injected style: html 0, head 1, body 2, then the body's children.
  async function mount(body: string): Promise<HTMLDivElement> {
    container = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = KEY.frame
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body>${body}</body></html>`
    frame.append(iframe)
    container.append(frame)
    document.body.append(container)
    await loaded
    return container
  }

  afterEach(() => {
    container?.remove()
    container = undefined
  })

  describe('shownGroup', () => {
    const at = (index: number) => ({ ...KEY, index })

    it('reads each free member with its offsets and box', async () => {
      const shown = await mount(
        '<div style="position: absolute; left: 10px; top: 20px; width: 30px; height: 40px"></div><div style="position: absolute; left: 100px; top: 5px; width: 10px; height: 10px"></div>',
      )

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

      expect(
        shownGroup(shown, [at(3), at(4)])?.map(({ placed }) => placed),
      ).toEqual([{ left: 0, top: 0 }, null])
    })

    it('leaves a member in the flow unplaced', async () => {
      const shown = await mount(
        '<p>Words</p><div style="position: absolute; left: 0; top: 0; width: 20px; height: 20px"></div>',
      )

      expect(
        shownGroup(shown, [at(3), at(4)])?.map(({ placed }) => placed),
      ).toEqual([null, { left: 0, top: 0 }])
    })

    it('answers null for keys read from other bytes', async () => {
      const shown = await mount('<div></div><div></div>')

      expect(
        shownGroup(shown, [
          { ...at(3), hash: 'e'.repeat(64) },
          { ...at(4), hash: 'e'.repeat(64) },
        ]),
      ).toBeNull()
    })
  })

  describe('shownResize', () => {
    it('reads an upright shape as one a corner resizes', async () => {
      const shown = await mount('<div style="width: 40px; height: 40px"></div>')

      expect(shownResize(shown, KEY)?.kind).toBe('box')
    })

    it('reads a shape whose rotate states 0deg as upright', async () => {
      const shown = await mount(
        '<div style="width: 40px; height: 40px; rotate: 0deg"></div>',
      )

      expect(shownResize(shown, KEY)?.kind).toBe('box')
    })

    it('refuses a shape its rotate turns', async () => {
      const shown = await mount(
        '<div style="width: 40px; height: 40px; rotate: 30deg"></div>',
      )

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('refuses text its rotate turns', async () => {
      const shown = await mount('<p style="rotate: 30deg">Turned</p>')

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('refuses inline text, which a width does not size', async () => {
      const shown = await mount('<span>Inline</span>')

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('reads text with no stated height as hugging it', async () => {
      const shown = await mount('<p style="width: 240px">Words</p>')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'text',
        hugsHeight: true,
        inset: { width: 0, height: 0 },
      })
    })

    it('reads text with a stated height as not hugging it', async () => {
      const shown = await mount('<p style="height: 80px">Words</p>')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'text',
        hugsHeight: false,
        inset: { width: 0, height: 0 },
      })
    })

    it('reads an image with no size in the file at its natural size', async () => {
      const shown = await mount(`<img alt="" src="${WIDE_PNG}">`)

      await vi.waitFor(() =>
        expect(shownResize(shown, KEY)?.natural).toEqual({
          width: 2,
          height: 1,
        }),
      )
    })

    it('reads a decoded video at the size it decodes to', async () => {
      const shown = await mount(
        `<video muted preload="auto" src="${new URL(CLIP, location.href).href}"></video>`,
      )

      await vi.waitFor(() =>
        expect(shownResize(shown, KEY)?.natural).toEqual({
          width: 160,
          height: 90,
        }),
      )
    })

    it('reads the padding and border a content box width leaves out', async () => {
      const shown = await mount(
        '<p style="padding: 12px 24px; border: 2px solid">Tag</p>',
      )

      expect(shownResize(shown, KEY)?.inset).toEqual({ width: 52, height: 28 })
    })

    it('reads no inset on a border box, whose width holds its padding', async () => {
      const shown = await mount(
        '<p style="box-sizing: border-box; padding: 12px 24px">Tag</p>',
      )

      expect(shownResize(shown, KEY)?.inset).toEqual({ width: 0, height: 0 })
    })

    it('reads an image that has not decoded as having no natural size', async () => {
      const shown = await mount('<img alt="">')

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'media',
        natural: null,
      })
    })

    it('reads a container as one whose drag writes what it changed', async () => {
      const shown = await mount(
        '<div style="display: flex; gap: 8px"><span>a</span><span>b</span></div>',
      )

      expect(shownResize(shown, KEY)).toMatchObject({
        kind: 'container',
        sizing: { layout: { parent: 'block' }, fills: false },
      })
    })

    it('reads a container growing along its row parent as filling it', async () => {
      const shown = await mount(
        '<div style="display: flex; width: 400px"><div style="flex: 1 1 0"><p>a</p></div><span>b</span></div>',
      )

      expect(shownResize(shown, { ...KEY, index: 4 })).toMatchObject({
        kind: 'container',
        sizing: { layout: { parent: 'horizontal' }, fills: true },
      })
    })

    it('refuses an inline container, which a width does not size', async () => {
      const shown = await mount('<span><b>bold</b> words</span>')

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('refuses a container its rotate turns', async () => {
      const shown = await mount(
        '<div style="rotate: 30deg"><span>a</span></div>',
      )

      expect(shownResize(shown, KEY)).toBeNull()
    })

    it('reads nothing from a frame showing other bytes', async () => {
      const shown = await mount('<p>Words</p>')

      expect(shownResize(shown, { ...KEY, hash: 'f'.repeat(64) })).toBeNull()
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

    it('previews only the width of text, whose height keeps hugging', async () => {
      const shown = await mount('<p>Words</p>')
      const resize = startElementResize('studio/home', KEY, {
        kind: 'text',
        inset: { width: 0, height: 0 },
      })

      resize?.preview({ width: 240, height: 90 })

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

      expect(paragraph(shown).style.width).toBe('fit-content')
    })

    it('puts back every declaration a container’s preview wrote on a cancel', async () => {
      const shown = await mount(
        '<div style="display: flex; width: 400px"><div style="flex: 1 1 0"><p>a</p></div></div>',
      )
      const key = { ...KEY, index: 4 }
      const read = shownResize(shown, key)
      if (!read) throw new Error('The container reads no resize')
      const resize = startElementResize('studio/home', key, read)
      const child = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector<HTMLElement>('div > div')

      resize?.preview({ width: 120, height: read.sizing?.layout.height ?? 0 })
      expect(child?.style.flex).toBe('0 1 auto')
      resize?.cancel()

      expect(child?.style.flex).toBe('1 1 0px')
      expect(child?.style.width).toBe('')
    })

    it('leaves a hugging container’s style as it was after a cancel of a drag on both sides', async () => {
      const shown = await mount(
        '<div style="display: flex; gap: 8px"><p>a</p><p>b</p></div>',
      )
      const read = shownResize(shown, KEY)
      if (!read) throw new Error('The container reads no resize')
      const resize = startElementResize('studio/home', KEY, read)
      const container = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('body > div')

      resize?.preview({ width: 300, height: 200 })
      resize?.cancel()

      expect(container?.getAttribute('style')).toBe('display: flex; gap: 8px')
    })

    it('leaves a Fill row child’s style as it was after a cancel of a drag on both sides', async () => {
      const shown = await mount(
        '<style>.grow { flex: 1 }</style><div style="display: flex; width: 400px"><div class="grow" style="width: 100px"><p>a</p></div></div>',
      )
      const key = { ...KEY, index: 5 }
      const read = shownResize(shown, key)
      if (!read) throw new Error('The container reads no resize')
      const resize = startElementResize('studio/home', key, read)
      const child = shown
        .querySelector('iframe')
        ?.contentDocument?.querySelector('.grow')

      resize?.preview({
        width: 160,
        height: (read.sizing?.layout.height ?? 0) + 40,
      })
      resize?.cancel()

      expect(child?.getAttribute('style')).toBe('width: 100px;')
    })
  })
})

describe('placedOffsets', () => {
  const HASH = 'e'.repeat(64)
  const KEY = { frame: 'studio/home/hero', index: 3, hash: HASH }
  let container: HTMLDivElement | undefined

  // Indices past the skipped injected style: html 0, head 1, body 2, then the body's children.
  async function mountElement(style: string): Promise<HTMLDivElement> {
    container = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = KEY.frame
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body><div style="${style}"></div></body></html>`
    frame.append(iframe)
    container.append(frame)
    document.body.append(container)
    await loaded
    return container
  }

  afterEach(() => {
    container?.remove()
    container = undefined
  })

  it('reads the offsets a placed element holds', async () => {
    const shown = await mountElement(
      'position: absolute; left: 12px; top: 34px',
    )

    expect(placedOffsets(shown, KEY)).toEqual({ left: 12, top: 34 })
  })

  it('reads an element in the flow as unplaced', async () => {
    const shown = await mountElement('position: relative; left: 12px')

    expect(placedOffsets(shown, KEY)).toBeNull()
  })

  it('reads nothing from a frame showing other bytes', async () => {
    const shown = await mountElement('position: absolute; left: 0; top: 0')

    expect(placedOffsets(shown, { ...KEY, hash: 'f'.repeat(64) })).toBeNull()
  })
})
