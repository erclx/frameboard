import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../bridge/channel'
import { shownHashOf } from '../bridge/shown'
import { stampRenderedHash } from '../frame-dom'
import { heldGhost, heldMeasures, useGhosts, useMeasures } from './measures'

const HASH = 'c'.repeat(64)
const NEXT = 'd'.repeat(64)
const FRAME = 'studio/home/hero'

let container: HTMLDivElement | undefined

afterEach(() => {
  container?.remove()
  container = undefined
})

/** A canvas layer holding one live frame showing `body`, once its bridge announced its bytes. Indices: html 0, head 1, body 2. */
async function mount(body: string): Promise<{
  layer: HTMLDivElement
  iframe: HTMLIFrameElement
}> {
  container = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'width:400px;height:300px;border:0'
  frame.append(iframe)
  container.append(frame)
  document.body.append(container)
  iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}">body{margin:0}</style>${BRIDGE}</head><body>${body}</body></html>`
  await expect.poll(() => shownHashOf(iframe)).toBe(HASH)
  return { layer: container, iframe }
}

const BOX =
  '<div style="position:absolute;left:10px;top:20px;width:100px;height:50px"></div>'

describe('useMeasures', () => {
  it('holds what the frame pushes for the selection', async () => {
    const { layer } = await mount(BOX)
    const keys = [{ frame: FRAME, index: 3, hash: HASH }]

    const { result } = renderHook(() => useMeasures(layer, keys))

    await expect
      .poll(() => result.current?.[0]?.box)
      .toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(heldMeasures(keys)?.[0]?.placed).toEqual({ left: 10, top: 20 })
  })

  it('takes a push after a resize', async () => {
    const { layer, iframe } = await mount(BOX)
    const keys = [{ frame: FRAME, index: 3, hash: HASH }]
    const { result } = renderHook(() => useMeasures(layer, keys))
    await expect.poll(() => result.current?.[0]?.box.width).toBe(100)

    iframe.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('width', '140px')

    await expect.poll(() => result.current?.[0]?.box.width).toBe(140)
  })

  it('drops what it held once the frame is restamped past the key', async () => {
    const { layer, iframe } = await mount(BOX)
    const keys = [{ frame: FRAME, index: 3, hash: HASH }]
    const { result } = renderHook(() => useMeasures(layer, keys))
    await expect.poll(() => result.current).not.toBeNull()

    await request(iframe, 'restamp', { hash: NEXT })
    iframe.contentDocument
      ?.querySelector<HTMLElement>('body > div')
      ?.style.setProperty('width', '140px')
    // The frame answers a later request after every push it sent first.
    await request(iframe, 'element-box', { index: 3, hash: NEXT })

    expect(result.current).toBeNull()
    expect(heldMeasures(keys)).toBeNull()
  })

  it('measures the key a restamp moves the page to, as a write that lands without a reload does', async () => {
    const { layer, iframe } = await mount(BOX)
    const keys = [{ frame: FRAME, index: 3, hash: NEXT }]
    const { result } = renderHook(() => useMeasures(layer, keys))

    stampRenderedHash(iframe, NEXT)

    await expect.poll(() => result.current?.[0]?.box.width).toBe(100)
  })

  it('holds nothing for keys read from other bytes', async () => {
    const { layer, iframe } = await mount(BOX)
    const keys = [{ frame: FRAME, index: 3, hash: NEXT }]

    const { result } = renderHook(() => useMeasures(layer, keys))
    await request(iframe, 'element-box', { index: 3, hash: HASH })

    expect(result.current).toBeNull()
  })
})

describe('useGhosts', () => {
  it("holds a frame's elements past its edge with their offsets", async () => {
    const { layer } = await mount(
      '<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"></div>',
    )

    const { result } = renderHook(() => useGhosts(layer, FRAME))

    await expect
      .poll(() => result.current?.ghosts.map(({ index }) => index))
      .toEqual([3])
    expect(heldGhost({ frame: FRAME, index: 3, hash: HASH })?.placed).toEqual({
      left: 350,
      top: 20,
    })
  })

  it('lets go of a frame once no caller follows it', async () => {
    const { layer } = await mount(
      '<div style="position:absolute;left:350px;top:20px;width:100px;height:50px"></div>',
    )
    const { result, unmount } = renderHook(() => useGhosts(layer, FRAME))
    await expect.poll(() => result.current).not.toBeNull()

    unmount()

    expect(heldGhost({ frame: FRAME, index: 3, hash: HASH })).toBeNull()
  })
})
