import { z } from 'zod'

import type { KeepEdit } from '@/shared/bindings'

/** A box in a frame's viewport by its top left corner, rounded to whole CSS pixels. */
export interface ControlBox {
  x: number
  y: number
  width: number
  height: number
}

/** One control's binding as the canvas draws it, in its frame's own pixels. */
export interface DrawnBinding {
  /** Keys the drawn row, being the control's position among the frame's controls. */
  key: number
  control: ControlBox
  /** The element it tunes, null when its selector matches nothing. */
  target: ControlBox | null
  label: string
}

/** The moved controls' batch with the hash of the page it was read from, both from one read. */
export interface ControlEdits {
  hash: string
  edits: KeepEdit[]
}

const controlBoxSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
})

export const drawnBindingsSchema: z.ZodType<DrawnBinding[]> = z.array(
  z.object({
    key: z.number().int().nonnegative(),
    control: controlBoxSchema,
    target: controlBoxSchema.nullable(),
    label: z.string(),
  }),
)

const indexSchema = z.number().int().nonnegative()

export const controlEditsSchema: z.ZodType<ControlEdits | null> = z
  .object({
    hash: z.string(),
    edits: z.array(
      z.union([
        z.object({
          index: indexSchema,
          change: z.object({
            kind: z.literal('attribute'),
            name: z.literal('value'),
            value: z.string(),
          }),
        }),
        z.object({
          index: indexSchema,
          change: z.object({
            kind: z.literal('styles'),
            declarations: z.array(
              z.object({ property: z.string(), value: z.string() }),
            ),
          }),
        }),
      ]),
    ),
  })
  .nullable()
