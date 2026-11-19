import { afterEach, describe, expect, it } from 'vitest'

import { frameElements } from '@/shared/frame-bridge/elements'
import { ask, bridgedFrame } from '@/test/frame-bridge'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A frame of `width` by `height` showing `body` with no margin. */
async function frameOf(
  body: string,
  { width = 300, height = 400 } = {},
): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, {
    style: `display:block;border:0;width:${width}px;height:${height}px`,
    head: '<style data-frameboard>html,body{margin:0}</style>',
  })
  return iframe
}

function pageOf(frame: HTMLIFrameElement): Window {
  const view = frame.contentWindow
  if (!view) throw new Error('The iframe holds no window')
  return view
}

/** A page four times as tall as the 400px frame. */
const TALL = '<div style="height:1600px"></div>'

describe('theme', () => {
  it("shows the page's root in the theme named", async () => {
    const frame = await frameOf('<p>Hi</p>')

    const { reply } = await ask(frame, 'theme', { theme: 'dark' })

    const root = pageOf(frame).document.documentElement
    expect(reply).toEqual({ value: true })
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.style.colorScheme).toBe('dark')
    expect(root.classList.contains('dark')).toBe(true)
  })
})

describe('hide-scrollbar', () => {
  const scrollbar = (frame: HTMLIFrameElement) =>
    getComputedStyle(pageOf(frame).document.documentElement).scrollbarWidth

  it('hides the scrollbar until the board closes it', async () => {
    const frame = await frameOf(TALL)

    const asked = await ask(frame, 'hide-scrollbar', {})
    const hidden = scrollbar(frame)
    asked.close()

    expect(asked.reply).toEqual({ value: true })
    expect(hidden).toBe('none')
    await expect.poll(() => scrollbar(frame)).toBe('auto')
  })

  it('leaves its style out of the element index', async () => {
    const frame = await frameOf(TALL)

    await ask(frame, 'hide-scrollbar', {})

    const { document } = pageOf(frame)
    expect(
      frameElements(document).filter((node) => node.localName === 'style'),
    ).toEqual([])
  })
})

describe('scroll', () => {
  it('answers where the page shows as shares of its height', async () => {
    const frame = await frameOf(TALL)

    const { reply } = await ask(frame, 'scroll', {})

    expect(reply).toEqual({ value: { top: 0, size: 0.25 } })
  })

  it('pushes the view again as the page scrolls', async () => {
    const frame = await frameOf(TALL)
    const { pushes } = await ask(frame, 'scroll', {})

    pageOf(frame).scrollTo({ top: 800 })

    await expect.poll(() => pushes.at(-1)).toEqual({ top: 0.5, size: 0.25 })
  })

  it('answers null for a page that fits its frame', async () => {
    const frame = await frameOf('<div style="height:100px"></div>')

    const { reply } = await ask(frame, 'scroll', {})

    expect(reply).toEqual({ value: null })
  })
})

describe('scroll-act', () => {
  it('pages by one screen toward the side named', async () => {
    const frame = await frameOf(TALL)

    await ask(frame, 'scroll-act', { act: 'page', toward: 1 })

    expect(pageOf(frame).scrollY).toBe(400)
  })

  it('scrolls to a share of the page', async () => {
    const frame = await frameOf(TALL)

    await ask(frame, 'scroll-act', { act: 'to', top: 0.4 })

    expect(pageOf(frame).scrollY).toBe(640)
  })
})

describe('content-height', () => {
  it('reads a wrapping page at its height for its width', async () => {
    const tile = '<div style="flex:none;width:100px;height:50px"></div>'
    const frame = await frameOf(
      `<div style="display:flex;flex-wrap:wrap">${tile.repeat(8)}</div>`,
      { width: 200, height: 900 },
    )

    const { reply } = await ask(frame, 'content-height', {})

    expect(reply).toEqual({ value: 200 })
  })

  it('reads text spilling below a block shorter than it', async () => {
    const frame = await frameOf(
      '<p style="width:1px;height:20px;margin:0;line-height:30px">one two three four</p>',
    )

    const { reply } = await ask(frame, 'content-height', {})

    expect('value' in reply && reply.value).toBeGreaterThan(90)
  })

  it.each([
    [
      'a tight line height block',
      '<h1 style="margin:0;font-size:48px;line-height:1">Heading</h1>',
    ],
    [
      'a tight line height heading wrapping its text in a link',
      '<h1 style="margin:0;font-size:48px;line-height:1"><a href="#">Heading</a></h1>',
    ],
  ])('reads %s at its own height', async (_case, body) => {
    const frame = await frameOf(body, { width: 390, height: 900 })

    const { reply } = await ask(frame, 'content-height', {})

    expect(reply).toEqual({ value: 48 })
  })

  it('reads a padded inline badge under a tight line height to its painted bottom', async () => {
    const frame = await frameOf(
      '<h1 style="margin:0;font-size:48px;line-height:1"><span style="padding:12px 0;background:red">Heading</span></h1>',
    )
    const badge = pageOf(frame).document.querySelector('span')
    const painted = Math.ceil(badge?.getBoundingClientRect().bottom ?? 0)

    const { reply } = await ask(frame, 'content-height', {})

    expect(reply).toEqual({ value: painted })
  })

  it('reads an image inside a tight line height heading at its own height', async () => {
    const frame = await frameOf(
      '<h1 style="margin:0;font-size:48px;line-height:1"><img alt="" width="10" height="200" style="display:inline"></h1>',
    )

    const { reply } = await ask(frame, 'content-height', {})

    expect('value' in reply && reply.value).toBeGreaterThanOrEqual(200)
  })

  it('reads a page sized off its viewport at the viewport', async () => {
    const frame = await frameOf('<div style="height:100vh"></div>', {
      height: 900,
    })

    const { reply } = await ask(frame, 'content-height', {})

    expect(reply).toEqual({ value: 900 })
  })
})

describe('page-colors', () => {
  it("answers the fill and ink the page's body paints", async () => {
    const frame = await frameOf(
      '<style>body { background: rgb(1, 2, 3); color: rgb(4, 5, 6) }</style><p>Hi</p>',
    )

    const { reply } = await ask(frame, 'page-colors', {})

    expect(reply).toEqual({
      value: { fill: 'rgb(1, 2, 3)', ink: 'rgb(4, 5, 6)' },
    })
  })

  it('answers no fill for a page that paints none', async () => {
    const frame = await frameOf('<p>Hi</p>')

    const { reply } = await ask(frame, 'page-colors', {})

    expect(reply).toMatchObject({ value: { fill: null } })
  })
})
