import { z } from 'zod'

// What the frame reads off its live elements and the board draws or edits
// from, each shape beside the schema the board parses a reply against.

/** How a container lays out what it holds, as the Layout section names it. */
export type Flow = 'block' | 'vertical' | 'horizontal' | 'wrap' | 'grid'

/** What the Layout section reads off the element and its parent, as the browser computed them. */
export interface LiveLayout {
  flow: Flow
  /** Whether it flows inline, as `inline-flex` or `inline-grid`, which a flow pick keeps. */
  inline: boolean
  /** The computed `flex-direction`, `flex-wrap`, `justify-content`, and `align-items`. */
  direction: string
  wrap: string
  justify: string
  alignItems: string
  /** Whether its own `style` sets `justify-content`, which turning Auto gap off drops. */
  ownJustify: boolean
  /** In px, 0 for `normal`. */
  rowGap: number
  columnGap: number
  padding: { top: number; right: number; bottom: number; left: number }
  /** The parent's flow, which decides whether Fill is offered. */
  parent: Flow
  /** The parent's computed `align-items`, which decides how a child hugs across it. */
  parentAlignItems: string
  /** The rendered box in px, before any rotation. */
  width: number
  height: number
}

/** The step attributes present mode reads, each as the file holds it, null where absent. */
export interface LiveStep {
  step: string | null
  effect: string | null
  start: string | null
}

/**
 * Where the element sits, its offsets counted from the box a placement would
 * anchor it to, being any parent but `body`, else the nearest positioned
 * ancestor, else the frame.
 */
export interface Placement {
  /** Whether it is out of the flow, as `position: absolute` or `fixed`. */
  free: boolean
  /** The `left` and `top` that hold it where it renders, in px. */
  left: number
  top: number
  /** The width and height it renders at, null where `auto` resolves to no length, as on an inline box. */
  width: number | null
  height: number | null
  /** Its own `width` and `height` as its style attribute states them, empty when unset. */
  inline: { width: string; height: string }
  /** The `left` a box shrunk to its words would take, for text alone in the flow, else null. */
  wordsLeft: number | null
}

/**
 * What the Rotation row reads off the element, and the own `transform` the 3D
 * section writes, which the Rotation row never does.
 */
export interface Rotation {
  /** The `rotate` property in degrees, clockwise, null for a 3D rotation the field cannot show. */
  degrees: number | null
  /** The `scale` property's x and y, null for a 3D scale. */
  scale: { x: number; y: number } | null
  /**
   * For each the element's own `style` sets, the value a rule gives under it,
   * so a write landing there drops the element's declaration rather than
   * restating the rule. Absent where the style sets none.
   */
  own: {
    rotate?: number | null
    scale?: { x: number; y: number } | null
  }
  /** Whether the computed `transform` moves the element, which a `rotate` composed before it would swing around. */
  translated: boolean
  transform: {
    /** As the element's own `style` states it, empty where it sets none. */
    own: string
    /** Whether a rule gives it a transform, which an own one would override. */
    ruled: boolean
    /**
     * Whether a transform would make it the containing block of an absolute
     * or fixed descendant anchored above it today, which would then move.
     */
    reanchors: boolean
  }
}

/** What the inspector reads off the live element, as the browser computed it. */
export interface LiveElement {
  /** From 0 to 1. */
  opacity: number
  /** The top-left corner's radius in px. */
  radius: number
  /** The computed stack, which names the families and never the token behind them. */
  fontFamily: string
  fontSize: number
  fontWeight: number
  /** In px, null for `normal`, whose height the font decides. */
  lineHeight: number | null
  /** In px, 0 for `normal`. */
  letterSpacing: number
  textAlign: string
  /** The computed `text-decoration-line`, such as `none` or `underline`. */
  textDecorationLine: string
  /** The computed `text-transform`, such as `none` or `uppercase`. */
  textTransform: string
  /** The computed `text-wrap-style`, `auto` unless balanced or pretty. */
  textWrapStyle: string
  /** Whether it clips to one line with an ellipsis, which takes three declarations together. */
  truncated: boolean
  /** The computed `display`, where `inline` is a box nothing clips. */
  display: string
  /** The computed text color, which a `currentcolor` paint shows. */
  color: string
  /** Whether any side draws a border. */
  bordered: boolean
  /** The border width in px, null where the sides differ. */
  borderWidth: number | null
  /** Whether the element or anything in it shows text. */
  holdsText: boolean
  /** Whether it holds text and no element, so its text is edited as a whole. */
  textOnly: boolean
  text: string
  /** Whether its computed `white-space` shows a newline in its text as a line. */
  keepsBreaks: boolean
  rotation: Rotation
  placement: Placement
  layout: LiveLayout
  /** Which paints the element's own `style` attribute sets, which a remove drops rather than overrides. */
  inline: {
    color: boolean
    backgroundColor: boolean
    /** Whether the `background` shorthand states it, which a remove has to drop whole. */
    background: boolean
    border: boolean
  }
  /** The step attributes present mode reads, as the file writes them. */
  step: LiveStep
}

/** An element's size in its frame's CSS pixels. */
export interface ElementSize {
  width: number
  height: number
}

/**
 * What a corner drag writes on an element: width and height on a `box` or
 * `media`, width alone on `text`, whose height follows its words, and on a
 * `container` each side the drag changed, set Fixed as the Size row sets it.
 */
export type ResizeKind = 'box' | 'text' | 'media' | 'container'

/** What a container's corner drag reads at the press to write Fixed the way the Size row does. */
export interface ContainerSizing {
  /** Its flow and its parent's, holding the size it draws at, which a side the drag leaves keeps. */
  layout: LiveLayout
  /** Whether it grows along its flex parent's main axis, being Fill there, which Fixed takes off. */
  fills: boolean
}

/** What a live element's corner drag acts from. */
export interface ResizeRead {
  kind: ResizeKind
  /** The size media decodes to, null on anything else and until it decodes. */
  natural: ElementSize | null
  /** Whether a `text` element states no height, so its height follows its words. */
  hugsHeight: boolean
  /**
   * What the drawn box holds beyond a written size, being the padding and
   * border of a `content-box` element. The drag sizes the outline, a border
   * box, so a write takes this off rather than jump by it.
   */
  inset: ElementSize
  /** On a `container`, what its Fixed write reads, null on any other kind. */
  sizing: ContainerSizing | null
}

/** A placed element's `left` and `top` in its frame's CSS pixels. */
export interface Offsets {
  left: number
  top: number
}

/** A box in a frame's viewport, rounded to whole pixels as the overlay draws it. */
export interface MeasuredBox {
  x: number
  y: number
  width: number
  height: number
}

/** One measured element, as the overlay draws it and a press reads it. */
export interface MemberMeasure {
  index: number
  box: MeasuredBox
  /** How it takes a corner resize, null for one that takes none. */
  read: ResizeRead | null
  /** The offsets it holds as a free element, null for one in the flow. */
  placed: Offsets | null
  /** Whether another measured element holds it, so a group drag leaves it to that one. */
  nested: boolean
  /** The margins its frame's window computed, 0 where it reads none. */
  margin: { top: number; right: number; bottom: number; left: number }
  /** True when a lock on it or an element holding it keeps canvas presses off it. */
  locked?: boolean
  /** True when the page gives it no box, as `display: none` does, unlike a wrapper whose box is 0 by 0. */
  unboxed?: boolean
}

/** An element past its frame's viewport, by file index, with the offsets a press on its ghost drags. */
export interface Overflowing {
  index: number
  /** In the frame's own pixels, from the viewport's top left. */
  box: MeasuredBox
  placed: Offsets | null
}

/** A frame's elements past its viewport, read at the bytes the frame shows. */
export interface FrameOverflow {
  hash: string
  ghosts: Overflowing[]
}

/** The corner a note pin sits at, an element's right edge and top in its frame's viewport. */
export interface PinCorner {
  index: number
  right: number
  top: number
}

/** A computed `display`, `flex-direction`, and `flex-wrap` as one flow. */
export function flowOf(display: string, direction: string, wrap: string): Flow {
  if (display === 'grid' || display === 'inline-grid') return 'grid'
  if (display !== 'flex' && display !== 'inline-flex') return 'block'
  if (wrap !== 'nowrap') return 'wrap'
  return direction.startsWith('column') ? 'vertical' : 'horizontal'
}

const TO_DEGREES: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}

/** A computed `rotate` in degrees, 0 for `none`, null for one about another axis. */
export function degreesOf(rotate: string): number | null {
  if (rotate === 'none' || rotate === '') return 0
  const angle = /^(-?[\d.]+(?:e[+-]?\d+)?)(deg|grad|rad|turn)$/.exec(rotate)
  const unit = angle?.[2] ? TO_DEGREES[angle[2]] : undefined
  if (!angle || unit === undefined) return null
  return Math.round(Number(angle[1]) * unit * 100) / 100
}

/** A computed `scale` as its x and y, 1 and 1 for `none`, null for a 3D scale. */
export function scaleOf(scale: string): { x: number; y: number } | null {
  if (scale === 'none' || scale === '') return { x: 1, y: 1 }
  const factors = scale
    .split(/\s+/)
    .map((factor) =>
      factor.endsWith('%') ? parseFloat(factor) / 100 : Number(factor),
    )
  const [x, y = x, z = 1] = factors
  if (x === undefined || y === undefined || factors.some(Number.isNaN)) {
    return null
  }
  return factors.length > 3 || z !== 1 ? null : { x, y }
}

/** Whether a computed `transform` matrix moves the element, reading any other value as one that may. */
export function translates(transform: string): boolean {
  if (transform === 'none' || transform === '') return false
  const matrix = /^matrix(3d)?\(([^)]*)\)$/.exec(transform)
  if (!matrix?.[2]) return true
  const values = matrix[2].split(',').map(Number)
  const offsets = matrix[1] ? values.slice(12, 15) : values.slice(4, 6)
  return offsets.some((offset) => offset !== 0)
}

const finite = z.number().finite()

const index = z.number().int().nonnegative()

const flowSchema = z.enum(['block', 'vertical', 'horizontal', 'wrap', 'grid'])

const sidesSchema = z.object({
  top: finite,
  right: finite,
  bottom: finite,
  left: finite,
})

export const liveLayoutSchema: z.ZodType<LiveLayout> = z.object({
  flow: flowSchema,
  inline: z.boolean(),
  direction: z.string(),
  wrap: z.string(),
  justify: z.string(),
  alignItems: z.string(),
  ownJustify: z.boolean(),
  rowGap: finite,
  columnGap: finite,
  padding: sidesSchema,
  parent: flowSchema,
  parentAlignItems: z.string(),
  width: finite,
  height: finite,
})

const sizeSchema = z.object({ width: finite, height: finite })

const resizeReadSchema: z.ZodType<ResizeRead> = z.object({
  kind: z.enum(['box', 'text', 'media', 'container']),
  natural: sizeSchema.nullable(),
  hugsHeight: z.boolean(),
  inset: sizeSchema,
  sizing: z.object({ layout: liveLayoutSchema, fills: z.boolean() }).nullable(),
})

const offsetsSchema = z.object({ left: finite, top: finite })

const measuredBoxSchema = z.object({
  x: finite,
  y: finite,
  width: finite,
  height: finite,
})

export const memberMeasuresSchema: z.ZodType<MemberMeasure[] | null> = z
  .array(
    z.object({
      index,
      box: measuredBoxSchema,
      read: resizeReadSchema.nullable(),
      placed: offsetsSchema.nullable(),
      nested: z.boolean(),
      margin: sidesSchema,
      locked: z.boolean().optional(),
      unboxed: z.boolean().optional(),
    }),
  )
  .nullable()

export const frameOverflowSchema: z.ZodType<FrameOverflow | null> = z
  .object({
    hash: z.string(),
    ghosts: z.array(
      z.object({
        index,
        box: measuredBoxSchema,
        placed: offsetsSchema.nullable(),
      }),
    ),
  })
  .nullable()

export const pinCornersSchema: z.ZodType<PinCorner[]> = z.array(
  z.object({ index, right: finite, top: finite }),
)

const xySchema = z.object({ x: finite, y: finite })

const liveElementSchema: z.ZodType<LiveElement> = z.object({
  opacity: finite,
  radius: finite,
  fontFamily: z.string(),
  fontSize: finite,
  fontWeight: finite,
  lineHeight: finite.nullable(),
  letterSpacing: finite,
  textAlign: z.string(),
  textDecorationLine: z.string(),
  textTransform: z.string(),
  textWrapStyle: z.string(),
  truncated: z.boolean(),
  display: z.string(),
  color: z.string(),
  bordered: z.boolean(),
  borderWidth: finite.nullable(),
  holdsText: z.boolean(),
  textOnly: z.boolean(),
  text: z.string(),
  keepsBreaks: z.boolean(),
  rotation: z.object({
    degrees: finite.nullable(),
    scale: xySchema.nullable(),
    own: z.object({
      rotate: finite.nullable().optional(),
      scale: xySchema.nullable().optional(),
    }),
    translated: z.boolean(),
    transform: z.object({
      own: z.string(),
      ruled: z.boolean(),
      reanchors: z.boolean(),
    }),
  }),
  placement: z.object({
    free: z.boolean(),
    left: finite,
    top: finite,
    width: finite.nullable(),
    height: finite.nullable(),
    inline: z.object({ width: z.string(), height: z.string() }),
    wordsLeft: finite.nullable(),
  }),
  layout: liveLayoutSchema,
  inline: z.object({
    color: z.boolean(),
    backgroundColor: z.boolean(),
    background: z.boolean(),
    border: z.boolean(),
  }),
  step: z.object({
    step: z.string().nullable(),
    effect: z.string().nullable(),
    start: z.string().nullable(),
  }),
})

export const liveElementsSchema: z.ZodType<LiveElement[] | null> = z
  .array(liveElementSchema)
  .nullable()

export const liveBodySchema: z.ZodType<{ index: number; hash: string } | null> =
  z.object({ index, hash: z.string() }).nullable()
