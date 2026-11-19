import { afterEach, describe, expect, it } from 'vitest'

import { frameElements } from '@/shared/frame-bridge/elements'
import { ask, bridgedFrame } from '@/test/frame-bridge'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

async function frameOf(body: string, head = ''): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, { head })
  return iframe
}

function pageOf(frame: HTMLIFrameElement): Window & typeof globalThis {
  const view = frame.contentWindow as (Window & typeof globalThis) | null
  if (!view) throw new Error('The iframe holds no window')
  return view
}

/** A box that spins forever, so its play state shows whether the page's clock runs. */
const SPINNER =
  '<style>@keyframes spin { to { rotate: 1turn } } #s { animation: spin 1s infinite }</style>'

describe('hold-animations', () => {
  it("pauses the page's animations until closed", async () => {
    const frame = await frameOf('<div id="s"></div>', SPINNER)
    const state = () =>
      pageOf(frame).getComputedStyle(
        pageOf(frame).document.getElementById('s') as Element,
      ).animationPlayState

    const { reply, close } = await ask(frame, 'hold-animations', {})
    const held = state()
    close()

    expect([reply, held]).toEqual([{ value: true }, 'paused'])
    await expect.poll(state).toBe('running')
  })

  it('leaves every element index in place while it holds', async () => {
    const frame = await frameOf('<p>One</p><p>Two</p>')
    const before = frameElements(pageOf(frame).document).length

    await ask(frame, 'hold-animations', {})

    expect(frameElements(pageOf(frame).document)).toHaveLength(before)
  })
})

describe('hide-controls', () => {
  it('hides a drawn control until closed', async () => {
    const frame = await frameOf(
      '<p>Card</p><input id="c" type="range" data-binds=".card --gap">',
    )
    const display = () =>
      pageOf(frame).getComputedStyle(
        pageOf(frame).document.getElementById('c') as Element,
      ).display

    const { reply, close } = await ask(frame, 'hide-controls', {})
    const hidden = display()
    close()

    expect([reply, hidden]).toEqual([{ value: true }, 'none'])
    await expect.poll(display).not.toBe('none')
  })
})

describe('pointer-move', () => {
  function move(frame: HTMLIFrameElement): void {
    const view = pageOf(frame)
    view.dispatchEvent(new view.PointerEvent('pointermove'))
  }

  it('pushes once for every move inside one frame', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const { reply, pushes } = await ask(frame, 'pointer-move', {})

    move(frame)
    move(frame)
    move(frame)

    expect(reply).toEqual({ value: true })
    await expect.poll(() => pushes).toEqual([null])
  })

  it('pushes nothing once closed', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const { pushes, close } = await ask(frame, 'pointer-move', {})
    close()
    await ask(frame, 'live-body', {})

    move(frame)
    await ask(frame, 'live-body', {})
    await new Promise((done) => requestAnimationFrame(() => done(null)))

    expect(pushes).toEqual([])
  })
})
