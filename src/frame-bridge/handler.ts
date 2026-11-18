import { elementAt, renderedHash } from '@/shared/frame-bridge/elements'
import type { BridgeOp, BridgeOps } from '@/shared/frame-bridge/messages'

/** What a handler is handed beside its arguments, for an op that pushes or holds state until closed. */
export interface HandlerContext<O extends BridgeOp> {
  /** The request's id, which a later op names to reach it. */
  id: string
  /** Sends the board a result under this request until either side closes it. */
  push: (value: BridgeOps[O]['push']) => void
  /** Runs `stop` once the board closes this request, or never for one it does not. */
  onClose: (stop: () => void) => void
}

/**
 * Answers one request from arguments its op's schema already read, returning
 * its reply value. A thrown error replies as a refusal.
 */
export type Handler<O extends BridgeOp> = (
  args: BridgeOps[O]['args'],
  context: HandlerContext<O>,
) => BridgeOps[O]['value']

export type Handlers = { [O in BridgeOp]?: Handler<O> }

/**
 * Runs `run` once `doc` has parsed its body, at once when it already has.
 * The bridge runs from the head, where a parser-blocking script or sheet
 * leaves the body unparsed when its first word would otherwise go out.
 */
export function onceParsed(doc: Document, run: () => void): void {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run, { once: true })
  } else {
    run()
  }
}

/** The live element an address names, or null when the frame shows other bytes or nothing there. */
export function addressed(address: {
  index: number
  hash: string
}): Element | null {
  if (renderedHash(document) !== address.hash) return null
  return elementAt(document, address.index)
}
