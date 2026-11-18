import { afterEach, describe, expect, it, vi } from 'vitest'

import { BRIDGE_TAG } from '@/shared/frame-bridge/messages'

import { request, subscribe } from './channel'

const HASH = 'c'.repeat(64)
const BRIDGE =
  '<script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script>'

let frames: HTMLIFrameElement[] = []

afterEach(() => {
  vi.useRealTimers()
  for (const frame of frames) frame.remove()
  frames = []
})

/** An iframe showing `head` and `body`, resolved once it has loaded. */
async function mount(head: string, body = ''): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe')
  frames.push(iframe)
  const loaded = new Promise<void>((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
  iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${head}</head><body style="margin:0">${body}</body></html>`
  document.body.append(iframe)
  await loaded
  return iframe
}

/** Posts `message` to the board from the frame's own realm, as a script the frame carries would. */
function postFrom(iframe: HTMLIFrameElement, message: unknown): void {
  const view = iframe.contentWindow as
    | (Window & { eval: (code: string) => unknown })
    | null
  view?.eval(`parent.postMessage(${JSON.stringify(message)}, '*')`)
}

/** The id of the next message the frame receives. */
function nextRequestId(iframe: HTMLIFrameElement): Promise<string> {
  return new Promise((resolve) =>
    iframe.contentWindow?.addEventListener(
      'message',
      (event: MessageEvent<{ id: string }>) => resolve(event.data.id),
      { once: true },
    ),
  )
}

describe('request', () => {
  it("answers with the frame bridge's reply", async () => {
    const iframe = await mount(
      BRIDGE,
      '<h1 style="margin:0;height:20px">Hi</h1>',
    )

    const box = await request(iframe, 'element-box', { index: 3, hash: HASH })

    expect(box).toMatchObject({ left: 0, top: 0, bottom: 20 })
  })

  it('answers null for a request the frame refuses', async () => {
    const iframe = await mount(BRIDGE)

    const box = await request(iframe, 'element-box', { index: -1, hash: HASH })

    expect(box).toBeNull()
  })

  it('answers null once a frame with no bridge never replies', async () => {
    const iframe = await mount('')
    vi.useFakeTimers()

    const answer = request(iframe, 'element-box', { index: 3, hash: HASH })
    await vi.advanceTimersByTimeAsync(1000)

    await expect(answer).resolves.toBeNull()
  })

  it('ignores a reply from a window it never asked', async () => {
    const asked = await mount('')
    const other = await mount('')
    const sent = nextRequestId(asked)
    vi.useFakeTimers()

    const answer = request(asked, 'element-box', { index: 3, hash: HASH })
    const id = await sent
    postFrom(other, { tag: BRIDGE_TAG, kind: 'reply', id, ok: true, value: 1 })
    await vi.advanceTimersByTimeAsync(1000)

    await expect(answer).resolves.toBeNull()
  })

  it('ignores a reply under an id it never sent', async () => {
    const asked = await mount('')
    vi.useFakeTimers()

    const answer = request(asked, 'element-box', { index: 3, hash: HASH })
    postFrom(asked, {
      tag: BRIDGE_TAG,
      kind: 'reply',
      id: 'made-up',
      ok: true,
      value: 1,
    })
    await vi.advanceTimersByTimeAsync(1000)

    await expect(answer).resolves.toBeNull()
  })
})

describe('subscribe', () => {
  it('delivers no push once the frame closes the subscription', async () => {
    const asked = await mount('')
    const sent = nextRequestId(asked)
    const pushes: unknown[] = []
    const subscription = subscribe(
      asked,
      'text-edit',
      { index: 3, hash: HASH },
      (value) => pushes.push(value),
    )
    const id = await sent
    const drained = new Promise<void>((resolve) => {
      const done = (event: MessageEvent) => {
        if (event.data !== 'drained') return
        window.removeEventListener('message', done)
        resolve()
      }
      window.addEventListener('message', done)
    })

    postFrom(asked, {
      tag: BRIDGE_TAG,
      kind: 'reply',
      id,
      ok: true,
      value: true,
    })
    postFrom(asked, { tag: BRIDGE_TAG, kind: 'push', id, value: 'before' })
    postFrom(asked, { tag: BRIDGE_TAG, kind: 'close', id })
    postFrom(asked, { tag: BRIDGE_TAG, kind: 'push', id, value: 'after' })
    postFrom(asked, 'drained')
    await drained

    await expect(subscription.opened).resolves.toBe(true)
    expect(pushes).toEqual(['before'])
  })
})
