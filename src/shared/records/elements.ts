import { z } from 'zod'

/**
 * How an element lays out what it holds, read from the frame's static
 * cascade: a flex by its main axis, a grid, or `block` for anything else,
 * including a flex or grid set through an unresolved `var()`.
 */
export const layoutSchema = z.enum(['row', 'column', 'grid', 'block'])

export type Layout = z.infer<typeof layoutSchema>

/** One element under a frame's `body`, addressed by the index `edit --index` takes. */
export const treeElementSchema = z.object({
  index: z.int().min(0),
  /** The index of the element it sits in, null for a child of `body`. */
  parent: z.int().min(0).nullable(),
  tag: z.string(),
  /** `data-name`, else a text-only element's text cut to 40 characters, else an `img`'s `alt`, else the tag. */
  name: z.string(),
  /** True when the element holds text and nothing else. */
  textOnly: z.boolean(),
  /** Its layout, which a culled frame's Layers rows draw from without an iframe. */
  layout: layoutSchema,
  /** True when it holds nothing and its corners round by half or more, so it draws as an ellipse. */
  round: z.boolean(),
})

export type TreeElement = z.infer<typeof treeElementSchema>

/** What `GET /api/frames/elements` answers: a frame's elements under `body` in index order, and the hash they were read from. */
export const elementTreeSchema = z.object({
  ref: z.string(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  elements: z.array(treeElementSchema),
})

export type ElementTree = z.infer<typeof elementTreeSchema>

/** One color or shadow as a frame's source states it. */
export const styleValueSchema = z.object({
  /** The value as written, a raw hex without its alpha pair, or the whole value behind a token. */
  value: z.string(),
  /** The custom property the value names, with its `--`, null for a raw value, which the board flags. */
  token: z.string().nullable(),
  /** The percent a `color-mix()` over the token or a raw hex's alpha keeps, 100 otherwise. */
  percent: z.number().min(0).max(100),
})

export type StyleValue = z.infer<typeof styleValueSchema>

/** The selected element's colors, border, shadow, and font family, each null when no author rule sets it. */
export const elementStylesSchema = z.object({
  color: styleValueSchema.nullable(),
  backgroundColor: styleValueSchema.nullable(),
  borderColor: styleValueSchema.nullable(),
  borderWidth: styleValueSchema.nullable(),
  boxShadow: styleValueSchema.nullable(),
  /** The family as written, inherited from an ancestor when the element states none, null for one a `font` shorthand sets. */
  fontFamily: styleValueSchema.nullable(),
})

export type ElementStyles = z.infer<typeof elementStylesSchema>

/**
 * What `GET /api/frames/styles` answers, read from the frame's static
 * cascade so a token is named exactly: the element's styles when an index
 * was given, and the colors its subtree uses, or the frame's, deduplicated.
 */
export const frameStylesSchema = z.object({
  ref: z.string(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  element: elementStylesSchema.nullable(),
  colors: z.array(styleValueSchema),
})

export type FrameStyles = z.infer<typeof frameStylesSchema>
