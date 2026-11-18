import {
  BRIDGE_TAG,
  type BridgeMessage,
  type BridgeOp,
  type BridgeOps,
  readBridgeMessage,
} from '@/shared/frame-bridge'

/**
 * How long a request waits on a frame that never answers, such as one
 * reloading or showing no bridge. A bridged reply takes under a millisecond.
 */
const REPLY_WAIT_MS = 1000

/** A request awaiting its reply, and after it, a subscription awaiting pushes. */
interface Open {
  target: Window
  origin: string
  resolve: (value: unknown) => void
  onPush?: (value: unknown) => void
}

const open = new Map<string, Open>()
let listening = false

/** An op's subscription, by the id its request carried. */
export interface Subscription {
  id: string
  /** The op's reply value, or null when the frame refused or never answered. */
  opened: Promise<unknown>
  /** Ends the subscription on both sides. */
  close: () => void
}

/**
 * Asks the bridge in a frame's iframe to run `op`, resolving its reply value,
 * or null when the frame refuses, answers from elsewhere, or never answers.
 * The value is the frame's word, so a caller checks its shape before use.
 */
export function request<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: BridgeOps[O]['args'],
): Promise<unknown> {
  return post(iframe, op, args).opened
}

/**
 * Runs `op` as `request` does and hands each result the frame pushes under it
 * to `onPush` until either side closes it. A push is the frame's word too.
 */
export function subscribe<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: BridgeOps[O]['args'],
  onPush: (value: unknown) => void,
): Subscription {
  return post(iframe, op, args, onPush)
}

function post(
  iframe: HTMLIFrameElement,
  op: BridgeOp,
  args: unknown,
  onPush?: (value: unknown) => void,
): Subscription {
  listen()
  const id = crypto.randomUUID()
  // The one read of a frame's window, which posting needs whatever its origin.
  const target = iframe.contentWindow
  const origin = new URL(iframe.src || location.href, location.href).origin
  const close = () => {
    const held = open.get(id)
    if (!held) return
    open.delete(id)
    held.resolve(null)
    send(held.target, held.origin, { tag: BRIDGE_TAG, kind: 'close', id })
  }
  if (!target) return { id, opened: Promise.resolve(null), close }

  const opened = new Promise<unknown>((resolve) => {
    let waiting = true
    const settle = (value: unknown) => {
      if (!waiting) return
      waiting = false
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      open.delete(id)
      settle(null)
    }, REPLY_WAIT_MS)
    open.set(id, { target, origin, resolve: settle, onPush })
  })
  send(target, origin, { tag: BRIDGE_TAG, kind: 'request', id, op, args })
  return { id, opened, close }
}

function send(target: Window, origin: string, message: BridgeMessage): void {
  try {
    target.postMessage(message, origin)
  } catch {
    // A frame showing no document of its own has no origin to post to.
  }
}

/**
 * Listens for every frame's answers on the board's window, taking a message
 * only from the window and origin its request went to, under an id still open.
 */
function listen(): void {
  if (listening) return
  listening = true
  window.addEventListener('message', (event) => {
    const id: unknown = (event.data as { id?: unknown } | null)?.id
    const held = typeof id === 'string' ? open.get(id) : undefined
    if (!held || event.source !== held.target) return
    const message = readBridgeMessage(event, held.origin)
    if (message?.kind === 'reply') {
      if (!held.onPush || !message.ok) open.delete(message.id)
      held.resolve(message.ok ? message.value : null)
    }
    if (message?.kind === 'push') held.onPush?.(message.value)
  })
}
