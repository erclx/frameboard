import { renderedHash } from '@/shared/frame-bridge/elements'
import {
  BRIDGE_TAG,
  type BridgeMessage,
  type BridgeOp,
  type BridgeOps,
  readBridgeMessage,
  REFUSED,
  requestArgs,
} from '@/shared/frame-bridge/messages'

import { chromeHandlers } from './chrome'
import { controlHandlers } from './controls'
import { gapHandlers } from './gap'
import { addressed, type Handler, type Handlers, onceParsed } from './handler'
import { keyHandlers } from './keys'
import { liveElementHandlers } from './live-element'
import { measureHandlers } from './measure'
import { mediaHandlers } from './media'
import { modelHandlers } from './model'
import { motionHandlers } from './motion'
import { presentHandlers } from './present'
import { previewHandlers } from './preview'
import { reachHandlers } from './reach'
import { stepHandlers } from './steps'
import { openTextEdit } from './text-edit'

// The frame route injects this as a script, which leaves no element behind,
// since another would shift every live index the board reads.
document.currentScript?.remove()

const board = window.parent
// Same origin as the board until frames move to their own port. The
// document's origin, since a srcdoc frame's location names none.
const boardOrigin = window.origin

const page = crypto.randomUUID()

/** What runs once the board closes a request, by its id. */
const closers = new Map<string, () => void>()

/** The committed text edits awaiting the board's write, each answering how to show the old text. */
const committed = new Map<string, () => void>()

const handlers: Handlers = {
  ...chromeHandlers,
  ...controlHandlers,
  ...gapHandlers,
  ...keyHandlers,
  ...liveElementHandlers,
  ...measureHandlers,
  ...mediaHandlers,
  ...modelHandlers,
  ...motionHandlers,
  ...presentHandlers,
  ...reachHandlers,
  ...stepHandlers,
  'element-box': (address) => {
    const element = addressed(address)
    if (!element) return null
    const { left, top, right, bottom } = element.getBoundingClientRect()
    return { left, top, right, bottom }
  },
  'text-edit': (args, { id, push, onClose }) => {
    const element = addressed(args)
    let ended = false
    const cancel =
      element &&
      openTextEdit(
        element,
        (end, restore) => {
          ended = true
          if (end.kind === 'commit') committed.set(id, restore)
          push(end)
        },
        args.at,
      )
    if (!cancel) return false
    onClose(() => {
      if (!ended) cancel()
    })
    return true
  },
  'text-written': ({ edit, written }) => {
    const restore = committed.get(edit)
    committed.delete(edit)
    if (!written) restore?.()
    return null
  },
  ...previewHandlers(() => announce()),
}

function send(message: BridgeMessage): void {
  board.postMessage(message, boardOrigin)
}

/** Tells the board which bytes the page shows, which it holds for every read a press takes at once. */
function announce(hash = renderedHash(document)): void {
  send({ tag: BRIDGE_TAG, kind: 'shown', page, hash })
}

/** Runs the request's handler on arguments its schema read, answering the value it returns. */
function answer<O extends BridgeOp>(op: O, args: unknown, id: string): unknown {
  const handler = handlers[op] as Handler<O> | undefined
  if (!handler) throw new Error(`no handler for ${op}`)
  const read = requestArgs(op, args)
  if (read === REFUSED) throw new Error(`not the arguments ${op} takes`)
  return handler(read, {
    id,
    push: (value: BridgeOps[O]['push']) =>
      send({ tag: BRIDGE_TAG, kind: 'push', id, value }),
    onClose: (stop) => closers.set(id, stop),
  })
}

// A frame shown on its own, as capture and the phone link show one, has no board.
if (board !== window) {
  // Every reader the first word wakes reads the body, so it waits for the body to parse.
  onceParsed(document, () => announce())
  window.addEventListener('pagehide', () => announce(null))
  window.addEventListener('message', (event) => {
    if (event.source !== board) return
    const message = readBridgeMessage(event, boardOrigin)
    if (message?.kind === 'close') {
      closers.get(message.id)?.()
      closers.delete(message.id)
    }
    if (message?.kind !== 'request') return
    const { id } = message
    try {
      const value = answer(message.op, message.args, id)
      send({ tag: BRIDGE_TAG, kind: 'reply', id, ok: true, value })
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      send({ tag: BRIDGE_TAG, kind: 'reply', id, ok: false, error: text })
    }
  })
}
