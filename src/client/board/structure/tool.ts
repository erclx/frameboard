import { Frame } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import { refreshActions, registerActions } from '@/client/actions/registry'
import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import {
  DEFAULT_FRAME_SIZE,
  type FrameSizeName,
  frameSizeOf,
} from '@/shared/frame-sizes'
import { nextFreeName } from '@/shared/names'
import type { FrameRecord } from '@/shared/records/list'

import type { Box } from '../geometry/box'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import { boxToolStore } from '../sections/actions'
import { select, type SelectionStore, selectionStore } from '../selection'
import { canvasView } from '../view'

/** The size the Frame tool's next click places, chosen from the inspector's list. */
export type PresetStore = StoreApi<{ preset: FrameSizeName }>

export const presetStore: PresetStore = createStore<{
  preset: FrameSizeName
}>()(() => ({ preset: DEFAULT_FRAME_SIZE }))

export function usePreset(): FrameSizeName {
  return useStore(presetStore, (state) => state.preset)
}

export function choosePreset(preset: FrameSizeName): void {
  presetStore.setState({ preset })
}

export interface PlaceContext {
  page: string
  /** Every frame on the page, hidden ones included, since they hold names too. */
  frames: readonly FrameRecord[]
  preset?: PresetStore
  selection?: SelectionStore
  mode?: ModeStore
  calls?: Structure
  /** The board area the view shows, which a new frame outside it pans to. Absent, the view stays. */
  visible?: Box
  view?: Pick<typeof canvasView, 'centerOn'>
}

/** The smallest box, in screen pixels, a Frame tool drag draws, below which the drag places as a click does. */
export const DRAWN_FRAME_MIN = 40

/** A drawn frame's name stem, since a drawn box has no size to be named for. */
const DRAWN_FRAME_NAME = 'frame'

/**
 * Adds a frame with its top left corner on a board point, hugging neither
 * axis, at the chosen size's width and height and named for it as duplicate
 * and new page name theirs, or at a drawn box's size and named `frame`, then
 * selects it, returns to Move, and centers the view on it when it is not
 * wholly in view, as one click or drag of the Frame tool. It opens no rename
 * field, so the next keystroke still reaches the board. Resolves to the
 * added frame, or null once a refusal is reported, so a caller can act on its
 * box before the live store carries it.
 */
export async function placeFrame(
  point: { x: number; y: number; width?: number; height?: number },
  {
    page,
    frames,
    preset = presetStore,
    selection = selectionStore,
    mode = modeStore,
    calls = structure,
    visible,
    view = canvasView,
  }: PlaceContext,
): Promise<FrameRecord | null> {
  const { width, height } = point
  const drawn =
    width === undefined || height === undefined ? null : { width, height }
  const picked = preset.getState().preset
  const name = nextFreeName(
    drawn ? DRAWN_FRAME_NAME : picked,
    frames.map((frame) => frame.name),
  )
  try {
    const added = await calls.addFrame(
      `${page}/${name}`,
      drawn ?? frameSizeOf(picked),
      Math.round(point.x),
      Math.round(point.y),
    )
    select(selection, page, [added.ref])
    mode.setState({ tool: 'move' })
    if (visible && !within(added.box, visible)) view.centerOn(added.box)
    return added
  } catch (error) {
    reportRefusal("Couldn't add a frame")(error)
    return null
  }
}

function within(box: Box, area: Box): boolean {
  return (
    box.x >= area.x &&
    box.y >= area.y &&
    box.x + box.width <= area.x + area.width &&
    box.y + box.height <= area.y + area.height
  )
}

const canWrite = () => liveStore.getState().canWrite

/**
 * Registers the Frame tool, key F, which fills the toolbar's Frame slot. It
 * writes, so it is enabled only while this tab may, and a tab losing write
 * returns to Move.
 */
export function useFrameTool(): void {
  useEffect(() => {
    const unregister = registerActions([
      {
        id: 'tool.frame',
        label: 'Frame',
        group: 'tool',
        command: { label: 'Add a frame', icon: Frame },
        keys: ['f'],
        enabled: canWrite,
        // Picking a tool returns to Edit, since a tool only works there.
        run: () => {
          boxToolStore.setState({ tool: 'frame' })
          modeStore.setState({ tool: 'frame', mode: 'edit' })
        },
        checked: () =>
          modeStore.getState().mode === 'edit' &&
          modeStore.getState().tool === 'frame',
      },
    ])
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (state.canWrite === previous.canWrite) return
      refreshActions()
      if (!state.canWrite && modeStore.getState().tool === 'frame') {
        modeStore.setState({ tool: 'move' })
      }
    })
    return () => {
      unsubscribe()
      unregister()
    }
  }, [])
}
