import { afterEach, describe, expect, it } from 'vitest'

import { ask, bridgedFrame } from '@/test/frame-bridge'

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

async function frameOf(body: string): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body)
  return iframe
}

/** Presses a key at `target` inside the frame, answering whether the page's own handler was prevented. tinykeys reads a press only when it carries both a key and a code. */
function press(
  frame: HTMLIFrameElement,
  key: string,
  target = frame.contentDocument?.body,
): boolean {
  const view = frame.contentWindow as typeof window | null
  if (!view || !target) throw new Error('The iframe holds no page')
  const event = new view.KeyboardEvent('keydown', {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event.defaultPrevented
}

describe('keys', () => {
  it('pushes a bound key pressed in the page and prevents it there', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const { reply, pushes } = await ask(frame, 'keys', {
      keys: ['Escape'],
      keepTyping: false,
    })

    const prevented = press(frame, 'Escape')

    expect(reply).toEqual({ value: true })
    expect(prevented).toBe(true)
    await expect.poll(() => pushes).toEqual([{ key: 'Escape', repeat: false }])
  })

  it('leaves a key no binding names to the page', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const { pushes } = await ask(frame, 'keys', {
      keys: ['Escape'],
      keepTyping: false,
    })

    const prevented = press(frame, 'Enter')
    press(frame, 'Escape')

    expect(prevented).toBe(false)
    await expect.poll(() => pushes).toEqual([{ key: 'Escape', repeat: false }])
  })

  it('takes a press in a field when typing is not kept', async () => {
    const frame = await frameOf('<input>')
    const field = frame.contentDocument?.querySelector('input') ?? undefined
    const { pushes } = await ask(frame, 'keys', {
      keys: ['Escape'],
      keepTyping: false,
    })

    press(frame, 'Escape', field)

    await expect.poll(() => pushes).toHaveLength(1)
  })

  it('leaves a press in a field to the page when typing is kept', async () => {
    const frame = await frameOf('<input>')
    const field = frame.contentDocument?.querySelector('input') ?? undefined
    const { pushes } = await ask(frame, 'keys', {
      keys: ['Escape'],
      keepTyping: true,
    })

    const prevented = press(frame, 'Escape', field)
    press(frame, 'Escape')

    expect(prevented).toBe(false)
    await expect.poll(() => pushes).toHaveLength(1)
  })

  it('unbinds once the board closes the request', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const asked = await ask(frame, 'keys', {
      keys: ['Escape'],
      keepTyping: false,
    })

    asked.close()

    await expect.poll(() => press(frame, 'Escape')).toBe(false)
  })

  it('leaves a Space on a button to the page while buttons are kept', async () => {
    const frame = await frameOf('<button>Go</button>')
    const button = frame.contentDocument?.querySelector('button') ?? undefined
    const { pushes } = await ask(frame, 'keys', {
      keys: ['Space'],
      keepTyping: false,
      keepButtons: true,
    })

    const prevented = press(frame, 'Space', button)
    press(frame, 'Space')

    expect(prevented).toBe(false)
    await expect.poll(() => pushes).toHaveLength(1)
  })

  it('takes a Space on a button when buttons are not kept', async () => {
    const frame = await frameOf('<button>Go</button>')
    const button = frame.contentDocument?.querySelector('button') ?? undefined
    const { pushes } = await ask(frame, 'keys', {
      keys: ['Space'],
      keepTyping: false,
    })

    const prevented = press(frame, 'Space', button)

    expect(prevented).toBe(true)
    await expect.poll(() => pushes).toHaveLength(1)
  })
})

describe('focus-keys', () => {
  it('pushes once for every key pressed in the page, whatever the key', async () => {
    const frame = await frameOf('<input>')
    const field = frame.contentDocument?.querySelector('input') ?? undefined
    const { reply, pushes } = await ask(frame, 'focus-keys', {})

    const prevented = press(frame, 'Tab', field)
    press(frame, 'Shift')

    expect(reply).toEqual({ value: true })
    expect(prevented).toBe(false)
    await expect.poll(() => pushes).toEqual([true, true])
  })

  it('hears a key the page stops before it reaches the window', async () => {
    const frame = await frameOf('<input onkeydown="event.stopPropagation()">')
    const field = frame.contentDocument?.querySelector('input') ?? undefined
    const { pushes } = await ask(frame, 'focus-keys', {})

    press(frame, 'Tab', field)

    await expect.poll(() => pushes).toEqual([true])
  })

  it('pushes nothing once closed', async () => {
    const frame = await frameOf('<p>Hi</p>')
    const { pushes, close } = await ask(frame, 'focus-keys', {})
    press(frame, 'Tab')
    await expect.poll(() => pushes).toHaveLength(1)

    close()
    await ask(frame, 'content-height', {})
    press(frame, 'Tab')
    await ask(frame, 'content-height', {})

    expect(pushes).toHaveLength(1)
  })
})
