import { useEffect, useRef } from 'react'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import type { FrameRecord } from '@/shared/records/list'

import { type ModeStore, modeStore } from '../mode'
import {
  clear,
  select,
  type SelectionStore,
  selectionStore,
} from '../selection'
import { align, type Alignment, type Axis, distribute } from './arrange'
import type { Box } from './box'
import { holdBoxes, withPending, writeBoxes } from './write'

/** How long the arrow keys rest before a run of nudges writes, so holding one costs one write. */
export const NUDGE_REST_MS = 300

const NUDGES = [
  { name: 'Left', key: 'ArrowLeft', dx: -1, dy: 0 },
  { name: 'Right', key: 'ArrowRight', dx: 1, dy: 0 },
  { name: 'Up', key: 'ArrowUp', dx: 0, dy: -1 },
  { name: 'Down', key: 'ArrowDown', dx: 0, dy: 1 },
] as const

/** The Arrange buttons in the order the inspector shows them, keys bound by code since a Mac turns Alt+A into å. */
export const ALIGNMENTS: readonly {
  id: string
  label: string
  alignment: Alignment
  key: string
}[] = [
  {
    id: 'arrange.alignLeft',
    label: 'Align left',
    alignment: 'left',
    key: 'Alt+KeyA',
  },
  {
    id: 'arrange.alignCenter',
    label: 'Align horizontal centers',
    alignment: 'center',
    key: 'Alt+KeyH',
  },
  {
    id: 'arrange.alignRight',
    label: 'Align right',
    alignment: 'right',
    key: 'Alt+KeyD',
  },
  {
    id: 'arrange.alignTop',
    label: 'Align top',
    alignment: 'top',
    key: 'Alt+KeyW',
  },
  {
    id: 'arrange.alignMiddle',
    label: 'Align vertical centers',
    alignment: 'middle',
    key: 'Alt+KeyV',
  },
  {
    id: 'arrange.alignBottom',
    label: 'Align bottom',
    alignment: 'bottom',
    key: 'Alt+KeyS',
  },
]

export const DISTRIBUTIONS: readonly {
  id: string
  label: string
  axis: Axis
  key: string
}[] = [
  {
    id: 'arrange.distributeHorizontal',
    label: 'Distribute horizontal spacing',
    axis: 'horizontal',
    key: 'Control+Alt+KeyH',
  },
  {
    id: 'arrange.distributeVertical',
    label: 'Distribute vertical spacing',
    axis: 'vertical',
    key: 'Control+Alt+KeyV',
  },
]

export interface GeometryContext {
  /** The page the canvas shows. */
  page: () => string
  /** Its shown frames as drawn, bottom to top. */
  frames: () => readonly FrameRecord[]
  selection: SelectionStore
  mode: ModeStore
  live: LiveStore
  /** Draws boxes a run of nudges has not sent yet. */
  hold: typeof holdBoxes
  write: typeof writeBoxes
}

/**
 * The selection's keys and the arrange actions while a canvas is mounted:
 * Esc to clear, Cmd+A to select the page, arrows to nudge, Cmd with an
 * arrow to resize, and the aligns and distributes. Each `enabled` reads the
 * mode and the selection, so Esc means one thing at a time and an arrow
 * with nothing selected falls through to arrow pan.
 */
export function geometryActions(context: GeometryContext): Action[] {
  const { selection, mode, live } = context
  const editing = () => mode.getState().mode === 'edit'
  const chosen = () => {
    const { page, frames } = selection.getState()
    if (page !== context.page()) return []
    return context.frames().filter((frame) => frames.includes(frame.ref))
  }
  const movable = (least: number) => () => {
    const frames = chosen()
    return (
      editing() &&
      live.getState().canWrite &&
      frames.length >= least &&
      frames.every((frame) => !frame.locked)
    )
  }

  // A run holds its own page and frames, so the write it sends names what it
  // started from even when the selection or the page changes before it rests.
  let run: {
    page: string
    refs: readonly string[]
    started: Record<string, Box>
    boxes: Record<string, Box>
  } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    clearTimeout(timer)
    const done = run
    run = null
    if (done) void context.write(done.page, done.boxes, done.started)
  }
  const step = (change: (box: Box) => Box) => {
    const frames = chosen()
    const page = context.page()
    const refs = frames.map((frame) => frame.ref)
    if (run && (run.page !== page || !sameRefs(run.refs, refs))) flush()
    if (!run) {
      run = { page, refs, started: boxesOf(frames), boxes: boxesOf(frames) }
    }
    const { boxes } = run
    for (const frame of frames) {
      const box = boxes[frame.ref] ?? frame.box
      boxes[frame.ref] = change(box)
    }
    context.hold(boxes)
    clearTimeout(timer)
    timer = setTimeout(flush, NUDGE_REST_MS)
  }
  const arrange = (
    arranged: (boxes: Record<string, Box>) => Record<string, Box>,
  ) => {
    const frames = chosen()
    const before = boxesOf(frames)
    const after = arranged(before)
    const changed = Object.keys(after).filter((ref) => {
      const a = after[ref]
      const b = before[ref]
      return a && b && (a.x !== b.x || a.y !== b.y)
    })
    void context.write(
      context.page(),
      pick(after, changed),
      pick(before, changed),
    )
  }

  return [
    {
      id: 'selection.clear',
      label: 'Clear selection',
      group: 'selection',
      keys: ['Escape'],
      enabled: () => editing() && selection.getState().frames.length > 0,
      run: () => clear(selection),
    },
    {
      id: 'selection.all',
      label: 'Select all',
      group: 'selection',
      command: { label: 'Select all' },
      keys: ['$mod+KeyA'],
      enabled: () => editing() && context.frames().length > 0,
      run: () =>
        select(
          selection,
          context.page(),
          context.frames().map((frame) => frame.ref),
        ),
    },
    ...NUDGES.flatMap(({ name, key, dx, dy }) => [
      {
        id: `frame.nudge${name}`,
        label: `Nudge ${name.toLowerCase()}`,
        group: 'frame',
        keys: [key],
        enabled: movable(1),
        run: () => step((box) => ({ ...box, x: box.x + dx, y: box.y + dy })),
      },
      {
        id: `frame.nudge${name}Far`,
        label: `Nudge ${name.toLowerCase()} 10 px`,
        group: 'frame',
        keys: [`Shift+${key}`],
        enabled: movable(1),
        run: () =>
          step((box) => ({ ...box, x: box.x + dx * 10, y: box.y + dy * 10 })),
      },
      {
        id: `frame.resize${name}`,
        label:
          dx === 0
            ? dy > 0
              ? 'Make taller'
              : 'Make shorter'
            : dx > 0
              ? 'Make wider'
              : 'Make narrower',
        group: 'frame',
        keys: [`$mod+${key}`],
        enabled: movable(1),
        run: () =>
          step((box) => ({
            ...box,
            width: Math.max(1, box.width + dx),
            height: Math.max(1, box.height + dy),
          })),
      },
    ]),
    ...ALIGNMENTS.map(({ id, label, alignment, key }) => ({
      id,
      label,
      group: 'arrange',
      command: { label },
      keys: [key],
      enabled: movable(2),
      run: () => arrange((boxes) => align(boxes, alignment)),
    })),
    ...DISTRIBUTIONS.map(({ id, label, axis, key }) => ({
      id,
      label,
      group: 'arrange',
      command: { label },
      keys: [key],
      enabled: movable(3),
      run: () => arrange((boxes) => distribute(boxes, axis)),
    })),
  ]
}

/** Registers the geometry actions for the page a canvas shows, rereading them as the selection, mode, or board change. */
export function useGeometryActions(
  page: string,
  frames: readonly FrameRecord[],
): void {
  const pageRef = useRef(page)
  const framesRef = useRef(frames)
  useEffect(() => {
    pageRef.current = page
    framesRef.current = frames
  }, [page, frames])
  useEffect(() => {
    const unregister = registerActions(
      geometryActions({
        page: () => pageRef.current,
        frames: () => withPending(framesRef.current),
        selection: selectionStore,
        mode: modeStore,
        live: liveStore,
        hold: holdBoxes,
        write: writeBoxes,
      }),
    )
    const unsubscribe = [
      selectionStore.subscribe(refreshActions),
      liveStore.subscribe(refreshActions),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [])
}

function sameRefs(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((ref) => b.includes(ref))
}

function boxesOf(frames: readonly FrameRecord[]): Record<string, Box> {
  return Object.fromEntries(frames.map((frame) => [frame.ref, frame.box]))
}

function pick(
  boxes: Readonly<Record<string, Box>>,
  refs: readonly string[],
): Record<string, Box> {
  return Object.fromEntries(
    refs.flatMap((ref) => {
      const box = boxes[ref]
      return box ? [[ref, box] as const] : []
    }),
  )
}
