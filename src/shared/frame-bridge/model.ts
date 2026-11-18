import { z } from 'zod'

/** The attributes a hand edit stages a `<model-viewer>` through, each written to the file as stated. */
export const STAGED_ATTRIBUTES = [
  'camera-orbit',
  'max-camera-orbit',
  'orientation',
  'scale',
  'animation-name',
  'autoplay',
] as const

export type StagedAttribute = (typeof STAGED_ATTRIBUTES)[number]

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
  /** Each staging attribute as the page states it, null for one it leaves out. */
  staged: Record<StagedAttribute, string | null>
}

/** One staging attribute to set on a live viewer, or to drop on a null value. */
export interface ModelStage {
  name: StagedAttribute
  value: string | null
}

export const modelStageSchema: z.ZodType<ModelStage> = z.object({
  name: z.enum(STAGED_ATTRIBUTES),
  value: z.string().nullable(),
})

const stated = z.string().nullable()

export const modelReadingSchema: z.ZodType<ModelReading | null> = z
  .object({
    src: z.string(),
    loaded: z.boolean(),
    clips: z.array(z.string()),
    orbit: z
      .object({ theta: z.number().finite(), phi: z.number().finite() })
      .nullable(),
    staged: z.object({
      'camera-orbit': stated,
      'max-camera-orbit': stated,
      orientation: stated,
      scale: stated,
      'animation-name': stated,
      autoplay: stated,
    }),
  })
  .nullable()
