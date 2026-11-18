import type { ModelReading, ModelStage } from '@/shared/frame-bridge/model'

import { request } from '../bridge/channel'
import {
  type ElementChange,
  writeElement,
  writeElements,
} from '../inspector/element/write'
import type { ElementKey } from '../selection'
import { useLiveReading } from './live-reading'

/** A live model viewer's reading and the one act on it. */
export interface LiveModel {
  reading: ModelReading
  /** Shows staging attributes on the live viewer, which nothing saves until they are written. */
  stage: (changes: readonly ModelStage[]) => void
}

/** Sends staging attributes as one write and one undo step, answering whether they were written. */
export type WriteStaged = (changes: readonly ModelStage[]) => Promise<boolean>

/**
 * The selected viewer as its frame's page pushes it on a load, a camera move,
 * and a staging change, held through a hand edit as `useLiveReading` holds it.
 */
export function useLiveModel(key: ElementKey | null): LiveModel | null {
  const held = useLiveReading(key, 'model')
  if (!held || !key) return null
  const { iframe, hash, reading } = held
  return {
    reading,
    stage: (changes) => {
      for (const change of changes) {
        void request(iframe, 'model-stage', {
          index: key.index,
          hash,
          ...change,
        })
      }
    },
  }
}

/**
 * Writes staging attributes the live viewer already shows, so the write
 * skips the reload that would fetch and draw the model again.
 */
export function writeStaged(
  page: string,
  key: ElementKey,
  changes: readonly ModelStage[],
): Promise<boolean> {
  const edits = changes.map(({ name, value }) => {
    const change: ElementChange =
      value === null
        ? { kind: 'attribute', name, remove: true }
        : { kind: 'attribute', name, value }
    return { key, change }
  })
  const [only, ...rest] = edits
  if (!only) return Promise.resolve(false)
  return rest.length === 0
    ? writeElement(page, key, only.change, { previewed: true })
    : writeElements(page, edits, { previewed: true })
}

/**
 * Shows `changes` on the live viewer and writes them, putting back what the
 * page stated at `from` when the write is refused, so the page shows the file
 * either way.
 */
export async function stageAndWrite(
  model: LiveModel,
  changes: readonly ModelStage[],
  write: WriteStaged,
  from: ModelReading['staged'] = model.reading.staged,
): Promise<boolean> {
  model.stage(changes)
  const written = await write(changes)
  if (!written) {
    model.stage(changes.map(({ name }) => ({ name, value: from[name] })))
  }
  return written
}
