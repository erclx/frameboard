import { afterEach, describe, expect, it } from 'vitest'

import { cornerOf } from './pin-corner'

const FRAME = {
  ref: 'studio/home/card',
  box: { x: 100, y: 50, width: 200, height: 150 },
}

/**
 * A canvas holding one live frame whose body sizes the iframe to the frame's
 * box and draws one absolutely placed element, file index 3 after the html,
 * head, and body.
 */
async function canvasWith(element: string): Promise<HTMLElement> {
  const container = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME.ref
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `border:0;width:${FRAME.box.width}px;height:${FRAME.box.height}px`
  iframe.srcdoc = `<!doctype html><html><head></head><body style="margin:0">${element}</body></html>`
  frame.append(iframe)
  container.append(frame)
  document.body.append(container)
  await new Promise((resolve) => iframe.addEventListener('load', resolve))
  return container
}

afterEach(() => {
  document.body.replaceChildren()
})

describe('cornerOf', () => {
  it('puts a frame note on the frame top right corner', () => {
    expect(cornerOf(FRAME, null, null)).toEqual({ x: 300, y: 50 })
  })

  it('puts an element note on the element top right corner', async () => {
    const container = await canvasWith(
      '<div style="position:absolute;left:20px;top:30px;width:50px;height:10px"></div>',
    )

    expect(cornerOf(FRAME, 3, container)).toEqual({ x: 170, y: 80 })
  })

  it('clamps an element running past the frame to its right edge and top', async () => {
    const container = await canvasWith(
      '<div style="position:absolute;left:150px;top:-20px;width:120px;height:40px"></div>',
    )

    expect(cornerOf(FRAME, 3, container)).toEqual({ x: 300, y: 50 })
  })

  it('falls back to the frame corner once the element is lost', async () => {
    const container = await canvasWith('<div></div>')

    expect(cornerOf(FRAME, 9, container)).toEqual({ x: 300, y: 50 })
  })

  it('reads the corner off the box it is handed rather than the stored one', async () => {
    const container = await canvasWith(
      '<div style="position:absolute;right:10px;top:0;width:20px;height:10px"></div>',
    )
    const iframe = container.querySelector('iframe')
    if (iframe) iframe.style.width = '260px'

    expect(
      cornerOf({ ...FRAME, box: { ...FRAME.box, width: 260 } }, 3, container),
    ).toEqual({ x: 350, y: 50 })
  })
})
