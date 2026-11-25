import { z } from 'zod'

/** The attributes a hand edit stages a `<model-viewer>` through, each written to the file as stated. */
export const STAGED_ATTRIBUTES = [
  'camera-orbit',
  'min-camera-orbit',
  'max-camera-orbit',
  'camera-target',
  'field-of-view',
  'max-field-of-view',
  'orientation',
  'scale',
  'animation-name',
  'autoplay',
] as const

export type StagedAttribute = (typeof STAGED_ATTRIBUTES)[number]

/** One value per axis of a model's own scene, Y up and Z toward a camera at rest. */
export interface Axes {
  x: number
  y: number
  z: number
}

/** A selected `<model-viewer>` as its frame's live page shows it. */
export interface ModelReading {
  /** The `src` the page states, empty for none. */
  src: string
  /** False until the viewer draws its model, so for a missing file and a frame loading no viewer script too. */
  loaded: boolean
  /** The model's clips by name in the file's order, empty until it loads. */
  clips: string[]
  /** The camera's angle around the model in whole degrees, null until the model loads. */
  orbit: { theta: number; phi: number } | null
  /** The camera's distance from its target in meters and its vertical view in degrees, null until the model loads. */
  camera: { distance: number; view: number } | null
  /** The turned and scaled model's box in meters, null until the model loads. */
  bounds: { center: Axes; size: Axes } | null
  /** Each staging attribute as the page states it, null for one it leaves out. */
  staged: Record<StagedAttribute, string | null>
}

/** One staging attribute to set on a live viewer, or to drop on a null value. */
export interface ModelStage {
  name: StagedAttribute
  value: string | null
}

/**
 * A model's size and how near it stands, stated as one, since the target a
 * depth is written as counts from the center a scale moves.
 */
export interface ModelTransform {
  scale: Axes
  /** Meters nearer than the model's center, null to leave the stated target alone. */
  depth: number | null
}

/** A staging attribute's terms, split on the spaces outside any `calc()`. */
export function stagedTerms(value: string | null): string[] {
  const found: string[] = []
  let depth = 0
  let term = ''
  for (const character of value?.trim() ?? '') {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (/\s/.test(character) && depth === 0) {
      if (term) found.push(term)
      term = ''
    } else {
      term += character
    }
  }
  return term ? [...found, term] : found
}

export const modelStageSchema: z.ZodType<ModelStage> = z.object({
  name: z.enum(STAGED_ATTRIBUTES),
  value: z.string().nullable(),
})

const axesSchema: z.ZodType<Axes> = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
})

export const modelTransformSchema: z.ZodType<ModelTransform> = z.object({
  scale: axesSchema,
  depth: z.number().finite().nullable(),
})

const stated = z.string().nullable()

/** A staging attribute a frame served by an older bridge leaves out of its reading. */
const added = stated.default(null)

export const modelReadingSchema: z.ZodType<ModelReading | null, unknown> = z
  .object({
    src: z.string(),
    loaded: z.boolean(),
    clips: z.array(z.string()),
    orbit: z
      .object({ theta: z.number().finite(), phi: z.number().finite() })
      .nullable(),
    camera: z
      .object({ distance: z.number().finite(), view: z.number().finite() })
      .nullable()
      .default(null),
    bounds: z
      .object({ center: axesSchema, size: axesSchema })
      .nullable()
      .default(null),
    staged: z.object({
      'camera-orbit': stated,
      'min-camera-orbit': added,
      'max-camera-orbit': stated,
      'camera-target': added,
      'field-of-view': added,
      'max-field-of-view': added,
      orientation: stated,
      scale: stated,
      'animation-name': stated,
      autoplay: stated,
    }),
  })
  .nullable()
