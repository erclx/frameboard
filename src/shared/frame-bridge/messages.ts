import { z } from 'zod'

import type { PageColors } from '@/shared/frame-device'
import { STEP_EFFECTS, type StepEffect } from '@/shared/present-transition'
import type { Theme } from '@/shared/theme'

import {
  type ControlEdits,
  controlEditsSchema,
  type DrawnBinding,
  drawnBindingsSchema,
} from './controls'
import { type ShownGap, shownGapSchema } from './gap'
import {
  type FrameOverflow,
  frameOverflowSchema,
  liveBodySchema,
  type LiveElement,
  liveElementsSchema,
  type MemberMeasure,
  memberMeasuresSchema,
  type PinCorner,
  pinCornersSchema,
} from './live-element'
import {
  type MediaAct,
  mediaActSchema,
  type MediaReading,
  mediaReadingSchema,
} from './media'
import {
  type ModelReading,
  modelReadingSchema,
  type ModelStage,
  modelStageSchema,
} from './model'
import { type FrameMotion, frameMotionSchema } from './motion'

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
 * How an in-place text edit ends: the text typed, the text node it is by
 * index when a `run`, and whether it holds a break its element would
 * collapse, or a close with nothing to write.
 */
export type TextEditEnd =
  | { kind: 'commit'; text: string; breaks: boolean; run?: number }
  | { kind: 'closed' }

/** A box in a frame's viewport by its top left corner, in CSS pixels. */
export interface FrameBox {
  x: number
  y: number
  width: number
  height: number
}

/** An element by its file index and its tag, as a pick walks up from the one under a point. */
export interface PickedElement {
  index: number
  tag: string
}

/** What sits under a point in a frame. */
export interface PickAt {
  /** The hash of the bytes the frame shows, null for a page the route never stamped. */
  hash: string | null
  /** The element under the point and each ancestor below `body`, empty over the page's root or wrapper. */
  chain: PickedElement[]
}

/** Where a frame's page shows, as fractions of its full height. */
export interface ScrollView {
  /** The share of the page above the top of the view. */
  top: number
  /** The share of the page the view shows. */
  size: number
}

/** How the board scrolls a frame's page: by one screen toward a side, or to a share of its height. */
export type ScrollAct =
  | { act: 'page'; toward: -1 | 1 }
  | { act: 'to'; top: number }

/** Which bindings a frame takes for the board, and whether a press in one of its fields stays with the page. */
export interface KeyBindings {
  /** tinykeys bindings, as the board's actions name them. */
  keys: string[]
  keepTyping: boolean
  /** Whether a Space or Enter on a button in the page stays with the page, false when left out. */
  keepButtons?: boolean
}

/** A binding the frame took a press of, its repeats marked so the board runs a held key as its own window would. */
export interface KeyFired {
  key: string
  repeat: boolean
}

/** What a presented page shows of its steps: the first `shown` groups, the one at `entering` playing its entrance. */
export interface StepsShown {
  shown: number
  entering: number | null
}

/** What the board asks of the drawn controls a `controls` subscription bound. */
export type ControlsAct = 'reset' | 'settle'

/** Each op's arguments, its reply value, and what it pushes, `never` for an op that pushes nothing. */
export interface BridgeOps {
  /** Shows the page's root in a theme, answering whether it held a root. */
  theme: { args: { theme: Theme }; value: boolean; push: never }
  /** Hides the page's own scrollbar until closed, answering whether it hid it. */
  'hide-scrollbar': {
    args: Record<string, never>
    value: boolean
    push: never
  }
  /** Where the page shows, pushed again on a scroll, resize, or growth until closed, null while nothing scrolls. */
  scroll: {
    args: Record<string, never>
    value: ScrollView | null
    push: ScrollView | null
  }
  /** Scrolls the page, answering whether it held a page to scroll. */
  'scroll-act': { args: ScrollAct; value: boolean; push: never }
  /**
   * Takes each named binding inside the frame until closed, preventing the
   * press there and pushing which one fired, answering whether it bound them.
   */
  keys: { args: KeyBindings; value: boolean; push: KeyFired }
  /** The page's content height at its viewport, as the server's fit reads it, null for a page with no body. */
  'content-height': {
    args: Record<string, never>
    value: number | null
    push: never
  }
  /** The element's live box, or null when the frame shows other bytes or no element there. */
  'element-box': { args: ElementAddress; value: ElementBox | null; push: never }
  /** Each named element's box that draws anything, or null when the frame shows other bytes. */
  'element-boxes': {
    args: { hash: string; indexes: number[] }
    value: { index: number; box: FrameBox }[] | null
    push: never
  }
  /** A frame's `body` as an element address at the bytes it shows, null for a page the route never stamped. */
  'live-body': {
    args: Record<string, never>
    value: ElementAddress | null
    push: never
  }
  /** The named elements as the page computes them, null when it shows other bytes or misses one. */
  'live-element': {
    args: { hash: string; indexes: number[] }
    value: LiveElement[] | null
    push: never
  }
  /** Hides the strip the browser draws for `controls` on every video until closed, answering whether it hid them. */
  'hide-strips': { args: Record<string, never>; value: boolean; push: never }
  /** A media element's reading, pushed again on every playback change until closed, null for no media at the address. */
  media: {
    args: ElementAddress
    value: MediaReading | null
    push: MediaReading | null
  }
  /** Moves a media element's live playback, answering whether the page showed it at the address. */
  'media-act': {
    args: ElementAddress & { act: MediaAct }
    value: boolean
    push: never
  }
  /** A model viewer's reading, pushed again on a load, a camera move, or a staging attribute changing until closed, null for no viewer at the address. */
  model: {
    args: ElementAddress
    value: ModelReading | null
    push: ModelReading | null
  }
  /** Shows one staging attribute on a live viewer ahead of the write that saves it, answering whether the page showed a viewer at the address. */
  'model-stage': {
    args: ElementAddress & ModelStage
    value: boolean
    push: never
  }
  /** Measures the named elements, pushing again on every resize, style change, or scroll until closed, null when the frame shows other bytes or misses one. */
  measure: {
    args: { hash: string; indexes: number[] }
    value: MemberMeasure[] | null
    push: MemberMeasure[] | null
  }
  /** The elements past the frame's viewport, pushed again on a resize or style change until closed. */
  overflow: {
    args: Record<string, never>
    value: FrameOverflow | null
    push: FrameOverflow | null
  }
  /** The color a paint resolves to in the page's own theme, null for a page with no body. */
  paint: { args: { fill: string }; value: string | null; push: never }
  /** What sits under a frame point, hit-tested as the page draws. */
  'pick-at': { args: { at: FramePoint }; value: PickAt; push: never }
  /** The named elements' pin corners, pushed again on every resize or scroll until closed, leaving out one the page holds none at. */
  pins: { args: { indexes: number[] }; value: PinCorner[]; push: PinCorner[] }
  /**
   * The gap a placement lands in under a frame point, with the hash it was
   * read at, or for a `carried` element the gap it moves to, null where the
   * move would change nothing.
   */
  'gap-at': {
    args: { at: FramePoint; carried?: number }
    value: ShownGap | null
    push: never
  }
  /** Forgets the frame's previews once a write of what they show landed with no reload. */
  'keep-previews': { args: Record<string, never>; value: null; push: never }
  /** Previews one inline declaration on the element at an index, or puts the one it replaced back on a null value, checking no hash. */
  'preview-style': {
    args: { index: number; property: string; value: string | null }
    value: null
    push: never
  }
  /** Moves the frame's stamp to a hash whose bytes it already shows, answering whether it held one to move. */
  restamp: { args: { hash: string }; value: boolean; push: never }
  /** Opens the element's text for typing, answering whether it opened, and pushes how the edit ends. */
  'text-edit': { args: TextEditArgs; value: boolean; push: TextEditEnd }
  /** Tells a committed edit, by its request id, whether the text was written, so a refusal shows the old text. */
  'text-written': {
    args: { edit: string; written: boolean }
    value: null
    push: never
  }
  /**
   * Reads the page's steps and shows the first `shown`, answering how many
   * presses it holds, and on an agent's write reads them again, showing the
   * step it holds and pushing the new count, until closed.
   */
  steps: { args: { shown: number }; value: number; push: number }
  /** Shows a `steps` subscription's page at a step, by its request id, answering whether it held one. */
  'steps-show': {
    args: StepsShown & { steps: string }
    value: boolean
    push: never
  }
  /** Plays a step's entrance once on the element at an index, checking no hash, until it ends or is closed. */
  'step-preview': {
    args: { index: number; effect: StepEffect }
    value: boolean
    push: never
  }
  /** Pauses every CSS animation in the page until closed, answering whether it held a head. */
  'hold-animations': {
    args: Record<string, never>
    value: boolean
    push: never
  }
  /** Hides every drawn control until closed, answering whether it held a head. */
  'hide-controls': { args: Record<string, never>; value: boolean; push: never }
  /** Pushes on a pointer move in the page, at most once a frame, until closed. */
  'pointer-move': { args: Record<string, never>; value: boolean; push: null }
  /**
   * Starts reading the page's timeline, answering true, and pushes it once
   * it registers, or null when none does in time.
   */
  motion: {
    args: Record<string, never>
    value: boolean
    push: FrameMotion | null
  }
  /**
   * Holds a `motion` subscription's timeline at a moment in ms, by its
   * request id, a newer seek replacing one still waiting, answering whether
   * it held a timeline.
   */
  'motion-seek': {
    args: { motion: string; at: number }
    value: boolean
    push: never
  }
  /** Hands a held page back to its own clock, playing CSS on and reloading any other, answering whether it held a timeline. */
  'motion-release': { args: { motion: string }; value: boolean; push: never }
  /**
   * The moment in ms a free-running page shows now on the timeline a `motion`
   * push named, 0 for a HyperFrames page, which exposes no reading.
   */
  'motion-moment': { args: FrameMotion; value: number; push: never }
  /**
   * Binds the page's drawn controls, a move setting its property inline and
   * pushing how many are moved, until closed, which puts every value back.
   */
  controls: { args: Record<string, never>; value: boolean; push: number }
  /** Resets or settles a `controls` subscription's moved controls, by its request id, answering whether it held one. */
  'controls-act': {
    args: { controls: string; act: ControlsAct }
    value: boolean
    push: never
  }
  /** The batch a keep writes for a `controls` subscription's moved controls, with the hash it was read at, null with none moved. */
  'controls-edits': {
    args: { controls: string }
    value: ControlEdits | null
    push: never
  }
  /** Whether the page holds anything a click reaches. */
  'takes-clicks': { args: Record<string, never>; value: boolean; push: never }
  /** Every drawn control with its target's box, pushed again on a resize or scroll until closed. */
  bindings: {
    args: Record<string, never>
    value: DrawnBinding[]
    push: DrawnBinding[]
  }
  /** The fill and text color the page shows, which a phone's status bar paints. */
  'page-colors': {
    args: Record<string, never>
    value: PageColors
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
  /**
   * The hash of the bytes a frame shows, outside any request, posted as its
   * bridge starts, on a restamp, and null as its page goes away. `page` names
   * the page, since a page going away posts with no window to tell it by.
   */
  | {
      tag: typeof BRIDGE_TAG
      kind: 'shown'
      page: string
      hash: string | null
    }

const OPS: readonly string[] = [
  'bindings',
  'content-height',
  'controls',
  'controls-act',
  'controls-edits',
  'element-box',
  'element-boxes',
  'gap-at',
  'hide-controls',
  'hide-scrollbar',
  'hide-strips',
  'hold-animations',
  'keep-previews',
  'keys',
  'live-body',
  'live-element',
  'measure',
  'media',
  'media-act',
  'model',
  'model-stage',
  'motion',
  'motion-moment',
  'motion-release',
  'motion-seek',
  'overflow',
  'page-colors',
  'paint',
  'pick-at',
  'pins',
  'pointer-move',
  'preview-style',
  'restamp',
  'scroll',
  'scroll-act',
  'step-preview',
  'steps',
  'steps-show',
  'takes-clicks',
  'text-edit',
  'text-written',
  'theme',
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
  if (data.tag !== BRIDGE_TAG) return null
  if (data.kind === 'shown') {
    const { page, hash } = data
    return typeof page === 'string' &&
      page !== '' &&
      (typeof hash === 'string' || hash === null)
      ? { tag: BRIDGE_TAG, kind: 'shown', page, hash }
      : null
  }
  if (typeof data.id !== 'string' || data.id === '') return null
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

const indexSchema = z.number().int().nonnegative()

/** A count of steps or controls, which `steps` takes past the last to show every one. */
const countSchema = z.number().int().nonnegative()

const noArgsSchema = z.object({}).strict() as z.ZodType<Record<string, never>>

const addressSchema = z.object({ index: indexSchema, hash: z.string() })

const pointSchema = z.object({ x: z.number().finite(), y: z.number().finite() })

const frameBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
})

const elementBoxSchema = z.object({
  left: z.number().finite(),
  top: z.number().finite(),
  right: z.number().finite(),
  bottom: z.number().finite(),
})

const scrollViewSchema = z.object({
  top: z.number().finite(),
  size: z.number().finite(),
})

const textEditEndSchema = z.union([
  z.object({
    kind: z.literal('commit'),
    text: z.string(),
    breaks: z.boolean(),
    run: z.number().int().nonnegative().optional(),
  }),
  z.object({ kind: z.literal('closed') }),
])

/**
 * What each op's arguments, reply, and pushes must hold, the arguments checked
 * where the frame takes them in and the rest where the board does.
 */
const SCHEMAS: {
  [O in BridgeOp]: {
    args: z.ZodType<BridgeOps[O]['args']>
    value: z.ZodType<BridgeOps[O]['value']>
    push?: z.ZodType<BridgeOps[O]['push']>
  }
} = {
  theme: {
    args: z.object({ theme: z.enum(['light', 'dark']) }),
    value: z.boolean(),
  },
  'hide-scrollbar': { args: noArgsSchema, value: z.boolean() },
  scroll: {
    args: noArgsSchema,
    value: scrollViewSchema.nullable(),
    push: scrollViewSchema.nullable(),
  },
  'scroll-act': {
    args: z.union([
      z.object({
        act: z.literal('page'),
        toward: z.union([z.literal(-1), z.literal(1)]),
      }),
      z.object({ act: z.literal('to'), top: z.number().finite() }),
    ]),
    value: z.boolean(),
  },
  keys: {
    args: z.object({
      keys: z.array(z.string()),
      keepTyping: z.boolean(),
      keepButtons: z.boolean().optional(),
    }),
    value: z.boolean(),
    push: z.object({ key: z.string(), repeat: z.boolean() }),
  },
  'content-height': {
    args: noArgsSchema,
    value: z.number().int().positive().nullable(),
  },
  'element-box': { args: addressSchema, value: elementBoxSchema.nullable() },
  'element-boxes': {
    args: z.object({ hash: z.string(), indexes: z.array(indexSchema) }),
    value: z
      .array(z.object({ index: indexSchema, box: frameBoxSchema }))
      .nullable(),
  },
  'live-body': { args: noArgsSchema, value: liveBodySchema },
  'live-element': {
    args: z.object({ hash: z.string(), indexes: z.array(indexSchema) }),
    value: liveElementsSchema,
  },
  measure: {
    args: z.object({ hash: z.string(), indexes: z.array(indexSchema) }),
    value: memberMeasuresSchema,
    push: memberMeasuresSchema,
  },
  overflow: {
    args: noArgsSchema,
    value: frameOverflowSchema,
    push: frameOverflowSchema,
  },
  pins: {
    args: z.object({ indexes: z.array(indexSchema) }),
    value: pinCornersSchema,
    push: pinCornersSchema,
  },
  'pick-at': {
    args: z.object({ at: pointSchema }),
    value: z.object({
      hash: z.string().nullable(),
      chain: z.array(z.object({ index: indexSchema, tag: z.string() })),
    }),
  },
  'gap-at': {
    args: z.object({ at: pointSchema, carried: indexSchema.optional() }),
    value: shownGapSchema,
  },
  'hide-strips': { args: noArgsSchema, value: z.boolean() },
  'keep-previews': { args: noArgsSchema, value: z.null() },
  media: {
    args: addressSchema,
    value: mediaReadingSchema,
    push: mediaReadingSchema,
  },
  'media-act': {
    args: addressSchema.extend({ act: mediaActSchema }),
    value: z.boolean(),
  },
  model: {
    args: addressSchema,
    value: modelReadingSchema,
    push: modelReadingSchema,
  },
  'model-stage': {
    args: addressSchema.and(modelStageSchema),
    value: z.boolean(),
  },
  paint: { args: z.object({ fill: z.string() }), value: z.string().nullable() },
  'preview-style': {
    args: z.object({
      index: indexSchema,
      property: z.string(),
      value: z.string().nullable(),
    }),
    value: z.null(),
  },
  restamp: { args: z.object({ hash: z.string() }), value: z.boolean() },
  'text-edit': {
    args: addressSchema.extend({ at: pointSchema.optional() }),
    value: z.boolean(),
    push: textEditEndSchema,
  },
  'text-written': {
    args: z.object({ edit: z.string(), written: z.boolean() }),
    value: z.null(),
  },
  steps: {
    args: z.object({ shown: countSchema }),
    value: countSchema,
    push: countSchema,
  },
  'steps-show': {
    args: z.object({
      steps: z.string(),
      shown: countSchema,
      entering: indexSchema.nullable(),
    }),
    value: z.boolean(),
  },
  'step-preview': {
    args: z.object({ index: indexSchema, effect: z.enum(STEP_EFFECTS) }),
    value: z.boolean(),
  },
  'hold-animations': { args: noArgsSchema, value: z.boolean() },
  'hide-controls': { args: noArgsSchema, value: z.boolean() },
  'pointer-move': { args: noArgsSchema, value: z.boolean(), push: z.null() },
  motion: {
    args: noArgsSchema,
    value: z.boolean(),
    push: frameMotionSchema.nullable(),
  },
  'motion-seek': {
    args: z.object({ motion: z.string(), at: z.number().finite() }),
    value: z.boolean(),
  },
  'motion-release': {
    args: z.object({ motion: z.string() }),
    value: z.boolean(),
  },
  'motion-moment': {
    args: frameMotionSchema,
    value: z.number().finite().nonnegative(),
  },
  controls: { args: noArgsSchema, value: z.boolean(), push: countSchema },
  'controls-act': {
    args: z.object({
      controls: z.string(),
      act: z.enum(['reset', 'settle']),
    }),
    value: z.boolean(),
  },
  'controls-edits': {
    args: z.object({ controls: z.string() }),
    value: controlEditsSchema,
  },
  'takes-clicks': { args: noArgsSchema, value: z.boolean() },
  bindings: {
    args: noArgsSchema,
    value: drawnBindingsSchema,
    push: drawnBindingsSchema,
  },
  'page-colors': {
    args: noArgsSchema,
    value: z.object({ fill: z.string().nullable(), ink: z.string() }),
  },
}

/** What `requestArgs`, `replyValue`, and `pushValue` answer for a value its schema refuses. */
export const REFUSED: unique symbol = Symbol('refused')

/** An op's arguments as its schema reads them, or `refused` for any other shape. */
export function requestArgs<O extends BridgeOp>(
  op: O,
  args: unknown,
): BridgeOps[O]['args'] | typeof REFUSED {
  const read = SCHEMAS[op].args.safeParse(args)
  return read.success ? read.data : REFUSED
}

/**
 * An op's reply value as its schema reads it, or `refused` for one of any
 * other shape, since a frame's script can post in the bridge's shape.
 */
export function replyValue<O extends BridgeOp>(
  op: O,
  value: unknown,
): BridgeOps[O]['value'] | typeof REFUSED {
  const read = SCHEMAS[op].value.safeParse(value)
  return read.success ? read.data : REFUSED
}

/** A pushed value as its op's schema reads it, or `refused` as `replyValue` answers. */
export function pushValue<O extends BridgeOp>(
  op: O,
  value: unknown,
): BridgeOps[O]['push'] | typeof REFUSED {
  const read = SCHEMAS[op].push?.safeParse(value)
  return read?.success ? read.data : REFUSED
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
  return elementBoxSchema.safeParse(value).success
}

/** Whether a value is how a text edit ends, what `text-edit` pushes. */
export function isTextEditEnd(value: unknown): value is TextEditEnd {
  return textEditEndSchema.safeParse(value).success
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
