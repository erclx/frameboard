import { afterEach, describe, expect, it } from 'vitest'

import { gapAt } from './gap'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A 400 by 300 live frame showing `body`, resolved with its document once it has loaded. */
async function mount(body: string): Promise<Document> {
  iframe = document.createElement('iframe')
  iframe.style.cssText = 'display:block;width:400px;height:300px;border:0'
  const loaded = new Promise((resolve) =>
    iframe?.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = `<!doctype html><html><head><style>body{margin:0}div{height:40px}</style></head><body>${body}</body></html>`
  document.body.append(iframe)
  await loaded
  const shown = iframe.contentDocument
  if (!shown) throw new Error('The frame shows no document.')
  return shown
}

// Indices: html 0, head 1, style 2, body 3, then the body's own elements from 4.

describe('gapAt', () => {
  it('should read a column of blocks along y, before the child below the point', async () => {
    const shown = await mount(
      '<main style="padding:10px"><div></div><div></div></main>',
    )

    // The first div spans y 10 to 50, so 45 is past its middle.
    expect(gapAt(shown, { x: 100, y: 45 })).toEqual({
      parent: 4,
      before: 6,
      row: false,
      line: { x: 10, y: 50, width: 380, height: 0 },
    })
  })

  it('should read a flex row along x, between the two children', async () => {
    const shown = await mount(
      '<main style="display:flex;height:100px"><div style="width:100px"></div><div style="width:100px"></div></main>',
    )

    expect(gapAt(shown, { x: 120, y: 20 })).toEqual({
      parent: 4,
      before: 6,
      row: true,
      line: { x: 100, y: 0, width: 0, height: 40 },
    })
  })

  it('should read a reversed row from the right', async () => {
    const shown = await mount(
      '<main style="display:flex;flex-direction:row-reverse"><div style="width:100px"></div><div style="width:100px"></div></main>',
    )

    // The first child draws at x 300 to 400, so 330 sits on its left, after it in the file.
    expect(gapAt(shown, { x: 330, y: 20 })).toMatchObject({
      before: 6,
      row: true,
      line: { x: 300 },
    })
  })

  it('should read a grid along x', async () => {
    const shown = await mount(
      '<main style="display:grid;grid-template-columns:100px 100px"><div></div><div></div></main>',
    )

    expect(gapAt(shown, { x: 120, y: 20 })).toMatchObject({
      parent: 4,
      before: 6,
      row: true,
    })
  })

  it('should take the parent of an element holding text, beside it', async () => {
    const shown = await mount(
      '<section><h1 style="margin:0;height:40px">Title</h1><h2 style="margin:0;height:40px">Sub</h2></section>',
    )

    // On the h1's lower half, so the gap is between the h1 and the h2.
    expect(gapAt(shown, { x: 20, y: 30 })).toMatchObject({
      parent: 4,
      before: 6,
      row: false,
    })
  })

  it('should take the block around an inline element', async () => {
    const shown = await mount(
      '<section><p style="margin:0">Hi <code>there</code></p></section>',
    )
    const code = shown.querySelector('code')?.getBoundingClientRect()
    if (!code) throw new Error('No code drawn.')

    expect(gapAt(shown, { x: code.left + 2, y: code.top + 2 })).toMatchObject({
      parent: 4,
      before: 5,
    })
  })

  it('should land at the end of the body below its content', async () => {
    const shown = await mount('<div></div>')

    expect(gapAt(shown, { x: 100, y: 200 })).toEqual({
      parent: 3,
      before: null,
      row: false,
      line: { x: 0, y: 40, width: 400, height: 0 },
    })
  })

  it('should land beside an empty box rather than inside it', async () => {
    const shown = await mount(
      '<main><div style="height:100px"></div><div></div></main>',
    )

    // On the first box's upper half, so the gap is ahead of it.
    expect(gapAt(shown, { x: 100, y: 20 })).toEqual({
      parent: 4,
      before: 5,
      row: false,
      line: { x: 0, y: 0, width: 400, height: 0 },
    })
  })

  it('should land in an empty body at its top', async () => {
    const shown = await mount('')

    expect(gapAt(shown, { x: 100, y: 100 })).toEqual({
      parent: 3,
      before: null,
      row: false,
      line: { x: 0, y: 0, width: 400, height: 0 },
    })
  })
})
