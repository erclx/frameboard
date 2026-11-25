import { useRef } from 'react'

import type { ModelReading, ModelStage } from '@/shared/frame-bridge/model'

import {
  type LiveModel,
  stageAndWrite,
  type WriteStaged,
} from '../../element/model'
import type { NumberChange } from '../number-field'

/** What one number field of a model reads, shows, and writes, each from the reading its gesture began at. */
export interface ModelNumber {
  read: (from: ModelReading) => number
  show: (from: ModelReading, value: number) => void
  putBack: (from: ModelReading) => void
  write: (from: ModelReading, value: number) => Promise<boolean>
}

/**
 * The preview and commit of a model's number fields, which share the reading
 * a gesture began at, since each step it previews comes back as the next one.
 */
export function useModelNumber({ reading }: LiveModel) {
  const began = useRef<ModelReading | null>(null)
  // Kept for the put-back a field asks for after a refusal, whose own reading is the preview.
  const refused = useRef<ModelReading | null>(null)
  return ({ read, show, putBack, write }: ModelNumber) => ({
    onPreview: (step: NumberChange | null) => {
      if (step) {
        const from = began.current ?? reading
        began.current = from
        refused.current = null
        show(from, step(read(from)))
        return
      }
      const from = began.current ?? refused.current ?? reading
      began.current = null
      refused.current = null
      putBack(from)
    },
    onCommit: async (step: NumberChange) => {
      const from = began.current ?? reading
      began.current = null
      const was = read(from)
      const value = step(was)
      // A value landing where it started writes nothing, so an Enter on an untouched field leaves the file alone.
      const written = value !== was && (await write(from, value))
      if (!written) refused.current = from
      return written
    },
  })
}

/** A number the viewer takes as staging attributes alone, `stages` naming what a value writes. */
export function stagedNumber(
  model: LiveModel,
  write: WriteStaged,
  read: (from: ModelReading) => number,
  stages: (from: ModelReading, value: number) => ModelStage[],
): ModelNumber {
  return {
    read,
    show: (from, value) => model.stage(stages(from, value)),
    putBack: (from) =>
      model.stage(
        stages(from, read(from)).map(({ name }) => ({
          name,
          value: from.staged[name],
        })),
      ),
    write: (from, value) =>
      stageAndWrite(model, stages(from, value), write, from.staged),
  }
}
