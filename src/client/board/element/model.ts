import type { BridgeOps } from '@/shared/frame-bridge/messages'
import type {
  ModelReading,
  ModelStage,
  ModelTransform,
  StagedAttribute,
} from '@/shared/frame-bridge/model'

import { request, subscribe } from '../bridge/channel'
import {
  type ElementChange,
  writeElement,
  writeElements,
} from '../inspector/element/write'
import type { ElementKey } from '../selection'
import { useLiveReading } from './live-reading'

/** A live model viewer's reading and the acts on it. */
export interface LiveModel {
  reading: ModelReading
  /** Shows staging attributes on the live viewer, which nothing saves until they are written. */
  stage: (changes: readonly ModelStage[]) => void
  /** Shows a scale and a depth with the camera standing still, which nothing saves. */
  preview: (transform: ModelTransform) => void
  /** Shows both as a fresh load would, answering every attribute the file needs for it, or none where the page refused. */
  hold: (transform: ModelTransform) => Promise<readonly ModelStage[]>
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
  const address = { index: key.index, hash }
  return {
    reading,
    stage: (changes) => {
      for (const change of changes) {
        void request(iframe, 'model-stage', { ...address, ...change })
      }
    },
    preview: (transform) => {
      void request(iframe, 'model-transform', {
        ...address,
        ...transform,
        preview: true,
      })
    },
    hold: (transform) => holdOn(iframe, { ...address, ...transform }),
  }
}

/** How long a frame gets to hold a transform, past which its page counts as refusing. */
const HOLD_WAIT_MS = 5000

/** Asks a frame to hold a transform, answering none once it refuses, closes, or runs out of time. */
function holdOn(
  iframe: HTMLIFrameElement,
  args: BridgeOps['model-transform']['args'],
): Promise<readonly ModelStage[]> {
  return new Promise((resolve) => {
    const settle = (stages: readonly ModelStage[]) => {
      clearTimeout(timer)
      asked.close()
      resolve(stages)
    }
    const timer = setTimeout(() => settle([]), HOLD_WAIT_MS)
    const asked = subscribe(iframe, 'model-transform', args, settle)
    void asked.opened.then((drawn) => {
      if (!drawn) settle([])
    })
  })
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
  model: Pick<LiveModel, 'reading' | 'stage'>,
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

/** Every attribute holding a transform may write, the view last, since stating it is what frames the model again. */
const HELD: readonly StagedAttribute[] = [
  'scale',
  'camera-target',
  'camera-orbit',
  'min-camera-orbit',
  'max-camera-orbit',
  'max-field-of-view',
  'field-of-view',
]

/** Puts a previewed scale and depth back as `from` stated them, the camera never having moved. */
export function unpreview(
  model: Pick<LiveModel, 'stage'>,
  from: ModelReading,
): void {
  model.stage([
    { name: 'scale', value: from.staged.scale },
    { name: 'camera-target', value: from.staged['camera-target'] },
  ])
}

/**
 * Holds a transform on the live viewer and writes what it answered as one
 * step, the model, camera, and view all going back to `from` when the page or
 * the write refuses.
 */
export async function holdAndWrite(
  model: LiveModel,
  transform: ModelTransform,
  write: WriteStaged,
  from: ModelReading = model.reading,
): Promise<boolean> {
  const answered = await model.hold(transform)
  const changes = answered.filter(
    ({ name, value }) => value !== from.staged[name],
  )
  const written = changes.length > 0 && (await write(changes))
  if (!written) {
    model.stage(HELD.map((name) => ({ name, value: from.staged[name] })))
  }
  return written
}
