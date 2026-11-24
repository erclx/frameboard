import { afterEach, describe, expect, it } from 'vitest'

import type { FramePoint } from '@/shared/frame-bridge/messages'
import { ask, bridgedFrame } from '@/test/frame-bridge'

const HASH = 'c'.repeat(64)

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A 400 by 300 live frame showing `body`, once it has loaded. */
async function mount(body: string): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, {
    hash: HASH,
    head: '<style>body{margin:0}div{height:40px}</style>',
    style: 'display:block;width:400px;height:300px;border:0',
  })
  return iframe
}

/** The gap the frame answers under a point, or for a carried element the gap it moves to. */
async function gapAt(
  frame: HTMLIFrameElement,
  at: FramePoint,
  carried?: number,
) {
  const asked = await ask(
    frame,
    'gap-at',
    carried === undefined ? { at } : { at, carried },
  )
  return 'value' in asked.reply ? (asked.reply.value?.gap ?? null) : undefined
}

// Indices past the injected stamp and bridge: html 0, head 1, style 2, body 3, then the body's own elements from 4.

describe('gap-at', () => {
  it('should read a column of blocks along y, before the child below the point', async () => {
    const frame = await mount(
      '<main style="padding:10px"><div></div><div></div></main>',
    )

    // The first div spans y 10 to 50, so 45 is past its middle.
    expect(await gapAt(frame, { x: 100, y: 45 })).toEqual({
      parent: 4,
      before: 6,
      row: false,
      flow: false,
      origin: { x: 0, y: 0 },
      room: 380,
      line: { x: 10, y: 50, width: 380, height: 0 },
    })
  })

  it('should read a flex row along x, between the two children', async () => {
    const frame = await mount(
      '<main style="display:flex;height:100px"><div style="width:100px"></div><div style="width:100px"></div></main>',
    )

    expect(await gapAt(frame, { x: 120, y: 20 })).toEqual({
      parent: 4,
      before: 6,
      row: true,
      flow: true,
      origin: { x: 0, y: 0 },
      room: 400,
      line: { x: 100, y: 0, width: 0, height: 40 },
    })
  })

  it('should read a reversed row from the right', async () => {
    const frame = await mount(
      '<main style="display:flex;flex-direction:row-reverse"><div style="width:100px"></div><div style="width:100px"></div></main>',
    )

    // The first child draws at x 300 to 400, so 330 sits on its left, after it in the file.
    expect(await gapAt(frame, { x: 330, y: 20 })).toMatchObject({
      before: 6,
      row: true,
      line: { x: 300 },
    })
  })

  it('should read a grid along x', async () => {
    const frame = await mount(
      '<main style="display:grid;grid-template-columns:100px 100px"><div></div><div></div></main>',
    )

    expect(await gapAt(frame, { x: 120, y: 20 })).toMatchObject({
      parent: 4,
      before: 6,
      row: true,
    })
  })

  it('should take the parent of an element holding text, beside it', async () => {
    const frame = await mount(
      '<section><h1 style="margin:0;height:40px">Title</h1><h2 style="margin:0;height:40px">Sub</h2></section>',
    )

    // On the h1's lower half, so the gap is between the h1 and the h2.
    expect(await gapAt(frame, { x: 20, y: 30 })).toMatchObject({
      parent: 4,
      before: 6,
      row: false,
    })
  })

  it('should take the block around an inline element', async () => {
    const frame = await mount(
      '<section><p style="margin:0">Hi <code>there</code></p></section>',
    )
    const code = frame.contentDocument
      ?.querySelector('code')
      ?.getBoundingClientRect()
    if (!code) throw new Error('No code drawn.')

    expect(
      await gapAt(frame, { x: code.left + 2, y: code.top + 2 }),
    ).toMatchObject({
      parent: 4,
      before: 5,
    })
  })

  it('should land at the end of the body below its content', async () => {
    const frame = await mount('<div></div>')

    expect(await gapAt(frame, { x: 100, y: 200 })).toEqual({
      parent: 3,
      before: null,
      row: false,
      flow: false,
      origin: { x: 0, y: 0 },
      room: 400,
      line: { x: 0, y: 40, width: 400, height: 0 },
    })
  })

  it('should land beside an empty box rather than inside it', async () => {
    const frame = await mount(
      '<main><div style="height:100px"></div><div></div></main>',
    )

    // On the first box's upper half, so the gap is ahead of it.
    expect(await gapAt(frame, { x: 100, y: 20 })).toEqual({
      parent: 4,
      before: 5,
      row: false,
      flow: false,
      origin: { x: 0, y: 0 },
      room: 400,
      line: { x: 0, y: 0, width: 400, height: 0 },
    })
  })

  it('should count a body placement from the document origin, past the scroll', async () => {
    const frame = await mount('<div style="height:1000px"></div>')
    frame.contentWindow?.scrollTo(0, 120)

    expect(await gapAt(frame, { x: 100, y: 20 })).toMatchObject({
      parent: 3,
      origin: { x: 0, y: -120 },
    })
  })

  it('should count a placement in a container from inside its border', async () => {
    const frame = await mount(
      '<main style="margin:30px 0 0 20px;border:4px solid;padding:10px"><div></div></main>',
    )

    expect(await gapAt(frame, { x: 100, y: 60 })).toMatchObject({
      parent: 4,
      origin: { x: 24, y: 34 },
    })
  })

  it('should read a grid as a flow a placed element joins', async () => {
    const frame = await mount('<main style="display:grid"><div></div></main>')

    expect(await gapAt(frame, { x: 100, y: 20 })).toMatchObject({ flow: true })
  })

  it('should land in an empty body at its top', async () => {
    const frame = await mount('')

    expect(await gapAt(frame, { x: 100, y: 100 })).toEqual({
      parent: 3,
      before: null,
      row: false,
      flow: false,
      origin: { x: 0, y: 0 },
      room: 400,
      line: { x: 0, y: 0, width: 400, height: 0 },
    })
  })
})

describe('gap-at for a carried element', () => {
  it('answers the gap it would move to, with the hash it was read at', async () => {
    const frame = await mount('<div></div><div></div><div></div>')

    const asked = await ask(frame, 'gap-at', {
      // On the third div's upper half, so the gap is ahead of it.
      at: { x: 100, y: 90 },
      carried: 4,
    })

    expect(asked.reply).toMatchObject({
      value: { hash: HASH, gap: { parent: 3, before: 6 } },
    })
  })

  it('answers null where the move would leave it in place', async () => {
    const frame = await mount('<div></div><div></div>')

    expect(await gapAt(frame, { x: 100, y: 10 }, 4)).toBeNull()
  })

  it('answers null for a move into the element itself', async () => {
    const frame = await mount(
      '<main style="padding:10px"><div></div><div></div></main>',
    )

    expect(await gapAt(frame, { x: 100, y: 45 }, 4)).toBeNull()
  })
})

describe('pick-at', () => {
  const BEHIND =
    '<main style="height:200px"><div style="position:absolute;inset:0;height:100px" data-locked=""><b style="display:block">Held</b></div></main>'

  async function chainOf(body: string, unlocked: boolean) {
    const asked = await ask(await mount(body), 'pick-at', {
      at: { x: 20, y: 5 },
      unlocked,
    })
    return 'value' in asked.reply
      ? asked.reply.value?.chain.map(({ tag }) => tag)
      : undefined
  }

  it('should pass over a locked element and what it holds for what sits behind it', async () => {
    expect(
      await chainOf(
        '<section style="height:100px"></section><div data-locked="" style="position:absolute;inset:0"><b>Held</b></div>',
        true,
      ),
    ).toEqual(['section'])
  })

  it('should land on the unlocked parent of a locked child', async () => {
    expect(await chainOf(BEHIND, true)).toEqual(['main'])
  })

  it('should answer nothing where a locked element covers the body alone', async () => {
    expect(await chainOf('<div data-locked="">Held</div>', true)).toEqual([])
  })

  it('should answer a locked element to a press that asks for any', async () => {
    expect(await chainOf(BEHIND, false)).toEqual(['b', 'div', 'main'])
  })

  it('should pass over an element that renders nothing the page draws anyway', async () => {
    expect(
      await chainOf(
        '<style style="display:block;height:40px">p{}</style>',
        false,
      ),
    ).toEqual([])
  })
})

describe('paint', () => {
  it("resolves a fill in the page's own theme", async () => {
    const frame = await mount('')
    frame.contentDocument?.documentElement.style.setProperty(
      '--fill',
      'rgb(1, 2, 3)',
    )

    const asked = await ask(frame, 'paint', { fill: 'var(--fill)' })

    expect(asked.reply).toEqual({ value: 'rgb(1, 2, 3)' })
    expect(frame.contentDocument?.body.childElementCount).toBe(0)
  })
})
