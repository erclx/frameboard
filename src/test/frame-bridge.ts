import {
  BRIDGE_TAG,
  type BridgeOp,
  type BridgeOps,
} from '@/shared/frame-bridge/messages'

/** The frame bridge as the frame route injects it, loaded from source. */
export const BRIDGE =
  '<script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script>'

/** The frame's answer to one request, and what it pushed under it so far. */
export interface Asked<O extends BridgeOp> {
  /** The reply value, or the refusal's message under `error`. */
  reply: { value: BridgeOps[O]['value'] } | { error: string }
  pushes: BridgeOps[O]['push'][]
  close: () => void
}

/**
 * Posts one request to the bridge in `iframe` as the board would, resolving
 * once it replies, with no schema read, so a test sees the frame's own word.
 */
export function ask<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: BridgeOps[O]['args'],
): Promise<Asked<O>> {
  const target = iframe.contentWindow
  if (!target) throw new Error('The iframe holds no window')
  const id = crypto.randomUUID()
  const pushes: BridgeOps[O]['push'][] = []
  return new Promise((resolve) => {
    const heard = (event: MessageEvent) => {
      const data = event.data as {
        tag?: unknown
        kind?: unknown
        id?: unknown
        ok?: unknown
        value?: unknown
        error?: unknown
      } | null
      if (event.source !== target || data?.tag !== BRIDGE_TAG) return
      if (data.id !== id) return
      if (data.kind === 'push') {
        pushes.push(data.value as BridgeOps[O]['push'])
      }
      if (data.kind !== 'reply') return
      resolve({
        reply:
          data.ok === true
            ? { value: data.value as BridgeOps[O]['value'] }
            : { error: String(data.error) },
        pushes,
        close: () => {
          removeEventListener('message', heard)
          target.postMessage({ tag: BRIDGE_TAG, kind: 'close', id }, '*')
        },
      })
    }
    addEventListener('message', heard)
    target.postMessage({ tag: BRIDGE_TAG, kind: 'request', id, op, args }, '*')
  })
}

/** An iframe showing `body` beside the stamp and the bridge, resolved once it has loaded. */
export async function bridgedFrame(
  body: string,
  { hash = 'c'.repeat(64), head = '', style = '' } = {},
): Promise<HTMLIFrameElement> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = style
  const loaded = new Promise((resolve) =>
    iframe.addEventListener('load', resolve, { once: true }),
  )
  iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${hash}"></style>${head}${BRIDGE}</head><body>${body}</body></html>`
  document.body.append(iframe)
  await loaded
  return iframe
}
