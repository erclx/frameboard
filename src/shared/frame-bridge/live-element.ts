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
