import { elementAt, renderedHash } from '@/client/board/frame-dom'
import {
  BRIDGE_TAG,
  type BridgeMessage,
  type BridgeOp,
  type ElementAddress,
  type ElementBox,
  isElementAddress,
  readBridgeMessage,
} from '@/shared/frame-bridge'

/**
 * Answers one request, returning its reply value. A thrown error replies as
 * a refusal.
 */
type Handler = (args: unknown, id: string) => unknown

// The frame route injects this as a script, which leaves no element behind,
// since another would shift every live index the board reads.
document.currentScript?.remove()

const board = window.parent
// Same origin as the board until frames move to their own port. The
// document's origin, since a srcdoc frame's location names none.
const boardOrigin = window.origin

/** The live element an address names, or null when the frame shows other bytes. */
function addressed(address: ElementAddress): Element | null {
  if (renderedHash(document) !== address.hash) return null
  return elementAt(document, address.index)
}

function elementBox(args: unknown): ElementBox | null {
  if (!isElementAddress(args)) throw new Error('not an element address')
  const element = addressed(args)
  if (!element) return null
  const { left, top, right, bottom } = element.getBoundingClientRect()
  return { left, top, right, bottom }
}

const handlers: Partial<Record<BridgeOp, Handler>> = {
  'element-box': elementBox,
}

function send(message: BridgeMessage): void {
  board.postMessage(message, boardOrigin)
}

// A frame shown on its own, as capture and the phone link show one, has no board.
if (board !== window) {
  window.addEventListener('message', (event) => {
    if (event.source !== board) return
    const message = readBridgeMessage(event, boardOrigin)
    if (message?.kind !== 'request') return
    const { id } = message
    const handler = handlers[message.op]
    try {
      if (!handler) throw new Error(`no handler for ${message.op}`)
      const value = handler(message.args, id)
      send({ tag: BRIDGE_TAG, kind: 'reply', id, ok: true, value })
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error)
      send({ tag: BRIDGE_TAG, kind: 'reply', id, ok: false, error: text })
    }
  })
}
