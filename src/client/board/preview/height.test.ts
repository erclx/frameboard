import { afterEach, describe, expect, it } from 'vitest'

import { bridgedFrame } from '@/test/frame-bridge'

import { shownHashOf } from '../bridge/shown'
import { measureHeight } from './height'

const RESET = '<style data-frameboard>html,body{margin:0}</style>'

/** A bridged frame of `width` by 900 showing `body`, resolved once its bridge announced itself. */
async function frameOf(body: string, width = 390): Promise<HTMLIFrameElement> {
  const iframe = await bridgedFrame(body, {
    head: RESET,
    style: `display:block;border:0;width:${width}px;height:900px`,
  })
  await expect.poll(() => shownHashOf(iframe)).not.toBeNull()
  return iframe
}

describe('measureHeight', () => {
  afterEach(() => {
    for (const iframe of document.querySelectorAll('iframe')) iframe.remove()
  })

  it('reads a page of a fixed height at that height', async () => {
    const iframe = await frameOf('<div style="height:320px"></div>')

    expect(await measureHeight(iframe, 900)).toBe(320)
  })

  it('reads a wrapping page taller at a narrower width', async () => {
    const tile = '<div style="flex:none;width:100px;height:50px"></div>'
    const iframe = await frameOf(
      `<div style="display:flex;flex-wrap:wrap">${tile.repeat(8)}</div>`,
      200,
    )

    expect(await measureHeight(iframe, 900)).toBe(200)
  })

  it('reads nothing for a page sized off the viewport', async () => {
    const iframe = await frameOf('<div style="height:100vh"></div>')

    expect(await measureHeight(iframe, 900)).toBeNull()
  })

  it('hides the iframe while it reads, so its collapsed page never shows', async () => {
    const iframe = await frameOf('<div style="height:320px"></div>')

    const measured = measureHeight(iframe, 900)
    const during = iframe.style.visibility
    await measured

    expect(during).toBe('hidden')
  })

  it('puts the iframe back at its height and shows it once read', async () => {
    const iframe = await frameOf('<div style="height:320px"></div>')

    await measureHeight(iframe, 900)

    expect([iframe.style.height, iframe.style.visibility]).toEqual([
      '900px',
      '',
    ])
  })

  it('puts the iframe back as it stood before two reads in quick order', async () => {
    const iframe = await frameOf('<div style="height:320px"></div>')

    const first = measureHeight(iframe, 900)
    const second = measureHeight(iframe, 900)
    await Promise.all([first, second])

    expect([iframe.style.height, iframe.style.visibility]).toEqual([
      '900px',
      '',
    ])
  })

  it('answers the newer of two reads in quick order alone', async () => {
    const iframe = await frameOf('<div style="height:320px"></div>')

    const first = measureHeight(iframe, 900)
    const second = measureHeight(iframe, 900)

    expect(await Promise.all([first, second])).toEqual([null, 320])
  })

  it('reads nothing and hides nothing on a page with no bridge', async () => {
    const iframe = document.createElement('iframe')
    iframe.srcdoc = '<div style="height:320px"></div>'
    document.body.append(iframe)

    const measured = measureHeight(iframe, 900)

    expect(iframe.style.visibility).toBe('')
    expect(await measured).toBeNull()
  })
})
