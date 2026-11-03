import { afterEach, describe, expect, it } from 'vitest'

import { overflowing } from './overflow'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

/** A 400 × 300 frame showing `body`, its indices past html 0, head 1, and body 2. */
async function frameOf(body: string): Promise<Document> {
  iframe = document.createElement('iframe')
  iframe.style.cssText = 'width:400px;height:300px;border:0'
  const loaded = new Promise((resolve) =>
    iframe?.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = `<!doctype html><html><head></head><body style="margin:0">${body}</body></html>`
  document.body.append(iframe)
  await loaded
  const shown = iframe.contentDocument
  if (!shown) throw new Error('The frame shows no document')
  return shown
}

const at = (left: number, top: number, extra = '') =>
  `<div style="position:absolute;left:${left}px;top:${top}px;width:100px;height:50px${extra}"></div>`

describe('overflowing', () => {
  it('lists an element partly past the edge and one wholly past it, and not one inside', async () => {
    const shown = await frameOf(`${at(20, 20)}${at(350, 20)}${at(500, 400)}`)

    expect(overflowing(shown)).toEqual([
      { index: 4, box: { x: 350, y: 20, width: 100, height: 50 } },
      { index: 5, box: { x: 500, y: 400, width: 100, height: 50 } },
    ])
  })

  it('lists one past the left or top edge too', async () => {
    const shown = await frameOf(at(-30, 20))

    expect(overflowing(shown)).toEqual([
      { index: 3, box: { x: -30, y: 20, width: 100, height: 50 } },
    ])
  })

  it('lists nothing for a fixed element, which the viewport check reports', async () => {
    const shown = await frameOf(
      `<div style="position:fixed;left:350px;top:20px;width:100px;height:50px"></div>`,
    )

    expect(overflowing(shown)).toEqual([])
  })

  it('lists nothing an ancestor crops inside the frame', async () => {
    const shown = await frameOf(
      `<div style="position:relative;width:200px;height:200px;overflow:hidden">${at(350, 20)}</div>`,
    )

    expect(overflowing(shown)).toEqual([])
  })

  it('lists the element past the edge and none of its children, which travel with it', async () => {
    const shown = await frameOf(
      `<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"><span>child</span></div>`,
    )

    expect(overflowing(shown).map(({ index }) => index)).toEqual([3])
  })

  it('takes a pixel of slack, so a subpixel edge reads as inside', async () => {
    const shown = await frameOf(at(300.5, 20))

    expect(overflowing(shown)).toEqual([])
  })
})
