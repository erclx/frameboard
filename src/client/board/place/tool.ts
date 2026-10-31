import {
  Circle,
  Image as ImageIcon,
  type LucideIcon,
  Minus,
  Square,
  Type,
} from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'

import type { PlaceableFile } from '../assets/drag'
import { modeStore, type Tool } from '../mode'
import type { BoardPoint } from '../notes/pick'
import type { ElementKey } from '../selection'
import type { PlacedKind } from './write'

export type ShapeKind = Exclude<PlacedKind, 'text' | 'asset'>

/** A shape the Shape tool places, with the action and key that pick it. */
export interface ShapeRow {
  kind: ShapeKind
  id: string
  label: string
  key: string
  icon: LucideIcon
}

/** The action that opens the picker, listed in the Shape menu below the shapes. */
export const IMAGE_TOOL = 'tool.image'

/** In the order the Shape menu lists them. */
export const SHAPES = [
  {
    kind: 'rectangle',
    id: 'tool.rectangle',
    label: 'Rectangle',
    key: 'r',
    icon: Square,
  },
  {
    kind: 'ellipse',
    id: 'tool.ellipse',
    label: 'Ellipse',
    key: 'o',
    icon: Circle,
  },
  {
    kind: 'divider',
    id: 'tool.divider',
    label: 'Divider',
    key: 'l',
    icon: Minus,
  },
] as const satisfies readonly ShapeRow[]

/** The shape the Shape tool places, being the last one chosen, which its toolbar slot shows. */
export const shapeStore = createStore<{ shape: ShapeKind }>()(() => ({
  shape: 'rectangle',
}))

/** The file the Image tool places, chosen in the picker, null until one is. */
export const armedStore = createStore<{ file: PlaceableFile | null }>()(() => ({
  file: null,
}))

/** Whether the picker the Image tool opens with is open. */
export const pickerStore = createStore<{ open: boolean }>()(() => ({
  open: false,
}))

/** Turns the Image tool on with `file`, so the next click places it. */
export function armFile(file: PlaceableFile): void {
  armedStore.setState({ file })
  pickerStore.setState({ open: false })
  modeStore.setState({ tool: 'image', mode: 'edit' })
  refreshActions()
}

/** The selected element a Move drag carries, which the drop line follows, null while none is dragged. */
export const carriedStore = createStore<{ carried: ElementKey | null }>()(
  () => ({ carried: null }),
)

/**
 * A Rectangle, Ellipse, Image, or Frame drag as it ended, where it started, the top
 * left corner of the box it drew, and that box's size in CSS pixels.
 */
export interface Draft {
  from: BoardPoint
  at: BoardPoint
  size: { width: number; height: number }
}

// Set on the release and taken by the click that follows it, and cleared on
// the next press, so a press that never clicks leaves nothing for a later one.
let finished: Draft | null = null

export function finishDraft(draft: Draft | null): void {
  finished = draft
}

/** The drag a Rectangle, Ellipse, or Image press just finished, taken once, else null. */
export function takeDraft(): Draft | null {
  const draft = finished
  finished = null
  return draft
}

export function shapeRow(kind: ShapeKind): ShapeRow {
  return SHAPES.find((row) => row.kind === kind) ?? SHAPES[0]
}

export function useShape(): ShapeRow {
  return shapeRow(useStore(shapeStore, (state) => state.shape))
}

/** The element the tool on now places, or null under any other tool. */
export function placedKind(): PlacedKind | null {
  const { mode, tool } = modeStore.getState()
  if (mode !== 'edit') return null
  if (tool === 'text') return 'text'
  if (tool === 'image') return armedStore.getState().file ? 'asset' : null
  return tool === 'shape' ? shapeStore.getState().shape : null
}

/** Whether `tool` places an element with a click, as Text, Shape, and Image do. */
export function placesElement(tool: Tool): boolean {
  return tool === 'text' || tool === 'shape' || tool === 'image'
}

const canWrite = () => liveStore.getState().canWrite

const placing = () => placesElement(modeStore.getState().tool)

/**
 * Registers the Text tool, key T, one action per shape, keys R, O, and L,
 * each choosing that shape for the Shape tool, and the Image tool, which
 * opens the picker whose choice arms it. They write, so they are enabled
 * only while this tab may, and a tab losing write returns to Move and closes
 * the picker, as the canvas leaving does, so a tool never carries to the
 * next page.
 */
export function usePlaceTools(): void {
  useEffect(() => {
    const unregister = registerActions([
      {
        id: 'tool.text',
        label: 'Text',
        group: 'tool',
        command: { label: 'Add text', icon: Type },
        keys: ['t'],
        enabled: canWrite,
        // Picking a tool returns to Edit, since a tool only works there.
        run: () => modeStore.setState({ tool: 'text', mode: 'edit' }),
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'text',
      },
      ...SHAPES.map((row) => ({
        id: row.id,
        label: row.label,
        group: 'tool',
        command: {
          label: `Add ${/^[aeiou]/i.test(row.label) ? 'an' : 'a'} ${row.label.toLowerCase()}`,
          icon: row.icon,
        },
        keys: [row.key],
        enabled: canWrite,
        run: () => {
          shapeStore.setState({ shape: row.kind })
          modeStore.setState({ tool: 'shape', mode: 'edit' })
          refreshActions()
        },
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'shape' &&
          shapeStore.getState().shape === row.kind,
      })),
      {
        id: IMAGE_TOOL,
        label: 'Image or video',
        group: 'tool',
        command: { label: 'Add an image or video', icon: ImageIcon },
        keys: ['$mod+Shift+KeyK'],
        enabled: canWrite,
        run: () => pickerStore.setState({ open: true }),
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'image',
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite === previous.canWrite) return
      refreshActions()
      if (state.canWrite) return
      pickerStore.setState({ open: false })
      if (placing()) modeStore.setState({ tool: 'move' })
    })
    return () => {
      unsubscribe()
      unregister()
      pickerStore.setState({ open: false })
      if (placing()) modeStore.setState({ tool: 'move' })
    }
  }, [])
}
