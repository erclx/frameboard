import { afterEach, describe, expect, it } from 'vitest'

import { measureHeight } from './height'

const RESET = '<style>html,body{margin:0}</style>'

async function iframeOf(
  body: string,
  { width, height }: { width: number; height: number },
): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `display:block;border:0;width:${width}px;height:${height}px`
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = `<!doctype html>${RESET}<body>${body}</body>`
  document.body.append(iframe)
  await loaded
  return iframe
}

describe('measureHeight', () => {
  afterEach(() => {
    for (const iframe of document.querySelectorAll('iframe')) iframe.remove()
  })

  it('reads a wrapping page taller at a narrower width', async () => {
    const tile = '<div style="flex:none;width:100px;height:50px"></div>'
    const iframe = await iframeOf(
      `<div style="display:flex;flex-wrap:wrap">${tile.repeat(8)}</div>`,
      { width: 200, height: 900 },
    )

    expect(measureHeight(iframe, 900)).toBe(200)
  })

  it('reads a page of a fixed height at that height', async () => {
    const iframe = await iframeOf('<div style="height:320px"></div>', {
      width: 390,
      height: 900,
    })

    expect(measureHeight(iframe, 900)).toBe(320)
  })

  it('reads nothing for a page sized off the viewport', async () => {
    const iframe = await iframeOf('<div style="height:100vh"></div>', {
      width: 390,
      height: 900,
    })

    expect(measureHeight(iframe, 900)).toBeNull()
  })

  it('puts the iframe back at its height', async () => {
    const iframe = await iframeOf('<div style="height:320px"></div>', {
      width: 390,
      height: 900,
    })

    measureHeight(iframe, 900)

    expect(iframe.style.height).toBe('900px')
  })
})
