// The board and a frame's bridge talk over `postMessage`, whatever the frame's
// origin. A request's id comes back on its one reply, and on every push a
// subscribing op sends until either side closes it.

/** Marks every bridge message, so the board and the bridge pass over a frame's own. */
export const BRIDGE_TAG = 'frameboard-bridge'

/** Marks the live element an in-place text edit has open, for the overlay and the tests. */
export const EDITING = 'data-frameboard-editing'

/** One element of a live frame, by its file index and the content hash of the file it was read from. */
export interface ElementAddress {
  index: number
  hash: string
}

/** An element's box in its frame's viewport, in CSS pixels. */
export interface ElementBox {
  left: number
  top: number
  right: number
  bottom: number
}

/** A point in a frame's viewport, in CSS pixels. */
export interface FramePoint {
  x: number
  y: number
}

/** The element a text edit opens, and the point double-clicked in it, which picks a run of text beside a child element. */
export interface TextEditArgs extends ElementAddress {
  at?: FramePoint
}

/**
 * How an in-place text edit ends: the text typed, and whether it holds a
 * break its element would collapse, or a close with nothing to write. A
 * `run` names the one text node typed in among the element's text-node
 * children, and its absence the element's whole text.
 */
export type TextEditEnd =
  | { kind: 'commit'; text: string; breaks: boolean; run?: number }
  | { kind: 'closed' }

/** Each op's arguments, its reply value, and what it pushes, `never` for an op that pushes nothing. */
export interface BridgeOps {
  /** The element's live box, or null when the frame shows other bytes or no element there. */
  'element-box': { args: ElementAddress; value: ElementBox | null; push: never }
  /** Opens the element's text for typing, answering whether it opened, and pushes how the edit ends. */
  'text-edit': { args: TextEditArgs; value: boolean; push: TextEditEnd }
  /** Tells a committed edit, by its request id, whether the text was written, so a refusal shows the old text. */
  'text-written': {
    args: { edit: string; written: boolean }
    value: null
    push: never
  }
}

export type BridgeOp = keyof BridgeOps

export type BridgeMessage =
  | {
      tag: typeof BRIDGE_TAG
      kind: 'request'
      id: string
      op: BridgeOp
      args: unknown
    }
  | {
      tag: typeof BRIDGE_TAG
      kind: 'reply'
      id: string
      ok: true
      value: unknown
    }
  | {
      tag: typeof BRIDGE_TAG
      kind: 'reply'
      id: string
      ok: false
      error: string
    }
  | { tag: typeof BRIDGE_TAG; kind: 'push'; id: string; value: unknown }
  | { tag: typeof BRIDGE_TAG; kind: 'close'; id: string }

const OPS: readonly string[] = [
  'element-box',
  'text-edit',
  'text-written',
] satisfies readonly BridgeOp[]

/**
 * The bridge message an event carries, or null for one from any origin but
 * `origin` or of any other shape. An op's arguments are left for its handler
 * to check, since only it knows their shape.
 */
export function readBridgeMessage(
  event: { data: unknown; origin: string },
  origin: string,
): BridgeMessage | null {
  const { data } = event
  if (event.origin !== origin || !isRecord(data)) return null
  if (
    data.tag !== BRIDGE_TAG ||
    typeof data.id !== 'string' ||
    data.id === ''
  ) {
    return null
  }
  const { id } = data
  switch (data.kind) {
    case 'request':
      return typeof data.op === 'string' && OPS.includes(data.op)
        ? {
            tag: BRIDGE_TAG,
            kind: 'request',
            id,
            op: data.op as BridgeOp,
            args: data.args,
          }
        : null
    case 'reply':
      if (data.ok === true) {
        return {
          tag: BRIDGE_TAG,
          kind: 'reply',
          id,
          ok: true,
          value: data.value,
        }
      }
      return data.ok === false && typeof data.error === 'string'
        ? { tag: BRIDGE_TAG, kind: 'reply', id, ok: false, error: data.error }
        : null
    case 'push':
      return { tag: BRIDGE_TAG, kind: 'push', id, value: data.value }
    case 'close':
      return { tag: BRIDGE_TAG, kind: 'close', id }
    default:
      return null
  }
}

/** Whether a value is an element address, the arguments the element ops take. */
export function isElementAddress(value: unknown): value is ElementAddress {
  return (
    isRecord(value) &&
    Number.isInteger(value.index) &&
    (value.index as number) >= 0 &&
    typeof value.hash === 'string'
  )
}

/** Whether a value is what `text-edit` takes, an address with an optional point. */
export function isTextEditArgs(value: unknown): value is TextEditArgs {
  if (!isElementAddress(value)) return false
  const { at } = value as { at?: unknown }
  return (
    at === undefined ||
    (isRecord(at) && Number.isFinite(at.x) && Number.isFinite(at.y))
  )
}

/** Whether a value is an element box, the value `element-box` replies with. */
export function isElementBox(value: unknown): value is ElementBox {
  return (
    isRecord(value) &&
    [value.left, value.top, value.right, value.bottom].every(Number.isFinite)
  )
}

/** Whether a value is how a text edit ends, what `text-edit` pushes. */
export function isTextEditEnd(value: unknown): value is TextEditEnd {
  if (!isRecord(value)) return false
  if (value.kind === 'closed') return true
  return (
    value.kind === 'commit' &&
    typeof value.text === 'string' &&
    typeof value.breaks === 'boolean' &&
    (value.run === undefined ||
      (Number.isInteger(value.run) && (value.run as number) >= 0))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
