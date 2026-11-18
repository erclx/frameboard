import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { BRIDGE } from '@/test/frame-bridge'

import { cornerOf, usePinCorners } from './pin-corner'

const FRAME = {
  ref: 'studio/home/card',
  box: { x: 100, y: 50, width: 200, height: 150 },
}

let stop = () => {}

/**
 * A canvas holding one live frame whose body sizes the iframe to the frame's
 * box and draws one absolutely placed element, file index 3 after the html,
 * head, and body, its pin corners followed as the notes layer follows them.
 */
async function canvasWith(
  element: string,
  pinned: readonly number[] = [3],
): Promise<{ container: HTMLElement; iframe: HTMLIFrameElement }> {
  const container = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME.ref
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `border:0;width:${FRAME.box.width}px;height:${FRAME.box.height}px`
  iframe.srcdoc = `<!doctype html><html><head>${BRIDGE}</head><body style="margin:0">${element}</body></html>`
  frame.append(iframe)
  container.append(frame)
  document.body.append(container)
  await new Promise((resolve) => iframe.addEventListener('load', resolve))
  const { unmount } = renderHook(() =>
    usePinCorners(container, new Map([[FRAME.ref, pinned]])),
  )
  stop = unmount
  return { container, iframe }
}

afterEach(() => {
  stop()
  stop = () => {}
  document.body.replaceChildren()
})

describe('cornerOf', () => {
  it('puts a frame note on the frame top right corner', () => {
    expect(cornerOf(FRAME, null, null)).toEqual({ x: 300, y: 50 })
  })

  it('puts an element note on the element top right corner', async () => {
    const { container } = await canvasWith(
      '<div style="position:absolute;left:20px;top:30px;width:50px;height:10px"></div>',
    )

    await expect
      .poll(() => cornerOf(FRAME, 3, container))
      .toEqual({ x: 170, y: 80 })
  })

  it('clamps an element running past the frame to its right edge and top', async () => {
    const { container } = await canvasWith(
      '<div style="position:absolute;left:150px;top:-20px;width:120px;height:40px"></div>',
    )
    // Answered once the frame pushes, which an in-frame corner shows apart from the frame's.
    await expect
      .poll(() =>
        cornerOf({ ...FRAME, box: { ...FRAME.box, width: 300 } }, 3, container),
      )
      .toEqual({ x: 370, y: 50 })

    expect(cornerOf(FRAME, 3, container)).toEqual({ x: 300, y: 50 })
  })

  it('falls back to the frame corner for an element the page holds none at', async () => {
    const { container } = await canvasWith('<div></div>', [9])

    expect(cornerOf(FRAME, 9, container)).toEqual({ x: 300, y: 50 })
  })

  it('moves to the corner the frame pushes once it reflows', async () => {
    const { container, iframe } = await canvasWith(
      '<div style="position:absolute;right:10px;top:0;width:20px;height:10px"></div>',
    )
    await expect
      .poll(() => cornerOf(FRAME, 3, container))
      .toEqual({ x: 290, y: 50 })

    iframe.style.width = '260px'
    const wider = { ...FRAME, box: { ...FRAME.box, width: 260 } }

    await expect
      .poll(() => cornerOf(wider, 3, container))
      .toEqual({
        x: 350,
        y: 50,
      })
  })
})
