import {
  BRIDGE_TAG,
  type BridgeMessage,
  type BridgeOp,
  type BridgeOps,
  pushValue,
  readBridgeMessage,
  REFUSED,
  replyValue,
} from '@/shared/frame-bridge/messages'

/**
 * How long a request waits on a frame that never answers, such as one reloading
 * or showing no bridge. A loaded machine can take past a second to reply.
 */
const REPLY_WAIT_MS = 5000

/** A request awaiting its reply, and after it, a subscription awaiting pushes. */
interface Open {
  op: BridgeOp
  target: Window
  origin: string
  resolve: (value: unknown) => void
  onPush?: (value: unknown) => void
}

const open = new Map<string, Open>()
let listening = false

/** An op's subscription, by the id its request carried. */
export interface Subscription<O extends BridgeOp = BridgeOp> {
  id: string
  /** The op's reply value, or null when the frame refused or never answered. */
  opened: Promise<BridgeOps[O]['value'] | null>
  /** Ends the subscription on both sides. */
  close: () => void
}

/** Hears the hash a frame's bridge announces, with the iframe showing that frame. */
export type ShownListener = (
  iframe: HTMLIFrameElement,
  hash: string | null,
) => void

const shownListeners = new Set<ShownListener>()

/**
 * Asks the bridge in a frame's iframe to run `op`, resolving its reply value,
 * or null when the frame refuses, answers in another shape, or never answers.
 */
export function request<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: BridgeOps[O]['args'],
): Promise<BridgeOps[O]['value'] | null> {
  return post(iframe, op, args).opened
}

/**
 * Runs `op` as `request` does and hands each result the frame pushes under it
 * to `onPush` until either side closes it, dropping one in another shape.
 */
export function subscribe<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: BridgeOps[O]['args'],
  onPush: (value: BridgeOps[O]['push']) => void,
): Subscription<O> {
  return post(iframe, op, args, onPush as (value: unknown) => void)
}

/** Hears every frame's announced hash until the answer is called. */
export function onShown(listener: ShownListener): () => void {
  listen()
  shownListeners.add(listener)
  return () => shownListeners.delete(listener)
}

function post<O extends BridgeOp>(
  iframe: HTMLIFrameElement,
  op: O,
  args: unknown,
  onPush?: (value: unknown) => void,
): Subscription<O> {
  listen()
  const id = crypto.randomUUID()
  // The one read of a frame's window, which posting needs whatever its origin.
  const target = iframe.contentWindow
  const origin = originOf(iframe)
  const close = () => {
    const held = open.get(id)
    if (!held) return
    open.delete(id)
    held.resolve(null)
    send(held.target, held.origin, { tag: BRIDGE_TAG, kind: 'close', id })
  }
  if (!target) return { id, opened: Promise.resolve(null), close }

  const opened = new Promise<BridgeOps[O]['value'] | null>((resolve) => {
    let waiting = true
    const settle = (value: unknown) => {
      if (!waiting) return
      waiting = false
      clearTimeout(timer)
      resolve(value as BridgeOps[O]['value'] | null)
    }
    const timer = setTimeout(() => {
      open.delete(id)
      settle(null)
    }, REPLY_WAIT_MS)
    open.set(id, { op, target, origin, resolve: settle, onPush })
  })
  send(target, origin, { tag: BRIDGE_TAG, kind: 'request', id, op, args })
  return { id, opened, close }
}

function originOf(iframe: HTMLIFrameElement): string {
  return new URL(iframe.src || location.href, location.href).origin
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
    const data = event.data as { id?: unknown; kind?: unknown } | null
    if (data?.kind === 'shown') {
      heardShown(event)
      return
    }
    const id = data?.id
    const held = typeof id === 'string' ? open.get(id) : undefined
    if (!held || event.source !== held.target) return
    const message = readBridgeMessage(event, held.origin)
    if (message?.kind === 'reply') {
      const value = message.ok ? replyValue(held.op, message.value) : REFUSED
      if (!held.onPush || value === REFUSED) open.delete(message.id)
      held.resolve(value === REFUSED ? null : value)
    }
    if (message?.kind === 'push') {
      const value = pushValue(held.op, message.value)
      if (value !== REFUSED) held.onPush?.(value)
    }
    if (message?.kind === 'close') {
      open.delete(message.id)
      held.resolve(null)
    }
  })
}

/** Each live page's iframe by the id its bridge announces, for the page going away, which posts with no window. */
const pages = new Map<string, HTMLIFrameElement>()

/**
 * Hands a frame's announced hash to the listeners, from the iframe whose
 * window and origin posted it, or for a page going away, the iframe its id
 * was first heard from.
 */
function heardShown(event: MessageEvent): void {
  const page = (event.data as { page?: unknown }).page
  const known = typeof page === 'string' ? pages.get(page) : undefined
  // The second read of a frame's window, which tells which iframe announced.
  const iframe = event.source
    ? [...document.querySelectorAll('iframe')].find(
        (candidate) => candidate.contentWindow === event.source,
      )
    : known
  if (!iframe || (known && known !== iframe)) return
  const message = readBridgeMessage(event, originOf(iframe))
  if (message?.kind !== 'shown') return
  if (message.hash === null) pages.delete(message.page)
  else pages.set(message.page, iframe)
  for (const listener of shownListeners) listener(iframe, message.hash)
}
